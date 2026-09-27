const XLSX = require("xlsx");
const fs = require("fs");

const buf = fs.readFileSync("C:/Users/acuba/appsperu/data/sunat/cdro_16.xlsx");
const wb = XLSX.read(buf, { type: "buffer" });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

// Show first 10 data rows (after headers) to understand structure
console.log("First 15 rows:");
for (let i = 0; i < 15; i++) {
  if (!rows[i]) continue;
  const r = rows[i];
  const slice = [];
  for (let c = 0; c < Math.min(r.length, 12); c++) {
    slice.push("[" + c + "]=" + JSON.stringify(r[c]).slice(0, 20));
  }
  console.log("  r" + i + ": " + slice.join(" | "));
}

// Find SALAVERRY subpartida rows (rows after "Total SALAVERRY" that have numeric idx)
let found = false;
for (let i = 328; i < Math.min(350, rows.length); i++) {
  const r = rows[i];
  if (!r) continue;
  if (r[0] && String(r[0]).includes("SALAVERRY") && r[2] !== undefined) {
    found = true;
    console.log("\n=== SALAVERRY subpartida row r" + i + " ===");
    for (let c = 0; c < r.length; c++) {
      console.log("  [" + c + "]:", JSON.stringify(r[c]));
    }
    break;
  }
}
