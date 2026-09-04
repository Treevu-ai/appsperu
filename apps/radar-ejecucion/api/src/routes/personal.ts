import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const personalRouter = Router();

/**
 * GET /api/personal?entidad=<texto>&ejercicio=<año>
 * Sin ubigeo en la fuente — filtra por texto sobre PLIEGO/UNIDAD_EJECUTORA
 * (ej. "LA LIBERTAD", "TRUJILLO", "MUNICIPALIDAD DISTRITAL DE ...").
 */
personalRouter.get("/", asyncHandler(async (req, res) => {
  const entidad = typeof req.query.entidad === "string" ? req.query.entidad : null;
  const ejercicio = typeof req.query.ejercicio === "string" ? Number(req.query.ejercicio) : null;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (entidad) {
    params.push(`%${entidad}%`);
    conditions.push(`(pliego ILIKE $${params.length} OR unidad_ejecutora ILIKE $${params.length})`);
  }
  if (ejercicio) {
    params.push(ejercicio);
    conditions.push(`ejercicio = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT pliego, unidad_ejecutora, ejercicio, mes,
            desc_regimen_laboral, desc_grupo_ocupacional, desc_condicion_laboral,
            sum(cantidad) AS cantidad_total, sum(costo_total_anual) AS costo_total_anual
     FROM airhsp_personal
     ${where}
     GROUP BY pliego, unidad_ejecutora, ejercicio, mes, desc_regimen_laboral, desc_grupo_ocupacional, desc_condicion_laboral
     ORDER BY ejercicio DESC, mes DESC, cantidad_total DESC
     LIMIT 500`,
    params
  );

  res.json({
    filtros: { entidad, ejercicio },
    registros: rows.map((r) => ({
      pliego: r.pliego,
      unidadEjecutora: r.unidad_ejecutora,
      ejercicio: r.ejercicio,
      mes: r.mes,
      regimenLaboral: r.desc_regimen_laboral,
      grupoOcupacional: r.desc_grupo_ocupacional,
      condicionLaboral: r.desc_condicion_laboral,
      cantidadTotal: Number(r.cantidad_total),
      costoTotalAnual: r.costo_total_anual === null ? null : Number(r.costo_total_anual),
    })),
    fuente: { dataset: "MEF — AIRHSP (Plataforma Nacional de Datos Abiertos)", agregacion: "por Unidad Ejecutora/régimen/cargo, no personal identificable" },
  });
}));
