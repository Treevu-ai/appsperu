import { pool } from "./src/db/pool.js";

async function main() {
  // 1. SALAVERRY — datos de importación SUNAT
  const r1 = await pool.query(`
    SELECT aduana_name, year, quarter, is_total, value_cif_usd
    FROM port_imports
    WHERE aduana_name = 'SALAVERRY' AND year = 2024
    ORDER BY quarter NULLS LAST
  `);
  console.log("=== SALAVERRY importaciones CIF 2024 (SUNAT cdro_15) ===");
  for (const row of r1.rows) {
    const label = row.quarter ? `Q${row.quarter}` : "TOTAL";
    console.log(`  ${label}: US$ ${Number(row.value_cif_usd).toLocaleString('en')}`);
  }

  // 2. Top 10 aduanas por volumen CIF 2024
  const r2 = await pool.query(`
    SELECT aduana_name, year, MAX(value_cif_usd) as total_cif
    FROM port_imports
    WHERE year = 2024 AND is_total = true
    GROUP BY aduana_name, year
    ORDER BY total_cif DESC
    LIMIT 10
  `);
  console.log("\n=== Top 10 aduanas por CIF 2024 ===");
  r2.rows.forEach((row, i) => {
    const pct = (Number(row.total_cif) / 55064124291 * 100).toFixed(1);
    console.log(`  ${i+1}. ${row.aduana_name.padEnd(30)} US$ ${Number(row.total_cif).toLocaleString('en')} (${pct}%)`);
  });

  // 3. Top 5 subpartidas SALAVERRY por FOB
  const r3 = await pool.query(`
    SELECT subpartida, product_desc, value_fob_usd, value_cif_usd, pct_change
    FROM port_subpartida_imports
    WHERE aduana_name = 'SALAVERRY' AND year = 2024
    ORDER BY value_fob_usd DESC
    LIMIT 5
  `);
  console.log("\n=== Top 5 subpartidas SALAVERRY por FOB 2024 ===");
  for (const row of r3.rows) {
    const change = row.pct_change != null ? `${(Number(row.pct_change)*100).toFixed(1)}%` : 'n/d';
    console.log(`  ${row.subpartida} | ${row.product_desc.slice(0,35).padEnd(35)} | FOB US$ ${Number(row.value_fob_usd).toLocaleString('en')} | var ${change}`);
  }

  // 4. ¿Cuánto representa SALAVERRY del total?
  const r4 = await pool.query(`
    SELECT
      (SELECT MAX(value_cif_usd) FROM port_imports WHERE aduana_name = 'SALAVERRY' AND year = 2024 AND is_total = true) as salaverry_total,
      (SELECT SUM(value_cif_usd) FROM port_imports WHERE year = 2024 AND is_total = true AND aduana_name NOT LIKE '%AEREA%' AND aduana_name NOT LIKE '%POSTAL%') as maritimo_total
  `);
  const salaverry = Number(r4.rows[0]?.salaverry_total ?? 0);
  const maritimo = Number(r4.rows[0]?.maritimo_total ?? 0);
  if (salaverry && maritimo) {
    console.log(`\n=== Peso relativo SALAVERRY ===`);
    console.log(`  SALAVERRY 2024 total: US$ ${salaverry.toLocaleString('en')}`);
    console.log(`  Total marítimo 2024:    US$ ${maritimo.toLocaleString('en')}`);
    console.log(`  Participación:         ${(salaverry/maritimo*100).toFixed(2)}% del comercio marítimo`);
    console.log(`  Participación nacional: ${(salaverry/55064124291*100).toFixed(2)}% del total importaciones`);
  }

  await pool.end();
}

main().catch(console.error);
