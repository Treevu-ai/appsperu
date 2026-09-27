import { pool } from "./src/db/pool.js";

async function main() {
  const r1 = await pool.query("SELECT DISTINCT aduana_name, aduana_code FROM port_imports WHERE aduana_name LIKE '%SALA%' ORDER BY aduana_name");
  console.log("Aduanas con 'SALA':", r1.rows);

  const r2 = await pool.query("SELECT * FROM port_imports WHERE aduana_name = 'SALAVERRY' LIMIT 5");
  console.log("\nSALAVERRY rows:", r2.rows.length, r2.rows);

  const r3 = await pool.query("SELECT aduana_name, year, is_total, MAX(value_cif_usd) as mx FROM port_imports WHERE year = 2024 AND is_total = true GROUP BY aduana_name, year, is_total ORDER BY mx DESC LIMIT 15");
  console.log("\nTop 15 total 2024:");
  for (const row of r3.rows) {
    console.log(" ", row.aduana_name, "US$" + Number(row.mx).toLocaleString('en'));
  }

  await pool.end();
}
main().catch(console.error);
