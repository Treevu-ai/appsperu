import { pool } from "../db/pool.js";

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const startDate = value("--start-date");
const endDate = value("--end-date");

if (!startDate || !endDate) {
  throw new Error("Usa --start-date YYYY-MM-DD y --end-date YYYY-MM-DD.");
}

try {
  const result = await pool.query<{ reconciliation_status: string; cases: number; award_rows: number }>(
     `WITH release_scope AS (
       SELECT p.ocid, p.source_batch_id
       FROM procurement_processes p
       WHERE p.tender_inicio >= $1::date
         AND p.tender_inicio < ($2::date + INTERVAL '1 day')
     ),
     record_scope AS (
       SELECT a.ocid,
              MAX(a.source_batch_id) AS source_batch_id,
              COUNT(*)::int AS award_rows
       FROM awards a
       JOIN raw_ocds_batches b ON b.id = a.source_batch_id
       WHERE b.source_endpoint = '/records'
         AND b.query_params ? 'dataSegmentationID'
       GROUP BY a.ocid
     ),
     links AS (
       SELECT COALESCE(r.ocid, a.ocid) AS ocid,
              r.source_batch_id AS release_source_batch_id,
              a.source_batch_id AS record_source_batch_id,
              (r.ocid IS NOT NULL) AS release_present,
              (a.ocid IS NOT NULL) AS award_present,
              COALESCE(a.award_rows, 0) AS award_rows
       FROM release_scope r
       FULL OUTER JOIN record_scope a ON a.ocid = r.ocid
     ),
     upserted AS (
       INSERT INTO oece_ocid_reconciliations (
         ocid, release_source_batch_id, record_source_batch_id, release_present,
         award_present, award_rows, reconciliation_status, match_method,
         scope_start, scope_end, reconciled_at
       )
       SELECT ocid, release_source_batch_id, record_source_batch_id, release_present,
              award_present, award_rows,
              CASE
                WHEN release_present AND award_present THEN 'matched_exact_ocid'
                WHEN release_present THEN 'release_only'
                ELSE 'record_only'
              END,
              'ocid_exact', $1::date, $2::date, now()
       FROM links
       ON CONFLICT (ocid) DO UPDATE SET
         release_source_batch_id = EXCLUDED.release_source_batch_id,
         record_source_batch_id = EXCLUDED.record_source_batch_id,
         release_present = EXCLUDED.release_present,
         award_present = EXCLUDED.award_present,
         award_rows = EXCLUDED.award_rows,
         reconciliation_status = EXCLUDED.reconciliation_status,
         match_method = EXCLUDED.match_method,
         scope_start = EXCLUDED.scope_start,
         scope_end = EXCLUDED.scope_end,
         reconciled_at = now()
       RETURNING reconciliation_status, award_rows
     )
     SELECT reconciliation_status, COUNT(*)::int AS cases, SUM(award_rows)::int AS award_rows
     FROM upserted
     GROUP BY reconciliation_status
     ORDER BY reconciliation_status`,
    [startDate, endDate],
  );
  console.log(JSON.stringify({
    status: "COMPLETE",
    scope: { department: "LA LIBERTAD", startDate, endDate },
    matchMethod: "ocid_exact",
    results: result.rows,
  }, null, 2));
} finally {
  await pool.end();
}
