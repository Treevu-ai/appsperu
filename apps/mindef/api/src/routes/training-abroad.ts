import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const trainingAbroadRouter = Router();

const TrainingAbroadQuerySchema = z.object({
  pais: z.string().min(1).optional(),
});

trainingAbroadRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(TrainingAbroadQuerySchema, req.query, res);
  if (!parsed) return;
  const { pais } = parsed;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (pais) {
    params.push(pais.toUpperCase());
    conditions.push(`t.pais = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT t.institucion, t.capacitacion, t.personal_cantidad, t.fecha_inicio, t.fecha_termino,
            t.pais, rb.fetched_at
     FROM training_abroad t
     JOIN raw_mindef_batches rb ON rb.id = t.source_batch_id
     ${where}
     ORDER BY t.fecha_inicio DESC NULLS LAST`,
    params
  );

  res.json({
    resultados: rows.map((r) => ({
      institucion: r.institucion,
      capacitacion: r.capacitacion,
      personalCantidad: Number(r.personal_cantidad),
      fechaInicio: r.fecha_inicio,
      fechaTermino: r.fecha_termino,
      pais: r.pais,
      fuente: { dataset: "MINDEF - Consolidado del Personal Militar capacitado en el Exterior", extraidoEl: r.fetched_at },
    })),
  });
}));
