import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { matchEntities, type EjecucionEntityInput, type InfobrasEntityInput } from "./match.js";

export interface BuildCrosswalkSummary {
  ejecucionEntities: number;
  infobrasEntities: number;
  confirmadas: number;
  candidatas: number;
  sinMatch: number;
}

/**
 * Recalcula el cruce radar-ejecucion (MEF) <-> INFOBRAS por nombre de
 * entidad, para un departamento, y lo persiste en `entity_crosswalk`. Se
 * puede correr de nuevo cuando haya más datos ingeridos en cualquiera de las
 * dos fuentes, o cuando cambie el matcher compartido — reemplaza (borra +
 * inserta) las filas del departamento en vez de solo upsert, para no dejar
 * matches obsoletos huérfanos. Mismo patrón que
 * `compras-publicas/src/crossref/build-crosswalk.ts`.
 */
export async function buildCrosswalk(departamento: string): Promise<BuildCrosswalkSummary> {
  const wantedDepartamento = departamento.toUpperCase().trim();

  const { rows: ejecucionRows } = await ejecucionPool.query<{ entity_code: string; nombre: string }>(
    `SELECT DISTINCT e.entity_code, e.nombre
     FROM entities e
     JOIN territories t ON t.ubigeo = e.ubigeo
     WHERE t.departamento = $1`,
    [wantedDepartamento]
  );
  const ejecucionEntities: EjecucionEntityInput[] = ejecucionRows.map((r) => ({
    entityCode: r.entity_code,
    nombre: r.nombre,
  }));

  const { rows: infobrasRows } = await pool.query<{ codigo_entidad: string; entidad_nombre: string }>(
    `SELECT DISTINCT codigo_entidad, entidad_nombre FROM public_works WHERE departamento = $1`,
    [wantedDepartamento]
  );
  const infobrasEntities: InfobrasEntityInput[] = infobrasRows.map((r) => ({
    codigoEntidad: r.codigo_entidad,
    entidadNombre: r.entidad_nombre,
  }));

  const matches = matchEntities(ejecucionEntities, infobrasEntities);
  const ejecucionEntityCodes = ejecucionEntities.map((e) => e.entityCode);

  // El DELETE de abajo depende de que `ejecucionEntityCodes` no esté vacío
  // para limpiar filas obsoletas (mismo riesgo que motivó mover el scoping
  // desde `infobras_codigo_entidad`, ver comentario en el DELETE) — si
  // `entities`/`territories` todavía no tiene ingeridas entidades para este
  // departamento, o el nombre no calza con `territories.departamento`, el
  // DELETE hace un no-op silencioso. Se advierte en vez de asumir que nunca
  // pasa.
  if (ejecucionEntityCodes.length === 0) {
    console.warn(
      `[build-crosswalk] 0 entidades radar-ejecucion para departamento="${wantedDepartamento}" — el DELETE de entity_crosswalk no se ejecutará (no-op), posibles filas obsoletas no se limpiarán.`,
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Reemplaza, no solo inserta: si una fila de `entity_crosswalk` ya
    // existente ya no aparece en `matches` (p.ej. porque un ajuste al
    // matcher dejó de considerarla válida — ver DQ-17), debe desaparecer al
    // recalcular, no quedar huérfana con su `computed_at` viejo.
    //
    // Se borra por `ejecucion_entity_code` (scoped por departamento vía el
    // JOIN con `territories` de arriba), NO por `infobras_codigo_entidad`
    // (hallazgo de CodeRabbit en PR #144, sin corregir por 5 días): mismo
    // razonamiento que `compras-publicas/src/crossref/build-crosswalk.ts` —
    // `entity_crosswalk` no tiene columna `departamento`, así que borrar por
    // el código del lado sin scope territorial garantizado puede arrastrar
    // matches válidos de otro departamento, y se salta el DELETE por
    // completo cuando `infobrasEntities` sale vacío.
    await client.query(`DELETE FROM entity_crosswalk WHERE ejecucion_entity_code = ANY($1)`, [ejecucionEntityCodes]);
    for (const m of matches) {
      await client.query(
        `INSERT INTO entity_crosswalk
           (ejecucion_entity_code, ejecucion_nombre, infobras_codigo_entidad, infobras_entidad_nombre, confidence, score)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [m.ejecucionEntityCode, m.ejecucionNombre, m.infobrasCodigoEntidad, m.infobrasEntidadNombre, m.confidence, m.score]
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
    ejecucionEntities: ejecucionEntities.length,
    infobrasEntities: infobrasEntities.length,
    confirmadas: matches.filter((m) => m.confidence === "confirmada").length,
    candidatas: matches.filter((m) => m.confidence === "candidata").length,
    sinMatch: infobrasEntities.length - matches.length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const departamento = process.env.INFOBRAS_DEPARTAMENTO ?? "LA LIBERTAD";
  buildCrosswalk(departamento)
    .then((summary) => {
      console.log("Cruce recalculado:", summary);
      return Promise.all([pool.end(), ejecucionPool.end()]);
    })
    .catch((err) => {
      console.error("Cruce falló:", err);
      process.exit(1);
    });
}
