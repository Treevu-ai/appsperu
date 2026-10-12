import "dotenv/config";
import { pool } from "../db/pool.js";
import { consultarAlertasRecientes } from "../lib/gfw-alerts-client.js";
import type { GeoJSONPolygon } from "../lib/gfw-client.js";

/**
 * Demuestra alertas casi en tiempo real (RADD + GLAD-DIST) sobre dos
 * concesiones mineras con causalidad de deforestación ya confirmada en
 * esta sesión (ver project_rastro_cruce_mineria_deforestacion en memoria):
 * Minera Caraveli S.A.C. y Minera Cascajal S.C.R.L.
 */

const DESDE_FECHA = "2026-01-01";

async function main(): Promise<void> {
  const { rows } = await pool.query<{ codigou: string; titular: string; geom_json: string }>(
    `SELECT codigou, titular, ST_AsGeoJSON(geom) AS geom_json FROM mining_rights WHERE codigou IN ('010010404','070019306')`
  );

  for (const row of rows) {
    console.log(`\n=== ${row.codigou} — ${row.titular} ===`);
    const geometry = JSON.parse(row.geom_json) as GeoJSONPolygon;
    const alertas = await consultarAlertasRecientes(geometry, DESDE_FECHA);
    if (alertas.length === 0) {
      console.log(`  Sin alertas desde ${DESDE_FECHA}.`);
      continue;
    }
    const totalHa = alertas.reduce((sum, a) => sum + a.areaHa, 0);
    console.log(`  ${alertas.length} alertas desde ${DESDE_FECHA}, ${totalHa.toFixed(2)} ha en total.`);
    for (const a of alertas.slice(0, 10)) {
      console.log(`    [${a.fuente}] ${a.fecha} — ${a.areaHa.toFixed(2)} ha (confianza: ${a.confianza})`);
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
