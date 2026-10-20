import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const metaRouter = Router();

metaRouter.get(
  "/sources",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id, query_term, rows_requested, checksum, fetched_at
       FROM raw_crossref_batches
       ORDER BY fetched_at DESC
       LIMIT 10`
    );
    res.json({ lotes: rows });
  })
);
