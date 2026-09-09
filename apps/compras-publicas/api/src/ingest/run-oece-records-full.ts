import { pool } from "../db/pool.js";
import { ingestAwards, type IngestAwardsSummary } from "./oece-records-connector.js";
import { OecePageNotFoundError, PERU_DEPARTAMENTOS, resolveDepartamentosFromEnv } from "./oece-connector.js";

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const startDate = value("--start-date");
const endDate = value("--end-date");
const pageChunk = Number(value("--page-chunk") ?? 100);
const initialStartPage = Number(value("--start-page") ?? 1);
if (!startDate || !endDate || !Number.isInteger(pageChunk) || pageChunk < 1 || !Number.isInteger(initialStartPage) || initialStartPage < 1) {
  throw new Error("Usa --start-date, --end-date, --page-chunk entero >= 1 y --start-page entero >= 1.");
}

// CT-08 (2026-09-09): antes hardcodeaba "LA LIBERTAD" — ver la misma nota en
// run-oece-releases-full.ts.
const departamentos = resolveDepartamentosFromEnv() ?? [...PERU_DEPARTAMENTOS];

let startPage = initialStartPage;
const chunks: unknown[] = [];
try {
  for (;;) {
    let summary: IngestAwardsSummary;
    try {
      summary = await ingestAwards({ maxPages: pageChunk, startPage, departamentos, params: { startDate, endDate } });
    } catch (error) {
      if (error instanceof OecePageNotFoundError && error.page === startPage && startPage > 1) {
        console.warn(JSON.stringify({ terminalPage: startPage, reason: "OECE_404_AFTER_NEXT_LINK" }));
        break;
      }
      throw error;
    }
    chunks.push(summary);
    console.log(JSON.stringify({ checkpoint: { startPage, pageChunk }, ...summary }));
    if (!summary.isPartial) break;
    startPage += summary.pagesFetched;
  }
  console.log(JSON.stringify({ status: "COMPLETE", scope: { departamentos, startDate, endDate }, chunks }, null, 2));
} catch (error) {
  console.error("Barrido completo OECE de adjudicaciones/postores falló:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
