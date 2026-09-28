import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { asNumber, MINOR_CONTRACT_LIMIT_2026, territorialAggregationQuery } from "./_helpers.js";

const SIGNAL_TYPES = ["S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08", "S09", "S10", "S11", "S12", "S13"] as const;

interface MunicipalityRow extends NeonRow {
  municipality_id: string;
  official_name: string;
  ruc: string | null;
  province: string | null;
  district: string | null;
  contracts: string | number;
  total_amount: string | number;
  suppliers: string | number;
}

interface MunicipalityMetricsRow extends NeonRow {
  contracts: string | number;
  total_amount: string | number;
  average_amount: string | number;
  supplier_count: string | number;
  quotation_average: string | number | null;
}

interface MunicipalityCategoryRow extends NeonRow {
  category: string;
  contracts: string | number;
  total_amount: string | number;
}

interface MunicipalitySupplierRow extends NeonRow {
  supplier_id: string;
  legal_name: string;
  ruc: string | null;
  contracts: string | number;
  total_amount: string | number;
}

interface MunicipalitySignalRow extends NeonRow {
  signal_type: string;
  total: string | number;
}

interface MunicipalitySourceRow extends NeonRow {
  municipality_id: string;
  official_name: string;
  ruc: string | null;
  province: string | null;
  district: string | null;
}

interface ContractRow extends NeonRow {
  contracting_id: string;
  ocid: string;
  object_original: string | null;
  awarded_amount: string | number | null;
  publication_date: string | null;
  source_url: string | null;
  source_contracting_id: string | null;
  compared_contracting_id: string | null;
  compared_object_original: string | null;
  compared_awarded_amount: string | number | null;
  compared_publication_date: string | null;
  compared_source_url: string | null;
}

interface SignalRow extends NeonRow {
  signal_id: string;
  signal_type: string;
  confidence: string | number | null;
  observed_value: Record<string, unknown> | null;
  reference_value: Record<string, unknown> | null;
  explanation: string | null;
  model_version: string | null;
  municipality_id: string | null;
  municipality_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  contracting_id: string | null;
  object_original: string | null;
  executed_at: string | null;
  run_rule_version: string | null;
  run_model_version: string | null;
  run_normative_version: string | null;
  detected_at: string | null;
}

interface SignalEvidenceRow extends NeonRow {
  evidence_id: string;
  evidence_type: string | null;
  url: string | null;
  caption: string | null;
  capture_timestamp: string | null;
}

interface SignalReviewRow extends NeonRow {
  review_event_id: string;
  decision: string | null;
  reviewer_role: string | null;
  note: string | null;
  evidence_urls: string[] | null;
  reviewed_at: string | null;
}

interface FreshnessRow extends NeonRow {
  source: string;
  fetched_at: string | null;
  records: string | number;
  latest_batch_id: string | number | null;
  rejected_in_latest_batch: string | number | null;
  coverage: string | null;
}

interface TotalRow extends NeonRow {
  contracts: string | number;
  total_amount: string | number;
  average_amount: string | number;
  supplier_count: string | number;
}

interface TerritoryRow extends NeonRow {
  province: string;
  district: string | null;
  contracts: string | number;
  total_amount: string | number;
  average_amount: string | number;
  supplier_count: string | number;
  cr1: string | number | null;
  cr3: string | number | null;
}

interface AnalyticsKindRow extends NeonRow {
  municipality_id: string | null;
  supplier_count: string | number | null;
  total_amount: string | number | null;
  quotation_average: string | number | null;
  one_valid_quotation: string | number | null;
  contracting_id: string | null;
  awarded_amount: string | number | null;
  ratio_to_limit: string | number | null;
  supplier_id: string | null;
  contracts: string | number | null;
  evidence_found: string | number;
  evidence_expected: string | number;
}

