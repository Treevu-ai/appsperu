import "dotenv/config";
import { pool } from "../db/pool.js";
import { createGeostore, queryTreeCoverLossByYear, type GeoJSONPolygon } from "../lib/gfw-client.js";

/**
 * Valida (no solo solapamiento espacial) si la pérdida de bosque en las
 * concesiones mineras tituladas con mayor superposición ocurrió ANTES o
 * DESPUÉS de `fecha_denuncio` (inicio del trámite INGEMMET) — distingue
 * "la concesión se otorgó sobre bosque ya perdido" de "se perdió bosque
 * durante/después de la concesión".
 */

const TOP_N = Number(process.env.TOP_N ?? 8);

interface Candidato {
  codigou: string;
  titular: string;
  departamento: string;
  fecha_denuncio: string | null;
  ha_perdida_solapamiento: string;
  geom_json: string;
}

async function main(): Promise<void> {
  const { rows } = await pool.query<Candidato>(
    `SELECT codigou, titular, departamento, fecha_denuncio::text, ha_perdida_solapamiento::text, geom_json
     FROM (
       SELECT m.codigou, m.titular, m.departamento, m.fecha_denuncio,
              round(sum(ST_Area(ST_Intersection(p.geom, m.geom)::geography))/10000)::numeric AS ha_perdida_solapamiento,
              ST_AsGeoJSON(m.geom) AS geom_json
       FROM mining_rights m
       JOIN perdida_bosque_poligono p
         ON p.cobertura LIKE 'Pérdida%' AND ST_Intersects(p.geom, m.geom)
       WHERE m.estado = 'T'
       GROUP BY m.codigou, m.titular, m.departamento, m.fecha_denuncio, m.geom
       ORDER BY ha_perdida_solapamiento DESC
       LIMIT $1
     ) agregado`,
    [TOP_N]
  );

  for (const row of rows) {
    const anioDenuncio = row.fecha_denuncio ? new Date(row.fecha_denuncio).getFullYear() : null;
    console.log(`\n=== ${row.codigou} — ${row.titular} (${row.departamento}) ===`);
    console.log(`  fecha_denuncio: ${row.fecha_denuncio ?? "SIN DATO"} (año ${anioDenuncio ?? "?"})`);
    console.log(`  ha pérdida (solapamiento espacial, Geobosques agregado): ${row.ha_perdida_solapamiento}`);

    try {
      const geometry = JSON.parse(row.geom_json) as GeoJSONPolygon;
      const { geostoreId, areaHa } = await createGeostore(geometry);
      const serie = await queryTreeCoverLossByYear(geostoreId);
      const haAntes = anioDenuncio
        ? serie.filter((r) => r.anio < anioDenuncio).reduce((s, r) => s + r.areaHa, 0)
        : null;
      const haDespues = anioDenuncio
        ? serie.filter((r) => r.anio >= anioDenuncio).reduce((s, r) => s + r.areaHa, 0)
        : null;
      console.log(`  GFW área concesión: ${areaHa.toFixed(1)} ha`);
      console.log(`  GFW serie anual: ${serie.map((r) => `${r.anio}:${r.areaHa.toFixed(1)}ha`).join(", ") || "(sin pérdida registrada en GFW)"}`);
      if (anioDenuncio !== null) {
        console.log(`  → pérdida ANTES de la concesión (${anioDenuncio}): ${haAntes?.toFixed(1)} ha`);
        console.log(`  → pérdida DURANTE/DESPUÉS de la concesión: ${haDespues?.toFixed(1)} ha`);
      }
    } catch (err) {
      console.error(`  ERROR consultando GFW: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
