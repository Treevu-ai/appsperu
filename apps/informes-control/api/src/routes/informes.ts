import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const informesRouter = Router();

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

const InformesQuerySchema = z.object({
  entidad: z.string().min(1).optional(),
  departamento: z.string().min(1).optional(),
  periodo: z.string().regex(/^\d{4}$/).optional(),
  esConResponsabilidad: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

informesRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(InformesQuerySchema, req.query, res);
  if (!parsed) return;
  const { entidad, departamento, periodo, esConResponsabilidad, limit, offset } = parsed;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (entidad) {
    params.push(`%${entidad.toUpperCase()}%`);
    conditions.push(`entidad ILIKE $${params.length}`);
  }
  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`departamento = $${params.length}`);
  }
  if (periodo) {
    params.push(Number(periodo));
    conditions.push(`periodo = $${params.length}`);
  }
  if (esConResponsabilidad) {
    params.push(esConResponsabilidad === "true");
    conditions.push(`es_con_responsabilidad = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM informes_control ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await pool.query(
    `SELECT codigo_informe, numero_informe, entidad, sector, nivel_gobierno, departamento, provincia, distrito,
            descripcion, modalidad_servicio, servicio_control, tipo_informe, periodo, fecha_emision,
            fecha_publicacion, es_con_responsabilidad, total_recomendaciones, es_covid, es_reconstruccion,
            url_resumen_ejecutivo, url_informe_completo, updated_at
     FROM informes_control
     ${where}
     ORDER BY fecha_publicacion DESC NULLS LAST
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  res.json({
    cobertura: "Contraloría (buscadorinformes.contraloria.gob.pe), nacional. `esConResponsabilidad` es un indicador booleano — este endpoint nunca expone nombres de funcionarios ni detalle de responsabilidad individual, por diseño.",
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    resultados: rows.map((r) => ({
      codigoInforme: r.codigo_informe,
      numeroInforme: r.numero_informe,
      entidad: r.entidad,
      sector: r.sector,
      nivelGobierno: r.nivel_gobierno,
      departamento: r.departamento,
      provincia: r.provincia,
      distrito: r.distrito,
      descripcion: r.descripcion,
      modalidadServicio: r.modalidad_servicio,
      servicioControl: r.servicio_control,
      tipoInforme: r.tipo_informe,
      periodo: r.periodo,
      fechaEmision: r.fecha_emision,
      fechaPublicacion: r.fecha_publicacion,
      esConResponsabilidad: r.es_con_responsabilidad,
      totalRecomendaciones: r.total_recomendaciones,
      esCovid: r.es_covid,
      esReconstruccion: r.es_reconstruccion,
      urlResumenEjecutivo: r.url_resumen_ejecutivo,
      urlInformeCompleto: r.url_informe_completo,
      actualizadoEl: r.updated_at,
    })),
  });
}));
