import { fetchJson } from "../../../../../packages/http-client/src";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4004";

export interface FuenteTrazable {
  dataset: string;
}

export interface IndicatorRow {
  indicatorCode: string;
  indicatorName: string;
  serieId: string;
  serieLabel: string;
  nivelGobierno: string | null;
  value: number;
  measurementDate: string;
  unitOfMeasure: string | null;
  frequency: string;
  fuente: FuenteTrazable;
}

export interface IndicatorsListResponse {
  resultados: IndicatorRow[];
}

export interface IndicatorsFilters {
  indicatorCode?: string;
  nivelGobierno?: string;
}

async function getJson<T>(path: string): Promise<T> {
  return fetchJson<T>(API_URL, path);
}

export function getIndicators(filters: IndicatorsFilters = {}): Promise<IndicatorsListResponse> {
  const params = new URLSearchParams();
  if (filters.indicatorCode) params.set("indicatorCode", filters.indicatorCode);
  if (filters.nivelGobierno) params.set("nivelGobierno", filters.nivelGobierno);
  const qs = params.toString();
  return getJson(`/api/indicators${qs ? `?${qs}` : ""}`);
}

export interface CrossrefRow {
  nivelGobierno: string;
  nivelGobiernoRadarEjecucion: string;
  anioCeplan: string | null;
  anioRadarEjecucion: number | null;
  ejecucionFisicaCeplan: number | null;
  ejecucionPresupuestalCeplan: number | null;
  ejecucionPresupuestalRadarEjecucion: number | null;
  strategicExecutionGap: number | null;
  executionEfficiency: number | null;
}

export interface CrossrefListResponse {
  resultados: CrossrefRow[];
}

export function getCrossref(): Promise<CrossrefListResponse> {
  return getJson(`/api/crossref`);
}
