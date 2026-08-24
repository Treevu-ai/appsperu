import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeContractObject } from "./normalize-object.js";
import {
  MINOR_CONTRACT_LIMIT_2026,
  MINOR_CONTRACT_NORMALIZER_VERSION,
} from "./types.js";

interface SourceAwardRow {
  ocid: string;
  award_id: string;
  buyer_id: string | null;
  buyer_name: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  category: string | null;
  title: string | null;
  estimated_amount: string | null;
  awarded_amount: string;
  award_date: string | null;
  publication_date: string | null;
  quotation_start_date: string | null;
  quotation_end_date: string | null;
  supplier_id: string;
  supplier_name: string;
  source_batch_id: string;
  source_timestamp: string | null;
}

export interface SyncMinorContractsOptions {
  department?: string;
  year?: number;
  limitAmount?: number;
}

export interface SyncMinorContractsSummary {
  candidates: number;
  contractsUpserted: number;
  quotationsUpserted: number;
  eventsUpserted: number;
  evidencesRecorded: number;
  department: string;
  year: number;
  limitAmount: number;
}

function oeceRecordUrl(ocid: string) {
  return `https://contratacionesabiertas.oece.gob.pe/api/v1/records?ocid=${encodeURIComponent(ocid)}`;
}

function rucFromSupplierId(value: string): string | null {
  const match = value.match(/^PE-RUC-(\d{11})$/i);
  return match?.[1] ?? null;
}

async function insertEvidence(
  client: PoolClient,
  input: {
    contractingId: string;
    evidenceType: string;
    sourceRecord: string;
    sourceUrl: string;
    field: string;
    observedValue: Record<string, unknown>;
    sourceTimestamp: string | null;
    sourceBatchId: string;
  }
) {
  await client.query(
    `INSERT INTO contract_evidence
       (contracting_id, signal_id, evidence_type, source_record, source_url, field, observed_value,
        capture_timestamp, confidence, source_batch_id)
     VALUES ($1, NULL, $2, $3, $4, $5, $6::jsonb, COALESCE($7::timestamptz, now()), 1, $8)
     ON CONFLICT DO NOTHING`,
    [
      input.contractingId,
      input.evidenceType,
      input.sourceRecord,
      input.sourceUrl,
      input.field,
      JSON.stringify(input.observedValue),
      input.sourceTimestamp,
      input.sourceBatchId,
    ]
  );
}

/**
 * Materializa únicamente contrataciones que cumplen el alcance del piloto.
 * Si un campo no está publicado por OECE, se conserva como NULL/UNKNOWN y no
 * se convierte en una inferencia de incumplimiento.
 */
