import type { PoolClient } from "pg";
import type { OcdsRecord } from "./normalize-awards.js";

export interface CanonicalBidderRow {
  ocid: string;
  bidderId: string;
  bidderName: string;
  estado: "participante" | "ganador" | "descalificado" | "rechazado";
  ranking: number | null;
}

export interface RejectedBidder {
  raw: unknown;
  reason: string;
}

export interface NormalizeBiddersResult {
  rows: CanonicalBidderRow[];
  rejected: RejectedBidder[];
}

/**
 * Extrae participantes del campo que publica OECE (`tender.tenderers`), con
 * compatibilidad para el alias histórico `tender.bidders`.
 * Determina únicamente si el postor figura también como adjudicatario. El
 * arreglo OCDS no publica necesariamente ranking, oferta ni descalificación.
 */
export function normalizeBidders(records: OcdsRecord[]): NormalizeBiddersResult {
  const rows: CanonicalBidderRow[] = [];
  const rejected: RejectedBidder[] = [];

  for (const record of records) {
    if (!record.ocid || record.ocid.trim() === "") {
      rejected.push({ raw: record, reason: "ocid ausente" });
      continue;
    }

    // OECE publica `tenderers`; `bidders` se conserva como compatibilidad.
    const bidders = record.compiledRelease?.tender?.tenderers ?? record.compiledRelease?.tender?.bidders;
    if (!bidders || bidders.length === 0) {
      // No es un rechazo: algunos records no tienen bidders
      continue;
    }

    // Extraer IDs de ganadores de awards
    const winnerIds = new Set<string>();
    const awards = record.compiledRelease?.awards ?? [];
    for (const award of awards) {
      for (const supplier of award.suppliers ?? []) {
        if (supplier.id) {
          winnerIds.add(supplier.id.trim());
        }
      }
    }

    // Procesar cada bidder
    for (let idx = 0; idx < bidders.length; idx++) {
      const bidder = bidders[idx];

      if (!bidder.id && !bidder.address?.organizationID) {
        rejected.push({
          raw: bidder,
          reason: `bidder sin id en ocid ${record.ocid}`,
        });
        continue;
      }

      const bidderId = (bidder.id || bidder.address?.organizationID || "").trim();
      const bidderName = bidder.name?.trim() ?? "";

      if (!bidderId) {
        rejected.push({
          raw: bidder,
          reason: `bidder sin identificador en ocid ${record.ocid}`,
        });
        continue;
      }

      if (!bidderName) {
        rejected.push({ raw: bidder, reason: `bidder sin nombre en ocid ${record.ocid}` });
        continue;
      }

      const estado: "participante" | "ganador" = winnerIds.has(bidderId) ? "ganador" : "participante";

      rows.push({
        ocid: record.ocid.trim(),
        bidderId,
        bidderName,
        estado,
        // El orden del arreglo no es una clasificación publicada.
        ranking: null,
      });
    }
  }

  return { rows, rejected };
}

/**
 * Guarda bidders normalizados en la BD
 */
export async function persistBidders(
  client: PoolClient,
  bidders: CanonicalBidderRow[],
  batchId: number
): Promise<{ inserted: number; failed: number }> {
  const unique = new Map<string, CanonicalBidderRow>();
  for (const bidder of bidders) {
    const key = `${bidder.ocid}\u0000${bidder.bidderId}`;
    const previous = unique.get(key);
    unique.set(key, previous?.estado === "ganador" ? previous : bidder);
  }
  const rows = [...unique.values()];
  if (rows.length === 0) return { inserted: 0, failed: 0 };

  const result = await client.query(
    `INSERT INTO bidders (ocid, bidder_id, bidder_name, estado, ranking, source_batch_id, created_at, updated_at)
     SELECT input.ocid, input.bidder_id, input.bidder_name, input.estado, input.ranking, $2, now(), now()
     FROM jsonb_to_recordset($1::jsonb) AS input(
       ocid TEXT, bidder_id TEXT, bidder_name TEXT, estado TEXT, ranking INTEGER
     )
     ON CONFLICT (ocid, bidder_id) DO UPDATE
       SET bidder_name = EXCLUDED.bidder_name,
           estado = EXCLUDED.estado,
           ranking = EXCLUDED.ranking,
           source_batch_id = EXCLUDED.source_batch_id,
           updated_at = now()`,
    [JSON.stringify(rows.map((bidder) => ({
      ocid: bidder.ocid, bidder_id: bidder.bidderId, bidder_name: bidder.bidderName,
      estado: bidder.estado, ranking: bidder.ranking,
    }))), batchId],
  );
  return { inserted: result.rowCount ?? rows.length, failed: 0 };
}
