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

    const { rows: oxiBatches } = await pool.query(
      `SELECT id, records_total, checksum, fetched_at
       FROM raw_oxi_batches
       ORDER BY fetched_at DESC
       LIMIT 10`
    );

    const { rows: oxiBreakdown } = await pool.query(
      `SELECT fase, COUNT(*)::int AS total
       FROM oxi_investment_promotions
       GROUP BY fase
       ORDER BY fase`
    );

    res.json({
      lotes: batches,
      desgloseTipo: breakdown,
      oxiLotes: oxiBatches,
      oxiDesgloseFase: oxiBreakdown,
    });
  })
);