export async function municipalities(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const q = args.q as string | undefined;
  const limit = (args.limit as number | undefined) ?? 100;

  const values: unknown[] = ["LA LIBERTAD"];
  let search = "";
  if (q) {
    values.push(`%${q}%`);
    search = `AND (m.official_name ILIKE $2 OR m.ruc ILIKE $2 OR m.district ILIKE $2)`;
  }
  values.push(limit);

  const { rows } = await db.query<MunicipalityRow>(
    `SELECT m.municipality_id,m.official_name,m.ruc,m.province,m.district,COUNT(c.contracting_id)::integer AS contracts,COALESCE(SUM(c.awarded_amount),0) AS total_amount,COUNT(DISTINCT c.winning_supplier_id)::integer AS suppliers FROM municipalities m LEFT JOIN minor_contracts c ON c.municipality_id=m.municipality_id WHERE m.department=$1 ${search} GROUP BY m.municipality_id,m.official_name,m.ruc,m.province,m.district ORDER BY total_amount DESC,m.official_name LIMIT $${values.length}`,
    values
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((row) => ({
        municipalityId: row.municipality_id,
        officialName: row.official_name,
        ruc: row.ruc,
        province: row.province,
        district: row.district,
        contracts: Number(row.contracts),
        totalAmount: asNumber(row.total_amount),
        suppliers: Number(row.suppliers),
      })),
    },
  };
}

export async function municipalityById(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const id = args.id as string;

  const municipalityResult = await db.query<MunicipalitySourceRow>(
    `SELECT * FROM municipalities WHERE municipality_id=$1`,
    [id]
  );

  if (municipalityResult.rows.length === 0) {
    return { status: 404, body: { error: "Municipalidad no encontrada en el universo materializado." } };
  }

  const [metrics, categories, suppliers, signals] = await Promise.all([
    db.query<MunicipalityMetricsRow>(
      `SELECT COUNT(*)::integer AS contracts,COALESCE(SUM(awarded_amount),0) AS total_amount,COALESCE(AVG(awarded_amount),0) AS average_amount,COUNT(DISTINCT winning_supplier_id)::integer AS supplier_count,AVG(quotation_count) AS quotation_average FROM minor_contracts WHERE municipality_id=$1`,
      [id]
    ),
    db.query<MunicipalityCategoryRow>(
      `SELECT category,COUNT(*)::integer AS contracts,SUM(awarded_amount) AS total_amount FROM minor_contracts WHERE municipality_id=$1 GROUP BY category ORDER BY total_amount DESC`,
      [id]
    ),
    db.query<MunicipalitySupplierRow>(
      `SELECT s.supplier_id,s.legal_name,s.ruc,COUNT(*)::integer AS contracts,SUM(c.awarded_amount) AS total_amount FROM minor_contracts c JOIN supplier_profiles s ON s.supplier_id=c.winning_supplier_id WHERE c.municipality_id=$1 GROUP BY s.supplier_id,s.legal_name,s.ruc ORDER BY total_amount DESC LIMIT 20`,
      [id]
    ),
    db.query<MunicipalitySignalRow>(
      `SELECT signal_type,COUNT(*)::integer AS total FROM contract_signals WHERE municipality_id=$1 GROUP BY signal_type ORDER BY signal_type`,
      [id]
    ),
  ]);

  const source = municipalityResult.rows[0];
  const profile = metrics.rows[0];

  return {
    status: 200,
    body: {
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
    },
  };
}

export async function signals(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const signalType = args.signalType as (typeof SIGNAL_TYPES)[number] | undefined;
  const municipalityId = args.municipalityId as string | undefined;
  const supplierId = args.supplierId as string | undefined;
  const contractingId = args.contractingId as string | undefined;
  const signalRunId = args.signalRunId as string | undefined;
  const limit = (args.limit as number | undefined) ?? 100;

  const values: unknown[] = [];
  const conditions: string[] = [];
  const add = (expression: string, value: unknown) => {
    values.push(value);
    conditions.push(`${expression} $${values.length}`);
  };

  if (signalRunId) add("cs.signal_run_id =", signalRunId);
  if (signalType) add("cs.signal_type =", signalType);
  if (municipalityId) add("cs.municipality_id =", municipalityId);
  if (supplierId) add("cs.supplier_id =", supplierId);
  if (contractingId) add("cs.contracting_id =", contractingId);

  if (!signalRunId) {
    conditions.push("cs.signal_run_id = (SELECT signal_run_id FROM signal_runs ORDER BY executed_at DESC LIMIT 1)");
  }

  values.push(limit);

  const { rows } = await db.query<SignalRow>(
    `SELECT cs.*,m.official_name AS municipality_name,s.legal_name AS supplier_name,c.object_original,sr.executed_at,sr.rule_version AS run_rule_version,sr.model_version AS run_model_version,sr.normative_version FROM contract_signals cs JOIN municipalities m ON m.municipality_id=cs.municipality_id LEFT JOIN supplier_profiles s ON s.supplier_id=cs.supplier_id LEFT JOIN minor_contracts c ON c.contracting_id=cs.contracting_id JOIN signal_runs sr ON sr.signal_run_id=cs.signal_run_id WHERE ${conditions.join(" AND ")} ORDER BY cs.detected_at DESC,cs.signal_type LIMIT $${values.length}`,
    values
  );

  return {
    status: 200,
    body: {
      resultados: rows,
      limitation: "Una señal identifica evidencia y patrones observables. No determina corrupción, favorecimiento, fraccionamiento ni incumplimiento.",
    },
  };
}

