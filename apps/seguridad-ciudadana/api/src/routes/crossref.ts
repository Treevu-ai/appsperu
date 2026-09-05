import { Router } from "express";
import { z } from "zod";
import { LATEST_BUDGET_CTE } from "@appsperu/shared-queries";
import { pool } from "../db/pool.js";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const crossrefRouter = Router();

const CrossrefQuerySchema = z.object({
  departamento: z.string().min(1),
  anio: z.string().regex(/^\d{4}$/, "anio debe ser un año de 4 dígitos"),
});

/**
 * Cruce seguridad-ciudadana (SIDPOL, conteo de denuncias) <-> radar-ejecucion
 * (gasto en la función ORDEN PUBLICO Y SEGURIDAD), por `departamento` exacto
 * — mismo patrón de bucket exacto sin matcher difuso que usa
 * actividad-agraria/crossref.ts (ver ADR-0003 y ADR-0008). Propósito:
 * "cuánto se denuncia" junto a "cuánto invierte el Estado en orden público"
 * en la misma región y año — NO implica causalidad ni correlación, es un
 * cruce de dos series independientes para lectura conjunta.
 *
 * Igual que en actividad-agraria, distingue ejecución con sede en el
 * departamento (`ejecucionRegionalLocal`) de gasto de Gobierno Nacional
 * dirigido al departamento (`ejecucionNacionalDirigida`, vía
 * `budget_execution.meta_departamento` — ej. PNP con sede en Lima
 * operando en la región).
 */
crossrefRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(CrossrefQuerySchema, req.query, res);
    if (!parsed) return;

    const departamento = parsed.departamento.toUpperCase();
    const anio = Number(parsed.anio);

    const { rows: denunciasRows } = await pool.query<{ modalidad: string; total: string }>(
      `SELECT modalidad, SUM(cantidad)::text AS total
         FROM police_reports
        WHERE departamento = $1 AND anio = $2
        GROUP BY modalidad
        ORDER BY SUM(cantidad) DESC`,
      [departamento, anio]
    );

    const { rows: regionalRows } = await ejecucionPool.query<{ pim: string; devengado: string }>(
      `${LATEST_BUDGET_CTE}
       SELECT COALESCE(SUM(b.pim), 0) AS pim, COALESCE(SUM(b.devengado), 0) AS devengado
       FROM latest_budget b
       JOIN entities e ON e.entity_code = b.entity_code
       JOIN territories t ON t.ubigeo = e.ubigeo
       WHERE b.funcion = 'ORDEN PUBLICO Y SEGURIDAD' AND b.anio_fiscal = $1 AND t.departamento = $2
         AND b.meta_departamento IS NULL`,
      [anio, departamento]
    );

    const { rows: nacionalRows } = await ejecucionPool.query<{
      pim: string;
      devengado: string;
      entidades: string;
    }>(
      `${LATEST_BUDGET_CTE}
       SELECT COALESCE(SUM(b.pim), 0) AS pim, COALESCE(SUM(b.devengado), 0) AS devengado,
              COUNT(DISTINCT b.entity_code) AS entidades
       FROM latest_budget b
       WHERE b.funcion = 'ORDEN PUBLICO Y SEGURIDAD' AND b.anio_fiscal = $1 AND b.meta_departamento = $2`,
      [anio, departamento]
    );

    const toNum = (v: string | undefined) => Number(v ?? 0);
    const regional = { pim: toNum(regionalRows[0]?.pim), devengado: toNum(regionalRows[0]?.devengado) };
    const nacional = {
      pim: toNum(nacionalRows[0]?.pim),
      devengado: toNum(nacionalRows[0]?.devengado),
      entidades: toNum(nacionalRows[0]?.entidades),
    };
    const pimTotal = regional.pim + nacional.pim;
    const devengadoTotal = regional.devengado + nacional.devengado;
    const totalDenuncias = denunciasRows.reduce((sum, r) => sum + Number(r.total), 0);

    res.json({
      departamento,
      anio,
      denuncias: {
        total: totalDenuncias,
        porModalidad: denunciasRows.map((r) => ({ modalidad: r.modalidad, total: Number(r.total) })),
      },
      ejecucionOrdenPublicoYSeguridad: {
        ejecucionRegionalLocal: {
          pim: regional.pim,
          devengado: regional.devengado,
          avancePct: regional.pim > 0 ? Math.round((regional.devengado / regional.pim) * 10000) / 100 : null,
        },
        ejecucionNacionalDirigida: {
          pim: nacional.pim,
          devengado: nacional.devengado,
          avancePct: nacional.pim > 0 ? Math.round((nacional.devengado / nacional.pim) * 10000) / 100 : null,
          entidadesDistintas: nacional.entidades,
        },
        total: {
          pim: pimTotal,
          devengado: devengadoTotal,
          avancePct: pimTotal > 0 ? Math.round((devengadoTotal / pimTotal) * 10000) / 100 : null,
        },
      },
    });
  })
);
