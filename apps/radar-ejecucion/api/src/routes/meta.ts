import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const metaRouter = Router();

/**
 * ADR-0016 (docs/adr/0016-automatizacion-conectores-nucleo-evaluacion.md),
 * recomendación 1: fecha, filas aceptadas/rechazadas y batch id de la
 * última ingesta — `batchId` y `registrosRechazados` (vía
 * `budget_execution_rejected`) se agregaron a este endpoint ya existente
 * para mef-connector.ts, mismo criterio que
 * compras-publicas `GET /api/meta/freshness`.
 */
metaRouter.get("/sources", asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT rb.id AS batch_id, rb.resource_id, rb.fetched_at, rb.record_count, rb.checksum,
            (SELECT COUNT(*)::int FROM budget_execution_rejected ber WHERE ber.source_batch_id = rb.id) AS rejected_count
     FROM raw_mef_batches rb
     ORDER BY rb.fetched_at DESC
     LIMIT 10`
  );

  res.json({
    fuentes: [
      {
        dataset: "MEF - Presupuesto y ejecución de gasto",
        metodo: "API CKAN (datastore_search)",
        ultimosLotes: rows.map((r) => ({
          batchId: r.batch_id,
          resourceId: r.resource_id,
          extraidoEl: r.fetched_at,
          registros: r.record_count,
          registrosRechazados: r.rejected_count,
          checksum: r.checksum,
        })),
      },
    ],
  });
}));
