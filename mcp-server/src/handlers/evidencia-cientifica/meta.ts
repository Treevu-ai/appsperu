import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface BatchRow extends NeonRow {
  id: string;
  query_term: string;
  rows_requested: number;
  checksum: string;
  fetched_at: string;
}

/**
 * Handler para `evidencia_cientifica_meta_sources` — GET /api/meta/sources.
 * SQL idéntico a `apps/evidencia-cientifica/api/src/routes/meta.ts`.
 */
export async function sources(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;
  const { rows } = await db.query<BatchRow>(
    `SELECT id, query_term, rows_requested, checksum, fetched_at
     FROM raw_crossref_batches
     ORDER BY fetched_at DESC
     LIMIT 10`
  );
  return { status: 200, body: { lotes: rows } };
}
