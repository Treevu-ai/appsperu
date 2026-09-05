import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const ipressRouter = Router();

const IpressQuerySchema = z.object({
  ubigeo: z.string().min(1).optional(),
  departamento: z.string().min(1).optional(),
  distrito: z.string().min(1).optional(),
  estado: z.string().min(1).optional(),
});

ipressRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(IpressQuerySchema, req.query, res);
  if (!parsed) return;
  const { ubigeo, departamento, distrito, estado } = parsed;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (ubigeo) {
    params.push(ubigeo);
    conditions.push(`ubigeo = $${params.length}`);
  }
  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`departamento = $${params.length}`);
  }
  if (distrito) {
    params.push(distrito.toUpperCase());
    conditions.push(`distrito = $${params.length}`);
  }
  if (estado) {
    params.push(estado.toUpperCase());
    conditions.push(`estado = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT cod_ipress, institucion, nombre, clasificacion, tipo_establecimiento,
            departamento, provincia, distrito, ubigeo, direccion, categoria, estado,
            norte, este, updated_at
     FROM ipress
     ${where}
     ORDER BY departamento, provincia, distrito, nombre
     LIMIT 2000`,
    params
  );

  res.json({
    cobertura: "RENIPRESS es un registro nacional (SUSALUD); no está acotado a La Libertad.",
    resultados: rows.map((r) => ({
      codIpress: r.cod_ipress,
      institucion: r.institucion,
      nombre: r.nombre,
      clasificacion: r.clasificacion,
      tipoEstablecimiento: r.tipo_establecimiento,
      departamento: r.departamento,
      provincia: r.provincia,
      distrito: r.distrito,
      ubigeo: r.ubigeo,
      direccion: r.direccion,
      categoria: r.categoria,
      estado: r.estado,
      norte: r.norte === null ? null : Number(r.norte),
      este: r.este === null ? null : Number(r.este),
      actualizadoEl: r.updated_at,
    })),
  });
}));
