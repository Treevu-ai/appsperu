import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface RegionalOutcomeRow extends NeonRow {
  departamento: string;
  anio: number;
  metric_key: string;
  metric_label: string;
  valor_numeric: number | string | null;
  valor_text: string | null;
  unidad: string;
  source_url: string | null;
  source_label: string | null;
  ingestion_mode: string;
  limitation: string | null;
  observed_at: string | null;
}

/**
 * Handler para `actividad_agraria_regional_outcome` — GET /api/regional-outcome.
 *
 * SQL idéntico al de `apps/actividad-agraria/api/src/routes/regional-outcome.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const departamento = args.departamento as string | undefined;
  const anio = args.anio as string | undefined;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (departamento) {
    values.push(departamento.toUpperCase());
    conditions.push(`departamento = $${values.length}`);
  }
  if (anio) {
    values.push(Number(anio));
    conditions.push(`anio = $${values.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<RegionalOutcomeRow>(
    `SELECT departamento, anio, metric_key, metric_label, valor_numeric, valor_text, unidad,
            source_url, source_label, ingestion_mode, limitation, observed_at
     FROM agricultural_regional_outcome
     ${where}
     ORDER BY departamento, anio, metric_key`,
    values
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((row) => ({
        departamento: row.departamento,
        anio: row.anio,
        metricKey: row.metric_key,
        metricLabel: row.metric_label,
        valorNumerico: row.valor_numeric !== null ? Number(row.valor_numeric) : null,
        valorTexto: row.valor_text,
        unidad: row.unidad,
        fuente: {
          url: row.source_url,
          etiqueta: row.source_label,
          modoIngesta: row.ingestion_mode,
          fechaObservacion: row.observed_at,
        },
        limitacion: row.limitation,
      })),
      cautela:
        "Métricas MANUAL_PILOT provienen de observación documentada en SIEA; no reemplazan series CSV automatizables cuando existan.",
    },
  };
}
