import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const padronPpaRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const SearchQuerySchema = z.object({
  registrado: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

padronPpaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(SearchQuerySchema, req.query, res);
    if (!parsed) return;
    const { registrado, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (registrado !== undefined) {
      params.push(registrado === "true");
      conditions.push(`registrado = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM ruc_padron_ppa ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query(
      `SELECT ruc, registrado, nombre_ppa, fecha_consulta FROM ruc_padron_ppa ${where}
       ORDER BY ruc
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        ruc: r.ruc,
        registrado: r.registrado,
        nombrePpa: r.nombre_ppa,
        fechaConsulta: r.fecha_consulta,
      })),
    });
  })
);

padronPpaRouter.get(
  "/:ruc",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ruc, registrado, nombre_ppa, fecha_consulta FROM ruc_padron_ppa WHERE ruc = $1`,
      [req.params.ruc]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "RUC no consultado todavía contra el Padrón de Productores Agrarios." });
      return;
    }
    const r = rows[0];
    res.json({ ruc: r.ruc, registrado: r.registrado, nombrePpa: r.nombre_ppa, fechaConsulta: r.fecha_consulta });
  })
);
