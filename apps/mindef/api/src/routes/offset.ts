import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const offsetRouter = Router();

const OffsetQuerySchema = z.object({
  entidadContraparte: z.string().min(1).optional(),
});

offsetRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(OffsetQuerySchema, req.query, res);
  if (!parsed) return;
  const { entidadContraparte } = parsed;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (entidadContraparte) {
    params.push(`%${entidadContraparte}%`);
    conditions.push(`o.entidad_contraparte ILIKE $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT o.tipo_convenio, o.institucion, o.titulo, o.entidad_contraparte, o.observacion,
            o.anio_inicio, rb.fetched_at
     FROM offset_agreements o
     JOIN raw_mindef_batches rb ON rb.id = o.source_batch_id
     ${where}
     ORDER BY o.anio_inicio DESC NULLS LAST`,
    params
  );

  res.json({
    resultados: rows.map((r) => ({
      tipoConvenio: r.tipo_convenio,
      institucion: r.institucion,
      titulo: r.titulo,
      entidadContraparte: r.entidad_contraparte,
      observacion: r.observacion,
      anioInicio: r.anio_inicio,
      fuente: { dataset: "MINDEF - Convenios Específicos de Compensaciones Industriales y Sociales Offset", extraidoEl: r.fetched_at },
    })),
  });
}));
