import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const denunciasRouter = Router();

const DenunciasQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  provincia: z.string().min(1).optional(),
  anio: z
    .string()
    .regex(/^\d{4}$/, "anio debe ser un año de 4 dígitos")
    .optional(),
  modalidad: z.string().min(1).optional(),
});

/**
 * Denuncias policiales agregadas (SIDPOL, ver docs de la fuente) por
 * departamento/provincia/año/modalidad. Sin filtros, devuelve el universo
 * nacional completo — usar al menos `departamento` en producción, la tabla
 * cubre 2018-2026 a nivel distrital.
 */
denunciasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(DenunciasQuerySchema, req.query, res);
    if (!parsed) return;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (parsed.departamento) {
      values.push(parsed.departamento.toUpperCase());
      conditions.push(`departamento = $${values.length}`);
    }
    if (parsed.provincia) {
      values.push(parsed.provincia.toUpperCase());
      conditions.push(`provincia = $${values.length}`);
    }
    if (parsed.anio) {
      values.push(Number(parsed.anio));
      conditions.push(`anio = $${values.length}`);
    }
    if (parsed.modalidad) {
      values.push(parsed.modalidad);
      conditions.push(`modalidad = $${values.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT departamento, provincia, distrito, ubigeo, anio, mes, modalidad, cantidad
       FROM police_reports
       ${where}
       ORDER BY departamento, provincia, distrito, anio, mes, modalidad`,
      values
    );

    res.json({ resultados: rows });
  })
);
