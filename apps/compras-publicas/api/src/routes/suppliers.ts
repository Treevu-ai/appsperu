import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { computeConcentration } from "../suppliers/concentration.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const suppliersRouter = Router();

const SuppliersQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  categoria: z.string().min(1).optional(),
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
  proveedor: z.string().min(1).optional(),
  top: z.coerce.number().int().min(1).max(1000).optional(),
});

suppliersRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(SuppliersQuerySchema, req.query, res);
  if (!parsed) return;
  const { departamento, categoria, anio, proveedor, top } = parsed;

  // `categoria` vive en procurement_processes (PK: ocid) — el LEFT JOIN no
  // duplica filas de awards y solo se emite cuando se pide, para no arrastrar
  // la ambigüedad de columnas compartidas (departamento, valor_monto,
  // buyer_id) a la query por defecto. Con el JOIN activo, las columnas de
  // awards se califican explícitamente en SELECT y WHERE.
  const join = categoria ? `LEFT JOIN procurement_processes pp ON pp.ocid = awards.ocid` : "";
  const a = (col: string): string => (categoria ? `awards.${col}` : col);

  const params: unknown[] = [];
  const conditions: string[] = [];
  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`${a("departamento")} = $${params.length}`);
  }
  if (categoria) {
    params.push(categoria);
    conditions.push(`LOWER(pp.categoria) = $${params.length}`);
  }
  if (anio !== undefined) {
    params.push(anio);
    conditions.push(`EXTRACT(YEAR FROM ${a("fecha")}) = $${params.length}`);
  }
  if (proveedor) {
    params.push(proveedor);
    conditions.push(`${a("supplier_id")} = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitClause = top !== undefined ? `LIMIT ${top}` : "";

  const { rows } = await pool.query(
    `SELECT ${a("supplier_id")}, ${a("supplier_name")},
            COUNT(*) AS adjudicaciones,
            COUNT(DISTINCT ${a("buyer_id")}) AS entidades_distintas,
            SUM(${a("valor_monto")}) AS valor_total
     FROM awards
     ${join}
     ${where}
     GROUP BY ${a("supplier_id")}, ${a("supplier_name")}
     ORDER BY valor_total DESC NULLS LAST
     ${limitClause}`,
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

  res.json({
    resultados,
    concentracion,
    scope: {
      fuente: "awards — OECE contrataciones abiertas (OCDS), corridas locales",
      ambito: departamento ? `departamento ${departamento.toUpperCase()}` : "nacional (sin filtro de departamento)",
      cobertura:
        "muestra de adjudicaciones ingeridas — no es censo del universo OECE; grupos económicos multi-RUC no se detectan desde awards.",
      filtros: {
        departamento: departamento ?? null,
        categoria: categoria ?? null,
        anio: anio ?? null,
        proveedor: proveedor ?? null,
        top: top ?? null,
      },
    },
  });
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
