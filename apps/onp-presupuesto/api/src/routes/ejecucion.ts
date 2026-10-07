import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const ejecucionRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface EjecucionRow {
  anio: number;
  descripcion: string;
  fuente: string;
  ejecutado: number | string | null;
}

function toApiShape(r: EjecucionRow) {
  return {
    anio: r.anio,
    descripcion: r.descripcion,
    fuente: r.fuente,
    ejecutado: r.ejecutado === null ? null : Number(r.ejecutado),
  };
}

const EjecucionQuerySchema = z.object({
  anio: z.coerce.number().int().optional(),
  descripcion: z.string().min(1).optional(),
  fuente: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Ejecución presupuestal anual de los regímenes previsionales administrados por ONP. */
ejecucionRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(EjecucionQuerySchema, req.query, res);
    if (!parsed) return;
    const { anio, descripcion, fuente, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (anio !== undefined) {
      params.push(anio);
      conditions.push(`anio = $${params.length}`);
    }
    if (descripcion) {
      params.push(`%${descripcion}%`);
      conditions.push(`descripcion ILIKE $${params.length}`);
    }
    if (fuente) {
      params.push(fuente);
      conditions.push(`fuente = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM ejecucion_presupuestal_onp ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query<EjecucionRow>(
      `SELECT anio, descripcion, fuente, ejecutado
       FROM ejecucion_presupuestal_onp
       ${where}
       ORDER BY anio DESC, descripcion, fuente, id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map(toApiShape),
      fuente: { dataset: "ONP - Ejecución Presupuestal de los Regímenes Administrados" },
    });
  })
);
