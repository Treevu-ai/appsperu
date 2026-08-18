import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const metaRouter = Router();

metaRouter.get("/sources", asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT resource_id, fetched_at, record_count, checksum
     FROM raw_mef_batches
     ORDER BY fetched_at DESC
     LIMIT 10`
  );

  res.json({
    fuentes: [
      {
        dataset: "MEF - Presupuesto y ejecución de gasto",
        metodo: "API CKAN (datastore_search)",
        ultimosLotes: rows.map((r) => ({
          resourceId: r.resource_id,
          extraidoEl: r.fetched_at,
          registros: r.record_count,
          checksum: r.checksum,
        })),
      },
    ],
  });
}));
