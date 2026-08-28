import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const metaRouter = Router();

metaRouter.get(
  "/sources",
  asyncHandler(async (_req, res) => {
    const { rows: batches } = await pool.query(
      `SELECT id, report_period, file_name, checksum, ingested_at
       FROM raw_bcrp_ll_batches
       ORDER BY ingested_at DESC
       LIMIT 10`
    );

    const { rows: breakdown } = await pool.query(
      `SELECT anexo_numero, COUNT(*)::int AS total
       FROM bcrp_ll_indicators
       GROUP BY anexo_numero
       ORDER BY anexo_numero`
    );

    res.json({ lotes: batches, desgloseAnexo: breakdown });
  })
);