export async function signalById(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const id = args.id as string;

  const signalResult = await db.query<SignalRow>(
    `SELECT cs.*,m.official_name AS municipality_name,s.legal_name AS supplier_name,c.object_original,sr.executed_at,sr.rule_version AS run_rule_version,sr.model_version AS run_model_version,sr.normative_version FROM contract_signals cs JOIN municipalities m ON m.municipality_id=cs.municipality_id LEFT JOIN supplier_profiles s ON s.supplier_id=cs.supplier_id LEFT JOIN minor_contracts c ON c.contracting_id=cs.contracting_id JOIN signal_runs sr ON sr.signal_run_id=cs.signal_run_id WHERE cs.signal_id=$1`,
    [id]
  );

  if (signalResult.rows.length === 0) {
    return { status: 404, body: { error: "Señal no encontrada." } };
  }

  const [evidence, reviews] = await Promise.all([
    db.query<SignalEvidenceRow>(
      `SELECT * FROM contract_evidence WHERE signal_id=$1 ORDER BY capture_timestamp DESC`,
      [id]
    ),
    db.query<SignalReviewRow>(
      `SELECT review_event_id,decision,reviewer_role,note,evidence_urls,reviewed_at FROM signal_review_events WHERE signal_id=$1 ORDER BY reviewed_at DESC,review_event_id DESC`,
      [id]
    ),
  ]);

  return {
    status: 200,
    body: {
      signal: signalResult.rows[0],
      evidence: evidence.rows,
      reviews: reviews.rows,
      limitation: "Esta señal identifica un patrón que merece revisión. No determina corrupción, favorecimiento, fraccionamiento ni incumplimiento.",
    },
  };
}

export async function semanticReviewQueue(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const municipalityId = args.municipalityId as string | undefined;
  const limit = (args.limit as number | undefined) ?? 50;

  const values: unknown[] = [];
  const conditions = ["cs.signal_type IN ('S12','S13')", "cs.signal_run_id = (SELECT signal_run_id FROM signal_runs ORDER BY executed_at DESC LIMIT 1)"];

  if (municipalityId) {
    values.push(municipalityId);
    conditions.push(`cs.municipality_id = $${values.length}`);
  }

  values.push(limit);

  const { rows } = await db.query<ContractRow & {
    signal_id: string;
    signal_type: string;
    confidence: string | number | null;
    observed_value: Record<string, unknown> | null;
    reference_value: Record<string, unknown> | null;
    explanation: string | null;
    model_version: string | null;
    municipality_name: string | null;
    priority: string | number;
  }>(
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
    values
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((row) => ({
        signalId: row.signal_id,
        signalType: row.signal_type,
        similarity: asNumber(row.confidence),
        observed: row.observed_value,
        reference: row.reference_value,
        explanation: row.explanation,
        modelVersion: row.model_version,
        municipality: row.municipality_name ?? "",
        contract: {
          contractingId: row.contracting_id,
          object: row.object_original,
          awardedAmount: asNumber(row.awarded_amount),
          publicationDate: row.publication_date,
        },
        comparedContract: {
          contractingId: row.compared_contracting_id ?? "",
          object: row.compared_object_original,
          awardedAmount: asNumber(row.compared_awarded_amount),
          publicationDate: row.compared_publication_date,
        },
      })),
      limitation: "La bandeja prioriza pares para solicitar y revisar evidencia primaria. Una similitud semántica no determina misma necesidad, favorecimiento, fraccionamiento ni direccionamiento.",
    },
  };
}

