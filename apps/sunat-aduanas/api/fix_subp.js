import XLSX from "xlsx";
import { readFileSync } from "fs";
import { pool } from "./src/db/pool.js";
import { normalizeCdro16 } from "./src/ingest/normalize.js";

async function main() {
  const buf = readFileSync("C:/Users/acuba/appsperu/data/sunat/cdro_16.xlsx");
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = normalizeCdro16(ws);

  const sala = data.filter(r => r.aduana_name.toLowerCase().includes("salaverry"));
  console.log("cdro_16 SALAVERRY rows:", sala.length);

  // Get or create batch
  const batch = await pool.query(
    `INSERT INTO raw_batches (source_file, year, checksum, row_count)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    ["cdro_16.xlsx", 2024, "fixed-salaverry", sala.length]
  );
  const batchId = Number(batch.rows[0].id);

  // Limpiar e insertar SALAVERRY en port_subpartida_imports
  // (borra cualquier fila con SALAVERRY, sin importar el codigo)
  await pool.query("DELETE FROM port_subpartida_imports WHERE LOWER(aduana_name) LIKE '%salaverry%'");
  console.log("Deleted existing SALAVERRY subpartidas");

  let inserted = 0;
  for (const row of sala) {
    await pool.query(
      `INSERT INTO port_subpartida_imports
         (aduana_code, aduana_name, year, subpartida, product_desc,
          value_fob_usd, value_cif_usd, pct_change, pct_structure, batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [row.aduana_code, row.aduana_name, row.year, row.subpartida, row.product_desc,
       row.value_fob_usd, row.value_cif_usd, row.pct_change, row.pct_structure, batchId]
    );
    inserted++;
  }
  console.log("Inserted SALAVERRY subpartidas:", inserted);

  // Top 5 productos SALAVERRY
  const top = await pool.query(`
    SELECT subpartida, product_desc, value_fob_usd, value_cif_usd, pct_change
    FROM port_subpartida_imports
    WHERE LOWER(aduana_name) LIKE '%salaverry%' AND year = 2024
    ORDER BY value_fob_usd DESC
    LIMIT 5
  `);
  console.log("\n=== Top 5 productos SALAVERRY por FOB 2024 ===");
  for (const row of top.rows) {
    const change = row.pct_change != null ? `${(Number(row.pct_change)*100).toFixed(1)}%` : 'n/d';
    const cif = Number(row.value_cif_usd).toLocaleString('en');
    const fob = Number(row.value_fob_usd).toLocaleString('en');
    console.log(`  ${row.subpartida} | ${row.product_desc.slice(0,40).padEnd(40)} | FOB US$ ${fob} | CIF US$ ${cif} | var ${change}`);
  }

  await pool.end();
}
main().catch(console.error);
