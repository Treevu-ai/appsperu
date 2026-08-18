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

export function getProcurementList(filters: ProcurementFilters = {}): Promise<ProcurementListResponse> {
  const params = new URLSearchParams();
  if (filters.departamento) params.set("departamento", filters.departamento);
  if (filters.categoria) params.set("categoria", filters.categoria);
  if (filters.buyerId) params.set("buyerId", filters.buyerId);
  const qs = params.toString();
  return getJson(`/api/procurement${qs ? `?${qs}` : ""}`);
}

export function getProcurementProcess(ocid: string): Promise<ProcurementProcess> {
  return getJson(`/api/procurement/${encodeURIComponent(ocid)}`);
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
  return getJson(`/api/suppliers/${encodeURIComponent(supplierId)}`);
}