export async function semanticReviewClusters(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const limit = (args.limit as number | undefined) ?? 50;

  const { rows } = await db.query<ContractRow & {
    signal_id: string;
    signal_type: string;
    confidence: string | number | null;
    human_review_status: string | null;
    model_version: string | null;
    observed_value: Record<string, unknown> | null;
    municipality_name: string | null;
    source_url: string | null;
    source_contracting_id: string | null;
  }>(
    `SELECT cs.signal_id,cs.signal_type,cs.confidence,cs.human_review_status,cs.model_version,cs.observed_value,
            m.official_name AS municipality_name,
            c.contracting_id,c.source_contracting_id,c.object_original,c.awarded_amount,c.publication_date,c.source_url,
            related.contracting_id AS compared_contracting_id,related.source_contracting_id AS compared_source_contracting_id,
            related.object_original AS compared_object_original,related.awarded_amount AS compared_awarded_amount,
            related.publication_date AS compared_publication_date,related.source_url AS compared_source_url
     FROM contract_signals cs
     JOIN municipalities m ON m.municipality_id=cs.municipality_id
     JOIN minor_contracts c ON c.contracting_id=cs.contracting_id
     JOIN minor_contracts related ON related.contracting_id=cs.observed_value->>'comparedContractingId'
     WHERE cs.signal_run_id=(SELECT signal_run_id FROM signal_runs ORDER BY executed_at DESC LIMIT 1)
       AND cs.signal_type IN ('S12','S13')
       AND c.source_contracting_id <> related.source_contracting_id
     ORDER BY cs.confidence DESC`,
    []
  );

  const parent = new Map<string, string>();
  const find = (value: string): string => {
    const root = parent.get(value) ?? value;
    if (root === value) return root;
    const resolved = find(root);
    parent.set(value, resolved);
    return resolved;
  };
  const doUnion = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  for (const row of rows) {
    const comparedId = row.compared_contracting_id ?? row.contracting_id;
    parent.set(row.contracting_id, parent.get(row.contracting_id) ?? row.contracting_id);
    parent.set(comparedId, parent.get(comparedId) ?? comparedId);
    doUnion(row.contracting_id, comparedId);
  }

  type ClusterContract = {
    contractingId: string;
    object: string | null;
    awardedAmount: number | null;
    publicationDate: string | null;
    sourceUrl: string;
  };
  type Cluster = {
    municipality: string;
    contracts: Map<string, ClusterContract>;
    signals: Set<string>;
    models: Set<string>;
    confidences: number[];
    statuses: Set<string>;
  };

  const clusters = new Map<string, Cluster>();
  const addContract = (cluster: Cluster, id: string, object: unknown, amount: unknown, publicationDate: unknown, sourceUrl: unknown) =>
    cluster.contracts.set(id, {
      contractingId: id,
      object: typeof object === "string" ? object : null,
      awardedAmount: asNumber(amount),
      publicationDate: typeof publicationDate === "string" ? publicationDate : null,
      sourceUrl: typeof sourceUrl === "string" ? sourceUrl : "",
    });

  for (const row of rows) {
    const clusterId = find(row.contracting_id);
    const cluster: Cluster = clusters.get(clusterId) ?? {
      municipality: row.municipality_name ?? "",
      contracts: new Map<string, ClusterContract>(),
      signals: new Set<string>(),
      models: new Set<string>(),
      confidences: [],
      statuses: new Set<string>(),
    };
    addContract(cluster, row.contracting_id, row.object_original, row.awarded_amount, row.publication_date, row.source_url);
    addContract(cluster, row.compared_contracting_id ?? "", row.compared_object_original, row.compared_awarded_amount, row.compared_publication_date, row.compared_source_url);
    cluster.signals.add(row.signal_type);
    if (row.model_version) cluster.models.add(row.model_version);
    cluster.confidences.push(Number(row.confidence));
    cluster.statuses.add(row.human_review_status ?? "PENDING");
    clusters.set(clusterId, cluster);
  }

  const resultados = [...clusters.values()]
    .map((cluster) => {
      const contracts = [...cluster.contracts.values()].sort((left, right) =>
        String(left.publicationDate ?? "").localeCompare(String(right.publicationDate ?? ""))
      );
      const reviewStatus = cluster.statuses.has("PENDING")
        ? "PENDING"
        : cluster.statuses.has("REVIEWED")
        ? "REVIEWED"
        : "DISMISSED";
      return {
        clusterId: contracts.map((contract) => contract.contractingId).join("::"),
        municipality: cluster.municipality,
        contracts,
        contractCount: contracts.length,
        totalAmount: contracts.reduce((sum, contract) => sum + (Number(contract.awardedAmount) || 0), 0),
        signalTypes: [...cluster.signals].sort(),
        modelVersions: [...cluster.models].sort(),
        similarity: Math.max(...cluster.confidences),
        reviewStatus,
      };
    })
    .sort((left, right) => right.totalAmount - left.totalAmount || right.similarity - left.similarity)
    .slice(0, limit);

  return {
    status: 200,
    body: {
      resultados,
      limitation: "Un cluster resume objetos comparables para organizar revisión documental. La suma y similitud son descriptivas; no determinan una misma necesidad, fraccionamiento, favorecimiento ni direccionamiento.",
    },
  };
}

