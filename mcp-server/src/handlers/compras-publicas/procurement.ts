import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface ProcurementRow extends NeonRow {
  ocid: string;
  tender_id: string;
  source_id: string | null;
  buyer_id: string;
  buyer_name: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  categoria: string | null;
  titulo: string | null;
  valor_monto: string | number | null;
  valor_moneda: string | null;
  fecha_publicacion: string | null;
  tender_inicio: string | null;
  tender_fin: string | null;
  tags: string[] | null;
  fetched_at: string | null;
}

export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const categoria = args.categoria as string | undefined;
  const buyerId = args.buyerId as string | undefined;

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

  const { rows } = await db.query<ProcurementRow>(
    `SELECT p.ocid, p.tender_id, p.source_id, p.buyer_id, p.buyer_name, p.departamento,
            p.provincia, p.distrito, p.categoria, p.titulo, p.valor_monto, p.valor_moneda,
            p.fecha_publicacion, p.tender_inicio, p.tender_fin, p.tags, rb.fetched_at
     FROM procurement_processes p
     JOIN raw_ocds_batches rb ON rb.id = p.source_batch_id
     ${where}
     ORDER BY p.fecha_publicacion DESC
     LIMIT 10000`,
    params
  );

  return {
    status: 200,
    body: {
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
    },
  };
}

export async function byOcid(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const ocid = args.ocid as string;

  const { rows } = await db.query<ProcurementRow>(
    `SELECT p.*, rb.fetched_at
     FROM procurement_processes p
     JOIN raw_ocds_batches rb ON rb.id = p.source_batch_id
     WHERE p.ocid = $1`,
    [ocid]
  );

  if (rows.length === 0) {
    return { status: 404, body: { error: "Proceso de contratación no encontrado en los datos ingeridos." } };
  }

  const r = rows[0];
  return {
    status: 200,
    body: {
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
    },
  };
}
