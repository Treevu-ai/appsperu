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

async function promedioMensual(table: string, departamento: string, anio: number): Promise<number | null> {
  const { rows } = await pool.query<{ valor_soles: string | null }>(
    `SELECT valor_soles FROM ${table} WHERE departamento = $1 AND anio = $2 AND valor_soles IS NOT NULL`,
    [departamento, anio]
  );
  if (rows.length === 0) return null;
  const sum = rows.reduce((acc, row) => acc + Number(row.valor_soles), 0);
  return Math.round((sum / rows.length) * 100) / 100;
}

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

    const { rows: outcomeRows } = await pool.query<{
      metric_key: string;
      metric_label: string;
      valor_numeric: string | null;
      valor_text: string | null;
      unidad: string;
      ingestion_mode: string;
      limitation: string;
    }>(
      `SELECT metric_key, metric_label, valor_numeric, valor_text, unidad, ingestion_mode, limitation
       FROM agricultural_regional_outcome
       WHERE departamento = $1 AND anio = $2
       ORDER BY metric_key`,
      [departamento, anio]
    );

    const { rows: regionalRows } = await ejecucionPool.query<{ pim: string; devengado: string }>(
      `${LATEST_BUDGET_CTE}
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
      `${LATEST_BUDGET_CTE}
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

    const valoresReportados = wageRows.filter((r) => r.valor_soles !== null);
    const promedioJornal =
      valoresReportados.length > 0
        ? Math.round(
            (valoresReportados.reduce((sum, r) => sum + Number(r.valor_soles), 0) / valoresReportados.length) * 100
          ) / 100
        : null;

    const [promedioTractor, promedioYunta] = await Promise.all([
      promedioMensual("agricultural_tractor_rental", departamento, anio),
      promedioMensual("agricultural_yunta_rental", departamento, anio),
    ]);

    res.json({
      departamento,
      anio,
      insumosAgricolas: {
        jornal: {
          promedioAnualSoles: promedioJornal,
          porMes: wageRows.map((r) => ({
            mes: r.mes,
            valorSoles: r.valor_soles !== null ? Number(r.valor_soles) : null,
          })),
        },
        alquilerTractorPromedioSoles: promedioTractor,
        alquilerYuntaPromedioSoles: promedioYunta,
      },
      resultadoAgropecuario: {
        metricas: outcomeRows.map((row) => ({
          clave: row.metric_key,
          etiqueta: row.metric_label,
          valorNumerico: row.valor_numeric !== null ? Number(row.valor_numeric) : null,
          valorTexto: row.valor_text,
          unidad: row.unidad,
          modoIngesta: row.ingestion_mode,
          limitacion: row.limitation,
        })),
        cautela:
          outcomeRows.length === 0
            ? "Sin métricas de resultado materializadas para el año; solo insumos y gasto."
            : "Resultado (VBP/superficie) y gasto AGROPECUARIA miden dimensiones distintas; no implica eficiencia.",
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
        advertenciaGasto:
          "No sumar ejecucionRegionalLocal y ejecucionNacionalDirigida: miden sede regional/local vs gasto nacional dirigido al departamento.",
      },
    });
  })
);
