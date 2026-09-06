import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const unsuccessfulTendersRouter = Router();

const UnsuccessfulTendersQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  statusDetails: z.enum(["DESIERTO", "NULO"]).optional(),
  buyerId: z.string().min(1).optional(),
});

/**
 * Ítems de contratación pública (dinero convocado, no gastado) declarados
 * DESIERTO o NULO — la mitad de los procesos OCDS que `GET /api/procurement`
 * (adjudicaciones) nunca cubre. No incluye estados ambiguos observados en la
 * fuente (`RETROTRAIDO_POR_RESOLUCION`, `PENDIENTE_DE_REGISTRO_DE_EFECTO`,
 * `CONVOCADO`) — ver `normalize-unsuccessful-tenders.ts`.
 */
unsuccessfulTendersRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(UnsuccessfulTendersQuerySchema, req.query, res);
  if (!parsed) return;
  const { departamento, statusDetails, buyerId } = parsed;

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

  const { rows } = await pool.query(
    `SELECT u.ocid, u.tender_id, u.item_id, u.status_details, u.item_description,
            u.buyer_id, u.buyer_name, u.departamento, u.fecha, rb.fetched_at
     FROM unsuccessful_tenders u
     JOIN raw_ocds_batches rb ON rb.id = u.source_batch_id
     ${where}
     ORDER BY u.fecha DESC NULLS LAST
     LIMIT 500`,
    params
  );

  res.json({
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
  });
}));
