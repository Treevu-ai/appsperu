const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4003";

export interface FuenteTrazable {
  dataset: string;
  extraidoEl?: string;
}

export interface PublicWork {
  codigoInfobras: string;
  codigoEntidad: string;
  entidadNombre: string;
  nombreObra: string;
  modalidadEjecucion: string | null;
  naturalezaObra: string | null;
  estadoEjecucion: string | null;
  nivelGobierno: string | null;
  sectorEntidad: string | null;
  cui: string | null;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
  montoViable: number | null;
  costoActualizado: number | null;
  avanceFisicoProgPct: number | null;
  avanceFisicoRealPct: number | null;
  ejecucionFinancieraPct: number | null;
  existeParalizacion: boolean;
  causalParalizacion: string | null;
  fechaParalizacion: string | null;
  diasParalizado: number | null;
  costDriftPct: number | null;
  gapFisicoFinanciero: number | null;
  fuente: FuenteTrazable;
}

export interface PublicWorkListResponse {
  resultados: PublicWork[];
}

export interface PublicWorksFilters {
  departamento?: string;
  estado?: string;
  conParalizacion?: boolean;
}

export interface PublicWorksResumen {
  totalObras: number;
  conParalizacionPct: number;
  conAvanceReportadoPct: number;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`La API respondió ${res.status} para ${path}`);
  }
  return (await res.json()) as T;
}

export function getPublicWorks(filters: PublicWorksFilters = {}): Promise<PublicWorkListResponse> {
  const params = new URLSearchParams();
  if (filters.departamento) params.set("departamento", filters.departamento);
  if (filters.estado) params.set("estado", filters.estado);
  if (filters.conParalizacion) params.set("conParalizacion", "true");
  const qs = params.toString();
  return getJson(`/api/public-works${qs ? `?${qs}` : ""}`);
}

export function getPublicWork(codigoInfobras: string): Promise<PublicWork> {
  return getJson(`/api/public-works/${encodeURIComponent(codigoInfobras)}`);
}

export function getPublicWorksResumen(departamento?: string): Promise<PublicWorksResumen> {
  const qs = departamento ? `?departamento=${encodeURIComponent(departamento)}` : "";
  return getJson(`/api/public-works/resumen${qs}`);
}

export interface CrossrefEntry {
  cui: string;
  obras: number;
  obrasParalizadas: number;
  avanceFisicoRealPromedio: number | null;
  enInversiones: boolean;
  nombreInversion: string | null;
  estadoInversion: string | null;
  montoViableInversion: number | null;
  costoActualizadoInversion: number | null;
}

export interface CrossrefListResponse {
  resultados: CrossrefEntry[];
}

export function getCrossref(departamento?: string): Promise<CrossrefListResponse> {
  const qs = departamento ? `?departamento=${encodeURIComponent(departamento)}` : "";
  return getJson(`/api/crossref${qs}`);
}
