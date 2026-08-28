import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const metaRouter = Router();

metaRouter.get(
  "/sources",
  asyncHandler(async (_req, res) => {
    const { rows: batches } = await pool.query(
      `SELECT id, records_total, checksum, fetched_at
       FROM raw_vertix_batches
       ORDER BY fetched_at DESC
       LIMIT 10`
    );

    const { rows: breakdown } = await pool.query(
      `SELECT tipo_proyecto, COUNT(*)::int AS total
       FROM private_investment_projects
       GROUP BY tipo_proyecto
       ORDER BY tipo_proyecto`
    );

    res.json({ lotes: batches, desgloseTipo: breakdown });
  })
);
