import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const regionalOutcomeRouter = Router();

const QuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  anio: z.string().regex(/^\d{4}$/, "anio debe ser un año de 4 dígitos").optional(),
});

regionalOutcomeRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(QuerySchema, req.query, res);
    if (!parsed) return;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (parsed.departamento) {
      values.push(parsed.departamento.toUpperCase());
      conditions.push(`departamento = $${values.length}`);
    }
    if (parsed.anio) {
      values.push(Number(parsed.anio));
      conditions.push(`anio = $${values.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT departamento, anio, metric_key, metric_label, valor_numeric, valor_text, unidad,
              source_url, source_label, ingestion_mode, limitation, observed_at
       FROM agricultural_regional_outcome
       ${where}
       ORDER BY departamento, anio, metric_key`,
      values
    );

    res.json({
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
    });
  })
);
