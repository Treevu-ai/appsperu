import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const metaRouter = Router();

metaRouter.get(
  "/sources",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id, series_codes, period_start, period_end, checksum, fetched_at
       FROM raw_bcrp_batches
       ORDER BY fetched_at DESC
       LIMIT 10`
    );
    res.json({ lotes: rows });
  })
);
