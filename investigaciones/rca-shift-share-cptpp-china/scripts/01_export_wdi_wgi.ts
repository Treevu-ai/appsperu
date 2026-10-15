/**
 * Exporta a CSV los indicadores WDI/WGI del Banco Mundial para Perú y los
 * países del benchmark (socios CPTPP disponibles + China), ya cargados en
 * `bcrp_comercio_exterior.wdi_indicadores`.
 *
 * Requiere DATABASE_URL apuntando a la base `bcrp_comercio_exterior` (Neon).
 *
 * Uso:
 *   DATABASE_URL=... npx tsx 01_export_wdi_wgi.ts
 */
import { Pool } from "pg";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(import.meta.dirname, "..", "data", "raw");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está definida.");
  }
  const pool = new Pool({ connectionString, max: 1 });

  const { rows } = await pool.query(
    `select pais_codigo, pais_iso3, pais_nombre, indicador_codigo, indicador_nombre, anio, valor
     from wdi_indicadores
     order by pais_iso3, indicador_codigo, anio`
  );

  const header = "pais_codigo,pais_iso3,pais_nombre,indicador_codigo,indicador_nombre,anio,valor";
  const lines = rows.map(
    (r) =>
      `${r.pais_codigo},${r.pais_iso3},"${r.pais_nombre}",${r.indicador_codigo},"${r.indicador_nombre}",${r.anio},${r.valor ?? ""}`
  );

  const outPath = join(OUT_DIR, "wdi_wgi.csv");
  writeFileSync(outPath, [header, ...lines].join("\n") + "\n", "utf-8");
  console.log(`Escrito ${outPath} (${rows.length} filas, ${new Set(rows.map((r) => r.pais_iso3)).size} países)`);

  await pool.end();
}

main().catch((err) => {
  console.error("Falló la exportación:", err);
  process.exit(1);
});
