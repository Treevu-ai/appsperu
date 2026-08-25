import { pool } from '../db/pool.js';
import { canClaimCoverage } from '../coverage/states.js';
import { TERRITORIAL_APP_CATALOG, summarizeAppCoverage } from '../coverage/app-catalog.js';

const args = process.argv.slice(2);
const value = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const app = value('--app');
const jurisdiction = value('--jurisdiccion')?.toUpperCase();
const requireComplete = args.includes('--require-complete');

const conditions: string[] = [];
const params: string[] = [];
if (app) { params.push(app); conditions.push(`c.app_name=$${params.length}`); }
if (jurisdiction) { params.push(jurisdiction); conditions.push(`j.name=$${params.length}`); }

const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
const sql = `SELECT DISTINCT ON (c.app_name,c.source_name,c.jurisdiction_code)
  c.app_name,c.source_name,j.code,j.name,c.requested,c.source_records,c.normalized_records,c.persisted_records,c.rejected_records,c.completeness,c.source_batch_ref,c.cutoff_at,c.restriction,c.dependencies,c.created_at
  FROM territorial_coverage c JOIN territorial_jurisdictions j ON j.code=c.jurisdiction_code
  ${where}
  ORDER BY c.app_name,c.source_name,c.jurisdiction_code,c.created_at DESC`;

try {
  const { rows } = await pool.query(sql, params);
  const report = rows.map((row) => ({ ...row, coverage_claimable: canClaimCoverage({ state: row.completeness, batch: row.source_batch_ref, cutoff: row.cutoff_at, persisted: row.persisted_records === null ? null : Number(row.persisted_records) }) }));
  const catalog = app ? TERRITORIAL_APP_CATALOG.filter((entry) => entry.app === app) : TERRITORIAL_APP_CATALOG;
  const apps = catalog.map((entry) => {
    const summary = summarizeAppCoverage({ app: entry.app, rows: report.filter((row) => row.app_name === entry.app) });
    const rowsReported = report.filter((row) => row.app_name === entry.app).length;
    return {
      ...summary,
      rows_reported: rowsReported,
      restriction: rowsReported === 0
        ? entry.defaultRestriction
        : null,
    };
  });
  console.log(JSON.stringify({ generated_at: new Date().toISOString(), apps, rows: report }, null, 2));
  if (requireComplete && apps.some((entry) => !entry.coverage_claimable)) process.exitCode = 2;
} finally { await pool.end(); }
