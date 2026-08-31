/**
 * Cliente HTTP a las 14 APIs de appsperu.
 *
 * Diseño:
 * - Una función tipada por tool (no genéricos) para que el linter AL3-13
 *   detecte "número sin metadata" en el sitio de uso.
 * - Timeout 8 s por defecto. La UI nunca queda colgada en un spinner.
 * - Distingue 5 clases de error (`AppUnavailableError.kind`) para que la
 *   UI muestre el mensaje correcto (timeout vs 5xx vs 404 vs JSON roto).
 * - `fetch` se llama SIEMPRE con `cache: 'no-store'` para respetar P3
 *   (frescura honesta: nunca datos viejos servidos por el navegador).
 * - Cero retry silencioso. Si quieres retry, lo decides en la UI.
 */

import { AppUnavailableError, type AppKey, APP_CATALOG } from "./types.js";
import { apisPublishedForBrowser, APIS_NOT_PUBLISHED_MESSAGE } from "./api-config.js";

export interface RequestOptions {
  /** Query params ya encoded como Record<string,string>. */
  query?: Record<string, string | number | boolean | undefined>;
  /** Timeout en ms. Default 8000. */
  timeoutMs?: number;
  /** Headers adicionales (ej. Authorization si más adelante se requiere). */
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 8000;

function envBaseUrl(appKey: AppKey): string {
  const envKey = APP_CATALOG[appKey].envKey;
  const value = import.meta.env[envKey as keyof ImportMetaEnv];
  if (typeof value !== "string" || value.length === 0) {
    throw new AppUnavailableError(
      appKey,
      "(config)",
      "network",
      `Variable de entorno ${envKey} no configurada.`,
    );
  }
  return value.replace(/\/+$/, "");
}

function buildUrl(base: string, path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, `${base}/`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function requestJson<T>(appKey: AppKey, path: string, options: RequestOptions = {}): Promise<T> {
  if (!apisPublishedForBrowser()) {
    throw new AppUnavailableError(appKey, path, "network", APIS_NOT_PUBLISHED_MESSAGE);
  }
  const base = envBaseUrl(appKey);
  const url = buildUrl(base, path, options.query);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json", ...(options.headers ?? {}) },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof DOMException && err.name === "AbortError";
    throw new AppUnavailableError(
      appKey,
      path,
      isAbort ? "timeout" : "network",
      isAbort
        ? `Timeout ${timeoutMs} ms consultando ${url}`
        : `Error de red consultando ${url}: ${(err as Error).message}`,
    );
  }
  clearTimeout(timer);

  if (!response.ok) {
    const kind: AppUnavailableError["kind"] = response.status >= 500 ? "http_5xx" : "http_4xx";
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      // ignore
    }
    throw new AppUnavailableError(
      appKey,
      path,
      kind,
      `HTTP ${response.status} ${response.statusText} en ${url}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ""}`,
      response.status,
    );
  }

  let payload: T;
  try {
    payload = (await response.json()) as T;
  } catch (err) {
    throw new AppUnavailableError(
      appKey,
      path,
      "invalid_json",
      `Respuesta no es JSON válido en ${url}: ${(err as Error).message}`,
    );
  }
  return payload;
}

// =====================================================================
// Tipos de respuesta (parcial — los necesarios para Sprint 11; se
// completarán en Sprints 12–14 cuando cada vista se implemente).
// =====================================================================

export interface MetaSource {
  runAt: string;
  records: number;
  checksum?: string;
  fuente?: string;
  cobertura?: "COMPLETA" | "PARCIAL" | "BLOQUEADA";
}

export interface MetaSourcesResponse {
  items: MetaSource[];
}

export interface SectorFichaResponse {
  sectorId: string;
  anio: number;
  pia: number;
  pim: number;
  devengado: number;
  regla: string;
  cobertura: "COMPLETA" | "PARCIAL" | "BLOQUEADA";
  matcher: string;
  corte: string;
}

/** radar_ejecucion_sector_comparativo — comparativo entre sectores verificados. */
export interface SectorComparativoRow {
  sectorId: string;
  sector: string;
  entityCode: string;
  entidad: string;
  tipoEntidad: string;
  nivelGobierno: string;
  reglaTerritorial: string;
  alcance: string;
  pia: number;
  pim: number;
  devengado: number;
  saldoPorDevengar: number | null;
  cobertura: {
    estado: "COMPLETA" | "PARCIAL" | "BLOQUEADA" | "NO_VERIFICADA";
    fechaCorteParticion: string | null;
    registrosParticion: number | null;
  };
  cortesUsados: string[];
  recursos: string[];
}
export interface SectorComparativoResponse {
  anio: number;
  departamento: string;
  resultados: SectorComparativoRow[];
  /** Texto literal de la API: separa GN dirigido y GR ejecutado por sede. */
  limitation: string;
}

/** radar_ejecucion_benchmark — percentil de una entidad contra su cohorte. */
export interface BenchmarkResponse {
  entityCode: string;
  anioFiscal: number;
  status: "ok" | "datos_insuficientes";
  fechaCorte: string;
  // ok
  n?: number;
  percentil?: number;
  medianaAvancePct?: number;
  criterios?: string;
  exclusiones?: string;
  // datos_insuficientes
  minRequerido?: number;
  // Explicación textual de error / nota (cuando 422: "No hay regla de cohorte…").
  error?: string;
}

