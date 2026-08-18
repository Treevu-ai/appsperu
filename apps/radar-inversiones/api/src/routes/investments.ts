import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const investmentsRouter = Router();

const InvestmentsQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  estado: z.string().min(1).optional(),
  situacion: z.string().min(1).optional(),
  funcion: z.string().min(1).optional(),
});

investmentsRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(InvestmentsQuerySchema, req.query, res);
  if (!parsed) return;
  const { departamento, estado, situacion, funcion } = parsed;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`i.departamento = $${params.length}`);
  }
  if (estado) {
    params.push(estado);
    conditions.push(`i.estado = $${params.length}`);
  }
  if (situacion) {
    params.push(situacion);
    conditions.push(`i.situacion = $${params.length}`);
  }
  if (funcion) {
    params.push(funcion);
    conditions.push(`i.funcion = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT i.cui, i.codigo_snip, i.nombre, i.sec_ejec, i.nombre_uep, i.entidad, i.sector,
            i.nivel, i.estado, i.situacion, i.departamento, i.provincia, i.distrito,
            i.monto_viable, i.costo_actualizado, i.funcion, i.tipo_inversion,
            i.fecha_registro, i.fecha_viabilidad, rb.fetched_at
     FROM investments i
     JOIN raw_investment_batches rb ON rb.id = i.source_batch_id
     ${where}
     ORDER BY i.costo_actualizado DESC NULLS LAST
     LIMIT 1000`,
    params
  );

  res.json({
    resultados: rows.map((r) => ({
      cui: r.cui,
      codigoSnip: r.codigo_snip,
      nombre: r.nombre,
      secEjec: r.sec_ejec,
      nombreUep: r.nombre_uep,
      entidad: r.entidad,
      sector: r.sector,
      nivel: r.nivel,
      estado: r.estado,
      situacion: r.situacion,
      departamento: r.departamento,
      provincia: r.provincia,
      distrito: r.distrito,
      montoViable: r.monto_viable === null ? null : Number(r.monto_viable),
      costoActualizado: r.costo_actualizado === null ? null : Number(r.costo_actualizado),
      funcion: r.funcion,
      tipoInversion: r.tipo_inversion,
      fechaRegistro: r.fecha_registro,
      fechaViabilidad: r.fecha_viabilidad,
      fuente: { dataset: "MEF - Invierte.pe / Banco de Inversiones", extraidoEl: r.fetched_at },
    })),
  });
}));

investmentsRouter.get("/:cui", asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.*, rb.fetched_at
     FROM investments i
     JOIN raw_investment_batches rb ON rb.id = i.source_batch_id
     WHERE i.cui = $1`,
    [req.params.cui]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "Inversión no encontrada en los datos ingeridos." });
    return;
  }

  const r = rows[0];
  res.json({
    cui: r.cui,
    codigoSnip: r.codigo_snip,
    nombre: r.nombre,
    secEjec: r.sec_ejec,
    nombreUep: r.nombre_uep,
    entidad: r.entidad,
    sector: r.sector,
    nivel: r.nivel,
    estado: r.estado,
    situacion: r.situacion,
    departamento: r.departamento,
    provincia: r.provincia,
    distrito: r.distrito,
    montoViable: r.monto_viable === null ? null : Number(r.monto_viable),
    costoActualizado: r.costo_actualizado === null ? null : Number(r.costo_actualizado),
    funcion: r.funcion,
    tipoInversion: r.tipo_inversion,
    fechaRegistro: r.fecha_registro,
    fechaViabilidad: r.fecha_viabilidad,
    fuente: { dataset: "MEF - Invierte.pe / Banco de Inversiones", extraidoEl: r.fetched_at },
  });
}));
