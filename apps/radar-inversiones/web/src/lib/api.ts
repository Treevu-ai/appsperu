const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4002";

export interface FuenteTrazable {
  dataset: string;
  extraidoEl?: string;
}

export interface Investment {
  cui: string;
  codigoSnip: string | null;
  nombre: string;
  secEjec: string | null;
  nombreUep: string | null;
  entidad: string | null;
  sector: string | null;
  nivel: string | null;
  estado: string | null;
  situacion: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  montoViable: number | null;
  costoActualizado: number | null;
  funcion: string | null;
  tipoInversion: string | null;
  fechaRegistro: string | null;
  fechaViabilidad: string | null;
  fuente: FuenteTrazable;
}

export interface InvestmentListResponse {
  resultados: Investment[];
}

export interface InvestmentFilters {
  departamento?: string;
  estado?: string;
  situacion?: string;
  funcion?: string;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`La API respondió ${res.status} para ${path}`);
  }
  return (await res.json()) as T;
}

export function getInvestmentList(filters: InvestmentFilters = {}): Promise<InvestmentListResponse> {
  const params = new URLSearchParams();
  if (filters.departamento) params.set("departamento", filters.departamento);
  if (filters.estado) params.set("estado", filters.estado);
  if (filters.situacion) params.set("situacion", filters.situacion);
  if (filters.funcion) params.set("funcion", filters.funcion);
  const qs = params.toString();
  return getJson(`/api/investments${qs ? `?${qs}` : ""}`);
}

export function getInvestment(cui: string): Promise<Investment> {
  return getJson(`/api/investments/${encodeURIComponent(cui)}`);
}

export interface CrossrefEntry {
  secEjec: string;
  nombreUep: string | null;
  nombreEnPresupuesto: string | null;
  enPresupuesto: boolean;
  inversiones: number;
  montoViableTotal: number;
  costoActualizadoTotal: number;
  devengado: number;
}

export interface CrossrefListResponse {
  resultados: CrossrefEntry[];
}

export function getCrossref(departamento?: string): Promise<CrossrefListResponse> {
  const qs = departamento ? `?departamento=${encodeURIComponent(departamento)}` : "";
  return getJson(`/api/crossref${qs}`);
}
