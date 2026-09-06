import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const investmentsDesactivadasRouter = Router();

const MAX_LIMIT = 5000;
const DEFAULT_LIMIT = 1000;

const DesactivadasQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  situacion: z.string().min(1).optional(),
  funcion: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Inversiones desactivadas del Banco de Inversiones (MEF) — la mitad del
 * Banco que `GET /api/investments` no cubre. `situacion` conserva el estado
 * que tenía la inversión al momento de desactivarse (ej. "EN FORMULACION"
 * cuando nunca obtuvo declaratoria de viabilidad — el primer supuesto de
 * desactivación del Anexo de la RD N° 001-2019-EF/63.01). El dataset del MEF
 * no publica un código de motivo por fila, así que esta ruta no infiere uno.
 */
investmentsDesactivadasRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(DesactivadasQuerySchema, req.query, res);
  if (!parsed) return;
  const { departamento, situacion, funcion, limit, offset } = parsed;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`i.departamento = $${params.length}`);
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

  const { rows: countRows } = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM investments_deactivated i ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await pool.query(
    `SELECT i.cui, i.codigo_snip, i.nombre, i.nombre_uep, i.entidad, i.sector,
            i.nivel, i.estado, i.situacion, i.departamento, i.provincia, i.distrito,
            i.monto_viable, i.costo_actualizado, i.funcion, i.tipo_inversion,
            i.fecha_registro, i.fecha_viabilidad, i.num_habitantes_benef, rb.fetched_at
     FROM investments_deactivated i
     JOIN raw_investment_deactivated_batches rb ON rb.id = i.source_batch_id
     ${where}
     ORDER BY i.costo_actualizado DESC NULLS LAST
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  res.json({
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    resultados: rows.map((r) => ({
      cui: r.cui,
      codigoSnip: r.codigo_snip,
      nombre: r.nombre,
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
      numHabitantesBenef: r.num_habitantes_benef === null ? null : Number(r.num_habitantes_benef),
      fuente: { dataset: "MEF - Invierte.pe / Banco de Inversiones (desactivadas)", extraidoEl: r.fetched_at },
    })),
  });
}));

investmentsDesactivadasRouter.get("/:cui", asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.*, rb.fetched_at
     FROM investments_deactivated i
     JOIN raw_investment_deactivated_batches rb ON rb.id = i.source_batch_id
     WHERE i.cui = $1`,
    [req.params.cui]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "Inversión desactivada no encontrada en los datos ingeridos." });
    return;
  }

  const r = rows[0];
  res.json({
    cui: r.cui,
    codigoSnip: r.codigo_snip,
    nombre: r.nombre,
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
    numHabitantesBenef: r.num_habitantes_benef === null ? null : Number(r.num_habitantes_benef),
    fuente: { dataset: "MEF - Invierte.pe / Banco de Inversiones (desactivadas)", extraidoEl: r.fetched_at },
  });
}));
