import { pool } from "./src/db/pool.js";

const r1 = await pool.query(`
  SELECT aduana_name, year, quarter, is_total, value_cif_usd
  FROM port_imports
  WHERE aduana_name = 'SALAVERRY'
  ORDER BY year, quarter NULLS LAST
`);
const totals = r1.rows.filter((r: { is_total: boolean }) => r.is_total);
const quarters = r1.rows.filter((r: { is_total: boolean }) => !r.is_total);
console.log("SALAVERRY totals:", totals.length, "| quarters:", quarters.length);
if (totals[0]) console.log("  2024 total CIF:", Number(totals[0].value_cif_usd).toFixed(0));
if (quarters[0]) console.log("  2024 Q1 CIF:", Number(quarters[0].value_cif_usd).toFixed(0));

const r2 = await pool.query("SELECT COUNT(*) as total, COUNT(DISTINCT aduana_name) as aduanas FROM port_imports");
console.log("\nport_imports:", r2.rows[0].total, "filas,", r2.rows[0].aduanas, "aduanas");

const r3 = await pool.query("SELECT COUNT(*) as total, COUNT(DISTINCT aduana_name) as aduanas FROM port_subpartida_imports");
console.log("port_subpartida_imports:", r3.rows[0].total, "filas,", r3.rows[0].aduanas, "aduanas");

const r4 = await pool.query("SELECT DISTINCT aduana_name FROM port_imports ORDER BY aduana_name");
console.log("\nAduanas en port_imports:", r4.rows.map((r: { aduana_name: string }) => r.aduana_name).join(", "));

await pool.end();
