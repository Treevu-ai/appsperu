import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { asNumber, MINOR_CONTRACT_LIMIT_2026 } from "./_helpers.js";

interface ContractRow extends NeonRow {
  contracting_id: string;
  ocid: string;
  award_id: string;
  year: string | number;
  object_original: string | null;
  object_normalized: string | null;
  category: string | null;
  estimated_amount: string | number | null;
  awarded_amount: string | number | null;
  publication_date: string | null;
  award_date: string | null;
  quotation_count: string | number;
  valid_quotation_count: string | number | null;
  source_url: string | null;
  source_timestamp: string | null;
  municipality_id: string;
  official_name: string;
  province: string | null;
  district: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  ruc: string | null;
}

interface QuotationRow extends NeonRow {
  quotation_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  ruc: string | null;
  amount: string | number | null;
  currency: string | null;
  submission_date: string | null;
}

interface EventRow extends NeonRow {
  event_id: string;
  event_type: string | null;
  description: string | null;
  event_timestamp: string | null;
}

interface DocumentRow extends NeonRow {
  document_id: string;
  document_type: string | null;
  title: string | null;
  url: string | null;
  publication_date: string | null;
}

interface EvidenceRow extends NeonRow {
  evidence_id: string;
  evidence_type: string | null;
  url: string | null;
  caption: string | null;
  capture_timestamp: string | null;
}

interface SignalRow extends NeonRow {
  signal_id: string;
  signal_type: string | null;
  confidence: string | number | null;
  observed_value: Record<string, unknown> | null;
  reference_value: Record<string, unknown> | null;
  explanation: string | null;
  model_version: string | null;
  detected_at: string | null;
  run_rule_version: string | null;
  run_model_version: string | null;
  normative_version: string | null;
}

const SIGNAL_TYPES = ["S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08", "S09", "S10", "S11", "S12", "S13"] as const;

export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const year = args.year as number | undefined;
  const municipalityId = args.municipalityId as string | undefined;
  const supplierId = args.supplierId as string | undefined;
  const category = args.category as string | undefined;
  const minAmount = args.minAmount as number | undefined;
  const maxAmount = args.maxAmount as number | undefined;
  const quotationCount = args.quotationCount as number | undefined;
  const signalType = args.signalType as (typeof SIGNAL_TYPES)[number] | undefined;
  const q = args.q as string | undefined;
  const limit = (args.limit as number | undefined) ?? 100;

  if (maxAmount !== undefined && maxAmount > MINOR_CONTRACT_LIMIT_2026) {
    return {
      status: 400,
      body: { error: `maxAmount excede el límite legal vigente (${MINOR_CONTRACT_LIMIT_2026}).` },
    };
  }

  const conditions: string[] = [];
  const values: unknown[] = [];
  const add = (expression: string, value: unknown) => {
    values.push(value);
    conditions.push(`${expression} $${values.length}`);
  };

  if (year !== undefined) add("c.year =", year);
  if (municipalityId) add("c.municipality_id =", municipalityId);
  if (supplierId) add("c.winning_supplier_id =", supplierId);
  if (category) add("c.category =", category);
  if (minAmount !== undefined) add("c.awarded_amount >=", minAmount);
  if (maxAmount !== undefined) add("c.awarded_amount <=", maxAmount);
  if (quotationCount !== undefined) add("c.quotation_count =", quotationCount);

  if (q) {
    values.push(`%${q}%`);
    conditions.push(
      `(c.object_original ILIKE $${values.length} OR m.official_name ILIKE $${values.length} OR s.legal_name ILIKE $${values.length} OR s.ruc ILIKE $${values.length} OR c.ocid ILIKE $${values.length})`
    );
  }

  if (signalType) {
    values.push(signalType);
    conditions.push(
      `EXISTS (SELECT 1 FROM contract_signals cs WHERE cs.contracting_id = c.contracting_id AND cs.signal_type = $${values.length})`
    );
  }

  values.push(limit);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<ContractRow>(
    `SELECT c.contracting_id,c.ocid,c.award_id,c.year,c.object_original,c.object_normalized,c.category,c.estimated_amount,c.awarded_amount,c.publication_date,c.award_date,c.quotation_count,c.valid_quotation_count,c.source_url,c.source_timestamp,m.municipality_id,m.official_name AS municipality_name,m.province,m.district,s.supplier_id,s.legal_name AS supplier_name,s.ruc
     FROM minor_contracts c JOIN municipalities m ON m.municipality_id=c.municipality_id LEFT JOIN supplier_profiles s ON s.supplier_id=c.winning_supplier_id ${where}
     ORDER BY c.publication_date DESC NULLS LAST,c.contracting_id LIMIT $${values.length}`,
    values
  );

  return {
    status: 200,
    body: {
      scope: {
        department: "LA LIBERTAD",
        maximumAmount: MINOR_CONTRACT_LIMIT_2026,
        statement: "Las contrataciones son una reconstrucción de evidencia pública; la ausencia de un dato no prueba incumplimiento.",
      },
      resultados: rows.map((row) => ({
        contractingId: row.contracting_id,
        ocid: row.ocid,
        awardId: row.award_id,
        year: Number(row.year),
        objectOriginal: row.object_original,
        objectNormalized: row.object_normalized,
        category: row.category,
        estimatedAmount: asNumber(row.estimated_amount),
        awardedAmount: asNumber(row.awarded_amount),
        publicationDate: row.publication_date,
        awardDate: row.award_date,
        quotationCount: Number(row.quotation_count),
        validQuotationCount: row.valid_quotation_count === null ? null : Number(row.valid_quotation_count),
        municipality: {
          id: row.municipality_id,
          name: row.municipality_name ?? row.official_name ?? "",
          province: row.province,
          district: row.district,
        },
        supplier: row.supplier_id
          ? { id: row.supplier_id, name: row.supplier_name ?? "", ruc: row.ruc }
          : null,
        source: { url: row.source_url, timestamp: row.source_timestamp },
      })),
    },
  };
}

