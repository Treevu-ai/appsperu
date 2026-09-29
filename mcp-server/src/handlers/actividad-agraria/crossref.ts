import type { NeonPool, NeonRow } from "../../db/neon-pool.js";
import { LATEST_BUDGET_CTE } from "../../db/latest-budget.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { crossAppPool, crossAppUnavailable } from "../proveedores-sancionados/_helpers.js";

interface ValorSolesRow extends NeonRow {
  valor_soles: string | number | null;
}

interface WageRow extends NeonRow {
  mes: number;
  valor_soles: string | number | null;
}

interface OutcomeRow extends NeonRow {
  metric_key: string;
  metric_label: string;
  valor_numeric: string | number | null;
  valor_text: string | null;
  unidad: string;
  ingestion_mode: string;
  limitation: string | null;
}

interface BudgetAggRow extends NeonRow {
  pim: string | number;
  devengado: string | number;
}

interface BudgetAggNacionalRow extends BudgetAggRow {
  entidades: string | number;
}

/** Igual que `promedioMensual` de `apps/actividad-agraria/api/src/routes/crossref.ts`. */
async function promedioMensual(db: NeonPool, table: string, departamento: string, anio: number): Promise<number | null> {
  const { rows } = await db.query<ValorSolesRow>(
    `SELECT valor_soles FROM ${table} WHERE departamento = $1 AND anio = $2 AND valor_soles IS NOT NULL`,
    [departamento, anio]
  );
  if (rows.length === 0) return null;
  const sum = rows.reduce((acc, row) => acc + Number(row.valor_soles), 0);
  return Math.round((sum / rows.length) * 100) / 100;
}

/**
 * Handler para `actividad_agraria_crossref` — GET /api/crossref.
 *
 * Cruce resultado agro (SIEA piloto) + insumos MIDAGRI vs gasto AGROPECUARIA
 * en radar-ejecucion (cross-app). SQL idéntico al de
 * `apps/actividad-agraria/api/src/routes/crossref.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;

  const departamento = (args.departamento as string).toUpperCase();
  const anio = Number(args.anio as string);

  const { rows: wageRows } = await db.query<WageRow>(
    `SELECT mes, valor_soles FROM agricultural_wage WHERE departamento = $1 AND anio = $2 ORDER BY mes`,
    [departamento, anio]
  );

  const { rows: outcomeRows } = await db.query<OutcomeRow>(
    `SELECT metric_key, metric_label, valor_numeric, valor_text, unidad, ingestion_mode, limitation
     FROM agricultural_regional_outcome
     WHERE departamento = $1 AND anio = $2
     ORDER BY metric_key`,
    [departamento, anio]
  );

  const ejecucionDb = crossAppPool("radar-ejecucion", env);
  if (!ejecucionDb) return crossAppUnavailable("radar-ejecucion");

  const { rows: regionalRows } = await ejecucionDb.query<BudgetAggRow>(
    `${LATEST_BUDGET_CTE}
     SELECT COALESCE(SUM(b.pim), 0) AS pim, COALESCE(SUM(b.devengado), 0) AS devengado
     FROM latest_budget b
     JOIN entities e ON e.entity_code = b.entity_code
     JOIN territories t ON t.ubigeo = e.ubigeo
     WHERE b.funcion = 'AGROPECUARIA' AND b.anio_fiscal = $1 AND t.departamento = $2
       AND b.meta_departamento IS NULL`,
    [anio, departamento]
  );

  const { rows: nacionalRows } = await ejecucionDb.query<BudgetAggNacionalRow>(
    `${LATEST_BUDGET_CTE}
     SELECT COALESCE(SUM(b.pim), 0) AS pim, COALESCE(SUM(b.devengado), 0) AS devengado,
            COUNT(DISTINCT b.entity_code) AS entidades
     FROM latest_budget b
     WHERE b.funcion = 'AGROPECUARIA' AND b.anio_fiscal = $1 AND b.meta_departamento = $2`,
    [anio, departamento]
  );

  const toNum = (v: string | number | undefined) => Number(v ?? 0);
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
    promedioMensual(db, "agricultural_tractor_rental", departamento, anio),
    promedioMensual(db, "agricultural_yunta_rental", departamento, anio),
  ]);

  return {
    status: 200,
    body: {
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
    },
  };
}
