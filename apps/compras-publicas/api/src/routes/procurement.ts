import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const procurementRouter = Router();

const ProcurementQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  categoria: z.string().min(1).optional(),
  buyerId: z.string().min(1).optional(),
});

procurementRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(ProcurementQuerySchema, req.query, res);
  if (!parsed) return;
  const { departamento, categoria, buyerId } = parsed;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`departamento = $${params.length}`);
  }
  if (categoria) {
    params.push(categoria);
    conditions.push(`categoria = $${params.length}`);
  }
  if (buyerId) {
    params.push(buyerId);
    conditions.push(`buyer_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT p.ocid, p.tender_id, p.source_id, p.buyer_id, p.buyer_name, p.departamento,
            p.provincia, p.distrito, p.categoria, p.titulo, p.valor_monto, p.valor_moneda,
            p.fecha_publicacion, p.tender_inicio, p.tender_fin, p.tags, rb.fetched_at
     FROM procurement_processes p
     JOIN raw_ocds_batches rb ON rb.id = p.source_batch_id
     ${where}
     ORDER BY p.fecha_publicacion DESC
     LIMIT 500`,
    params
  );

  res.json({
    resultados: rows.map((r) => ({
      ocid: r.ocid,
      tenderId: r.tender_id,
      sourceId: r.source_id,
      buyerId: r.buyer_id,
      buyerName: r.buyer_name,
      departamento: r.departamento,
      provincia: r.provincia,
      distrito: r.distrito,
      categoria: r.categoria,
      titulo: r.titulo,
      valorMonto: r.valor_monto === null ? null : Number(r.valor_monto),
      valorMoneda: r.valor_moneda,
      fechaPublicacion: r.fecha_publicacion,
      tenderInicio: r.tender_inicio,
      tenderFin: r.tender_fin,
      tags: r.tags,
      fuente: { dataset: "OECE - Contrataciones Abiertas (OCDS)", extraidoEl: r.fetched_at },
    })),
  });
}));

procurementRouter.get("/:ocid", asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, rb.fetched_at
     FROM procurement_processes p
     JOIN raw_ocds_batches rb ON rb.id = p.source_batch_id
     WHERE p.ocid = $1`,
    [req.params.ocid]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "Proceso de contratación no encontrado en los datos ingeridos." });
    return;
  }

  const r = rows[0];
  res.json({
    ocid: r.ocid,
    tenderId: r.tender_id,
    sourceId: r.source_id,
    buyerId: r.buyer_id,
    buyerName: r.buyer_name,
    departamento: r.departamento,
    provincia: r.provincia,
    distrito: r.distrito,
    categoria: r.categoria,
    titulo: r.titulo,
    valorMonto: r.valor_monto === null ? null : Number(r.valor_monto),
    valorMoneda: r.valor_moneda,
    fechaPublicacion: r.fecha_publicacion,
    tenderInicio: r.tender_inicio,
    tenderFin: r.tender_fin,
    tags: r.tags,
    fuente: { dataset: "OECE - Contrataciones Abiertas (OCDS)", extraidoEl: r.fetched_at },
  });
}));
