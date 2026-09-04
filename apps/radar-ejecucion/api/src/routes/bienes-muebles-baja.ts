import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const bienesMueblesBajaRouter = Router();

/**
 * GET /api/patrimonio/bienes-muebles-baja?entidad=<texto>&ejercicio=<año>
 * Sin ubigeo en la fuente — filtra por texto sobre NOM_ENTIDAD.
 */
bienesMueblesBajaRouter.get("/", asyncHandler(async (req, res) => {
  const entidad = typeof req.query.entidad === "string" ? req.query.entidad : null;
  const ejercicio = typeof req.query.ejercicio === "string" ? Number(req.query.ejercicio) : null;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (entidad) {
    params.push(`%${entidad}%`);
    conditions.push(`nom_entidad ILIKE $${params.length}`);
  }
  if (ejercicio) {
    params.push(ejercicio);
    conditions.push(`ejercicio = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT ruc_entidad, nom_entidad, nro_resolucion_baja, fecha_resolucion_baja,
            nom_acto_baja, codigo_patrimonial, denominacion_bien, ejercicio
     FROM bienes_muebles_baja
     ${where}
     ORDER BY fecha_resolucion_baja DESC NULLS LAST
     LIMIT 500`,
    params
  );

  res.json({
    filtros: { entidad, ejercicio },
    registros: rows.map((r) => ({
      rucEntidad: r.ruc_entidad,
      nomEntidad: r.nom_entidad,
      nroResolucionBaja: r.nro_resolucion_baja,
      fechaResolucionBaja: r.fecha_resolucion_baja,
      nomActoBaja: r.nom_acto_baja,
      codigoPatrimonial: r.codigo_patrimonial,
      denominacionBien: r.denominacion_bien,
      ejercicio: r.ejercicio,
    })),
    limitacion: "Solo activos dados de baja (desincorporados) — no es el inventario completo de bienes muebles del Estado, que no tiene fuente pública estructurada conocida.",
    fuente: { dataset: "MEF — Bienes muebles patrimoniales dados de baja (Plataforma Nacional de Datos Abiertos)" },
  });
}));
