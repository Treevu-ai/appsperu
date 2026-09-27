import XLSX from "xlsx";
import { readFileSync } from "fs";
import { pool } from "./src/db/pool.js";
import { normalizeCdro15 } from "./src/ingest/normalize.js";

async function main() {
  const buf = readFileSync("C:/Users/acuba/appsperu/data/sunat/cdro_15.xlsx");
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = normalizeCdro15(ws);

  console.log("Normalized rows:", data.length);
  const salaRows = data.filter(r => r.aduana_name === "SALAVERRY");
  console.log("SALAVERRY rows:", salaRows.length);

  // Verificar cuántas filas hay en la BD
  const before = await pool.query("SELECT COUNT(*) as c FROM port_imports WHERE aduana_name = 'SALAVERRY'");
  console.log("BD before:", before.rows[0].c, "SALAVERRY rows");

  // Insertar directo sin ON CONFLICT (sobrescribir todo)
  const batchIns = await pool.query(
    `INSERT INTO raw_batches (source_file, year, checksum, row_count)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ["cdro_15.xlsx", 2024, "manual-reingest", data.length]
  );
  const batchId = Number(batchIns.rows[0].id);
  console.log("Batch ID:", batchId);

  // Limpiar y re-insertar SALAVERRY
  await pool.query("DELETE FROM port_imports WHERE aduana_name = 'SALAVERRY'");
  console.log("Deleted SALAVERRY from port_imports");

  let inserted = 0;
  for (const row of salaRows) {
    await pool.query(
      `INSERT INTO port_imports (aduana_code, aduana_name, year, quarter, is_total, value_cif_usd, batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [row.aduana_code, row.aduana_name, row.year, row.quarter, row.is_total, row.value_cif_usd, batchId]
    );
    inserted++;
  }
  console.log("Inserted SALAVERRY:", inserted, "rows");

  const after = await pool.query("SELECT COUNT(*) as c FROM port_imports WHERE aduana_name = 'SALAVERRY'");
  console.log("BD after:", after.rows[0].c, "SALAVERRY rows");

  // También insertar todas las demás aduanas
  const others = data.filter(r => r.aduana_name !== "SALAVERRY");
  let othersInserted = 0;
  for (const row of others) {
    try {
      await pool.query(
        `INSERT INTO port_imports (aduana_code, aduana_name, year, quarter, is_total, value_cif_usd, batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [row.aduana_code, row.aduana_name, row.year, row.quarter, row.is_total, row.value_cif_usd, batchId]
      );
      othersInserted++;
    } catch(e) {
      // ignore dupes
    }
  }
  console.log("Inserted others:", othersInserted);

  const total = await pool.query("SELECT COUNT(*) as c FROM port_imports");
  console.log("Total port_imports:", total.rows[0].c);

  await pool.end();
}
main().catch(console.error);
