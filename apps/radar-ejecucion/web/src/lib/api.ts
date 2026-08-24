import { fetchJson } from "../../../../../packages/http-client/src";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface FuenteTrazable {
  dataset: string;
  resourceId: string;
  extraidoEl?: string;
}

export interface ExecutionRow {
  entityCode: string;
  nombre: string;
  nivelGobierno: string;
  funcion: string;
  anioFiscal: number;
  pia: number;
  pim: number;
  devengado: number;
  avancePct: number | null;
  fechaCorte: string;
  fuente: FuenteTrazable;
}

export interface ExecutionListResponse {
  resultados: ExecutionRow[];
}

export interface EntityDetailResponse {
  entityCode: string;
  nombre: string;
  nivelGobierno: string;
  linea_de_tiempo: ExecutionRow[];
}

export type BenchmarkResponse =
  | {
      status: "ok";
      entityCode: string;
      anioFiscal: number;
      n: number;
      percentil: number;
      medianaAvancePct: number;
      criterios: string;
      exclusiones: string;
      fechaCorte: string;
    }
  | {
      status: "datos_insuficientes";
      entityCode: string;
      anioFiscal: number;
      n: number;
      minRequerido: number;
      criterios: string;
      fechaCorte: string;
    };

export interface ExecutionFilters {
  nivel?: string;
  funcion?: string;
  anio?: string;
  ubigeo?: string;
  departamento?: string;
  metaDepartamento?: string;
}

async function getJson<T>(path: string): Promise<T> {
  return fetchJson<T>(API_URL, path);
}

export function getExecutionList(filters: ExecutionFilters = {}): Promise<ExecutionListResponse> {
  const params = new URLSearchParams();
  if (filters.nivel) params.set("nivel", filters.nivel);
  if (filters.funcion) params.set("funcion", filters.funcion);
  if (filters.anio) params.set("anio", filters.anio);
  if (filters.ubigeo) params.set("ubigeo", filters.ubigeo);
  if (filters.departamento) params.set("departamento", filters.departamento);
  if (filters.metaDepartamento) params.set("metaDepartamento", filters.metaDepartamento);
  const qs = params.toString();
  return getJson(`/api/execution${qs ? `?${qs}` : ""}`);
}

export function getEntity(entityCode: string): Promise<EntityDetailResponse> {
  return getJson(`/api/execution/${encodeURIComponent(entityCode)}`);
}

export function getBenchmark(entityCode: string, anio?: string): Promise<BenchmarkResponse> {
  const qs = anio ? `?anio=${encodeURIComponent(anio)}` : "";
  return getJson(`/api/benchmark/${encodeURIComponent(entityCode)}${qs}`);
}