export async function freshness(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const { rows } = await db.query<FreshnessRow>(
    `WITH latest_oece AS (
       SELECT id, fetched_at FROM raw_ocds_batches ORDER BY fetched_at DESC LIMIT 1
     ), latest_seace AS (
       SELECT id, fetched_at FROM raw_minor_contract_batches ORDER BY fetched_at DESC LIMIT 1
     )
     SELECT 'oece_ocds' AS source,
            (SELECT fetched_at FROM latest_oece) AS fetched_at,
            COALESCE((SELECT SUM(record_count) FROM raw_ocds_batches),0)::integer AS records,
            (SELECT id FROM latest_oece) AS latest_batch_id,
            (SELECT COUNT(*)::int FROM awards_rejected ar WHERE ar.source_batch_id = (SELECT id FROM latest_oece)) AS rejected_in_latest_batch,
            'Páginas recientes; cobertura parcial según la corrida.' AS coverage
     UNION ALL
     SELECT 'seace_contratos_menores' AS source,
            (SELECT fetched_at FROM latest_seace) AS fetched_at,
            COALESCE((SELECT SUM(record_count) FROM raw_minor_contract_batches),0)::integer AS records,
            (SELECT id FROM latest_seace) AS latest_batch_id,
            NULL AS rejected_in_latest_batch,
            'Buscador público observado; contratos menores materializados para el alcance seleccionado.' AS coverage
     ORDER BY source`
  );

  return {
    status: 200,
    body: {
      sources: rows.map((row) => ({
        source: row.source,
        fetchedAt: row.fetched_at,
        records: Number(row.records),
        latestBatchId: row.latest_batch_id === null ? null : Number(row.latest_batch_id),
        rejectedInLatestBatch: row.rejected_in_latest_batch === null ? null : Number(row.rejected_in_latest_batch),
        coverage: row.coverage,
      })),
      limitation: "La fecha de extracción, el periodo de los datos y la cobertura no son equivalentes. Revise el contrato de datos antes de comparar fuentes. `rejectedInLatestBatch: null` significa que esa fuente no trackea rechazos por lote persistido, no que no haya rechazos.",
    },
  };
}

