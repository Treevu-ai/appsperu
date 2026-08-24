import { pool } from "../db/pool.js";
import { filterRecordsByDepartment } from "./oece-records-connector.js";
import { normalizeBidders, persistBidders } from "./normalize-bidders.js";
import type { OcdsRecord } from "./normalize-awards.js";

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const startSegment = value("--start-segment");
const endSegment = value("--end-segment");

if (!startSegment || !endSegment || !/^\d{4}-(0[1-9]|1[0-2])$/.test(startSegment) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(endSegment) || endSegment < startSegment) {
  throw new Error("Usa --start-segment YYYY-MM y --end-segment YYYY-MM, en orden ascendente.");
}

const { rows: batches } = await pool.query<{ id: number; payload: OcdsRecord[] }>(
  `SELECT id, payload
   FROM raw_ocds_batches
   WHERE source_endpoint = '/records'
     AND query_params->>'dataSegmentationID' BETWEEN $1 AND $2
   ORDER BY id`,
  [startSegment, endSegment],
);

let batchesProcessed = 0;
let recordsInScope = 0;
let inserted = 0;
let rejected = 0;

try {
  for (const batch of batches) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const territorialRecords = filterRecordsByDepartment(batch.payload, "LA LIBERTAD");
      const normalized = normalizeBidders(territorialRecords);
      const persisted = await persistBidders(client, normalized.rows, batch.id);
      for (const bad of normalized.rejected) {
        await client.query(
          `INSERT INTO bidders_rejected (source_batch_id, raw_bidder_data, reason) VALUES ($1, $2, $3)`,
          [batch.id, JSON.stringify(bad.raw), bad.reason],
        );
      }
      await client.query("COMMIT");
      batchesProcessed += 1;
      recordsInScope += territorialRecords.length;
      inserted += persisted.inserted;
      rejected += normalized.rejected.length;
      console.log(JSON.stringify({ batchId: batch.id, recordsInScope: territorialRecords.length, biddersInserted: persisted.inserted, biddersRejected: normalized.rejected.length }));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  console.log(JSON.stringify({ status: "COMPLETE", scope: { department: "LA LIBERTAD", startSegment, endSegment }, batchesProcessed, recordsInScope, biddersInserted: inserted, biddersRejected: rejected }, null, 2));
} finally {
  await pool.end();
}
