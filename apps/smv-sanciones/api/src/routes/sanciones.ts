import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const sancionesRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface SancionRow {
  fecha_resolucion: string | null;
  nro_resolucion: string;
  empresa: string;
  sumilla: string | null;
  tipo: string | null;
  monto: number | string | null;
  con_recurso: boolean | null;
  nro_res_resolutiva: string | null;
  fecha_res_resolutiva: string | null;
}

function toApiShape(r: SancionRow) {
  return {
    fechaResolucion: r.fecha_resolucion,
    nroResolucion: r.nro_resolucion,
    empresa: r.empresa,
    sumilla: r.sumilla,
    tipo: r.tipo,
    monto: r.monto === null ? null : Number(r.monto),
    conRecurso: r.con_recurso,
    nroResResolutiva: r.nro_res_resolutiva,
    fechaResResolutiva: r.fecha_res_resolutiva,
  };
}

const SancionesQuerySchema = z.object({
  empresa: z.string().min(1).optional(),
  tipo: z.string().min(1).optional(),
  fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Sanciones a personas jurídicas supervisadas por la SMV (2018 en adelante). */
sancionesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(SancionesQuerySchema, req.query, res);
    if (!parsed) return;
    const { empresa, tipo, fechaInicio, fechaFin, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (empresa) {
      params.push(`%${empresa}%`);
      conditions.push(`empresa ILIKE $${params.length}`);
    }
    if (tipo) {
      params.push(`%${tipo}%`);
      conditions.push(`tipo ILIKE $${params.length}`);
    }
    if (fechaInicio) {
      params.push(fechaInicio);
      conditions.push(`fecha_resolucion >= $${params.length}`);
    }
    if (fechaFin) {
      params.push(fechaFin);
      conditions.push(`fecha_resolucion <= $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM sanciones_smv ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query<SancionRow>(
      `SELECT fecha_resolucion, nro_resolucion, empresa, sumilla, tipo, monto,
              con_recurso, nro_res_resolutiva, fecha_res_resolutiva
       FROM sanciones_smv
       ${where}
       ORDER BY fecha_resolucion DESC, id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map(toApiShape),
      fuente: { dataset: "SMV - Sanciones a personas jurídicas" },
    });
  })
);
