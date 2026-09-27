import { pool } from "./src/db/pool.js";

async function main() {
  // 1. SALAVERRY - importación trimestral 2024
  const r1 = await pool.query(`
    SELECT aduana_name, year, quarter, is_total, value_cif_usd
    FROM port_imports
    WHERE aduana_name = 'SALAVERRY' AND year = 2024
    ORDER BY quarter NULLS LAST
  `);
  console.log("=== SALAVERRY - Importaciones CIF 2024 (trimestral) ===");
  for (const row of r1.rows) {
    const label = row.quarter ? `Q${row.quarter}` : "TOTAL";
    console.log(`  ${label}: US$ ${Number(row.value_cif_usd).toLocaleString("en")}`);
  }

  // 2. SALAVERRY - top 5 productos por FOB 2024
  const r2 = await pool.query(`
    SELECT subpartida, product_desc, value_fob_usd, value_cif_usd, pct_change
    FROM port_subpartida_imports
    WHERE LOWER(aduana_name) LIKE '%salaverry%' AND year = 2024
    ORDER BY value_fob_usd DESC
    LIMIT 5
  `);
  console.log("\n=== SALAVERRY - Top 5 productos importados (FOB 2024) ===");
  for (const row of r2.rows) {
    const chg = row.pct_change != null ? `${(Number(row.pct_change)*100).toFixed(1)}%` : "n/d";
    console.log(`  ${row.subpartida} | ${String(row.product_desc).slice(0,40).padEnd(40)} | FOB US$ ${Number(row.value_fob_usd).toLocaleString("en")} | var ${chg}`);
  }

  // 3. Peso relativo
  const r3 = await pool.query(`
    SELECT MAX(value_cif_usd) as sala_total
    FROM port_imports
    WHERE aduana_name = 'SALAVERRY' AND year = 2024 AND is_total = true
  `);
  const r3b = await pool.query(`
    SELECT SUM(max_cif) as total_nacional FROM (
      SELECT MAX(value_cif_usd) as max_cif
      FROM port_imports
      WHERE year = 2024 AND is_total = true
      GROUP BY aduana_name
    ) sub
  `);
  const sala = Number(r3.rows[0]?.sala_total ?? 0);
  const nacional = Number(r3b.rows[0]?.total_nacional ?? 1);
  console.log(`\n=== SALAVERRY - Peso relativo ===`);
  console.log(`  Total SALAVERRY 2024:  US$ ${sala.toLocaleString("en")}`);
  console.log(`  Total nacional 2024:    US$ ${nacional.toLocaleString("en")}`);
  console.log(`  Participación:            ${(sala/nacional*100).toFixed(2)}% del total importaciones`);

  // 4. Top 10 aduanas
  const r4 = await pool.query(`
    SELECT aduana_name, MAX(value_cif_usd) as total_cif
    FROM port_imports WHERE year = 2024 AND is_total = true
    GROUP BY aduana_name ORDER BY total_cif DESC LIMIT 10
  `);
  console.log("\n=== Top 10 aduanas por volumen CIF 2024 ===");
  r4.rows.forEach((row, i) => {
    const pct = (Number(row.total_cif) / nacional * 100).toFixed(1);
    const mark = row.aduana_name === "SALAVERRY" ? " <-- LL" : "";
    console.log(`  ${(i+1)+"".padStart(2)}. ${String(row.aduana_name).padEnd(35)} US$ ${Number(row.total_cif).toLocaleString("en").padStart(15)} (${pct}%)${mark}`);
  });

  await pool.end();
}
main().catch(console.error);
