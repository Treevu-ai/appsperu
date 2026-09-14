import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { radarPool } from "../db/radar-pool.js";
import { matchEntities, type MefEntityInput, type OeceEntityInput } from "./match.js";

export interface BuildCrosswalkSummary {
  mefEntities: number;
  oeceEntities: number;
  confirmadas: number;
  candidatas: number;
  sinMatch: number;
}

/**
 * Recalcula el cruce MEF <-> OECE para un departamento y lo persiste en
 * `entity_crosswalk`. Se puede correr de nuevo cuando haya más datos
 * ingeridos en cualquiera de las dos fuentes, o cuando cambie el matcher
 * compartido — reemplaza (borra + inserta) las filas del departamento en
 * vez de solo upsert, para no dejar matches obsoletos huérfanos.
 */
export async function buildCrosswalk(departamento: string): Promise<BuildCrosswalkSummary> {
  const wantedDepartamento = departamento.toUpperCase().trim();

  const { rows: mefRows } = await radarPool.query<{ entity_code: string; nombre: string }>(
    `SELECT DISTINCT e.entity_code, e.nombre
     FROM entities e
     JOIN territories t ON t.ubigeo = e.ubigeo
     WHERE t.departamento = $1`,
    [wantedDepartamento]
  );
  const mefEntities: MefEntityInput[] = mefRows.map((r) => ({ entityCode: r.entity_code, nombre: r.nombre }));

  const { rows: oeceRows } = await pool.query<{ buyer_id: string; buyer_name: string }>(
    `SELECT DISTINCT buyer_id, buyer_name FROM procurement_processes WHERE departamento = $1`,
    [wantedDepartamento]
  );
  const oeceEntities: OeceEntityInput[] = oeceRows.map((r) => ({ buyerId: r.buyer_id, buyerName: r.buyer_name }));

  const matches = matchEntities(mefEntities, oeceEntities);
  const mefEntityCodes = mefEntities.map((e) => e.entityCode);

  // El DELETE de abajo depende de que `mefEntityCodes` no esté vacío para
  // limpiar filas obsoletas (mismo riesgo que motivó mover el scoping desde
  // `oece_buyer_id`, ver comentario en el DELETE) — si `entities`/`territories`
  // todavía no tiene ingeridas entidades para este departamento, o el nombre
  // no calza con `territories.departamento`, el DELETE hace un no-op
  // silencioso. Se advierte en vez de asumir que nunca pasa.
  if (mefEntityCodes.length === 0) {
    console.warn(
      `[build-crosswalk] 0 entidades MEF para departamento="${wantedDepartamento}" — el DELETE de entity_crosswalk no se ejecutará (no-op), posibles filas obsoletas no se limpiarán.`,
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Reemplaza, no solo inserta: si una fila ya existente ya no aparece en
    // `matches` (p.ej. un ajuste al matcher compartido la descarta), debe
    // desaparecer al recalcular, no quedar huérfana con su `computed_at`
    // viejo — mismo fix que `infobras/src/crossref/build-crosswalk.ts` (DQ-17).
    //
    // Se borra por `mef_entity_code` (scoped por departamento vía el JOIN
    // con `territories` de arriba), NO por `oece_buyer_id` (hallazgo de
    // CodeRabbit en PR #144, sin corregir por 5 días): `entity_crosswalk` no
    // tiene columna `departamento` — si un mismo buyer OECE aparece en más
    // de un departamento, borrar por `oece_buyer_id` podía arrastrar
    // matches válidos de otras regiones. Borrar por `oece_buyer_id` también
    // se saltaba el DELETE por completo cuando `oeceEntities` salía vacío
    // (`ANY('{}')` no matchea nada), dejando filas huérfanas para siempre;
    // `mefEntityCodes` sí está garantizado no-vacío mientras el departamento
    // tenga al menos una entidad MEF registrada.
    await client.query(`DELETE FROM entity_crosswalk WHERE mef_entity_code = ANY($1)`, [mefEntityCodes]);
    for (const m of matches) {
      await client.query(
        `INSERT INTO entity_crosswalk (mef_entity_code, mef_nombre, oece_buyer_id, oece_buyer_name, confidence, score)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [m.mefEntityCode, m.mefNombre, m.oeceBuyerId, m.oeceBuyerName, m.confidence, m.score]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return {
    mefEntities: mefEntities.length,
    oeceEntities: oeceEntities.length,
    confirmadas: matches.filter((m) => m.confidence === "confirmada").length,
    candidatas: matches.filter((m) => m.confidence === "candidata").length,
    sinMatch: oeceEntities.length - matches.length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const departamento = process.env.OECE_DEPARTAMENTO ?? "LA LIBERTAD";
  buildCrosswalk(departamento)
    .then((summary) => {
      console.log("Cruce recalculado:", summary);
      return Promise.all([pool.end(), radarPool.end()]);
    })
    .catch((err) => {
      console.error("Cruce falló:", err);
      process.exit(1);
    });
}
