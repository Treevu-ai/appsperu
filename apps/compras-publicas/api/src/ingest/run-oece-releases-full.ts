import { pool } from "../db/pool.js";
import { ingestOecdReleases } from "./oece-connector.js";

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const startDate = value("--start-date");
const endDate = value("--end-date");
const pageChunk = Number(value("--page-chunk") ?? 100);
if (!startDate || !endDate || !Number.isInteger(pageChunk) || pageChunk < 1) throw new Error("Usa --start-date, --end-date y un --page-chunk entero >= 1.");

let startPage = 1;
const chunks: unknown[] = [];
try {
  for (;;) {
    const summary = await ingestOecdReleases({ maxPages: pageChunk, startPage, departamento: "LA LIBERTAD", params: { startDate, endDate } });
    chunks.push(summary);
    console.log(JSON.stringify({ checkpoint: { startPage, pageChunk }, ...summary }));
    if (!summary.isPartial) break;
    startPage += summary.pagesFetched;
  }
  console.log(JSON.stringify({ status: "COMPLETE", scope: { department: "LA LIBERTAD", startDate, endDate }, chunks }, null, 2));
} catch (error) {
  console.error("Barrido completo OECE de procesos falló:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
