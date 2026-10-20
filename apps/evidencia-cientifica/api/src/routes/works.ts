import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const worksRouter = Router();

const WorksQuerySchema = z.object({
  term: z.string().min(1).optional(),
  anio: z.string().regex(/^\d{4}$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

/**
 * Evidencia científica (papers indexados en CrossRef) para las categorías de
 * exportación no tradicional que cubre CLI Market. No es un catálogo completo
 * de CrossRef — solo lo que matchea la taxonomía de términos ingeridos.
 */
worksRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(WorksQuerySchema, req.query, res);
    if (!parsed) return;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (parsed.term) {
      values.push(parsed.term);
      conditions.push(`query_term = $${values.length}`);
    }
    if (parsed.anio) {
      values.push(Number(parsed.anio));
      conditions.push(`published_year = $${values.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = parsed.limit ? Math.min(Number(parsed.limit), 200) : 50;

    const { rows } = await pool.query(
      `SELECT doi, title, publisher, subjects, published_year, url, score, query_term
       FROM crossref_works
       ${where}
       ORDER BY published_year DESC NULLS LAST, score DESC NULLS LAST
       LIMIT ${limit}`,
      values
    );

    res.json({ resultados: rows, fuente: "crossref", isPartial: false });
  })
);
