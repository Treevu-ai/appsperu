import XLSX from "xlsx";
import { readFileSync } from "fs";
import { normalizeCdro15 } from "./src/ingest/normalize.js";

const buf = readFileSync("C:/Users/acuba/appsperu/data/sunat/cdro_15.xlsx");
const wb = XLSX.read(buf, { type: "buffer" });
const ws = wb.Sheets[wb.SheetNames[0]];

const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log("Total rows:", rows.length);
console.log("\nRows with SALAVERRY:");
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  if (!row) continue;
  const s = JSON.stringify(row).toLowerCase();
  if (s.includes("salaverry") || s.includes("sala")) {
    console.log(`  [${i}]: ${JSON.stringify(row.slice(0,4))}`);
  }
}

console.log("\nNormalized SALAVERRY rows:");
const norm = normalizeCdro15(ws);
const sala = norm.filter(r => r.aduana_name.toLowerCase().includes("sala"));
console.log("  Count:", sala.length);
for (const r of sala) {
  console.log(`  ${r.aduana_name} | ${r.year} | Q${r.quarter} | total=${r.is_total} | US$${Number(r.value_cif_usd).toLocaleString('en')}`);
}

console.log("\nAll aduana names in normalized:");
const names = [...new Set(norm.map(r => r.aduana_name))];
for (const n of names.sort()) {
  console.log("  -", n);
}
