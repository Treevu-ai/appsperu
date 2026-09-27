import XLSX from "xlsx";
import { readFileSync } from "fs";
import { pool } from "./src/db/pool.js";
import { normalizeCdro16 } from "./src/ingest/normalize.js";

async function main() {
  // Check cdro_16 normalization for SALAVERRY
  const buf = readFileSync("C:/Users/acuba/appsperu/data/sunat/cdro_16.xlsx");
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = normalizeCdro16(ws);

  const sala = data.filter(r => r.aduana_name.toLowerCase().includes("sala"));
  console.log("cdro_16 SALAVERRY normalized rows:", sala.length);
  for (const r of sala.slice(0, 5)) {
    console.log("  ", r.aduana_code, r.aduana_name, r.subpartida, r.product_desc.slice(0,30), "FOB US$" + Number(r.value_fob_usd).toLocaleString('en'));
  }

  // Check BD
  const r2 = await pool.query("SELECT aduana_name, COUNT(*) as c FROM port_subpartida_imports GROUP BY aduana_name ORDER BY c DESC");
  console.log("\nAduanas en port_subpartida_imports:");
  for (const row of r2.rows) {
    console.log("  ", row.aduana_name, ":", row.c, "filas");
  }

  const r3 = await pool.query("SELECT * FROM port_subpartida_imports WHERE LOWER(aduana_name) LIKE '%sala%' LIMIT 3");
  console.log("\nSALAVERRY in BD:", r3.rows.length);

  await pool.end();
}
main().catch(console.error);
