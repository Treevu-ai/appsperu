import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const inhabilitacionesJudicialesRouter = Router();

const QuerySchema = z.object({
  rucDni: z.string().min(1).optional().describe("RUC (10 u 11 dígitos) o DNI, tal cual viene en la fuente."),
  dni: z.string().regex(/^\d{8}$/).optional().describe("Solo el DNI de 8 dígitos, extraído del RUC-10 cuando aplica."),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Inhabilitaciones dictadas por el Poder Judicial (comunicadas a OSCE/OECE
 * para su registro en el RNP) — base legal distinta a `GET /api/sanciones`
 * (sanción administrativa del Tribunal de Contrataciones). No hay cruce
 * automático entre ambas todavía: un mismo RUC/DNI puede aparecer en una,
 * la otra, ambas, o ninguna.
 */
inhabilitacionesJudicialesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(QuerySchema, req.query, res);
    if (!parsed) return;
    const { rucDni, dni, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (rucDni) {
      params.push(rucDni);
      conditions.push(`ruc_dni = $${params.length}`);
    }
    if (dni) {
      params.push(dni);
      conditions.push(`dni = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM inhabilitaciones_judiciales ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query(
      `SELECT fecha_corte, ruc_dni, nombre, organo_jurisdiccional, numero_resolucion, fecha_inicio, fecha_fin
       FROM inhabilitaciones_judiciales ${where}
       ORDER BY fecha_inicio DESC NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        fechaCorte: r.fecha_corte,
        rucDni: r.ruc_dni,
        nombre: r.nombre,
        organoJurisdiccional: r.organo_jurisdiccional,
        numeroResolucion: r.numero_resolucion,
        fechaInicio: r.fecha_inicio,
        fechaFin: r.fecha_fin,
      })),
      limitation:
        "Base legal distinta a las inhabilitaciones/multas del Tribunal de Contrataciones (GET /api/sanciones): esto es inhabilitación por mandato judicial, comunicada al OSCE/OECE por el Poder Judicial. No se cruza automáticamente con esa otra fuente.",
    });
  })
);
