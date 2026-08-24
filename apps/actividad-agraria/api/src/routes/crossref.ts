import { Router } from "express";
import { z } from "zod";
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
 * Cruce actividad-agraria (MIDAGRI, costo de jornal) <-> radar-ejecucion
 * (gasto en la función AGROPECUARIA), por `departamento` exacto — mismo
 * patrón de bucket exacto sin matcher difuso que usa el cruce CEPLAN
 * (ver ADR-0003 y ADR-0008). Propósito: "cuánto cuesta operar en el campo"
 * (costo de jornal) junto a "cuánto invierte el Estado en agro" en la
 * misma región y año.
 *
 * Desde la implementación de ADR-0006 (Decisión 2, `ingestMefFullYearForMetaDepartamento`
 * en radar-ejecucion), este cruce distingue dos fuentes de ejecución que antes
 * eran indistinguibles porque solo existía una: la del Gobierno Regional/Local
 * CON SEDE en el departamento (`ejecucionRegionalLocal`, vía `territories.departamento`)
 * y la de Gobierno Nacional DIRIGIDA al departamento (`ejecucionNacionalDirigida`,
 * vía `budget_execution.meta_departamento` — ej. ANIN/reconstrucción, MIDAGRI,
 * programas ejecutados desde Lima). Antes de esa ingesta, la segunda era
 * invisible en `budget_execution` — no es que el gasto no existiera, es que
 * nunca se había ingerido.
 */
crossrefRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(CrossrefQuerySchema, req.query, res);
    if (!parsed) return;

    const departamento = parsed.departamento.toUpperCase();
    const anio = Number(parsed.anio);

    const { rows: wageRows } = await pool.query<{ mes: number; valor_soles: string | null }>(
      `SELECT mes, valor_soles FROM agricultural_wage WHERE departamento = $1 AND anio = $2 ORDER BY mes`,
      [departamento, anio]
    );

    const { rows: regionalRows } = await ejecucionPool.query<{ pim: string; devengado: string }>(
      `WITH latest_budget AS (
         SELECT DISTINCT ON (entity_code, funcion, anio_fiscal, COALESCE(meta_departamento, ''), COALESCE(generica, '')) *
         FROM budget_execution
         ORDER BY entity_code, funcion, anio_fiscal, COALESCE(meta_departamento, ''), COALESCE(generica, ''), fecha_corte DESC, id DESC
       )
       SELECT COALESCE(SUM(b.pim), 0) AS pim, COALESCE(SUM(b.devengado), 0) AS devengado
       FROM latest_budget b
       JOIN entities e ON e.entity_code = b.entity_code
       JOIN territories t ON t.ubigeo = e.ubigeo
       WHERE b.funcion = 'AGROPECUARIA' AND b.anio_fiscal = $1 AND t.departamento = $2
         AND b.meta_departamento IS NULL`,
      [anio, departamento]
    );

    const { rows: nacionalRows } = await ejecucionPool.query<{
      pim: string;
      devengado: string;
      entidades: string;
    }>(
      `WITH latest_budget AS (
         SELECT DISTINCT ON (entity_code, funcion, anio_fiscal, COALESCE(meta_departamento, ''), COALESCE(generica, '')) *
         FROM budget_execution
         ORDER BY entity_code, funcion, anio_fiscal, COALESCE(meta_departamento, ''), COALESCE(generica, ''), fecha_corte DESC, id DESC
       )
       SELECT COALESCE(SUM(b.pim), 0) AS pim, COALESCE(SUM(b.devengado), 0) AS devengado,
              COUNT(DISTINCT b.entity_code) AS entidades
       FROM latest_budget b
       WHERE b.funcion = 'AGROPECUARIA' AND b.anio_fiscal = $1 AND b.meta_departamento = $2`,
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

    const valoresReportados = wageRows.filter((r) => r.valor_soles !== null);
    const promedioJornal =
      valoresReportados.length > 0
        ? Math.round(
            (valoresReportados.reduce((sum, r) => sum + Number(r.valor_soles), 0) / valoresReportados.length) * 100
          ) / 100
        : null;

    res.json({
      departamento,
      anio,
      jornalAgricola: {
        promedioAnualSoles: promedioJornal,
        porMes: wageRows.map((r) => ({ mes: r.mes, valorSoles: r.valor_soles !== null ? Number(r.valor_soles) : null })),
      },
      ejecucionAgropecuaria: {
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
