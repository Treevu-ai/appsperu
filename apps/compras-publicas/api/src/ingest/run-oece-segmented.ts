import { pool } from "../db/pool.js";
import { ingestOecdReleases, OecePageNotFoundError } from "./oece-connector.js";
import { ingestAwards } from "./oece-records-connector.js";
import { monthlySegments } from "./oece-segments.js";

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const kind = value("--kind");
const startSegment = value("--start-segment");
const endSegment = value("--end-segment");
const pageChunk = Number(value("--page-chunk") ?? 100);
const initialStartPage = Number(value("--start-page") ?? 1);

if ((kind !== "releases" && kind !== "records") || !startSegment || !endSegment || !Number.isInteger(pageChunk) || pageChunk < 1 || !Number.isInteger(initialStartPage) || initialStartPage < 1) {
  throw new Error("Usa --kind releases|records, --start-segment YYYY-MM, --end-segment YYYY-MM, --page-chunk entero >= 1 y --start-page entero >= 1.");
}

const segments = monthlySegments(startSegment, endSegment);
const summaries: unknown[] = [];

try {
  for (const dataSegmentationID of segments) {
    let startPage = dataSegmentationID === startSegment ? initialStartPage : 1;
    for (;;) {
      try {
        const summary = kind === "releases"
          ? await ingestOecdReleases({ maxPages: pageChunk, startPage, departamento: "LA LIBERTAD", params: { dataSegmentationID } })
          : await ingestAwards({ maxPages: pageChunk, startPage, departamento: "LA LIBERTAD", params: { dataSegmentationID } });
        summaries.push({ kind, dataSegmentationID, startPage, summary });
        console.log(JSON.stringify({ checkpoint: { kind, dataSegmentationID, startPage, pageChunk }, ...summary }));
        if (!summary.isPartial) break;
        startPage += summary.pagesFetched;
      } catch (error) {
        if (error instanceof OecePageNotFoundError && error.page === startPage && startPage > 1) {
          console.warn(JSON.stringify({ kind, dataSegmentationID, terminalPage: startPage, reason: "OECE_404_AFTER_NEXT_LINK" }));
          break;
        }
        throw error;
      }
    }
  }
  console.log(JSON.stringify({ status: "COMPLETE", scope: { department: "LA LIBERTAD", kind, segments }, summaries }, null, 2));
} catch (error) {
  console.error(`Barrido segmentado OECE de ${kind} falló:`, error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
