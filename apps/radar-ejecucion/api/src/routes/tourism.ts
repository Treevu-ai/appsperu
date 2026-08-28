import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { LATEST_BUDGET_CTE } from "../db/budget-coverage.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const tourismRouter = Router();

const BaseQuery = z.object({
  departamento: z.string().min(1).default("LA LIBERTAD"),
  anio: z.coerce.number().int().min(2015).max(2100).optional(),
});

const CrossrefQuery = BaseQuery.extend({
  anioFiscal: z.coerce.number().int().min(2009).max(2100).default(2026),
  entidadMpt: z
    .string()
    .min(1)
    .default("MUNICIPALIDAD PROVINCIAL DE TRUJILLO")
    .describe("Literal de entidad MEF para filtrar PIM turismo municipal."),
});

function money(value: unknown): number {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

tourismRouter.get(
  "/hospedaje",
  asyncHandler(async (req, res) => {
    const query = parseQuery(BaseQuery, req.query, res);
    if (!query) return;

    const departamento = query.departamento.toUpperCase();
    const conditions = ["departamento = $1"];
    const params: unknown[] = [departamento];
    if (query.anio) {
      params.push(query.anio);
      conditions.push(`anio = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT departamento, anio, mes, total_arribos, total_pernoctaciones,
              numero_establecimientos, porcentaje_tnoh
       FROM tourism_hospitality_monthly
       WHERE ${conditions.join(" AND ")}
       ORDER BY anio, mes`,
      params
    );

    const byYear = new Map<number, { arribos: number; pernoctaciones: number; meses: number }>();
    for (const row of rows) {
      const bucket = byYear.get(row.anio) ?? { arribos: 0, pernoctaciones: 0, meses: 0 };
      bucket.arribos += Number(row.total_arribos ?? 0);
      bucket.pernoctaciones += Number(row.total_pernoctaciones ?? 0);
      bucket.meses += 1;
      byYear.set(row.anio, bucket);
    }

    res.json({
      departamento,
      fuente: "MINCETUR — Indicadores de Ocupabilidad (PNDA / datosabiertos.mincetur.gob.pe)",
      resultados: rows.map((row) => ({
        anio: row.anio,
        mes: row.mes,
        totalArribos: row.total_arribos === null ? null : Number(row.total_arribos),
        totalPernoctaciones: row.total_pernoctaciones === null ? null : Number(row.total_pernoctaciones),
        establecimientos: row.numero_establecimientos === null ? null : Number(row.numero_establecimientos),
        porcentajeTnoh: row.porcentaje_tnoh === null ? null : Number(row.porcentaje_tnoh),
      })),
      resumenAnual: [...byYear.entries()].map(([anio, agg]) => ({
        anio,
        totalArribos: agg.arribos,
        totalPernoctaciones: agg.pernoctaciones,
        mesesReportados: agg.meses,
      })),
      limitacion:
        "Serie consolidada departamental (categoría TT). No sustituye el Reporte Regional PDF ni desagrega por provincia/distrito.",
    });
  })
);

tourismRouter.get(
  "/crossref",
  asyncHandler(async (req, res) => {
    const query = parseQuery(CrossrefQuery, req.query, res);
    if (!query) return;

    const departamento = query.departamento.toUpperCase();
    const anioTurismo = query.anio ?? query.anioFiscal - 1;

    const hospedaje = await pool.query(
      `SELECT mes, total_arribos, total_pernoctaciones
       FROM tourism_hospitality_monthly
       WHERE departamento = $1 AND anio = $2
       ORDER BY mes`,
      [departamento, anioTurismo]
    );

    const { rows: regionalRows } = await pool.query<{ pim: string; devengado: string; entidad: string }>(
      `${LATEST_BUDGET_CTE}
       SELECT COALESCE(SUM(b.pim), 0) AS pim, COALESCE(SUM(b.devengado), 0) AS devengado,
              string_agg(DISTINCT e.nombre, '; ' ORDER BY e.nombre) AS entidad
       FROM latest_budget b
       JOIN entities e ON e.entity_code = b.entity_code
       JOIN territories t ON t.ubigeo = e.ubigeo
       WHERE b.funcion = 'TURISMO' AND b.anio_fiscal = $1 AND t.departamento = $2
         AND b.meta_departamento IS NULL`,
      [query.anioFiscal, departamento]
    );

    const { rows: nacionalRows } = await pool.query<{ pim: string; devengado: string }>(
      `${LATEST_BUDGET_CTE}
       SELECT COALESCE(SUM(b.pim), 0) AS pim, COALESCE(SUM(b.devengado), 0) AS devengado
       FROM latest_budget b
       WHERE b.funcion = 'TURISMO' AND b.anio_fiscal = $1 AND b.meta_departamento = $2`,
      [query.anioFiscal, departamento]
    );

    const { rows: mptRows } = await pool.query<{ pim: string; devengado: string; entity_code: string }>(
      `${LATEST_BUDGET_CTE}
       SELECT b.entity_code, COALESCE(SUM(b.pim), 0) AS pim, COALESCE(SUM(b.devengado), 0) AS devengado
       FROM latest_budget b
       JOIN entities e ON e.entity_code = b.entity_code
       JOIN territories t ON t.ubigeo = e.ubigeo
       WHERE b.funcion = 'TURISMO' AND b.anio_fiscal = $1 AND t.departamento = $2
         AND b.meta_departamento IS NULL AND upper(e.nombre) = upper($3)
       GROUP BY b.entity_code`,
      [query.anioFiscal, departamento, query.entidadMpt]
    );

    const arribos = hospedaje.rows.reduce((sum, row) => sum + Number(row.total_arribos ?? 0), 0);
    const pernoct = hospedaje.rows.reduce((sum, row) => sum + Number(row.total_pernoctaciones ?? 0), 0);
    const regional = { pim: money(regionalRows[0]?.pim), devengado: money(regionalRows[0]?.devengado) };
    const nacional = { pim: money(nacionalRows[0]?.pim), devengado: money(nacionalRows[0]?.devengado) };
    const mpt = mptRows[0]
      ? { entityCode: mptRows[0].entity_code, pim: money(mptRows[0].pim), devengado: money(mptRows[0].devengado) }
      : null;

    res.json({
      departamento,
      periodoResultado: { anio: anioTurismo, mesesReportados: hospedaje.rows.length },
      resultadoTurismo: {
        totalArribos: arribos || null,
        totalPernoctaciones: pernoct || null,
        fuente: "MINCETUR Indicadores de Ocupabilidad (consolidado departamental)",
      },
      gastoTurismo: {
        anioFiscal: query.anioFiscal,
        ejecucionRegionalLocal: {
          ...regional,
          avancePct: regional.pim > 0 ? Math.round((regional.devengado / regional.pim) * 10000) / 100 : null,
        },
        ejecucionNacionalDirigida: {
          ...nacional,
          avancePct: nacional.pim > 0 ? Math.round((nacional.devengado / nacional.pim) * 10000) / 100 : null,
        },
        municipalidadProvincialTrujillo: mpt
          ? {
              ...mpt,
              avancePct: mpt.pim > 0 ? Math.round((mpt.devengado / mpt.pim) * 10000) / 100 : null,
            }
          : { estado: "ENTIDAD_NO_ENCONTRADA_EN_COBERTURA", entidadBuscada: query.entidadMpt.toUpperCase() },
      },
      advertenciaGasto:
        "No sumar ejecucionRegionalLocal y ejecucionNacionalDirigida: miden ámbitos distintos (sede vs meta departamento).",
      limitacion:
        "El cruce compara flujo turístico departamental (MINCETUR) con gasto en función TURISMO (MEF). No prueba causalidad ni cobertura distrital.",
    });
  })
);