// =====================================================================
// Funciones tipadas (1 por tool MCP usado en Sprint 11–14)
// =====================================================================

/** radar_ejecucion_meta_sources — fuente de verdad de la frescura. */
export function getRadarEjecucionMetaSources(options?: RequestOptions) {
  return requestJson<MetaSourcesResponse>("radar-ejecucion", "/api/meta/sources", options);
}

/** radar_ejecucion_sector_ficha — ficha de un sector verificado. */
export function getRadarEjecucionSectorFicha(
  params: { sectorId: string; anio?: number; departamento?: string },
  options?: RequestOptions,
) {
  return requestJson<SectorFichaResponse>("radar-ejecucion", `/api/sectores/${encodeURIComponent(params.sectorId)}/ficha`, {
    ...options,
    query: { anio: params.anio, departamento: params.departamento },
  });
}

/** radar_ejecucion_sector_comparativo — comparativo entre sectores verificados. */
export function getRadarEjecucionSectorComparativo(
  params: { anio?: number; departamento?: string; sectores?: string[] },
  options?: RequestOptions,
) {
  return requestJson<SectorComparativoResponse>("radar-ejecucion", "/api/sectores/comparativo", {
    ...options,
    query: {
      anio: params.anio,
      departamento: params.departamento,
      sectores: params.sectores?.join(","),
    },
  });
}

/** radar_ejecucion_benchmark — percentil de una entidad contra su cohorte. */
export function getRadarEjecucionBenchmark(
  params: { entityCode: string; anio?: number },
  options?: RequestOptions,
) {
  return requestJson<BenchmarkResponse>(
    "radar-ejecucion",
    `/api/benchmark/${encodeURIComponent(params.entityCode)}`,
    { ...options, query: { anio: params.anio } },
  );
}

/** compras_publicas_suppliers — concentración por departamento. */
export interface Supplier {
  supplierId: string;
  ruc?: string;
  razonSocial: string;
  valorTotal: number;
  adjudicaciones: number;
  entidadesDistintas: number;
}
export interface SuppliersResponse {
  items: Supplier[];
  concentracion: { cr3: number; cr5: number; hhi: number; proveedoresConsiderados: number };
  cobertura: "COMPLETA" | "PARCIAL" | "BLOQUEADA";
  matcher: string;
  corte: string;
}
export function getComprasPublicasSuppliers(params: { departamento?: string }, options?: RequestOptions) {
  return requestJson<SuppliersResponse>("compras-publicas", "/api/suppliers", {
    ...options,
    query: { departamento: params.departamento },
  });
}

/** identidad_fiscal_contribuyente_by_ruc — perfil RUC. */
export interface Contribuyente {
  ruc: string;
  razonSocial: string;
  estado: string;
  condicion: string;
  ubigeo?: string;
}
export interface ContribuyenteResponse {
  value: Contribuyente;
  fuente: string;
  cobertura: "COMPLETA" | "PARCIAL" | "BLOQUEADA";
  matcher: string;
  corte: string;
}
export function getIdentidadFiscalContribuyente(ruc: string, options?: RequestOptions) {
  return requestJson<ContribuyenteResponse>("identidad-fiscal", `/api/contribuyentes/${encodeURIComponent(ruc)}`, options);
}

/** proveedores_sancionados_sanciones — sanciones vigentes. */
export interface Sancion {
  ruc: string;
  tipo: string;
  estado: "VIGENTE" | "ARCHIVADA" | "RESUELTA" | "EN_INVESTIGACION";
  fechaInicio?: string;
  fechaFin?: string;
  expediente?: string;
}
export interface SancionesResponse {
  items: Sancion[];
  cobertura: "COMPLETA" | "PARCIAL" | "BLOQUEADA";
  matcher: string;
  corte: string;
}
export function getProveedoresSancionadosPorRuc(ruc: string, options?: RequestOptions) {
  return requestJson<SancionesResponse>("proveedores-sancionados", `/api/sanciones/${encodeURIComponent(ruc)}`, options);
}

/** infobras_public_works — obras de un departamento. */
export interface PublicWork {
  codigoInfobras: string;
  descripcion: string;
  cuit?: string;
  entidad: string;
  departamento: string;
  provincia?: string;
  distrito?: string;
  estado: string;
  paralizada: boolean;
  avanceFisicoPct?: number;
  ejecucionFinancieraPct?: number;
  montoViable?: number;
  costoActualizado?: number;
}
export interface PublicWorksResponse {
  items: PublicWork[];
  resumen?: { total: number; paralizadasPct: number; conAvanceFisicoPct: number };
  cobertura: "COMPLETA" | "PARCIAL" | "BLOQUEADA";
  matcher: string;
  corte: string;
}
export function getInfobrasPublicWorks(params: { departamento?: string; estado?: string; conParalizacion?: boolean }, options?: RequestOptions) {
  return requestJson<PublicWorksResponse>("infobras", "/api/public-works", {
    ...options,
    query: { departamento: params.departamento, estado: params.estado, conParalizacion: params.conParalizacion },
  });
}

/** health-check genérico (un endpoint por app). */
export function getAppHealth(appKey: AppKey, options?: RequestOptions): Promise<{ status: string }> {
  return requestJson<{ status: string }>(appKey, "/health", options);
}
