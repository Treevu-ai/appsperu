import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const metaRouter = Router();

/** Trazabilidad de lotes INFOBRAS — mismo contrato `items[]` que usa rastro-web. */
metaRouter.get(
  "/sources",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id AS batch_id, filename, fetched_at, record_count, checksum
         FROM raw_infobras_batches
        ORDER BY fetched_at DESC
        LIMIT 10`,
    );
    res.json({
      items: rows.map((row) => ({
        runAt: row.fetched_at,
        records: Number(row.record_count),
        checksum: row.checksum,
        fuente: row.filename,
        cobertura: "PARCIAL" as const,
      })),
    });
  }),
);
