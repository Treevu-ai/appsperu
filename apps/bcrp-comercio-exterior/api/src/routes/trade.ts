import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const tradeRouter = Router();

const TradeQuerySchema = z.object({
  series: z.string().min(1).optional(),
  anio: z.string().regex(/^\d{4}$/).optional(),
  desde: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

/**
 * Comercio exterior agregado nacional (millones US$ FOB), fuente BCRP PN38714BM–PN38723BM.
 * Indicador macro de contexto — sin desagregación territorial ni por empresa.
 */
tradeRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(TradeQuerySchema, req.query, res);
    if (!parsed) return;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (parsed.series) {
      values.push(parsed.series);
      conditions.push(`series_key = $${values.length}`);
    }
    if (parsed.anio) {
      values.push(Number(parsed.anio));
      conditions.push(`period_year = $${values.length}`);
    }
    if (parsed.desde) {
      const [year, month] = parsed.desde.split("-").map(Number);
      values.push(year, month);
      conditions.push(`(period_year > $${values.length - 1} OR (period_year = $${values.length - 1} AND period_month >= $${values.length}))`);
    }
    if (parsed.hasta) {
      const [year, month] = parsed.hasta.split("-").map(Number);
      values.push(year, month);
      conditions.push(`(period_year < $${values.length - 1} OR (period_year = $${values.length - 1} AND period_month <= $${values.length}))`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT series_code, series_key, series_title, category, period_year, period_month, value_usd_millions
       FROM trade_indicators
       ${where}
       ORDER BY period_year, period_month, series_key`,
      values
    );

    res.json({ resultados: rows, cobertura: "nacional_agregado", isPartial: false });
  })
);
