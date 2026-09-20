import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const exportacionesFobRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const SearchQuerySchema = z.object({
  ruc: z.string().regex(/^\d{11}$/, "ruc debe tener 11 dígitos").optional(),
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  paisCodigo: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

exportacionesFobRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(SearchQuerySchema, req.query, res);
    if (!parsed) return;
    const { ruc, anio, mes, paisCodigo, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (ruc) {
      params.push(ruc);
      conditions.push(`ruc = $${params.length}`);
    }
    if (anio) {
      params.push(anio);
      conditions.push(`anio = $${params.length}`);
    }
    if (mes) {
      params.push(mes);
      conditions.push(`mes = $${params.length}`);
    }
    if (paisCodigo) {
      params.push(paisCodigo.toUpperCase());
      conditions.push(`pais_codigo = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM ruc_exportaciones_fob ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query(
      `SELECT ruc, anio, mes, aduana_codigo, aduana_nombre, agente_codigo, agente_nombre,
              pais_codigo, pais_nombre, fob_usd, fecha_consulta
       FROM ruc_exportaciones_fob
       ${where}
       ORDER BY anio DESC, mes DESC, fob_usd DESC
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
        anio: r.anio,
        mes: r.mes,
        aduanaCodigo: r.aduana_codigo,
        aduanaNombre: r.aduana_nombre,
        agenteCodigo: r.agente_codigo,
        agenteNombre: r.agente_nombre,
        paisCodigo: r.pais_codigo,
        paisNombre: r.pais_nombre,
        fobUsd: Number(r.fob_usd),
        fechaConsulta: r.fecha_consulta,
      })),
    });
  })
);

const ResumenQuerySchema = z.object({
  ruc: z.string().regex(/^\d{11}$/, "ruc debe tener 11 dígitos"),
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
});

exportacionesFobRouter.get(
  "/resumen/:ruc",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ResumenQuerySchema, { ...req.query, ruc: req.params.ruc }, res);
    if (!parsed) return;
    const { ruc, anio } = parsed;

    const conditions = ["ruc = $1"];
    const params: unknown[] = [ruc];
    if (anio) {
      params.push(anio);
      conditions.push(`anio = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT anio, SUM(fob_usd)::numeric(14,2) AS fob_total, COUNT(*) AS embarques
       FROM ruc_exportaciones_fob
       WHERE ${conditions.join(" AND ")}
       GROUP BY anio
       ORDER BY anio DESC`,
      params
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Sin exportaciones registradas para ese RUC en el periodo pedido." });
      return;
    }

    res.json({
      ruc,
      porAnio: rows.map((r) => ({
        anio: r.anio,
        fobTotalUsd: Number(r.fob_total),
        embarques: Number(r.embarques),
      })),
    });
  })
);
