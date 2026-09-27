const XLSX = require("xlsx");
const fs = require("fs");

const buf = fs.readFileSync("C:/Users/acuba/appsperu/data/sunat/cdro_16.xlsx");
const wb = XLSX.read(buf, { type: "buffer" });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

// Find SALAVERRY rows
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (!r) continue;
  const s = JSON.stringify(r).toLowerCase();
  if (s.includes("salaverry")) {
    console.log("=== Row", i, "===");
    for (let c = 0; c < r.length; c++) {
      console.log("  [" + c + "]:", JSON.stringify(r[c]));
    }
    break;
  }
}
