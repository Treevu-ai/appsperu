import type { NeonPool, NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface SourceRow extends NeonRow {
  batch_id: number;
  resource_id: number;
  fetched_at: string | Date;
  record_count: number | string;
  checksum: string | null;
  rejected_count: number | string;
}

/**
 * Handler para `radar_ejecucion_meta_sources` — GET /api/meta/sources
 * Metadata de los últimos 10 lotes de ingesta del MEF (cuándo se corrió,
 * cuántos registros, checksum). ADR-0016 recomendación 1: fecha, filas
 * aceptadas/rechazadas y batch id de la última ingesta.
 */
export async function sources(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const { rows } = await db.query<SourceRow>(
    `SELECT rb.id AS batch_id, rb.resource_id, rb.fetched_at, rb.record_count, rb.checksum,
            (SELECT COUNT(*)::int FROM budget_execution_rejected ber WHERE ber.source_batch_id = rb.id) AS rejected_count
     FROM raw_mef_batches rb
     ORDER BY rb.fetched_at DESC
     LIMIT 10`
  );

  return {
    status: 200,
    body: {
      fuentes: [
        {
          dataset: "MEF - Presupuesto y ejecución de gasto",
          metodo: "API CKAN (datastore_search)",
          ultimosLotes: rows.map((r) => ({
            batchId: r.batch_id,
            resourceId: r.resource_id,
            extraidoEl: r.fetched_at,
            registros: Number(r.record_count),
            registrosRechazados: Number(r.rejected_count),
            checksum: r.checksum,
          })),
        },
      ],
    },
  };
}