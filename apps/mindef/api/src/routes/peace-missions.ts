import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const peaceMissionsRouter = Router();

const PeaceMissionsQuerySchema = z.object({
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
  pais: z.string().min(1).optional(),
});

peaceMissionsRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(PeaceMissionsQuerySchema, req.query, res);
  if (!parsed) return;
  const { anio, pais } = parsed;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (anio) {
    params.push(anio);
    conditions.push(`p.anio = $${params.length}`);
  }
  if (pais) {
    params.push(`%${pais}%`);
    conditions.push(`p.pais ILIKE $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT p.mision, p.modalidad, p.institucion, p.pais, p.anio, p.cantidad, rb.fetched_at
     FROM peace_missions p
     JOIN raw_mindef_batches rb ON rb.id = p.source_batch_id
     ${where}
     ORDER BY p.anio DESC, p.mision`,
    params
  );

  res.json({
    resultados: rows.map((r) => ({
      mision: r.mision,
      modalidad: r.modalidad,
      institucion: r.institucion,
      pais: r.pais,
      anio: r.anio,
      cantidad: Number(r.cantidad),
      fuente: { dataset: "MINDEF - Cuadro anual de personal FF.AA en Misiones de Paz", extraidoEl: r.fetched_at },
    })),
  });
}));
