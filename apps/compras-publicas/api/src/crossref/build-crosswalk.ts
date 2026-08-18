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
 * ingeridos en cualquiera de las dos fuentes — hace upsert por
 * (mef_entity_code, oece_buyer_id), no acumula duplicados.
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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const m of matches) {
      await client.query(
        `INSERT INTO entity_crosswalk (mef_entity_code, mef_nombre, oece_buyer_id, oece_buyer_name, confidence, score)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (mef_entity_code, oece_buyer_id) DO UPDATE
           SET mef_nombre = EXCLUDED.mef_nombre,
               oece_buyer_name = EXCLUDED.oece_buyer_name,
               confidence = EXCLUDED.confidence,
               score = EXCLUDED.score,
               computed_at = now()`,
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
