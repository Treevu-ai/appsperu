import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface BatchRow extends NeonRow {
  id: number;
  series_codes: string[];
  period_start: string;
  period_end: string;
  checksum: string;
  fetched_at: string;
}

/**
 * Handler para `bcrp_comercio_exterior_meta_sources` — GET /api/meta/sources.
 * SQL idéntico a `apps/bcrp-comercio-exterior/api/src/routes/meta.ts`.
 */
export async function sources(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const { rows } = await db.query<BatchRow>(
    `SELECT id, series_codes, period_start, period_end, checksum, fetched_at
     FROM raw_bcrp_batches
     ORDER BY fetched_at DESC
     LIMIT 10`
  );

  return { status: 200, body: { lotes: rows } };
}
