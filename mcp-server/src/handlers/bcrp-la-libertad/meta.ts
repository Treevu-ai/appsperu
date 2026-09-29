import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface BatchRow extends NeonRow {
  id: number;
  report_period: string;
  file_name: string;
  checksum: string;
  ingested_at: string;
}

interface BreakdownRow extends NeonRow {
  anexo_numero: number;
  total: number;
}

/**
 * Handler para `bcrp_la_libertad_meta_sources` — GET /api/meta/sources.
 * Origen: apps/bcrp-la-libertad/api/src/routes/meta.ts. SQL idéntico.
 */
export async function sources(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const { rows: batches } = await db.query<BatchRow>(
    `SELECT id, report_period, file_name, checksum, ingested_at
     FROM raw_bcrp_ll_batches
     ORDER BY ingested_at DESC
     LIMIT 10`
  );

  const { rows: breakdown } = await db.query<BreakdownRow>(
    `SELECT anexo_numero, COUNT(*)::int AS total
     FROM bcrp_ll_indicators
     GROUP BY anexo_numero
     ORDER BY anexo_numero`
  );

  return { status: 200, body: { lotes: batches, desgloseAnexo: breakdown } };
}
