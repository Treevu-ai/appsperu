const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

export interface FuenteTrazable {
  dataset: string;
  extraidoEl?: string;
}

export interface ProcurementProcess {
  ocid: string;
  tenderId: string | null;
  sourceId: string | null;
  buyerId: string;
  buyerName: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  categoria: string | null;
  titulo: string | null;
  valorMonto: number | null;
  valorMoneda: string | null;
  fechaPublicacion: string | null;
  tenderInicio: string | null;
  tenderFin: string | null;
  tags: string[];
  fuente: FuenteTrazable;
}

export interface ProcurementListResponse {
  resultados: ProcurementProcess[];
}

export interface ProcurementFilters {
  departamento?: string;
  categoria?: string;
  buyerId?: string;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`La API respondió ${res.status} para ${path}`);
  }
  return (await res.json()) as T;
}

// Las rutas dinámicas de Next.js pueden entregar un identificador ya escapado
// (por ejemplo, `seace%3Aentity%3A1215`). Esto evita volver a escapar `%`.
function encodePathSegment(value: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

export function getProcurementList(filters: ProcurementFilters = {}): Promise<ProcurementListResponse> {
  const params = new URLSearchParams();
  if (filters.departamento) params.set("departamento", filters.departamento);
  if (filters.categoria) params.set("categoria", filters.categoria);
  if (filters.buyerId) params.set("buyerId", filters.buyerId);
  const qs = params.toString();
  return getJson(`/api/procurement${qs ? `?${qs}` : ""}`);
}

export function getProcurementProcess(ocid: string): Promise<ProcurementProcess> {
  return getJson(`/api/procurement/${encodePathSegment(ocid)}`);
}

export type Confidence = "confirmada" | "candidata";

export interface CrossrefEntry {
  mefEntityCode: string;
  mefNombre: string;
  oeceBuyerId: string;
  oeceBuyerName: string;
  confidence: Confidence;
  score: number;
  devengado: number;
  comprasProcesos: number;
  comprasValorTotal: number;
  computedAt: string;
}

export interface CrossrefListResponse {
  resultados: CrossrefEntry[];
}

export function getCrossref(confidence?: Confidence): Promise<CrossrefListResponse> {
  const qs = confidence ? `?confidence=${confidence}` : "";
  return getJson(`/api/crossref${qs}`);
}

export interface SupplierSummary {
  supplierId: string;
  supplierName: string;
  adjudicaciones: number;
  entidadesDistintas: number;
  valorTotal: number;
}

export interface ConcentrationSummary {
  cr3: number;
  cr5: number;
  hhi: number;
  proveedoresConsiderados: number;
}

export interface SupplierListResponse {
  resultados: SupplierSummary[];
  concentracion: ConcentrationSummary;
}

export function getSuppliers(departamento?: string): Promise<SupplierListResponse> {
  const qs = departamento ? `?departamento=${encodeURIComponent(departamento)}` : "";
  return getJson(`/api/suppliers${qs}`);
}

export interface Adjudicacion {
  ocid: string;
  awardId: string;
  buyerId: string | null;
  buyerName: string | null;
  departamento: string | null;
  valorMonto: number | null;
  valorMoneda: string | null;
  fecha: string | null;
  fuente: FuenteTrazable;
}

export interface SupplierDetail {
  supplierId: string;
  supplierName: string;
  adjudicaciones: Adjudicacion[];
}

export function getSupplierDetail(supplierId: string): Promise<SupplierDetail> {
  return getJson(`/api/suppliers/${encodePathSegment(supplierId)}`);
}

export interface MinorContractSummary {
  contractingId: string;
  ocid: string;
  awardId: string;
  year: number;
  objectOriginal: string | null;
  objectNormalized: string | null;
  category: string | null;
  estimatedAmount: number | null;
  awardedAmount: number;
  publicationDate: string | null;
  awardDate: string | null;
  quotationCount: number;
  validQuotationCount: number | null;
  municipality: { id: string; name: string; province: string | null; district: string | null };
  supplier: { id: string; name: string; ruc: string | null } | null;
  source: { url: string; timestamp: string | null };
}

export interface MinorContractsResponse {
  scope: { department: string; maximumAmount: number; statement: string };
  resultados: MinorContractSummary[];
}

export interface MinorContractFilters {
  year?: string;
  category?: string;
  q?: string;
  municipalityId?: string;
  supplierId?: string;
}

export function getMinorContracts(filters: MinorContractFilters = {}): Promise<MinorContractsResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const qs = params.toString();
  return getJson(`/api/contracts${qs ? `?${qs}` : ""}`);
}

