import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const proyectosRouter = Router();

const ProyectosQuerySchema = z.object({
  entityCode: z.string().min(1).optional(),
  funcion: z.string().min(1).optional(),
  anio: z.string().regex(/^\d{4}$/, "debe ser un año de 4 dígitos").optional(),
  metaDepartamento: z.string().min(1).optional(),
});

/**
 * Nombre real de proyecto/actividad/obra por entidad+función — el nivel de
 * detalle que responde "qué construye" una entidad, no solo bajo qué
 * función/genérica cae. Ver ADR-0006 y `budget_execution_proyectos`.
 */
proyectosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ProyectosQuerySchema, req.query, res);
    if (!parsed) return;
    const { entityCode, funcion, anio, metaDepartamento } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (entityCode) {
      params.push(entityCode);
      conditions.push(`p.entity_code = $${params.length}`);
    }
    if (funcion) {
      params.push(funcion);
      conditions.push(`p.funcion = $${params.length}`);
    }
    if (anio) {
      params.push(Number(anio));
      conditions.push(`p.anio_fiscal = $${params.length}`);
    }
    if (metaDepartamento) {
      params.push(metaDepartamento.toUpperCase());
      conditions.push(`p.meta_departamento = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `WITH latest_projects AS (
         SELECT DISTINCT ON (
           p.entity_code, p.funcion, p.anio_fiscal, p.proyecto_nombre,
           COALESCE(p.meta_departamento, ''), COALESCE(p.generica, '')
         ) p.*
         FROM budget_execution_proyectos p
         ORDER BY p.entity_code, p.funcion, p.anio_fiscal, p.proyecto_nombre,
                  COALESCE(p.meta_departamento, ''), COALESCE(p.generica, ''),
                  p.fecha_corte DESC, p.id DESC
       )
       SELECT p.entity_code, e.nombre, p.funcion, p.generica, p.programa_ppto_nombre,
              p.proyecto_nombre, p.anio_fiscal, p.devengado, p.meta_departamento
       FROM latest_projects p
       JOIN entities e ON e.entity_code = p.entity_code
       ${where}
       ORDER BY p.devengado DESC
       LIMIT 500`,
      params
    );

    res.json({
      resultados: rows.map((r) => ({
        entityCode: r.entity_code,
        nombre: r.nombre,
        funcion: r.funcion,
        generica: r.generica,
        programaPptoNombre: r.programa_ppto_nombre,
        proyectoNombre: r.proyecto_nombre,
        anioFiscal: r.anio_fiscal,
        devengado: Number(r.devengado),
        metaDepartamento: r.meta_departamento,
      })),
    });
  })
);
