import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { matchEntitiesToPadron, type MefEntityInput, type PadronEntityInput } from "./match.js";

export interface BuildCrosswalkSummary {
  mefEntities: number;
  padronRows: number;
  confirmadas: number;
  candidatas: number;
  sinMatch: number;
}

/**
 * Recalcula el cruce MEF (radar-ejecucion) <-> padron RUC para un departamento
 * y lo persiste en `entity_padron_crosswalk`. Se puede correr de nuevo cuando
 * haya mas datos ingeridos en cualquiera de las dos fuentes, o cuando cambie el
 * matcher compartido — reemplaza (borra + inserta) las filas del departamento
 * en vez de solo upsert, para no dejar matches obsoletos huerfanos.
 */
export async function buildCrosswalk(departamento: string): Promise<BuildCrosswalkSummary> {
  const wantedDepartamento = departamento.toUpperCase().trim();

  const { rows: mefRows } = await ejecucionPool.query<{ entity_code: string; nombre: string }>(
    `SELECT DISTINCT e.entity_code, e.nombre
     FROM entities e
     JOIN territories t ON t.ubigeo = e.ubigeo
     WHERE t.departamento = $1`,
    [wantedDepartamento]
  );
  const mefEntities: MefEntityInput[] = mefRows.map((r) => ({ entityCode: r.entity_code, nombre: r.nombre }));

  // Mismo acote que aplica el route original: sin restricting el padron al
  // prefijo UBIGEO del departamento (2 primeros digitos del codigo INEI), cada
  // corrida compara las entidades contra los ~2.3M contribuyentes completos
  // (89s medidos en vivo el 2026-08-20).
  const { rows: prefixRows } = await ejecucionPool.query<{ ubigeo: string }>(
    `SELECT ubigeo FROM territories WHERE departamento = $1 LIMIT 1`,
    [wantedDepartamento]
  );
  const ubigeoPrefix = prefixRows[0]?.ubigeo.slice(0, 2);

  const { rows: padronRows } = await pool.query<{ ruc: string; razon_social: string }>(
    ubigeoPrefix
      ? `SELECT ruc, razon_social FROM contribuyentes WHERE ubigeo LIKE $1`
      : `SELECT ruc, razon_social FROM contribuyentes`,
    ubigeoPrefix ? [`${ubigeoPrefix}%`] : []
  );
  const padronEntities: PadronEntityInput[] = padronRows.map((r) => ({ ruc: r.ruc, razonSocial: r.razon_social }));

  const matches = matchEntitiesToPadron(mefEntities, padronEntities);
  const mefEntityCodes = mefEntities.map((e) => e.entityCode);

  // El DELETE de abajo depende de que `mefEntityCodes` no este vacio para
  // limpiar filas obsoletas — si `entities`/`territories` todavia no tiene
  // ingeridas entidades para este departamento, o el nombre no calza con
  // `territories.departamento`, el DELETE hace un no-op silencioso. Se advierte
  // en vez de asumir que nunca pasa.
  if (mefEntityCodes.length === 0) {
    console.warn(
      `[build-crosswalk] 0 entidades MEF para departamento="${wantedDepartamento}" — el DELETE de entity_padron_crosswalk no se ejecutara (no-op), posibles filas obsoletas no se limpiaran.`,
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Reemplaza, no solo inserta: si una fila existente ya no aparece en
    // `matches` (p.ej. un ajuste al matcher compartido la descarta), debe
    // desaparecer al recalcular, no quedar huerfana con su `computed_at` viejo.
    // Se borra por `mef_entity_code` y NO por `ruc`: el padron es la fuente
    // grande y compartida, y borrar por `ruc` podria arrastrar matches validos
    // de otro departamento (mismo hallazgo que corrigio compras-publicas en PR
    // #144, documentado en su `build-crosswalk.ts`).
    await client.query(`DELETE FROM entity_padron_crosswalk WHERE mef_entity_code = ANY($1)`, [mefEntityCodes]);
    for (const m of matches) {
      await client.query(
        `INSERT INTO entity_padron_crosswalk (mef_entity_code, mef_nombre, ruc, razon_social, confidence, score)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [m.mefEntityCode, m.mefNombre, m.ruc, m.razonSocial, m.confidence, m.score]
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
    padronRows: padronEntities.length,
    confirmadas: matches.filter((m) => m.confidence === "confirmada").length,
    candidatas: matches.filter((m) => m.confidence === "candidata").length,
    sinMatch: mefEntities.length - matches.length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const departamento = process.env.PADRON_DEPARTAMENTO ?? "LA LIBERTAD";
  buildCrosswalk(departamento)
    .then((summary) => {
      console.log("Cruce recalculado:", summary);
      return Promise.all([pool.end(), ejecucionPool.end()]);
    })
    .catch((err) => {
      console.error("Cruce fallo:", err);
      process.exit(1);
    });
}
