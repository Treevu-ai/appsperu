import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { MINOR_CONTRACT_LIMIT_2026 } from "../minor-contracts/types.js";

export const observatoryRouter = Router();
const signalTypes = ["S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08", "S09", "S10", "S11", "S12", "S13"] as const;

const contractQuerySchema = z.object({
  year: z.coerce.number().int().min(2026).max(2100).optional(),
  municipalityId: z.string().min(1).optional(), supplierId: z.string().min(1).optional(),
  category: z.enum(["goods", "services"]).optional(), minAmount: z.coerce.number().min(0).optional(),
  maxAmount: z.coerce.number().min(0).max(MINOR_CONTRACT_LIMIT_2026).optional(),
  quotationCount: z.coerce.number().int().min(0).optional(),
  signalType: z.enum(signalTypes).optional(),
  q: z.string().min(2).max(200).optional(), limit: z.coerce.number().int().min(1).max(500).default(100),
});
const municipalityQuerySchema = z.object({ q: z.string().min(2).max(200).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) });
const signalsQuerySchema = z.object({
  signalType: z.enum(signalTypes).optional(),
  municipalityId: z.string().min(1).optional(), supplierId: z.string().min(1).optional(), contractingId: z.string().min(1).optional(),
  signalRunId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(500).default(100),
});
const territorialQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).default(2026),
  category: z.enum(["goods", "services"]).optional(),
  dateBasis: z.enum(["source_year", "publication_year"]).default("source_year"),
});
const semanticQueueQuerySchema = z.object({
  municipalityId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const asNumber = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);

function territorialAggregationQuery(level: "province" | "district", where: string) {
  const keys = level === "province" ? "province" : "province, district";
  const district = level === "province" ? "NULL::text AS district" : "t.district";
  const join = level === "province" ? "pc.province = t.province" : "pc.province = t.province AND pc.district = t.district";
  return `
    WITH filtered AS (
      SELECT COALESCE(m.province, 'NO PUBLICADA') AS province,
             COALESCE(m.district, 'NO PUBLICADO') AS district,
             c.winning_supplier_id, c.awarded_amount
      FROM minor_contracts c
      JOIN municipalities m ON m.municipality_id = c.municipality_id
      ${where}
    ), territories AS (
      SELECT ${keys}, COUNT(*)::integer AS contracts, COALESCE(SUM(awarded_amount), 0) AS total_amount,
             COALESCE(AVG(awarded_amount), 0) AS average_amount,
             COUNT(DISTINCT winning_supplier_id)::integer AS supplier_count
      FROM filtered GROUP BY ${keys}
    ), supplier_spend AS (
      SELECT ${keys}, winning_supplier_id, SUM(awarded_amount) AS supplier_amount
      FROM filtered WHERE winning_supplier_id IS NOT NULL GROUP BY ${keys}, winning_supplier_id
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY ${keys} ORDER BY supplier_amount DESC, winning_supplier_id) AS position
      FROM supplier_spend
    ), concentration AS (
      SELECT ${keys}, MAX(supplier_amount) FILTER (WHERE position = 1) AS cr1_amount,
             SUM(supplier_amount) FILTER (WHERE position <= 3) AS cr3_amount
      FROM ranked GROUP BY ${keys}
    )
    SELECT t.province, ${district}, t.contracts, t.total_amount, t.average_amount, t.supplier_count,
           COALESCE(pc.cr1_amount / NULLIF(t.total_amount, 0), 0) AS cr1,
           COALESCE(pc.cr3_amount / NULLIF(t.total_amount, 0), 0) AS cr3
    FROM territories t LEFT JOIN concentration pc ON ${join}
    ORDER BY t.total_amount DESC, t.province, ${level === "province" ? "t.province" : "t.district"}`;
}

observatoryRouter.get("/contracts", asyncHandler(async (req, res) => {
  const query = parseQuery(contractQuerySchema, req.query, res); if (!query) return;
  const conditions: string[] = []; const values: unknown[] = [];
  const add = (expression: string, value: unknown) => { values.push(value); conditions.push(`${expression} $${values.length}`); };
  if (query.year) add("c.year =", query.year); if (query.municipalityId) add("c.municipality_id =", query.municipalityId);
  if (query.supplierId) add("c.winning_supplier_id =", query.supplierId); if (query.category) add("c.category =", query.category);
  if (query.minAmount !== undefined) add("c.awarded_amount >=", query.minAmount); if (query.maxAmount !== undefined) add("c.awarded_amount <=", query.maxAmount);
  if (query.quotationCount !== undefined) add("c.quotation_count =", query.quotationCount);
  if (query.q) { values.push(`%${query.q}%`); conditions.push(`(c.object_original ILIKE $${values.length} OR m.official_name ILIKE $${values.length} OR s.legal_name ILIKE $${values.length} OR s.ruc ILIKE $${values.length} OR c.ocid ILIKE $${values.length})`); }
  if (query.signalType) { values.push(query.signalType); conditions.push(`EXISTS (SELECT 1 FROM contract_signals cs WHERE cs.contracting_id = c.contracting_id AND cs.signal_type = $${values.length})`); }
  values.push(query.limit); const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT c.contracting_id,c.ocid,c.award_id,c.year,c.object_original,c.object_normalized,c.category,c.estimated_amount,c.awarded_amount,c.publication_date,c.award_date,c.quotation_count,c.valid_quotation_count,c.source_url,c.source_timestamp,m.municipality_id,m.official_name AS municipality_name,m.province,m.district,s.supplier_id,s.legal_name AS supplier_name,s.ruc
     FROM minor_contracts c JOIN municipalities m ON m.municipality_id=c.municipality_id LEFT JOIN supplier_profiles s ON s.supplier_id=c.winning_supplier_id ${where}
     ORDER BY c.publication_date DESC NULLS LAST,c.contracting_id LIMIT $${values.length}`, values);
  res.json({ scope: { department: "LA LIBERTAD", maximumAmount: MINOR_CONTRACT_LIMIT_2026, statement: "Las contrataciones son una reconstrucción de evidencia pública; la ausencia de un dato no prueba incumplimiento." }, resultados: rows.map((row) => ({
    contractingId: row.contracting_id, ocid: row.ocid, awardId: row.award_id, year: Number(row.year), objectOriginal: row.object_original, objectNormalized: row.object_normalized, category: row.category,
    estimatedAmount: asNumber(row.estimated_amount), awardedAmount: asNumber(row.awarded_amount), publicationDate: row.publication_date, awardDate: row.award_date,
    quotationCount: Number(row.quotation_count), validQuotationCount: row.valid_quotation_count === null ? null : Number(row.valid_quotation_count),
    municipality: { id: row.municipality_id, name: row.municipality_name, province: row.province, district: row.district }, supplier: row.supplier_id ? { id: row.supplier_id, name: row.supplier_name, ruc: row.ruc } : null,
    source: { url: row.source_url, timestamp: row.source_timestamp },
  })) });
}));

observatoryRouter.get("/contracts/:id", asyncHandler(async (req, res) => {
  const contractResult = await pool.query(`SELECT c.*,m.official_name AS municipality_name,m.ruc AS municipality_ruc,m.province,m.district,s.legal_name AS supplier_name,s.ruc AS supplier_ruc FROM minor_contracts c JOIN municipalities m ON m.municipality_id=c.municipality_id LEFT JOIN supplier_profiles s ON s.supplier_id=c.winning_supplier_id WHERE c.contracting_id=$1`, [req.params.id]);
  if (contractResult.rows.length === 0) { res.status(404).json({ error: "Contratación menor no encontrada en el universo materializado." }); return; }
  const contract = contractResult.rows[0]; const id = req.params.id;
  const [quotations, events, documents, evidence, signals] = await Promise.all([
    pool.query(`SELECT q.*,s.legal_name AS supplier_name,s.ruc FROM contract_quotations q LEFT JOIN supplier_profiles s ON s.supplier_id=q.supplier_id WHERE q.contracting_id=$1 ORDER BY q.submission_date`, [id]),
    pool.query(`SELECT * FROM contract_events WHERE contracting_id=$1 ORDER BY event_timestamp NULLS LAST`, [id]), pool.query(`SELECT * FROM contract_documents WHERE contracting_id=$1 ORDER BY publication_date NULLS LAST`, [id]),
    pool.query(`SELECT * FROM contract_evidence WHERE contracting_id=$1 ORDER BY capture_timestamp DESC`, [id]),
    pool.query(`SELECT cs.*,sr.rule_version AS run_rule_version,sr.model_version AS run_model_version,sr.normative_version FROM contract_signals cs JOIN signal_runs sr ON sr.signal_run_id=cs.signal_run_id WHERE cs.contracting_id=$1 ORDER BY cs.detected_at DESC`, [id]),
  ]);
  res.json({ contracting: {
    contractingId: contract.contracting_id, sourceContractingId: contract.source_contracting_id, ocid: contract.ocid, awardId: contract.award_id, objectOriginal: contract.object_original, objectNormalized: contract.object_normalized, category: contract.category,
    estimatedAmount: asNumber(contract.estimated_amount), quotedAmount: asNumber(contract.quoted_amount), awardedAmount: asNumber(contract.awarded_amount), publicationDate: contract.publication_date, quotationStartDate: contract.quotation_start_date, quotationEndDate: contract.quotation_end_date, awardDate: contract.award_date,
    quotationCount: Number(contract.quotation_count), validQuotationCount: contract.valid_quotation_count === null ? null : Number(contract.valid_quotation_count),
    municipality: { id: contract.municipality_id, name: contract.municipality_name, ruc: contract.municipality_ruc, province: contract.province, district: contract.district }, supplier: contract.winning_supplier_id ? { id: contract.winning_supplier_id, name: contract.supplier_name, ruc: contract.supplier_ruc } : null,
    source: {
      url: contract.source_url,
      timestamp: contract.source_timestamp,
      ocdsBatchId: contract.source_batch_id,
      publicMinorContractBatchId: contract.minor_source_batch_id,
    }, versions: { data: contract.data_version, normalizer: contract.normalizer_version },
  }, quotations: quotations.rows, events: events.rows, documents: documents.rows, evidence: evidence.rows, signals: signals.rows, limitation: "La evidencia no localizada en las fuentes consultadas no equivale a incumplimiento." });
}));

observatoryRouter.get("/municipalities", asyncHandler(async (req, res) => {
  const query = parseQuery(municipalityQuerySchema, req.query, res); if (!query) return;
  const values: unknown[] = ["LA LIBERTAD"]; let search = "";
  if (query.q) { values.push(`%${query.q}%`); search = `AND (m.official_name ILIKE $2 OR m.ruc ILIKE $2 OR m.district ILIKE $2)`; }
  values.push(query.limit);
  const { rows } = await pool.query(`SELECT m.municipality_id,m.official_name,m.ruc,m.province,m.district,COUNT(c.contracting_id)::integer AS contracts,COALESCE(SUM(c.awarded_amount),0) AS total_amount,COUNT(DISTINCT c.winning_supplier_id)::integer AS suppliers FROM municipalities m LEFT JOIN minor_contracts c ON c.municipality_id=m.municipality_id WHERE m.department=$1 ${search} GROUP BY m.municipality_id,m.official_name,m.ruc,m.province,m.district ORDER BY total_amount DESC,m.official_name LIMIT $${values.length}`, values);
  res.json({ resultados: rows.map((row) => ({ municipalityId: row.municipality_id, officialName: row.official_name, ruc: row.ruc, province: row.province, district: row.district, contracts: Number(row.contracts), totalAmount: asNumber(row.total_amount), suppliers: Number(row.suppliers) })) });
}));

observatoryRouter.get("/municipalities/:id", asyncHandler(async (req, res) => {
  const municipality = await pool.query(`SELECT * FROM municipalities WHERE municipality_id=$1`, [req.params.id]); if (municipality.rows.length === 0) { res.status(404).json({ error: "Municipalidad no encontrada en el universo materializado." }); return; }
  const id = req.params.id; const [metrics, categories, suppliers, signals] = await Promise.all([
    pool.query(`SELECT COUNT(*)::integer AS contracts,COALESCE(SUM(awarded_amount),0) AS total_amount,COALESCE(AVG(awarded_amount),0) AS average_amount,COUNT(DISTINCT winning_supplier_id)::integer AS supplier_count,AVG(quotation_count) AS quotation_average FROM minor_contracts WHERE municipality_id=$1`, [id]),
    pool.query(`SELECT category,COUNT(*)::integer AS contracts,SUM(awarded_amount) AS total_amount FROM minor_contracts WHERE municipality_id=$1 GROUP BY category ORDER BY total_amount DESC`, [id]),
    pool.query(`SELECT s.supplier_id,s.legal_name,s.ruc,COUNT(*)::integer AS contracts,SUM(c.awarded_amount) AS total_amount FROM minor_contracts c JOIN supplier_profiles s ON s.supplier_id=c.winning_supplier_id WHERE c.municipality_id=$1 GROUP BY s.supplier_id,s.legal_name,s.ruc ORDER BY total_amount DESC LIMIT 20`, [id]),
    pool.query(`SELECT signal_type,COUNT(*)::integer AS total FROM contract_signals WHERE municipality_id=$1 GROUP BY signal_type ORDER BY signal_type`, [id]),
  ]);
  const source = municipality.rows[0];
  const profile = metrics.rows[0];
  res.json({
    municipality: {
      municipalityId: source.municipality_id,
      officialName: source.official_name,
      ruc: source.ruc,
      province: source.province,
      district: source.district,
      contracts: Number(profile.contracts),
      totalAmount: asNumber(profile.total_amount) ?? 0,
      suppliers: Number(profile.supplier_count),
    },
    profile,
    categories: categories.rows,
    suppliers: suppliers.rows,
    signals: signals.rows,
    limitation: "Las señales son patrones para revisión y no determinan irregularidad.",
  });
}));

observatoryRouter.get("/signals", asyncHandler(async (req, res) => {
  const query = parseQuery(signalsQuerySchema, req.query, res); if (!query) return;
  const values: unknown[] = []; const conditions: string[] = []; const add = (expression: string, value: unknown) => { values.push(value); conditions.push(`${expression} $${values.length}`); };
  if (query.signalRunId) add("cs.signal_run_id =", query.signalRunId); if (query.signalType) add("cs.signal_type =", query.signalType); if (query.municipalityId) add("cs.municipality_id =", query.municipalityId); if (query.supplierId) add("cs.supplier_id =", query.supplierId); if (query.contractingId) add("cs.contracting_id =", query.contractingId);
  if (!query.signalRunId) conditions.push("cs.signal_run_id = (SELECT signal_run_id FROM signal_runs ORDER BY executed_at DESC LIMIT 1)"); values.push(query.limit);
  const { rows } = await pool.query(`SELECT cs.*,m.official_name AS municipality_name,s.legal_name AS supplier_name,c.object_original,sr.executed_at,sr.rule_version AS run_rule_version,sr.model_version AS run_model_version,sr.normative_version FROM contract_signals cs JOIN municipalities m ON m.municipality_id=cs.municipality_id LEFT JOIN supplier_profiles s ON s.supplier_id=cs.supplier_id LEFT JOIN minor_contracts c ON c.contracting_id=cs.contracting_id JOIN signal_runs sr ON sr.signal_run_id=cs.signal_run_id WHERE ${conditions.join(" AND ")} ORDER BY cs.detected_at DESC,cs.signal_type LIMIT $${values.length}`, values);
  res.json({ resultados: rows, limitation: "Una señal identifica evidencia y patrones observables. No determina corrupción, favorecimiento, fraccionamiento ni incumplimiento." });
}));

/**
 * Bandeja de pares comparables. S13 se muestra antes que S12 porque añade el
 * mismo proveedor, pero ninguno equivale a una determinación de conducta.
 */
observatoryRouter.get("/semantic-review-queue", asyncHandler(async (req, res) => {
  const query = parseQuery(semanticQueueQuerySchema, req.query, res); if (!query) return;
  const values: unknown[] = [];
  const conditions = ["cs.signal_type IN ('S12','S13')", "cs.signal_run_id = (SELECT signal_run_id FROM signal_runs ORDER BY executed_at DESC LIMIT 1)"];
  if (query.municipalityId) { values.push(query.municipalityId); conditions.push(`cs.municipality_id = $${values.length}`); }
  values.push(query.limit);
  const { rows } = await pool.query(
    `WITH candidates AS (
       SELECT cs.*, cs.observed_value->>'comparedContractingId' AS compared_contracting_id,
              CASE cs.signal_type WHEN 'S13' THEN 1 ELSE 2 END AS priority
       FROM contract_signals cs WHERE ${conditions.join(" AND ")}
     ), deduplicated AS (
       SELECT DISTINCT ON (LEAST(contracting_id, compared_contracting_id), GREATEST(contracting_id, compared_contracting_id)) *
       FROM candidates WHERE compared_contracting_id IS NOT NULL
       ORDER BY LEAST(contracting_id, compared_contracting_id), GREATEST(contracting_id, compared_contracting_id), priority, confidence DESC
     )
     SELECT d.signal_id,d.signal_type,d.confidence,d.observed_value,d.reference_value,d.explanation,d.model_version,
            m.official_name AS municipality_name,
            c.contracting_id,c.object_original,c.awarded_amount,c.publication_date,
            related.contracting_id AS compared_contracting_id,related.object_original AS compared_object_original,
            related.awarded_amount AS compared_awarded_amount,related.publication_date AS compared_publication_date
     FROM deduplicated d
     JOIN municipalities m ON m.municipality_id=d.municipality_id
     JOIN minor_contracts c ON c.contracting_id=d.contracting_id
     JOIN minor_contracts related ON related.contracting_id=d.compared_contracting_id
     ORDER BY d.priority,d.confidence DESC,c.publication_date DESC NULLS LAST
     LIMIT $${values.length}`,
    values,
  );
  res.json({
    resultados: rows.map((row) => ({
      signalId: row.signal_id, signalType: row.signal_type, similarity: asNumber(row.confidence), observed: row.observed_value,
      reference: row.reference_value, explanation: row.explanation, modelVersion: row.model_version,
      municipality: row.municipality_name,
      contract: { contractingId: row.contracting_id, object: row.object_original, awardedAmount: asNumber(row.awarded_amount), publicationDate: row.publication_date },
      comparedContract: { contractingId: row.compared_contracting_id, object: row.compared_object_original, awardedAmount: asNumber(row.compared_awarded_amount), publicationDate: row.compared_publication_date },
    })),
    limitation: "La bandeja prioriza pares para solicitar y revisar evidencia primaria. Una similitud semántica no determina misma necesidad, favorecimiento, fraccionamiento ni direccionamiento.",
  });
}));

observatoryRouter.get("/signals/:id", asyncHandler(async (req, res) => {
  const signal = await pool.query(`SELECT cs.*,m.official_name AS municipality_name,s.legal_name AS supplier_name,c.object_original,sr.executed_at,sr.rule_version AS run_rule_version,sr.model_version AS run_model_version,sr.normative_version FROM contract_signals cs JOIN municipalities m ON m.municipality_id=cs.municipality_id LEFT JOIN supplier_profiles s ON s.supplier_id=cs.supplier_id LEFT JOIN minor_contracts c ON c.contracting_id=cs.contracting_id JOIN signal_runs sr ON sr.signal_run_id=cs.signal_run_id WHERE cs.signal_id=$1`, [req.params.id]);
  if (signal.rows.length === 0) { res.status(404).json({ error: "Señal no encontrada." }); return; }
  const evidence = await pool.query(`SELECT * FROM contract_evidence WHERE signal_id=$1 ORDER BY capture_timestamp DESC`, [req.params.id]);
  res.json({ signal: signal.rows[0], evidence: evidence.rows, limitation: "Esta señal identifica un patrón que merece revisión. No determina corrupción, favorecimiento, fraccionamiento ni incumplimiento." });
}));

observatoryRouter.get("/analytics/territorial", asyncHandler(async (req, res) => {
  const query = parseQuery(territorialQuerySchema, req.query, res); if (!query) return;
  const values: unknown[] = ["LA LIBERTAD"];
  const conditions = ["m.department = $1"];
  if (query.category) { values.push(query.category); conditions.push(`c.category = $${values.length}`); }
  values.push(query.year);
  conditions.push(query.dateBasis === "source_year"
    ? `c.year = $${values.length}`
    : `EXTRACT(YEAR FROM c.publication_date) = $${values.length}`);
  const where = `WHERE ${conditions.join(" AND ")}`;
  const totalQuery = `SELECT COUNT(*)::integer AS contracts, COALESCE(SUM(c.awarded_amount), 0) AS total_amount,
                             COALESCE(AVG(c.awarded_amount), 0) AS average_amount,
                             COUNT(DISTINCT c.winning_supplier_id)::integer AS supplier_count
                      FROM minor_contracts c JOIN municipalities m ON m.municipality_id = c.municipality_id ${where}`;
  const [total, provinces, districts] = await Promise.all([
    pool.query(totalQuery, values),
    pool.query(territorialAggregationQuery("province", where), values),
    pool.query(territorialAggregationQuery("district", where), values),
  ]);
  const mapTerritory = (row: Record<string, unknown>) => ({
    province: row.province, district: row.district, contracts: Number(row.contracts),
    totalAmount: asNumber(row.total_amount) ?? 0, averageAmount: asNumber(row.average_amount) ?? 0,
    suppliers: Number(row.supplier_count), cr1: asNumber(row.cr1) ?? 0, cr3: asNumber(row.cr3) ?? 0,
  });
  const totals = total.rows[0] ?? { contracts: 0, total_amount: 0, average_amount: 0, supplier_count: 0 };
  res.json({
    scope: {
      department: "LA LIBERTAD", year: query.year, category: query.category ?? "all",
      dateBasis: query.dateBasis,
      dateField: query.dateBasis === "source_year" ? "minor_contracts.year" : "minor_contracts.publication_date",
      maximumAmount: MINOR_CONTRACT_LIMIT_2026,
    },
    totals: {
      contracts: Number(totals.contracts), totalAmount: asNumber(totals.total_amount) ?? 0,
      averageAmount: asNumber(totals.average_amount) ?? 0, suppliers: Number(totals.supplier_count),
    },
    byProvince: provinces.rows.map(mapTerritory),
    byDistrict: districts.rows.map(mapTerritory),
    limitation: "Los agregados describen sólo el universo materializado. `source_year` y `publication_year` no son equivalentes; elija la base temporal según la pregunta analítica.",
  });
}));

observatoryRouter.get("/analytics/:kind(concentration|competition|near-threshold|recurrence|evidence)", asyncHandler(async (req, res) => {
  const queries: Record<string, string> = {
    concentration: `SELECT municipality_id,COUNT(DISTINCT winning_supplier_id)::integer AS supplier_count,SUM(awarded_amount) AS total_amount FROM minor_contracts GROUP BY municipality_id ORDER BY total_amount DESC`,
    competition: `SELECT municipality_id,AVG(quotation_count) AS quotation_average,COUNT(*) FILTER (WHERE valid_quotation_count=1)::integer AS one_valid_quotation FROM minor_contracts GROUP BY municipality_id ORDER BY municipality_id`,
    "near-threshold": `SELECT contracting_id,municipality_id,awarded_amount,awarded_amount / ${MINOR_CONTRACT_LIMIT_2026}::numeric AS ratio_to_limit FROM minor_contracts WHERE awarded_amount >= ${MINOR_CONTRACT_LIMIT_2026 * 0.9} ORDER BY awarded_amount DESC`,
    recurrence: `SELECT municipality_id,winning_supplier_id,COUNT(*)::integer AS contracts,SUM(awarded_amount) AS total_amount FROM minor_contracts WHERE winning_supplier_id IS NOT NULL GROUP BY municipality_id,winning_supplier_id HAVING COUNT(*) >= 2 ORDER BY contracts DESC,total_amount DESC`,
    evidence: `SELECT c.contracting_id,COUNT(e.evidence_id)::integer AS evidence_found,4 AS evidence_expected FROM minor_contracts c LEFT JOIN contract_evidence e ON e.contracting_id=c.contracting_id AND e.signal_id IS NULL GROUP BY c.contracting_id ORDER BY c.contracting_id`,
  };
  const kind = req.params.kind; res.json({ kind, resultados: (await pool.query(queries[kind])).rows, limitation: "Los indicadores son reproducibles y descriptivos; no constituyen una conclusión jurídica." });
}));
