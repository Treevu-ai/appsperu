import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { deriveSignals } from "./derive-signals.js";
import {
  MINOR_CONTRACT_LIMIT_2026,
  MINOR_CONTRACT_NORMATIVE_VERSION,
  MINOR_CONTRACT_RULE_VERSION,
  type MinorContractForSignals,
} from "./types.js";

// S01/S02 pueden referir cientos de contratos. Se conserva la métrica completa
// en la señal y una muestra acotada de insumos trazables, para que una corrida
// completa no intente materializar una relación cuadrática de evidencia.
const MAX_EVIDENCE_INPUTS_PER_SIGNAL = 25;

interface SignalSourceRow {
  contracting_id: string;
  source_contracting_id: string;
  municipality_id: string;
  winning_supplier_id: string | null;
  object_normalized: string | null;
  awarded_amount: string;
  publication_date: string | null;
  quotation_end_date: string | null;
  quotation_count: number;
  valid_quotation_count: number | null;
  evidence_found: number;
  evidence_expected: number;
  source_batch_id: string;
  source_url: string;
  source_timestamp: string | null;
  semantic_embedding: unknown | null;
  semantic_provider: string | null;
  semantic_model: string | null;
}

export interface RunSignalsOptions {
  department?: string;
  year?: number;
  limitAmount?: number;
}

export interface RunSignalsSummary {
  signalRunId: string;
  contractsConsidered: number;
  signalsCreated: number;
  unavailableSignals: string[];
}

/**
 * Persiste un run inmutable: los resultados de versiones distintas de reglas,
 * modelos o normativa coexisten y la API puede mostrar exactamente cuál usó.
 */
