const XLSX = require("xlsx");
const fs = require("fs");

const buf = fs.readFileSync("C:/Users/acuba/appsperu/data/sunat/cdro_15.xlsx");
const wb = XLSX.read(buf, { type: "buffer" });
const ws = wb.Sheets[wb.SheetNames[0]];

// sheet_to_json con header:1 -> array de arrays
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log("Total rows:", rows.length);
console.log("\nFirst 12 rows (cols 0-4):");
for (let i = 0; i < 12; i++) {
    if (!rows[i]) continue;
    const slice = rows[i].slice(0, 5).map(c => (c === null || c === undefined ? "None" : String(c).slice(0,15)));
    console.log(`  [${i}]: ${JSON.stringify(slice)}`);
}
console.log("\nRow 7 full (TOTAL nacional):");
console.log("  " + JSON.stringify(rows[7]?.slice(0, 13)));
console.log("\nRow 8 full (SALAVERRY):");
console.log("  " + JSON.stringify(rows[8]?.slice(0, 13)));
