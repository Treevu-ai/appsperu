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
  const infobrasCodigos = infobrasEntities.map((e) => e.codigoEntidad);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Reemplaza, no solo inserta: si una fila de `entity_crosswalk` ya
    // existente ya no aparece en `matches` (p.ej. porque un ajuste al
    // matcher dejó de considerarla válida — ver DQ-17), debe desaparecer al
    // recalcular, no quedar huérfana con su `computed_at` viejo.
    await client.query(`DELETE FROM entity_crosswalk WHERE infobras_codigo_entidad = ANY($1)`, [infobrasCodigos]);
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
