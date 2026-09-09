import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { radarPool } from "../db/radar-pool.js";

/**
 * CT-21 (2026-09-09): recalcula `territorial_coverage` para las fuentes OECE
 * directamente desde lo ya persistido en `procurement_processes`/`awards`/`bidders`,
 * sin volver a golpear la fuente. El bug de `isCompleteSnapshot` (corregido en
 * oece-connector.ts/oece-records-connector.ts) dejó filas `PARCIAL` para corridas
 * que en realidad recorrieron la fuente hasta la página terminal — este backfill
 * corrige el registro de las regiones ya verificadas en dato real (CT-08/CT-09),
 * no re-ejecuta ninguna ingesta.
 */

const RESTRICTION_RELEASES =
  "Recorrido hasta la página terminal del endpoint público /releases; el rango de fechas u otros parámetros de consulta, si los hubo, definen el universo cubierto, no una cobertura parcial.";
const RESTRICTION_RECORDS = (endpoint: "/records") =>
  `Recorrido hasta la página terminal del endpoint público ${endpoint}; el rango de fechas u otros parámetros de consulta, si los hubo, definen el universo cubierto, no una cobertura parcial.`;

async function countReleases(departamento: string): Promise<number> {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM procurement_processes WHERE departamento=$1",
    [departamento]
  );
  return rows[0].n;
}

async function countAwards(departamento: string): Promise<number> {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM awards WHERE departamento=$1",
    [departamento]
  );
  return rows[0].n;
}

async function countBidders(departamento: string): Promise<number> {
  // `awards.ocid` no es único (un mismo proceso puede tener varios lotes/ítems
  // adjudicados bajo el mismo ocid) — unir por ocid sin deduplicar multiplicaría
  // el conteo de postores. Se usa el conjunto distinto de ocid del departamento.
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM bidders b
     WHERE b.ocid IN (SELECT DISTINCT ocid FROM awards WHERE departamento = $1)`,
    [departamento]
  );
  return rows[0].n;
}

async function maxBatchId(table: string): Promise<number> {
  const { rows } = await pool.query(`SELECT MAX(source_batch_id)::int AS n FROM ${table}`);
  return rows[0].n;
}

async function insertCoverage(input: {
  sourceName: string;
  departamento: string;
  count: number;
  sourceBatchRef: string;
  restriction: string;
}): Promise<void> {
  const completeness = input.count === 0 ? "SIN_DATOS_EN_FUENTE" : "COMPLETA_VERIFICADA";
  await radarPool.query(
    `INSERT INTO territorial_coverage
      (app_name,source_name,jurisdiction_code,requested,source_records,normalized_records,persisted_records,rejected_records,completeness,source_batch_ref,cutoff_at,restriction,dependencies)
     SELECT 'compras-publicas',$2,code,true,$3,$3,$3,0,$4,$5,now(),$6,'[]'::jsonb
     FROM territorial_jurisdictions WHERE name=$1`,
    [input.departamento, input.sourceName, input.count, completeness, input.sourceBatchRef, input.restriction]
  );
}

export async function recomputeOeceCoverage(departamentos: readonly string[]): Promise<void> {
  const releasesBatchId = await maxBatchId("procurement_processes");
  const recordsBatchId = await maxBatchId("awards");

  for (const departamento of departamentos) {
    const releases = await countReleases(departamento);
    await insertCoverage({
      sourceName: "OECE_OCDS_RELEASES",
      departamento,
      count: releases,
      sourceBatchRef: `oece-releases:${releasesBatchId}`,
      restriction: RESTRICTION_RELEASES,
    });

    const awards = await countAwards(departamento);
    await insertCoverage({
      sourceName: "OECE_OCDS_AWARDS",
      departamento,
      count: awards,
      sourceBatchRef: `oece-records:${recordsBatchId}`,
      restriction: RESTRICTION_RECORDS("/records"),
    });

    const bidders = await countBidders(departamento);
    await insertCoverage({
      sourceName: "OECE_OCDS_BIDDERS",
      departamento,
      count: bidders,
      sourceBatchRef: `oece-records:${recordsBatchId}`,
      restriction: RESTRICTION_RECORDS("/records"),
    });

    console.log(JSON.stringify({ departamento, releases, awards, bidders }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const departamentos = (process.env.OECE_COVERAGE_DEPARTAMENTOS ?? "LA LIBERTAD,AREQUIPA,LIMA")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  recomputeOeceCoverage(departamentos)
    .then(() => console.log(JSON.stringify({ status: "COMPLETE", departamentos })))
    .catch((error) => {
      console.error("Backfill de cobertura OECE falló:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
      await radarPool.end();
    });
}
