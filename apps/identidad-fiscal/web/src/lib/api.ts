import { fetchJson } from "../../../../../packages/http-client/src";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4006";

export interface Contribuyente {
  ruc: string;
  razonSocial: string;
  estadoContribuyente: string | null;
  condicionDomicilio: string | null;
  ubigeo: string | null;
  direccion: string | null;
}

export interface ContribuyenteListResponse {
  resultados: Contribuyente[];
}

export interface ContribuyenteFilters {
  razonSocial?: string;
  estado?: string;
  ubigeo?: string;
}

async function getJson<T>(path: string): Promise<T> {
  return fetchJson<T>(API_URL, path);
}

export function getContribuyentes(filters: ContribuyenteFilters = {}): Promise<ContribuyenteListResponse> {
  const params = new URLSearchParams();
  if (filters.razonSocial) params.set("razonSocial", filters.razonSocial);
  if (filters.estado) params.set("estado", filters.estado);
  if (filters.ubigeo) params.set("ubigeo", filters.ubigeo);
  const qs = params.toString();
  return getJson(`/api/contribuyentes${qs ? `?${qs}` : ""}`);
}

export interface ProveedorCrossrefEntry {
  ocid: string;
  awardId: string;
  supplierId: string;
  supplierName: string;
  buyerName: string;
  valorMonto: number | null;
  valorMoneda: string | null;
  fecha: string | null;
  rucValido: boolean;
  encontradoEnPadron: boolean;
  estadoContribuyente: string | null;
  condicionDomicilio: string | null;
  ubigeoProveedor: string | null;
  irregular: boolean;
}

export interface ProveedorCrossrefResponse {
  departamento: string;
  resultados: ProveedorCrossrefEntry[];
}

export function getCrossrefProveedores(departamento?: string): Promise<ProveedorCrossrefResponse> {
  const qs = departamento ? `?departamento=${encodeURIComponent(departamento)}` : "";
  return getJson(`/api/crossref${qs}`);
}

export interface EntidadCrossrefEntry {
  entityCode: string;
  nombreEnRadarEjecucion: string;
  ruc: string;
  razonSocialEnPadron: string;
  confidence: "confirmada" | "candidata";
  score: number;
  estadoContribuyente: string | null;
  condicionDomicilio: string | null;
}

export interface EntidadCrossrefResponse {
  departamento: string;
  totalEntidades: number;
  totalMatches: number;
  resultados: EntidadCrossrefEntry[];
}

export function getCrossrefEntidades(departamento?: string): Promise<EntidadCrossrefResponse> {
  const qs = departamento ? `?departamento=${encodeURIComponent(departamento)}` : "";
  return getJson(`/api/crossref/entidades${qs}`);
}
