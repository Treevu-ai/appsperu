import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface UnsuccessfulTenderRow extends NeonRow {
  ocid: string;
  tender_id: string;
  item_id: string | null;
  status_details: string | null;
  item_description: string | null;
  buyer_id: string;
  buyer_name: string | null;
  departamento: string | null;
  fecha: string | null;
  fetched_at: string | null;
}

export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const statusDetails = args.statusDetails as string | undefined;
  const buyerId = args.buyerId as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`u.departamento = $${params.length}`);
  }
  if (statusDetails) {
    params.push(statusDetails);
    conditions.push(`u.status_details = $${params.length}`);
  }
  if (buyerId) {
    params.push(buyerId);
    conditions.push(`u.buyer_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<UnsuccessfulTenderRow>(
    `SELECT u.ocid, u.tender_id, u.item_id, u.status_details, u.item_description,
            u.buyer_id, u.buyer_name, u.departamento, u.fecha, rb.fetched_at
     FROM unsuccessful_tenders u
     JOIN raw_ocds_batches rb ON rb.id = u.source_batch_id
     ${where}
     ORDER BY u.fecha DESC NULLS LAST
     LIMIT 500`,
    params
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        ocid: r.ocid,
        tenderId: r.tender_id,
        itemId: r.item_id,
        statusDetails: r.status_details,
        itemDescription: r.item_description,
        buyerId: r.buyer_id,
        buyerName: r.buyer_name,
        departamento: r.departamento,
        fecha: r.fecha,
        fuente: { dataset: "OECE - Contrataciones Abiertas (OCDS), ítems sin adjudicar", extraidoEl: r.fetched_at },
      })),
    },
  };
}
