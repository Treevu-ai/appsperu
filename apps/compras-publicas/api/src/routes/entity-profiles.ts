import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const entityProfilesRouter = Router();

const asNumber = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);

/**
 * Ficha transversal para compradores OCDS. No trata una adjudicación como
 * contrato/pago y no infiere coincidencias fuera del OCID exacto.
 */
entityProfilesRouter.get("/:buyerId/profile", asyncHandler(async (req, res) => {
  const buyerId = req.params.buyerId;
  const identityResult = await pool.query(
    `WITH names AS (
       SELECT buyer_id,buyer_name FROM procurement_processes WHERE buyer_id=$1
       UNION ALL
       SELECT buyer_id,buyer_name FROM awards WHERE buyer_id=$1
     )
     SELECT buyer_id,buyer_name,COUNT(*)::integer AS rows
       FROM names
      GROUP BY buyer_id,buyer_name
      ORDER BY rows DESC,buyer_name`,
    [buyerId],
  );
  if (identityResult.rows.length === 0) {
    res.status(404).json({ error: "Entidad compradora no encontrada en el universo OCDS materializado." });
    return;
  }

  const [processSummary, processCategories, processRows, awardSummary, awardsByYear, bidderSummary, bidderByProcess, reconciliation, minorCatalog] = await Promise.all([
    pool.query(
      `SELECT COUNT(DISTINCT ocid)::integer AS processes,COUNT(DISTINCT tender_id)::integer AS tenders,
              COUNT(*) FILTER (WHERE valor_monto IS NULL)::integer AS amount_null,
              COUNT(*) FILTER (WHERE valor_monto=0)::integer AS amount_zero,
              COALESCE(SUM(valor_monto) FILTER (WHERE valor_monto>0),0) AS positive_amount,
              MIN(fecha_publicacion) AS first_publication,MAX(fecha_publicacion) AS last_publication,
              MIN(tender_inicio) AS first_tender_start,MAX(tender_inicio) AS last_tender_start
         FROM procurement_processes WHERE buyer_id=$1`,
      [buyerId],
    ),
    pool.query(
      `SELECT COALESCE(categoria,'unclassified') AS category,COUNT(DISTINCT ocid)::integer AS processes,
              COALESCE(SUM(valor_monto) FILTER (WHERE valor_monto>0),0) AS positive_amount,
              COUNT(*) FILTER (WHERE valor_monto IS NULL OR valor_monto=0)::integer AS amount_not_published
         FROM procurement_processes WHERE buyer_id=$1
        GROUP BY categoria ORDER BY processes DESC,category`,
      [buyerId],
    ),
    pool.query(
      `SELECT p.ocid,p.tender_id,p.categoria,p.titulo,p.valor_monto,p.valor_moneda,p.fecha_publicacion,p.tender_inicio,p.tender_fin,
              COUNT(DISTINCT b.bidder_id)::integer AS bidders,
              COUNT(DISTINCT b.bidder_id) FILTER (WHERE b.estado='ganador')::integer AS winners
         FROM procurement_processes p LEFT JOIN bidders b ON b.ocid=p.ocid
        WHERE p.buyer_id=$1
        GROUP BY p.ocid,p.tender_id,p.categoria,p.titulo,p.valor_monto,p.valor_moneda,p.fecha_publicacion,p.tender_inicio,p.tender_fin
        ORDER BY p.fecha_publicacion DESC,p.ocid
        LIMIT 100`,
      [buyerId],
    ),
    pool.query(
      `SELECT COUNT(DISTINCT award_id)::integer AS awards,COUNT(DISTINCT ocid)::integer AS ocids,
              COUNT(DISTINCT supplier_id)::integer AS suppliers,
              COUNT(*) FILTER (WHERE valor_monto IS NULL)::integer AS amount_null,
              COALESCE(SUM(valor_monto) FILTER (WHERE valor_monto>0),0) AS positive_amount,
              MIN(fecha) AS first_award,MAX(fecha) AS last_award
         FROM awards WHERE buyer_id=$1`,
      [buyerId],
    ),
    pool.query(
      `SELECT EXTRACT(YEAR FROM fecha)::integer AS award_year,COALESCE(valor_moneda,'unpublished') AS currency,
              COUNT(DISTINCT award_id)::integer AS awards,COALESCE(SUM(valor_monto),0) AS total_amount
         FROM awards WHERE buyer_id=$1
        GROUP BY EXTRACT(YEAR FROM fecha),valor_moneda
        ORDER BY award_year,currency`,
      [buyerId],
    ),
    pool.query(
      `SELECT COUNT(DISTINCT (b.ocid,b.bidder_id))::integer AS participations,
              COUNT(DISTINCT b.ocid)::integer AS processes_with_bidders,
              COUNT(DISTINCT b.bidder_id)::integer AS bidders,
              COUNT(DISTINCT b.ocid) FILTER (WHERE b.estado='ganador')::integer AS processes_with_winner
         FROM bidders b
        WHERE EXISTS (SELECT 1 FROM procurement_processes p WHERE p.ocid=b.ocid AND p.buyer_id=$1)`,
      [buyerId],
    ),
    pool.query(
      `SELECT p.ocid,COUNT(DISTINCT b.bidder_id)::integer AS bidders,
              COUNT(DISTINCT b.bidder_id) FILTER (WHERE b.estado='ganador')::integer AS winners
         FROM procurement_processes p JOIN bidders b ON b.ocid=p.ocid
        WHERE p.buyer_id=$1
        GROUP BY p.ocid ORDER BY bidders DESC,p.ocid`,
      [buyerId],
    ),
    pool.query(
      `SELECT r.reconciliation_status,COUNT(*)::integer AS ocids
         FROM oece_ocid_reconciliations r JOIN procurement_processes p ON p.ocid=r.ocid
        WHERE p.buyer_id=$1
        GROUP BY r.reconciliation_status ORDER BY r.reconciliation_status`,
      [buyerId],
    ),
    pool.query(`SELECT municipality_id FROM municipalities WHERE municipality_id=$1`, [buyerId]),
  ]);

  const identity = identityResult.rows[0];
  const processProfile = processSummary.rows[0];
  const awardProfile = awardSummary.rows[0];
  const bidders = bidderSummary.rows[0];
  const minorSourceMaterialized = minorCatalog.rows.length > 0;

  res.json({
    entity: { buyerId: identity.buyer_id, buyerName: identity.buyer_name },
    processes: {
      processes: Number(processProfile.processes), tenders: Number(processProfile.tenders),
      positiveAmount: asNumber(processProfile.positive_amount) ?? 0,
      amountNull: Number(processProfile.amount_null), amountZero: Number(processProfile.amount_zero),
      firstPublication: processProfile.first_publication, lastPublication: processProfile.last_publication,
      firstTenderStart: processProfile.first_tender_start, lastTenderStart: processProfile.last_tender_start,
      categories: processCategories.rows.map((row) => ({
        category: row.category, processes: Number(row.processes), positiveAmount: asNumber(row.positive_amount) ?? 0,
        amountNotPublished: Number(row.amount_not_published),
      })),
      records: processRows.rows.map((row) => ({
        ocid: row.ocid, tenderId: row.tender_id, category: row.categoria, title: row.titulo,
        valueAmount: asNumber(row.valor_monto), currency: row.valor_moneda,
        publicationDate: row.fecha_publicacion, tenderStart: row.tender_inicio, tenderEnd: row.tender_fin,
        bidders: Number(row.bidders), winners: Number(row.winners),
      })),
      limitation: "La fecha de publicación del registro no siempre equivale al inicio del procedimiento. Un valor nulo o cero publicado no equivale a valor real cero.",
    },
    awards: {
      awards: Number(awardProfile.awards), ocids: Number(awardProfile.ocids), suppliers: Number(awardProfile.suppliers),
      positiveAmount: asNumber(awardProfile.positive_amount) ?? 0, amountNull: Number(awardProfile.amount_null),
      firstAward: awardProfile.first_award, lastAward: awardProfile.last_award,
      byYearAndCurrency: awardsByYear.rows.map((row) => ({ awardYear: Number(row.award_year), currency: row.currency, awards: Number(row.awards), totalAmount: asNumber(row.total_amount) ?? 0 })),
      limitation: "Una adjudicación publicada no equivale a contrato firmado, pago ejecutado ni entrega recibida.",
    },
    bidders: {
      participations: Number(bidders.participations), processesWithBidders: Number(bidders.processes_with_bidders),
      distinctBidders: Number(bidders.bidders), processesWithWinner: Number(bidders.processes_with_winner),
      byProcess: bidderByProcess.rows.map((row) => ({ ocid: row.ocid, bidders: Number(row.bidders), winners: Number(row.winners) })),
      limitation: "La ausencia de postores en el registro materializado no prueba ausencia de competencia; puede ser una limitación de cobertura o de publicación.",
    },
    reconciliation: {
      method: "exact_ocid_only",
      statuses: reconciliation.rows.map((row) => ({ status: row.reconciliation_status, ocids: Number(row.ocids) })),
      limitation: "No se usan coincidencias por nombre, título o monto para relacionar procesos y adjudicaciones.",
    },
    minorContracts: minorSourceMaterialized
      ? { available: true, limitation: "La fuente de contratos menores tiene un alcance propio y debe revisarse antes de compararla con procesos y adjudicaciones OCDS." }
      : { available: false, scope: "piloto de contratos menores para entidades del catálogo municipal materializado", limitation: "Esta entidad no está materializada en ese catálogo; AppsPerú no debe mostrar cero contratos ni calcular señales de contratos menores para ella." },
    source: { dataset: "OECE - Contrataciones Abiertas (OCDS)", buyerId },
    limitation: "La ficha describe sólo el universo materializado en AppsPerú. No certifica cobertura completa, ejecución presupuestal ni resultados de la contratación.",
  });
}));