export interface MunicipalitySummary {
  municipalityId: string;
  officialName: string;
  ruc: string | null;
  province: string | null;
  district: string | null;
  contracts: number;
  totalAmount: number;
  suppliers: number;
}

export function getMunicipalities(q?: string): Promise<{ resultados: MunicipalitySummary[] }> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return getJson(`/api/municipalities${qs}`);
}

export type TerritorialDateBasis = "source_year" | "publication_year";
export interface TerritorialMetrics {
  province: string;
  district: string | null;
  contracts: number;
  totalAmount: number;
  averageAmount: number;
  suppliers: number;
  cr1: number;
  cr3: number;
}
export interface TerritorialAnalyticsResponse {
  scope: { department: string; year: number; category: "goods" | "services" | "all"; dateBasis: TerritorialDateBasis; dateField: string; maximumAmount: number };
  totals: { contracts: number; totalAmount: number; averageAmount: number; suppliers: number };
  byProvince: TerritorialMetrics[];
  byDistrict: TerritorialMetrics[];
  limitation: string;
}
export function getTerritorialAnalytics(filters: { year?: number; category?: "goods" | "services"; dateBasis?: TerritorialDateBasis } = {}): Promise<TerritorialAnalyticsResponse> {
  const params = new URLSearchParams();
  if (filters.year) params.set("year", String(filters.year));
  if (filters.category) params.set("category", filters.category);
  if (filters.dateBasis) params.set("dateBasis", filters.dateBasis);
  const qs = params.toString();
  return getJson(`/api/analytics/territorial${qs ? `?${qs}` : ""}`);
}

export interface ObservatorySignal {
  signal_id: string;
  signal_type: string;
  contracting_id: string;
  municipality_name: string;
  supplier_name: string | null;
  object_original: string | null;
  observed_value: Record<string, unknown>;
  explanation: string;
  confidence: string | number;
  severity: "INFO" | "REVISAR" | "PRIORIZAR";
}

export function getObservatorySignals(signalType?: string): Promise<{ resultados: ObservatorySignal[]; limitation: string }> {
  const qs = signalType ? `?signalType=${encodeURIComponent(signalType)}` : "";
  return getJson(`/api/signals${qs}`);
}

export interface MinorContractDetail {
  contracting: MinorContractSummary & {
    sourceContractingId: string;
    quotedAmount: number | null;
    quotationStartDate: string | null;
    quotationEndDate: string | null;
    versions: { data: string; normalizer: string };
  };
  quotations: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  signals: ObservatorySignal[];
  limitation: string;
}

export function getMinorContract(id: string): Promise<MinorContractDetail> {
  return getJson(`/api/contracts/${encodePathSegment(id)}`);
}

export interface MunicipalityDetail {
  municipality: MunicipalitySummary;
  profile: { contracts: number; total_amount: string | number; average_amount: string | number; supplier_count: number; quotation_average: string | number | null };
  categories: Array<{ category: string | null; contracts: number; total_amount: string | number }>;
  suppliers: Array<{ supplier_id: string; legal_name: string; ruc: string | null; contracts: number; total_amount: string | number }>;
  signals: Array<{ signal_type: string; total: number }>;
  limitation: string;
}

export function getMunicipality(id: string): Promise<MunicipalityDetail> {
  return getJson(`/api/municipalities/${encodePathSegment(id)}`);
}

export interface ObservatorySignalDetail { signal: ObservatorySignal; evidence: Array<Record<string, unknown>>; limitation: string }
export function getObservatorySignal(id: string): Promise<ObservatorySignalDetail> { return getJson(`/api/signals/${encodePathSegment(id)}`); }

export interface SemanticReviewCandidate {
  signalId: string;
  signalType: "S12" | "S13";
  similarity: number;
  observed: Record<string, unknown>;
  reference: Record<string, unknown> | null;
  explanation: string;
  modelVersion: string;
  municipality: string;
  contract: { contractingId: string; object: string | null; awardedAmount: number | null; publicationDate: string | null };
  comparedContract: { contractingId: string; object: string | null; awardedAmount: number | null; publicationDate: string | null };
}
export function getSemanticReviewQueue(): Promise<{ resultados: SemanticReviewCandidate[]; limitation: string }> {
  return getJson("/api/semantic-review-queue");
}
