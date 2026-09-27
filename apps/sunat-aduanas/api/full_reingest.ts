import XLSX from "xlsx";
import { readFileSync } from "fs";
import { pool } from "./src/db/pool.js";
import { normalizeCdro15, normalizeCdro16 } from "./src/ingest/normalize.js";

async function ingestSubp(file: string) {
  const buf = readFileSync("C:/Users/acuba/appsperu/data/sunat/" + file);
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = normalizeCdro16(ws);

  console.log(file + ": " + data.length + " filas normalizadas");

  await pool.query("DELETE FROM port_subpartida_imports");
  const batch = await pool.query(
    "INSERT INTO raw_batches (source_file, year, checksum, row_count) VALUES ($1,$2,$3,$4) RETURNING id",
    [file, 2024, "fixed-v2", data.length]
  );
  const batchId = Number(batch.rows[0].id);

  let inserted = 0;
  for (const row of data) {
    try {
      await pool.query(
        "INSERT INTO port_subpartida_imports (aduana_code, aduana_name, year, subpartida, product_desc, value_fob_usd, value_cif_usd, pct_change, pct_structure, batch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [row.aduana_code, row.aduana_name, row.year, row.subpartida, row.product_desc, row.value_fob_usd, row.value_cif_usd, row.pct_change, row.pct_structure, batchId]
      );
      inserted++;
    } catch(e: unknown) {}
  }
  console.log(file + ": " + inserted + " filas insertadas");
  return inserted;
}

async function main() {
  const total = await ingestSubp("cdro_16.xlsx");

  const r = await pool.query("SELECT COUNT(*) as c, COUNT(DISTINCT aduana_name) as ad FROM port_subpartida_imports");
  console.log("\nport_subpartida_imports final: " + r.rows[0].c + " filas, " + r.rows[0].ad + " aduanas");

  const sala = await pool.query("SELECT COUNT(*) as c FROM port_subpartida_imports WHERE LOWER(aduana_name) LIKE '%salaverry%'");
  console.log("SALAVERRY subpartidas: " + sala.rows[0].c);

  const top = await pool.query("SELECT subpartida, product_desc, value_fob_usd, value_cif_usd FROM port_subpartida_imports WHERE LOWER(aduana_name) LIKE '%salaverry%' ORDER BY value_fob_usd DESC LIMIT 5");
  console.log("\nTop 5 SALAVERRY por FOB:");
  for (const row of top.rows) {
    console.log("  " + row.subpartida + " | " + String(row.product_desc).slice(0,40).padEnd(40) + " | FOB US$" + Number(row.value_fob_usd).toLocaleString("en") + " | CIF US$" + Number(row.value_cif_usd).toLocaleString("en"));
  }

  await pool.end();
}

main().catch(console.error);
