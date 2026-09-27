import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const portsRouter = Router();

const QuerySchema = z.object({
  aduana: z.string().optional(),
  anio: z.string().regex(/^\d{4}$/).optional(),
  desde: z.string().regex(/^\d{4}$/).optional(),
  hasta: z.string().regex(/^\d{4}$/).optional(),
  subpartida: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/**
 * Importaciones CIF por aduana y año (trimestral + total anual).
 * cdro_15 — fuente: SUNAT Anuario de Comercio Exterior.
 */
portsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const p = parseQuery(QuerySchema, req.query, res);
    if (!p) return;

    const cond: string[] = [];
    const vals: unknown[] = [];

    if (p.aduana) { vals.push(p.aduana); cond.push(`LOWER(aduana_name) LIKE $${vals.length}`); }
    if (p.anio) { vals.push(Number(p.anio)); cond.push(`year = $${vals.length}`); }
    if (p.desde) { vals.push(Number(p.desde)); cond.push(`year >= $${vals.length}`); }
    if (p.hasta) { vals.push(Number(p.hasta)); cond.push(`year <= $${vals.length}`); }

    const where = cond.length ? "WHERE " + cond.join(" AND ") : "";
    const limit = p.limit ?? 200;

    const { rows } = await pool.query(
      `SELECT aduana_code, aduana_name, year, quarter, is_total, value_cif_usd
       FROM port_imports
       ${where}
       ORDER BY year DESC, aduana_name, quarter NULLS LAST`,
      vals
    );

    res.json({ resultados: rows.slice(0, limit), fuente: "SUNAT cdro_15", cobertura: "nacional" });
  })
);

/**
 * Importaciones por aduana + subpartida (nivel de detalle productos).
 * cdro_16 — fuente: SUNAT Anuario de Comercio Exterior.
 */
portsRouter.get(
  "/subpartidas",
  asyncHandler(async (req, res) => {
    const p = parseQuery(QuerySchema, req.query, res);
    if (!p) return;

    const cond: string[] = [];
    const vals: unknown[] = [];

    if (p.aduana) { vals.push(p.aduana); cond.push(`LOWER(aduana_name) LIKE $${vals.length}`); }
    if (p.anio) { vals.push(Number(p.anio)); cond.push(`year = $${vals.length}`); }
    if (p.desde) { vals.push(Number(p.desde)); cond.push(`year >= $${vals.length}`); }
    if (p.hasta) { vals.push(Number(p.hasta)); cond.push(`year <= $${vals.length}`); }
    if (p.subpartida) { vals.push(p.subpartida); cond.push(`subpartida LIKE $${vals.length}`); }

    const where = cond.length ? "WHERE " + cond.join(" AND ") : "";
    const limit = p.limit ?? 200;

    const { rows } = await pool.query(
      `SELECT aduana_code, aduana_name, year, subpartida, product_desc,
              value_fob_usd, value_cif_usd, pct_change, pct_structure
       FROM port_subpartida_imports
       ${where}
       ORDER BY year DESC, aduana_name, value_fob_usd DESC`,
      vals
    );

    res.json({ resultados: rows.slice(0, limit), fuente: "SUNAT cdro_16", cobertura: "nacional" });
  })
);

/**
 * Top aduanas por volumen CIF en un año dado.
 */
portsRouter.get(
  "/top",
  asyncHandler(async (req, res) => {
    const p = parseQuery(
      z.object({ anio: z.string().regex(/^\d{4}$/) }),
      req.query,
      res
    );
    if (!p) return;

    const { rows } = await pool.query(
      `SELECT aduana_code, aduana_name, year,
              MAX(value_cif_usd) FILTER (WHERE is_total = true) as total_cif_usd
       FROM port_imports
       WHERE year = $1 AND is_total = true
       GROUP BY aduana_code, aduana_name, year
       ORDER BY total_cif_usd DESC`,
      [Number(p.anio)]
    );

    res.json({ resultados: rows, fuente: "SUNAT cdro_15", cobertura: "nacional" });
  })
);
