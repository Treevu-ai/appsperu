import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * Handler para `inversion_privada_meta_sources` — GET /api/meta/sources.
 *
 * SQL idéntico a `apps/inversion-privada/api/src/routes/meta.ts`.
 */
export async function sources(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const { rows: batches } = await db.query<NeonRow>(
    `SELECT id, records_total, checksum, fetched_at
     FROM raw_vertix_batches
     ORDER BY fetched_at DESC
     LIMIT 10`,
  );

  const { rows: breakdown } = await db.query<NeonRow>(
    `SELECT tipo_proyecto, COUNT(*)::int AS total
     FROM private_investment_projects
     GROUP BY tipo_proyecto
     ORDER BY tipo_proyecto`,
  );

  const { rows: oxiBatches } = await db.query<NeonRow>(
    `SELECT id, records_total, checksum, fetched_at
     FROM raw_oxi_batches
     ORDER BY fetched_at DESC
     LIMIT 10`,
  );

  const { rows: oxiBreakdown } = await db.query<NeonRow>(
    `SELECT fase, COUNT(*)::int AS total
     FROM oxi_investment_promotions
     GROUP BY fase
     ORDER BY fase`,
  );

  return {
    status: 200,
    body: {
      lotes: batches,
      desgloseTipo: breakdown,
      oxiLotes: oxiBatches,
      oxiDesgloseFase: oxiBreakdown,
    },
  };
}
