const XLSX = require("xlsx");
const fs = require("fs");

const buf = fs.readFileSync("C:/Users/acuba/appsperu/data/sunat/cdro_16.xlsx");
const wb = XLSX.read(buf, { type: "buffer" });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

// Find SALAVERRY Total row
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (!r || !r[0]) continue;
  if (String(r[0]).includes("Total SALAVERRY")) {
    console.log("=== Total SALAVERRY at row", i, "===");
    for (let c = 0; c < 12; c++) console.log("  [" + c + "] =", JSON.stringify(r[c]));
    console.log("\nNext 3 rows (subpartidas):");
    for (let j = i+1; j < i+4; j++) {
      const sr = rows[j];
      if (!sr) continue;
      console.log("  row", j + ":");
      for (let c = 0; c < 12; c++) console.log("    [" + c + "] =", JSON.stringify(sr[c]));
    }
    break;
  }
}
