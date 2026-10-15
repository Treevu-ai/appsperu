/**
 * Exporta a CSV los flujos Comtrade ya cargados en
 * `bcrp_comercio_exterior.comtrade_flujos` y reporta qué socios CPTPP
 * todavía no están cubiertos (ver docs/BRECHA_SOCIOS_CPTPP.md).
 *
 * Requiere DATABASE_URL apuntando a la base `bcrp_comercio_exterior` (Neon).
 *
 * Uso:
 *   DATABASE_URL=... npx tsx 02_export_comtrade.ts
 */
import { Pool } from "pg";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(import.meta.dirname, "..", "data", "raw");

// Códigos Comtrade (M49) de los 11 miembros del CPTPP + China (partner de interés).
const CPTPP_CHINA: Record<string, string> = {
  "36": "Australia",
  "96": "Brunéi Darussalam",
  "124": "Canadá",
  "152": "Chile",
  "156": "China",
  "392": "Japón",
  "458": "Malasia",
  "484": "México",
  "554": "Nueva Zelanda",
  "604": "Perú",
  "702": "Singapur",
  "704": "Vietnam",
  "826": "Reino Unido",
};

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está definida.");
  }
  const pool = new Pool({ connectionString, max: 1 });

  const { rows } = await pool.query(
    `select anio, flujo, reporter_code, partner_code, cmd_code, fob_usd, cif_usd, net_wgt_kg, es_estimado, es_agregado
     from comtrade_flujos
     order by anio, reporter_code, partner_code, cmd_code`
  );

  const header =
    "anio,flujo,reporter_code,partner_code,cmd_code,fob_usd,cif_usd,net_wgt_kg,es_estimado,es_agregado";
  const lines = rows.map(
    (r) =>
      `${r.anio},${r.flujo},${r.reporter_code},${r.partner_code},${r.cmd_code},${r.fob_usd ?? ""},${r.cif_usd ?? ""},${r.net_wgt_kg ?? ""},${r.es_estimado},${r.es_agregado}`
  );

  const outPath = join(OUT_DIR, "comtrade_flujos.csv");
  writeFileSync(outPath, [header, ...lines].join("\n") + "\n", "utf-8");

  const partnersCubiertos = new Set(rows.map((r) => r.partner_code));
  const faltantes = Object.entries(CPTPP_CHINA)
    .filter(([codigo]) => codigo !== "604") // Perú es el reporter, no un partner de sí mismo
    .filter(([codigo]) => !partnersCubiertos.has(codigo));

  console.log(`Escrito ${outPath} (${rows.length} filas)`);
  console.log(`Socios CPTPP+China cubiertos: ${Object.keys(CPTPP_CHINA).length - faltantes.length}/${Object.keys(CPTPP_CHINA).length}`);
  if (faltantes.length > 0) {
    console.log("Faltan (sin datos Comtrade todavía):");
    faltantes.forEach(([codigo, nombre]) => console.log(`  - ${nombre} (código ${codigo})`));
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Falló la exportación:", err);
  process.exit(1);
});
