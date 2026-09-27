import XLSX from "xlsx";
import { readFileSync } from "fs";
import { normalizeCdro16 } from "./src/ingest/normalize.js";

const buf = readFileSync("C:/Users/acuba/appsperu/data/sunat/cdro_16.xlsx");
const wb = XLSX.read(buf, { type: "buffer" });
const ws = wb.Sheets[wb.SheetNames[0]];
const data = normalizeCdro16(ws);

console.log("Total rows:", data.length);
const sala = data.filter(r => r.aduana_name.toLowerCase().includes("salaverry"));
console.log("SALAVERRY rows:", sala.length);

const aduanaCounts = data.reduce((acc, r) => {
  acc[r.aduana_name] = (acc[r.aduana_name] || 0) + 1;
  return acc;
}, {} as Record<string, number>);
console.log("\nRows por aduana:");
for (const [name, count] of Object.entries(aduanaCounts).sort((a,b) => b[1]-a[1])) {
  console.log("  ", name.padEnd(35), count);
}

console.log("\nTop 3 SALAVERRY subpartidas:");
for (const r of sala.sort((a,b) => b.value_fob_usd - a.value_fob_usd).slice(0,3)) {
  console.log("  ", r.subpartida, "|", r.product_desc.slice(0,35).padEnd(35), "| FOB US$" + Number(r.value_fob_usd).toLocaleString('en'));
}
