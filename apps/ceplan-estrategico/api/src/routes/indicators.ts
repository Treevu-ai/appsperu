import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const indicatorsRouter = Router();

const IndicatorsQuerySchema = z.object({
  indicatorCode: z.string().min(1).optional(),
  nivelGobierno: z.string().min(1).optional(),
});

indicatorsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(IndicatorsQuerySchema, req.query, res);
    if (!parsed) return;
    const { indicatorCode, nivelGobierno } = parsed;

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

    const { rows } = await pool.query(
      `SELECT indicator_code, indicator_name, serie_id, serie_label, nivel_gobierno,
              value, measurement_date, unit_of_measure, frequency, source
       FROM strategic_indicators
       ${where}
       ORDER BY indicator_code, serie_id, measurement_date`,
      params
    );

    res.json({
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
    });
  })
);
