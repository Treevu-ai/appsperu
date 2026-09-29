import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface IndicatorRow extends NeonRow {
  indicator_code: string;
  indicator_name: string;
  serie_id: string;
  serie_label: string;
  nivel_gobierno: string;
  value: number | string;
  measurement_date: string;
  unit_of_measure: string;
  frequency: string;
}

/**
 * Handler para `ceplan_estrategico_indicators` — GET /api/indicators.
 * Idéntico a `apps/ceplan-estrategico/api/src/routes/indicators.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const indicatorCode = args.indicatorCode as string | undefined;
  const nivelGobierno = args.nivelGobierno as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (indicatorCode) {
    params.push(indicatorCode.toUpperCase());
    conditions.push(`indicator_code = $${params.length}`);
  }
  if (nivelGobierno) {
    params.push(nivelGobierno.toUpperCase());
    conditions.push(`nivel_gobierno = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<IndicatorRow>(
    `SELECT indicator_code, indicator_name, serie_id, serie_label, nivel_gobierno,
            value, measurement_date, unit_of_measure, frequency, source
     FROM strategic_indicators
     ${where}
     ORDER BY indicator_code, serie_id, measurement_date`,
    params
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        indicatorCode: r.indicator_code,
        indicatorName: r.indicator_name,
        serieId: r.serie_id,
        serieLabel: r.serie_label,
        nivelGobierno: r.nivel_gobierno,
        value: Number(r.value),
        measurementDate: r.measurement_date,
        unitOfMeasure: r.unit_of_measure,
        frequency: r.frequency,
        fuente: { dataset: "CEPLAN - ObservaPerú (Gestión Estratégica del Estado)" },
      })),
    },
  };
}
