import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const resumenRouter = Router();

const ResumenQuerySchema = z.object({
  departamento: z.string().min(1).default("LA LIBERTAD"),
});

/**
 * Agregado por provincia + distrito (total y activas) — pensado para no forzar al cliente a
 * paginar miles de filas de `/api/instituciones` cuando lo que se necesita es la cobertura por
 * territorio de un departamento completo.
 */
resumenRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ResumenQuerySchema, req.query, res);
    if (!parsed) return;
    const { departamento } = parsed;

    const { rows } = await pool.query(
      `SELECT i.provincia, i.distrito,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE i.estado = 'Activo')::int AS activas
       FROM instituciones_educativas i
       WHERE i.departamento ILIKE $1
       GROUP BY i.provincia, i.distrito
       ORDER BY i.provincia, i.distrito`,
      [departamento]
    );

    res.json({
      departamento,
      distritos: rows.map((r) => ({
        provincia: r.provincia,
        distrito: r.distrito,
        totalInstituciones: r.total,
        institucionesActivas: r.activas,
      })),
      fuente: { dataset: "MINEDU/ESCALE - Padrón de Instituciones Educativas" },
    });
  })
);