export async function byId(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const id = args.id as string;

  const contractResult = await db.query<ContractRow & {
    source_contracting_id: string | null;
    quoted_amount: string | number | null;
    quotation_start_date: string | null;
    quotation_end_date: string | null;
    valid_quotation_count: string | number | null;
    municipality_ruc: string | null;
    supplier_name: string | null;
    supplier_ruc: string | null;
    data_version: string | null;
    normalizer_version: string | null;
    minor_source_batch_id: string | null;
  }>(
    `SELECT c.*,m.official_name AS municipality_name,m.ruc AS municipality_ruc,m.province,m.district,s.legal_name AS supplier_name,s.ruc AS supplier_ruc
     FROM minor_contracts c JOIN municipalities m ON m.municipality_id=c.municipality_id LEFT JOIN supplier_profiles s ON s.supplier_id=c.winning_supplier_id WHERE c.contracting_id=$1`,
    [id]
  );

  if (contractResult.rows.length === 0) {
    return { status: 404, body: { error: "Contratación menor no encontrada en el universo materializado." } };
  }

  const contract = contractResult.rows[0];

  const [quotations, events, documents, evidence, signals] = await Promise.all([
    db.query<QuotationRow>(
      `SELECT q.*,s.legal_name AS supplier_name,s.ruc FROM contract_quotations q LEFT JOIN supplier_profiles s ON s.supplier_id=q.supplier_id WHERE q.contracting_id=$1 ORDER BY q.submission_date`,
      [id]
    ),
    db.query<EventRow>(`SELECT * FROM contract_events WHERE contracting_id=$1 ORDER BY event_timestamp NULLS LAST`, [id]),
    db.query<DocumentRow>(`SELECT * FROM contract_documents WHERE contracting_id=$1 ORDER BY publication_date NULLS LAST`, [id]),
    db.query<EvidenceRow>(`SELECT * FROM contract_evidence WHERE contracting_id=$1 ORDER BY capture_timestamp DESC`, [id]),
    db.query<SignalRow & {
      run_rule_version: string | null;
      run_model_version: string | null;
      normative_version: string | null;
    }>(
      `SELECT cs.*,sr.rule_version AS run_rule_version,sr.model_version AS run_model_version,sr.normative_version FROM contract_signals cs JOIN signal_runs sr ON sr.signal_run_id=cs.signal_run_id WHERE cs.contracting_id=$1 ORDER BY cs.detected_at DESC`,
      [id]
    ),
  ]);

  return {
    status: 200,
    body: {
      contracting: {
        contractingId: contract.contracting_id,
        sourceContractingId: contract.source_contracting_id,
        ocid: contract.ocid,
        awardId: contract.award_id,
        objectOriginal: contract.object_original,
        objectNormalized: contract.object_normalized,
        category: contract.category,
        estimatedAmount: asNumber(contract.estimated_amount),
        quotedAmount: asNumber(contract.quoted_amount),
        awardedAmount: asNumber(contract.awarded_amount),
        publicationDate: contract.publication_date,
        quotationStartDate: contract.quotation_start_date,
        quotationEndDate: contract.quotation_end_date,
        awardDate: contract.award_date,
        quotationCount: Number(contract.quotation_count),
        validQuotationCount: contract.valid_quotation_count === null ? null : Number(contract.valid_quotation_count),
        municipality: {
          id: contract.municipality_id,
          name: contract.municipality_name ?? "",
          ruc: contract.municipality_ruc,
          province: contract.province,
          district: contract.district,
        },
        supplier: contract.winning_supplier_id
          ? { id: contract.winning_supplier_id, name: contract.supplier_name ?? "", ruc: contract.supplier_ruc }
          : null,
        source: {
          url: contract.source_url,
          timestamp: contract.source_timestamp,
          ocdsBatchId: contract.source_batch_id,
          publicMinorContractBatchId: contract.minor_source_batch_id,
        },
        versions: { data: contract.data_version, normalizer: contract.normalizer_version },
      },
      quotations: quotations.rows,
      events: events.rows,
      documents: documents.rows,
      evidence: evidence.rows,
      signals: signals.rows,
      limitation: "La evidencia no localizada en las fuentes consultadas no equivale a incumplimiento.",
    },
  };
}