export async function runMinorContractSignals(options: RunSignalsOptions = {}): Promise<RunSignalsSummary> {
  const department = (options.department ?? "LA LIBERTAD").toUpperCase();
  const year = options.year ?? 2026;
  const limitAmount = options.limitAmount ?? MINOR_CONTRACT_LIMIT_2026;
  const signalRunId = randomUUID();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query<SignalSourceRow>(
      `SELECT c.contracting_id, c.source_contracting_id, c.municipality_id, c.winning_supplier_id, c.object_normalized,
              c.awarded_amount, c.publication_date, c.quotation_end_date, c.quotation_count,
              c.valid_quotation_count, c.source_batch_id, c.source_url, c.source_timestamp,
              se.embedding AS semantic_embedding, se.provider AS semantic_provider, se.model AS semantic_model,
              COUNT(e.evidence_id)::integer AS evidence_found,
              4::integer AS evidence_expected
       FROM minor_contracts c
       JOIN municipalities m ON m.municipality_id = c.municipality_id
       LEFT JOIN LATERAL (
         SELECT embedding,provider,model FROM contract_object_embeddings
          WHERE contracting_id=c.contracting_id AND object_normalized=c.object_normalized
          ORDER BY generated_at DESC LIMIT 1
       ) se ON TRUE
       LEFT JOIN contract_evidence e ON e.contracting_id = c.contracting_id AND e.signal_id IS NULL
       WHERE m.department = $1 AND c.year = $2 AND c.awarded_amount <= $3
       GROUP BY c.contracting_id, c.source_contracting_id, c.municipality_id, c.winning_supplier_id, c.object_normalized,
                c.awarded_amount, c.publication_date, c.quotation_end_date, c.quotation_count,
                c.valid_quotation_count, c.source_batch_id, c.source_url, c.source_timestamp,
                se.embedding, se.provider, se.model`,
      [department, year, limitAmount]
    );
    const contracts: MinorContractForSignals[] = result.rows.map((row) => ({
      contractingId: row.contracting_id,
      sourceContractingId: row.source_contracting_id,
      municipalityId: row.municipality_id,
      supplierId: row.winning_supplier_id,
      objectNormalized: row.object_normalized,
      awardedAmount: Number(row.awarded_amount),
      publicationDate: row.publication_date,
      quotationEndDate: row.quotation_end_date,
      quotationCount: Number(row.quotation_count),
      validQuotationCount: row.valid_quotation_count === null ? null : Number(row.valid_quotation_count),
      evidenceFound: Number(row.evidence_found),
      evidenceExpected: Number(row.evidence_expected),
      semanticEmbedding: Array.isArray(row.semantic_embedding) && row.semantic_embedding.every((value) => typeof value === "number" && Number.isFinite(value)) ? row.semantic_embedding as number[] : undefined,
      semanticModelVersion: row.semantic_provider && row.semantic_model ? `embedding:${row.semantic_provider}:${row.semantic_model}` : undefined,
    }));
    const sourceByContract = new Map(result.rows.map((row) => [row.contracting_id, row]));
    const signals = deriveSignals(contracts);
    const semanticModels = [...new Set(contracts.flatMap((contract) => contract.semanticModelVersion ? [contract.semanticModelVersion] : []))];
    const runModelVersion = ["token-jaccard-v1-exploratory", ...semanticModels].join(";");

    await client.query(
      `INSERT INTO signal_runs
         (signal_run_id, department, year, limit_amount, rule_version, model_version, normative_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [signalRunId, department, year, limitAmount, MINOR_CONTRACT_RULE_VERSION, runModelVersion, MINOR_CONTRACT_NORMATIVE_VERSION]
    );

    for (const signal of signals) {
      const signalId = randomUUID();
      const relatedContractingIds = [...new Set(signal.relatedContractingIds)];
      const evidenceInputs = relatedContractingIds
        .slice(0, MAX_EVIDENCE_INPUTS_PER_SIGNAL)
        .flatMap((contractingId) => {
          const source = sourceByContract.get(contractingId);
          return source ? [{
            contracting_id: contractingId,
            source_url: source.source_url,
            source_timestamp: source.source_timestamp,
          }] : [];
        });
      const observedValue = {
        ...signal.observedValue,
        evidenceInputsTotal: relatedContractingIds.length,
        evidenceInputsCaptured: evidenceInputs.length,
      };
      await client.query(
        `INSERT INTO contract_signals
           (signal_id, signal_run_id, signal_type, contracting_id, municipality_id, supplier_id,
            metric, observed_value, reference_value, severity, confidence, rule_version,
            model_version, explanation)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14)`,
        [
          signalId, signalRunId, signal.signalType, signal.contractingId, signal.municipalityId,
          signal.supplierId, signal.metric, JSON.stringify(observedValue),
          signal.referenceValue === null ? null : JSON.stringify(signal.referenceValue), signal.severity,
          signal.confidence, MINOR_CONTRACT_RULE_VERSION, signal.modelVersion, signal.explanation,
        ]
      );
      if (evidenceInputs.length > 0) {
        await client.query(
          `INSERT INTO contract_evidence
             (contracting_id, signal_id, evidence_type, source_record, source_url, field, observed_value,
              capture_timestamp, confidence, source_batch_id, minor_source_batch_id)
           SELECT input.contracting_id,$1,'SIGNAL_INPUT',input.contracting_id,input.source_url,'contracting_id',
                  jsonb_build_object('contractingId', input.contracting_id),COALESCE(input.source_timestamp, now()),1,NULL,NULL
           FROM jsonb_to_recordset($2::jsonb) AS input(contracting_id text, source_url text, source_timestamp timestamptz)
           ON CONFLICT DO NOTHING`,
          [signalId, JSON.stringify(evidenceInputs)]
        );
      }
    }

    await client.query("COMMIT");
    return {
      signalRunId, contractsConsidered: contracts.length, signalsCreated: signals.length,
      unavailableSignals: ["S03", "S10", ...(semanticModels.length === 0 ? ["S11", "S12", "S13"] : [])],
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMinorContractSignals({
    department: process.env.OECE_DEPARTAMENTO,
    year: process.env.MINOR_CONTRACT_YEAR ? Number(process.env.MINOR_CONTRACT_YEAR) : undefined,
  })
    .then((summary) => console.log("Cálculo de señales de contratos menores completado:", summary))
    .finally(() => pool.end())
    .catch((error) => {
      console.error("Cálculo de señales de contratos menores falló:", error);
      process.exitCode = 1;
    });
}