export async function syncMinorContracts(options: SyncMinorContractsOptions = {}): Promise<SyncMinorContractsSummary> {
  const department = (options.department ?? "LA LIBERTAD").toUpperCase();
  const year = options.year ?? 2026;
  const limitAmount = options.limitAmount ?? MINOR_CONTRACT_LIMIT_2026;
  const client = await pool.connect();
  let contractsUpserted = 0;
  let quotationsUpserted = 0;
  let eventsUpserted = 0;
  let evidencesRecorded = 0;

  try {
    await client.query("BEGIN");
    const { rows } = await client.query<SourceAwardRow>(
      `SELECT a.ocid, a.award_id, a.buyer_id, a.buyer_name, a.departamento,
              p.provincia, p.distrito, p.categoria AS category, p.titulo AS title,
              p.valor_monto AS estimated_amount, a.valor_monto AS awarded_amount, a.fecha AS award_date,
              p.fecha_publicacion AS publication_date, p.tender_inicio AS quotation_start_date,
              p.tender_fin AS quotation_end_date, a.supplier_id, a.supplier_name,
              a.source_batch_id, rb.fetched_at AS source_timestamp
       FROM awards a
       JOIN procurement_processes p ON p.ocid = a.ocid
       JOIN raw_ocds_batches rb ON rb.id = a.source_batch_id
       WHERE a.departamento = $1
         AND p.fecha_publicacion >= make_timestamptz($2, 1, 1, 0, 0, 0)
         AND p.fecha_publicacion < make_timestamptz($2 + 1, 1, 1, 0, 0, 0)
         AND a.valor_monto >= 0
         AND a.valor_monto <= $3
         AND p.categoria IN ('goods', 'services')
         AND UPPER(p.buyer_name) LIKE 'MUNICIPALIDAD DISTRITAL%'
       ORDER BY p.fecha_publicacion, a.ocid, a.award_id`,
      [department, year, limitAmount]
    );

    for (const row of rows) {
      // These records have all constraints enforced in SQL; null buyer data is not a valid pilot contracting.
      if (!row.buyer_id || !row.buyer_name) continue;
      const municipalityId = `oece:${row.buyer_id}`;
      const contractingId = `oece:${row.ocid}:${row.award_id}`;
      const sourceUrl = oeceRecordUrl(row.ocid);
      const sourceBatchId = row.source_batch_id;
      const sourceTimestamp = row.source_timestamp;
      const objectNormalized = normalizeContractObject(row.title);

      await client.query(
        `INSERT INTO municipalities
           (municipality_id, official_name, department, province, district, entity_code_oece, source, source_timestamp)
         VALUES ($1,$2,$3,$4,$5,$6,'OECE OCDS',$7)
         ON CONFLICT (municipality_id) DO UPDATE SET
           official_name = EXCLUDED.official_name, department = EXCLUDED.department,
           province = COALESCE(EXCLUDED.province, municipalities.province),
           district = COALESCE(EXCLUDED.district, municipalities.district),
           entity_code_oece = EXCLUDED.entity_code_oece, source_timestamp = EXCLUDED.source_timestamp`,
        [municipalityId, row.buyer_name, department, row.provincia, row.distrito, row.buyer_id, sourceTimestamp]
      );
      await client.query(
        `INSERT INTO supplier_profiles
           (supplier_id, ruc, legal_name, first_seen, last_seen, source, source_timestamp)
         VALUES ($1,$2,$3,$4,$4,'OECE OCDS',$5)
         ON CONFLICT (supplier_id) DO UPDATE SET
           legal_name = EXCLUDED.legal_name, ruc = COALESCE(supplier_profiles.ruc, EXCLUDED.ruc),
           last_seen = GREATEST(supplier_profiles.last_seen, EXCLUDED.last_seen), source_timestamp = EXCLUDED.source_timestamp`,
        [row.supplier_id, rucFromSupplierId(row.supplier_id), row.supplier_name, row.award_date ?? row.publication_date, sourceTimestamp]
      );
      await client.query(
        `INSERT INTO minor_contracts
           (contracting_id, source_contracting_id, ocid, award_id, municipality_id, year,
            object_original, object_normalized, category, contract_type, estimated_amount, awarded_amount,
            publication_date, quotation_start_date, quotation_end_date, award_date, winning_supplier_id,
            status, source_url, source_timestamp, source_batch_id, data_version, normalizer_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,$13,$14,$15,$16,'AWARDED',$17,$18,$19,
                 'oece-ocds-records-v1',$20)
         ON CONFLICT (contracting_id) DO UPDATE SET
           object_original = EXCLUDED.object_original, object_normalized = EXCLUDED.object_normalized,
           category = EXCLUDED.category, estimated_amount = EXCLUDED.estimated_amount,
           awarded_amount = EXCLUDED.awarded_amount, publication_date = EXCLUDED.publication_date,
           quotation_start_date = EXCLUDED.quotation_start_date, quotation_end_date = EXCLUDED.quotation_end_date,
           award_date = EXCLUDED.award_date, source_url = EXCLUDED.source_url,
           source_timestamp = EXCLUDED.source_timestamp, source_batch_id = EXCLUDED.source_batch_id,
           updated_at = now()`,
        [
          contractingId, row.award_id, row.ocid, row.award_id, municipalityId, year,
          row.title, objectNormalized, row.category, row.estimated_amount, row.awarded_amount,
          row.publication_date, row.quotation_start_date, row.quotation_end_date, row.award_date,
          row.supplier_id, sourceUrl, sourceTimestamp, sourceBatchId, MINOR_CONTRACT_NORMALIZER_VERSION,
        ]
      );
      contractsUpserted += 1;

      const baseEvidence = [
        { type: "PROCESS", field: "object_original", value: { objectOriginal: row.title, estimatedAmount: row.estimated_amount } },
        { type: "AWARD", field: "awarded_amount", value: { awardId: row.award_id, awardedAmount: row.awarded_amount, awardDate: row.award_date } },
        { type: "SUPPLIER", field: "supplier_id", value: { supplierId: row.supplier_id, supplierName: row.supplier_name } },
      ];
      for (const evidence of baseEvidence) {
        await insertEvidence(client, {
          contractingId, evidenceType: evidence.type, sourceRecord: row.ocid, sourceUrl, field: evidence.field,
          observedValue: evidence.value, sourceTimestamp, sourceBatchId,
        });
        evidencesRecorded += 1;
      }

      const eventRows = [
        { type: "REQUIREMENT_PUBLICATION", at: row.publication_date, description: "Publicación del requerimiento/proceso en OECE OCDS" },
        { type: "AWARD", at: row.award_date, description: "Adjudicación publicada en OECE OCDS" },
      ].filter((event): event is { type: "REQUIREMENT_PUBLICATION" | "AWARD"; at: string; description: string } => Boolean(event.at));
      for (const event of eventRows) {
        await client.query(
          `INSERT INTO contract_events
             (event_id, contracting_id, event_type, event_timestamp, publication_timestamp, description, source_url, source_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (contracting_id, event_type, source_batch_id) DO UPDATE SET event_timestamp = EXCLUDED.event_timestamp`,
          [`${contractingId}:${event.type}:${sourceBatchId}`, contractingId, event.type, event.at, row.publication_date, event.description, sourceUrl, sourceBatchId]
        );
        eventsUpserted += 1;
      }
    }

    await client.query(
      `UPDATE minor_contracts c
       SET quotation_count = counts.total, valid_quotation_count = NULL, updated_at = now()
       FROM (
         SELECT contracting_id, COUNT(*)::integer AS total
         FROM contract_quotations
         GROUP BY contracting_id
       ) counts
       WHERE c.contracting_id = counts.contracting_id
         AND c.year = $1`,
      [year]
    );

    await client.query("COMMIT");
    return { candidates: rows.length, contractsUpserted, quotationsUpserted, eventsUpserted, evidencesRecorded, department, year, limitAmount };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncMinorContracts({
    department: process.env.OECE_DEPARTAMENTO,
    year: process.env.MINOR_CONTRACT_YEAR ? Number(process.env.MINOR_CONTRACT_YEAR) : undefined,
  })
    .then((summary) => console.log("Materialización de contratos menores completada:", summary))
    .finally(() => pool.end())
    .catch((error) => {
      console.error("Materialización de contratos menores falló:", error);
      process.exitCode = 1;
    });
}
