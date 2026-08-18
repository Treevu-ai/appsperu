import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { computeConcentration } from "../suppliers/concentration.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const suppliersRouter = Router();

const SuppliersQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
});

suppliersRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(SuppliersQuerySchema, req.query, res);
  if (!parsed) return;
  const { departamento } = parsed;

  const params: unknown[] = [];
  let where = "";
  if (departamento) {
    params.push(departamento.toUpperCase());
    where = `WHERE departamento = $1`;
  }

  const { rows } = await pool.query(
    `SELECT supplier_id, supplier_name,
            COUNT(*) AS adjudicaciones,
            COUNT(DISTINCT buyer_id) AS entidades_distintas,
            SUM(valor_monto) AS valor_total
     FROM awards
     ${where}
     GROUP BY supplier_id, supplier_name
     ORDER BY valor_total DESC NULLS LAST`,
    params
  );

  const resultados = rows.map((r) => ({
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    adjudicaciones: Number(r.adjudicaciones),
    entidadesDistintas: Number(r.entidades_distintas),
    valorTotal: Number(r.valor_total) || 0,
  }));

  const concentracion = computeConcentration(
    resultados.map((r) => ({ supplierId: r.supplierId, valorTotal: r.valorTotal }))
  );

  res.json({ resultados, concentracion });
}));

suppliersRouter.get("/:supplierId", asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.ocid, a.award_id, a.buyer_id, a.buyer_name, a.departamento, a.supplier_id,
            a.supplier_name, a.valor_monto, a.valor_moneda, a.fecha, rb.fetched_at
     FROM awards a
     JOIN raw_ocds_batches rb ON rb.id = a.source_batch_id
     WHERE a.supplier_id = $1
     ORDER BY a.fecha DESC NULLS LAST`,
    [req.params.supplierId]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "Proveedor no encontrado en los datos ingeridos." });
    return;
  }

  res.json({
    supplierId: rows[0].supplier_id,
    supplierName: rows[0].supplier_name,
    adjudicaciones: rows.map((r) => ({
      ocid: r.ocid,
      awardId: r.award_id,
      buyerId: r.buyer_id,
      buyerName: r.buyer_name,
      departamento: r.departamento,
      valorMonto: r.valor_monto === null ? null : Number(r.valor_monto),
      valorMoneda: r.valor_moneda,
      fecha: r.fecha,
      fuente: { dataset: "OECE - Contrataciones Abiertas (OCDS)", extraidoEl: r.fetched_at },
    })),
  });
}));
