import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface BatchRow extends NeonRow {
  batch_id: number;
  filename: string;
  fetched_at: string;
  record_count: number | string;
  checksum: string;
}

/**
 * Handler para `infobras_meta_sources` — GET /api/meta/sources.
 *
 * Trazabilidad de lotes INFOBRAS — mismo contrato `items[]` que expone el MCP.
 */
export async function sources(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;
  const { rows } = await db.query<BatchRow>(
    `SELECT id AS batch_id, filename, fetched_at, record_count, checksum
       FROM raw_infobras_batches
      ORDER BY fetched_at DESC
      LIMIT 10`,
  );
  return {
    status: 200,
    body: {
      items: rows.map((row) => ({
        runAt: row.fetched_at,
        records: Number(row.record_count),
        checksum: row.checksum,
        fuente: row.filename,
        cobertura: "PARCIAL" as const,
      })),
    },
  };
}