export async function analyticsTerritorial(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const year = (args.year as number | undefined) ?? 2026;
  const category = args.category as "goods" | "services" | undefined;
  const dateBasis = (args.dateBasis as "source_year" | "publication_year" | undefined) ?? "source_year";

  const values: unknown[] = ["LA LIBERTAD"];
  const conditions = ["m.department = $1", "c.execution_department = $1"];

  if (category) {
    values.push(category);
    conditions.push(`c.category = $${values.length}`);
  }

  values.push(year);
  conditions.push(
    dateBasis === "source_year"
      ? `c.year = $${values.length}`
      : `EXTRACT(YEAR FROM c.publication_date) = $${values.length}`
  );

  const where = `WHERE ${conditions.join(" AND ")}`;

  const totalQuery = `SELECT COUNT(*)::integer AS contracts, COALESCE(SUM(c.awarded_amount), 0) AS total_amount,
                             COALESCE(AVG(c.awarded_amount), 0) AS average_amount,
                             COUNT(DISTINCT c.winning_supplier_id)::integer AS supplier_count
                      FROM minor_contracts c JOIN municipalities m ON m.municipality_id = c.municipality_id ${where}`;

  const [total, provinces, districts] = await Promise.all([
    db.query<TotalRow>(totalQuery, values),
    db.query<TerritoryRow>(territorialAggregationQuery("province", where), values),
    db.query<TerritoryRow>(territorialAggregationQuery("district", where), values),
  ]);

  const mapTerritory = (row: TerritoryRow) => ({
    province: row.province,
    district: row.district,
    contracts: Number(row.contracts),
    totalAmount: asNumber(row.total_amount) ?? 0,
    averageAmount: asNumber(row.average_amount) ?? 0,
    suppliers: Number(row.supplier_count),
    cr1: asNumber(row.cr1) ?? 0,
    cr3: asNumber(row.cr3) ?? 0,
  });

  const totals = total.rows[0] ?? { contracts: 0, total_amount: 0, average_amount: 0, supplier_count: 0 };

  return {
    status: 200,
    body: {
      scope: {
        department: "LA LIBERTAD",
        year,
        category: category ?? "all",
        dateBasis,
        dateField: dateBasis === "source_year" ? "minor_contracts.year" : "minor_contracts.publication_date",
        maximumAmount: MINOR_CONTRACT_LIMIT_2026,
      },
      totals: {
        contracts: Number(totals.contracts),
        totalAmount: asNumber(totals.total_amount) ?? 0,
        averageAmount: asNumber(totals.average_amount) ?? 0,
        suppliers: Number(totals.supplier_count),
      },
      byProvince: provinces.rows.map(mapTerritory),
      byDistrict: districts.rows.map(mapTerritory),
      limitation: "Los agregados describen sólo el universo materializado. `source_year` y `publication_year` no son equivalentes; elija la base temporal según la pregunta analítica.",
    },
  };
}

export async function analyticsKind(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const kind = args.kind as string;

  const queries: Record<string, string> = {
    concentration: `SELECT municipality_id,COUNT(DISTINCT winning_supplier_id)::integer AS supplier_count,SUM(awarded_amount) AS total_amount FROM minor_contracts GROUP BY municipality_id ORDER BY total_amount DESC`,
    competition: `SELECT municipality_id,AVG(quotation_count) AS quotation_average,COUNT(*) FILTER (WHERE valid_quotation_count=1)::integer AS one_valid_quotation FROM minor_contracts GROUP BY municipality_id ORDER BY municipality_id`,
    "near-threshold": `SELECT contracting_id,municipality_id,awarded_amount,awarded_amount / ${MINOR_CONTRACT_LIMIT_2026}::numeric AS ratio_to_limit FROM minor_contracts WHERE awarded_amount >= ${MINOR_CONTRACT_LIMIT_2026 * 0.9} ORDER BY awarded_amount DESC`,
    recurrence: `SELECT municipality_id,winning_supplier_id,COUNT(*)::integer AS contracts,SUM(awarded_amount) AS total_amount FROM minor_contracts WHERE winning_supplier_id IS NOT NULL GROUP BY municipality_id,winning_supplier_id HAVING COUNT(*) >= 2 ORDER BY contracts DESC,total_amount DESC`,
    evidence: `SELECT c.contracting_id,COUNT(e.evidence_id)::integer AS evidence_found,4 AS evidence_expected FROM minor_contracts c LEFT JOIN contract_evidence e ON e.contracting_id=c.contracting_id AND e.signal_id IS NULL GROUP BY c.contracting_id ORDER BY c.contracting_id`,
  };

  if (!(kind in queries)) {
    return {
      status: 400,
      body: {
        error: `kind inválido. Valores aceptados: ${Object.keys(queries).join(", ")}.`,
      },
    };
  }

  const { rows } = await db.query<AnalyticsKindRow>(queries[kind]);

  return {
    status: 200,
    body: {
      kind,
      resultados: rows,
      limitation: "Los indicadores son reproducibles y descriptivos; no constituyen una conclusión jurídica.",
    },
  };
}
