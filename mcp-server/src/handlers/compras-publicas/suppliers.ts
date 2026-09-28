import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { computeConcentration } from "./_helpers.js";

interface SupplierRow extends NeonRow {
  supplier_id: string;
  supplier_name: string;
  adjudicaciones: string | number;
  entidades_distintas: string | number;
  valor_total: string | number | null;
}

interface SupplierAwardRow extends NeonRow {
  ocid: string;
  award_id: string;
  buyer_id: string;
  buyer_name: string;
  departamento: string | null;
  supplier_id: string;
  supplier_name: string;
  valor_monto: string | number | null;
  valor_moneda: string | null;
  fecha: string | null;
  fetched_at: string | null;
}

export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;

  const params: unknown[] = [];
  let where = "";
  if (departamento) {
    params.push(departamento.toUpperCase());
    where = `WHERE departamento = $1`;
  }

  const { rows } = await db.query<SupplierRow>(
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

  return {
    status: 200,
    body: { resultados, concentracion },
  };
}

export async function bySupplierId(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const supplierId = args.supplierId as string;

  const { rows } = await db.query<SupplierAwardRow>(
    `SELECT a.ocid, a.award_id, a.buyer_id, a.buyer_name, a.departamento, a.supplier_id,
            a.supplier_name, a.valor_monto, a.valor_moneda, a.fecha, rb.fetched_at
     FROM awards a
     JOIN raw_ocds_batches rb ON rb.id = a.source_batch_id
     WHERE a.supplier_id = $1
     ORDER BY a.fecha DESC NULLS LAST`,
    [supplierId]
  );

  if (rows.length === 0) {
    return { status: 404, body: { error: "Proveedor no encontrado en los datos ingeridos." } };
  }

  return {
    status: 200,
    body: {
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
    },
  };
}
