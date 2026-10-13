import "dotenv/config";
import { pool } from "../db/pool.js";
import { createGeostore, queryTreeCoverLossByYear, type GeoJSONPolygon } from "../lib/gfw-client.js";

const GFW_BASE_URL = "https://data-api.globalforestwatch.org";

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": process.env.GFW_API_KEY ?? "",
    Origin: "http://localhost",
  };
}

async function driverCategoria(geostoreId: string): Promise<Array<{ categoria: number; areaHa: number }>> {
  const sql =
    "SELECT wri_google_tree_cover_loss_drivers__category, SUM(area__ha) FROM data GROUP BY wri_google_tree_cover_loss_drivers__category";
  const url = new URL(`${GFW_BASE_URL}/dataset/wri_google_tree_cover_loss_drivers/latest/query/json`);
  url.searchParams.set("sql", sql);
  url.searchParams.set("geostore_id", geostoreId);
  const res = await fetch(url, { headers: headers() });
  const body = (await res.json()) as { data?: Array<{ wri_google_tree_cover_loss_drivers__category: number; area__ha: number }> };
  return (body.data ?? []).map((r) => ({ categoria: r.wri_google_tree_cover_loss_drivers__category, areaHa: r.area__ha }));
}

interface Candidato {
  codigou: string;
  fecha_denuncio: string | null;
  ha_perdida: string;
  geom_json: string;
}

const CATEGORIA_NOMBRE: Record<number, string> = {
  1: "Agricultura permanente",
  2: "Hard commodities (minería/energía)",
  3: "Cultivo migratorio",
  4: "Tala",
  5: "Incendio",
  6: "Asentamientos/infraestructura",
  7: "Otras perturbaciones naturales",
};

async function main(): Promise<void> {
  const { rows } = await pool.query<Candidato>(
    `SELECT codigou, fecha_denuncio::text, ha_perdida::text, geom_json FROM (
       SELECT m.codigou, m.fecha_denuncio,
              round(sum(ST_Area(ST_Intersection(p.geom, m.geom)::geography))/10000)::numeric AS ha_perdida,
              ST_AsGeoJSON(m.geom) AS geom_json
       FROM mining_rights m
       JOIN perdida_bosque_poligono p
         ON p.cobertura LIKE 'Pérdida%' AND ST_Intersects(p.geom, m.geom)
       WHERE m.titular ILIKE '%PODEROSA%' AND m.departamento ILIKE '%LIBERTAD%'
       GROUP BY m.codigou, m.fecha_denuncio, m.geom
       ORDER BY ha_perdida DESC
       LIMIT 8
     ) agregado`
  );

  for (const row of rows) {
    const anioDenuncio = row.fecha_denuncio ? new Date(row.fecha_denuncio).getFullYear() : null;
    console.log(`\n=== ${row.codigou} (denuncio ${row.fecha_denuncio ?? "SIN DATO"}, año ${anioDenuncio}) — solapamiento ${row.ha_perdida} ha ===`);

    const geometry = JSON.parse(row.geom_json) as GeoJSONPolygon;
    const { geostoreId, areaHa } = await createGeostore(geometry);
    const serie = await queryTreeCoverLossByYear(geostoreId);
    const haAntes = anioDenuncio ? serie.filter((r) => r.anio < anioDenuncio).reduce((s, r) => s + r.areaHa, 0) : null;
    const haDespues = anioDenuncio ? serie.filter((r) => r.anio >= anioDenuncio).reduce((s, r) => s + r.areaHa, 0) : null;
    console.log(`  GFW área concesión: ${areaHa.toFixed(1)} ha`);
    console.log(`  GFW serie anual: ${serie.map((r) => `${r.anio}:${r.areaHa.toFixed(1)}ha`).join(", ") || "(sin pérdida registrada en GFW)"}`);
    console.log(`  → pérdida ANTES del petitorio: ${haAntes?.toFixed(1)} ha | DURANTE/DESPUÉS: ${haDespues?.toFixed(1)} ha`);

    const driver = await driverCategoria(geostoreId);
    console.log(
      `  Driver dominante (WRI/Google): ` +
        driver.map((d) => `${CATEGORIA_NOMBRE[d.categoria] ?? d.categoria}=${d.areaHa.toFixed(1)}ha`).join(", ")
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
