import { fetchJson } from "../../../../../packages/http-client/src";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4008";

export interface Inhabilitacion {
  razon_social: string;
  resolucion: string;
  periodo_inhabilitacion: string | null;
  desde: string | null;
  hasta: string | null;
  infraccion: string | null;
  otra_infraccion: string | null;
  norma: string | null;
  estado: string | null;
}

export interface Multa {
  razon_social: string;
  resolucion: string;
  fecha_resolucion: string | null;
  monto_multa: number | null;
  infraccion: string | null;
  periodo_suspension: string | null;
  desde: string | null;
  hasta: string | null;
  norma: string | null;
  estado: string | null;
}

export interface SancionesResponse {
  ruc: string;
  tieneInhabilitacionVigente: boolean;
  inhabilitaciones: Inhabilitacion[];
  multas: Multa[];
}

async function getJson<T>(path: string): Promise<T> {
  return fetchJson<T>(API_URL, path);
}

export function getSanciones(ruc: string): Promise<SancionesResponse> {
  return getJson(`/api/sanciones?ruc=${encodeURIComponent(ruc)}`);
}

export interface CrossrefEntry {
  ocid: string;
  awardId: string;
  supplierId: string;
  supplierName: string;
  buyerName: string;
  valorMonto: number | null;
  valorMoneda: string | null;
  fecha: string | null;
  rucValido: boolean;
  inhabilitacionesEncontradas: number;
  tieneInhabilitacionVigente: boolean;
  estadoContribuyente: string | null;
  condicionDomicilio: string | null;
}

export interface CrossrefResponse {
  departamento: string;
  resultados: CrossrefEntry[];
}

export function getCrossref(departamento?: string): Promise<CrossrefResponse> {
  const qs = departamento ? `?departamento=${encodeURIComponent(departamento)}` : "";
  return getJson(`/api/crossref${qs}`);
}
