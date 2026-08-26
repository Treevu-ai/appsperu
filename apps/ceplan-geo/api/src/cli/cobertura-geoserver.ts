import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

type LayerRow = {
  layer_name: string;
  feature_count: number | null;
  last_ingested_at: string | null;
  latest_batch_at: string | null;
  latest_checksum: string | null;
};

type DepartmentRow = {
  departamento: string;
  distritos: string;
};

export async function reportGeoserverCoverage() {
  const { rows: layers } = await pool.query<LayerRow>(
    `SELECT gl.layer_name,
            gl.feature_count,
            gl.last_ingested_at,
            rb.ingested_at AS latest_batch_at,
            rb.checksum AS latest_checksum
     FROM geo_layers gl
     LEFT JOIN LATERAL (
       SELECT ingested_at, checksum
       FROM raw_geoserver_batches
       WHERE layer_name = gl.layer_name
       ORDER BY ingested_at DESC
       LIMIT 1
     ) rb ON true
     ORDER BY gl.layer_name`
  );

  const { rows: departments } = await pool.query<DepartmentRow>(
    `SELECT departamento, COUNT(*)::text AS distritos
     FROM territories
     GROUP BY departamento
     ORDER BY departamento`
  );

  const { rows: crosswalk } = await pool.query<{ match_status: string; total: string }>(
    `SELECT match_status, COUNT(*)::text AS total
     FROM territory_name_crosswalk
     GROUP BY match_status
     ORDER BY match_status`
  );

  const { rows: infra } = await pool.query<{ infra_type: string; total: string }>(
    `SELECT infra_type, COUNT(*)::text AS total
     FROM infrastructure
     GROUP BY infra_type
     ORDER BY infra_type`
  );

  const distritoLayer = layers.find((row) => row.layer_name === "geoceplan:cb_limdistx");
  const distritosPersistidos = departments.reduce((sum, row) => sum + Number(row.distritos), 0);

  const report = {
    generatedAt: new Date().toISOString(),
    completitud:
      distritoLayer?.feature_count && distritosPersistidos >= distritoLayer.feature_count * 0.95
        ? "COMPLETA_VERIFICADA"
        : distritosPersistidos > 0
          ? "PARCIAL"
          : "SIN_DATOS_EN_FUENTE",
    restriccion:
      "Cobertura territorial de distritos según última ingesta WFS; no certifica actualización diaria del GeoServer.",
    capas: layers.map((row) => ({
      layerName: row.layer_name,
      featureCount: row.feature_count,
      lastIngestedAt: row.last_ingested_at,
      latestBatchAt: row.latest_batch_at,
      latestChecksum: row.latest_checksum,
    })),
    territorios: {
      distritosPersistidos,
      departamentos: departments.map((row) => ({
        departamento: row.departamento,
        distritos: Number(row.distritos),
      })),
      departamentosSinDistritos: departments.filter((row) => Number(row.distritos) === 0).length,
    },
    infraestructura: infra.map((row) => ({
      tipo: row.infra_type,
      total: Number(row.total),
    })),
    crosswalkInfobras: crosswalk.map((row) => ({
      matchStatus: row.match_status,
      total: Number(row.total),
    })),
  };

  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  reportGeoserverCoverage()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error("Error en cobertura:geoserver:", err);
      await pool.end();
      process.exit(1);
    });
}
