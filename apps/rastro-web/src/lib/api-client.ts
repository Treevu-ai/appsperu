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

/**
 * Bug real encontrado por AL3-14 (suite E2E, 2026-09-02): `new URL(path, base)`
 * con un `path` que empieza en "/" IGNORA el path de `base` y resuelve contra
 * el origin — ej. `new URL("/api/x", "https://api.rastro.pe/infobras/")` da
 * `https://api.rastro.pe/api/x`, perdiendo `/infobras`. No se notaba en local
 * (los 14 puertos no tienen path propio) ni en producción hoy
 * (`VITE_PUBLIC_APIS_LIVE=false` bloquea las llamadas antes de intentarlas),
 * pero rompería TODAS las llamadas en cuanto `api.rastro.pe` (proxy nginx por
 * path) se publique. Fix: resolver `path` como RELATIVO (sin "/" inicial)
 * contra una `base` que siempre termina en "/".
 */
function buildUrl(base: string, path: string, query?: RequestOptions["query"]): string {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, normalizedBase);
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

/**
 * compras_publicas_suppliers — concentración por departamento.
 *
 * Nota (AL3-08, 2026-09-02): el shape declarado acá antes no coincidía con
 * la respuesta real de `apps/compras-publicas/api/src/routes/suppliers.ts`
 * (campo `items` vs. `resultados`, `razonSocial`/`ruc` inexistentes en el
 * backend, y sin `cobertura`/`matcher`/`corte` — el endpoint no los
 * devuelve). Corregido para reflejar la respuesta real; ver `NO_APLICA` en
 * el uso de este tipo en `routes/prensa/Proveedores.tsx`.
 */
export interface Supplier {
  supplierId: string;
  supplierName: string;
  valorTotal: number;
  adjudicaciones: number;
  entidadesDistintas: number;
}
export interface SuppliersResponse {
  resultados: Supplier[];
  concentracion: { cr3: number; cr5: number; hhi: number; proveedoresConsiderados: number };
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

/**
 * infobras_public_works — obras de un departamento, con señales derivadas
 * (Cost Drift, Gap físico-financiero).
 *
 * Nota (2026-09-02): el tipo declarado acá antes no coincidía con la
 * respuesta real de `apps/infobras/api/src/routes/public-works.ts`
 * (`withSignals()`) — nunca se había verificado contra el código fuente.
 * Divergencias reales: `resultados` no `items`; `nombreObra` no
 * `descripcion`; `entidadNombre` no `entidad`; `estadoEjecucion` no
 * `estado`; `existeParalizacion` no `paralizada`; `avanceFisicoRealPct` no
 * `avanceFisicoPct`; y el endpoint no devuelve `cobertura`/`matcher`/`corte`
 * ni `resumen` a nivel de respuesta (eso vive en `GET
 * /api/public-works/resumen`, un endpoint aparte). Corregido para reflejar
 * el shape real — ver `NO_APLICA` en el uso de este tipo en
 * `routes/Distrito.tsx`.
 */
export interface PublicWork {
  codigoInfobras: string;
  codigoEntidad: string;
  entidadNombre: string;
  nombreObra: string;
  modalidadEjecucion: string | null;
  naturalezaObra: string | null;
  estadoEjecucion: string;
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
  fuente: { dataset: string; extraidoEl: string };
}
export interface PublicWorksResponse {
  resultados: PublicWork[];
}
export function getInfobrasPublicWorks(params: { departamento?: string; estado?: string; conParalizacion?: boolean }, options?: RequestOptions) {
  return requestJson<PublicWorksResponse>("infobras", "/api/public-works", {
    ...options,
    query: { departamento: params.departamento, estado: params.estado, conParalizacion: params.conParalizacion },
  });
}

/**
 * infobras_crossref_ejecucion — crosswalk INFOBRAS↔radar-ejecucion por
 * nombre de entidad (matcher difuso, con niveles de confianza), con
 * devengado y obras/obras paralizadas por entidad ya cruzada.
 */
export interface InfobrasCrossrefEjecucionRow {
  ejecucionEntityCode: string;
  ejecucionNombre: string;
  infobrasCodigoEntidad: string;
  infobrasEntidadNombre: string;
  confidence: "confirmada" | "candidata";
  score: number;
  devengado: number;
  coberturaTemporal: { cortesUsados: string[]; estado: "PARCIAL" } | null;
  obras: number;
  obrasParalizadas: number;
  computedAt: string;
}
export interface InfobrasCrossrefEjecucionResponse {
  resultados: InfobrasCrossrefEjecucionRow[];
}
export function getInfobrasCrossrefEjecucion(
  params: { confidence?: "confirmada" | "candidata" },
  options?: RequestOptions,
) {
  return requestJson<InfobrasCrossrefEjecucionResponse>("infobras", "/api/crossref/ejecucion", {
    ...options,
    query: { confidence: params.confidence },
  });
}

/**
 * radar_ejecucion_infrastructure_integrity — cadena documental mínima por
 * departamento (`apps/radar-ejecucion/api/src/routes/infrastructure.ts`,
 * `GET /api/infraestructura/integridad`). El endpoint filtra por
 * `departamento` + `sector` opcional — no por distrito/UBIGEO (la fuente no
 * lo soporta); ver AL3-10 en docs/TICKETS_Rastro_Capa_Lectura_v1.md.
 */
export interface InfrastructureIntegrityResponse {
  departamento: string;
  sector: string | null;
  estado: "CADENA_MINIMA_DOCUMENTADA" | "BLOQUEADO_POR_EVIDENCIA";
  controles: {
    activos: number;
    conCierre: number;
    conOperador: number;
    conMantenimiento: number;
    conDisponibilidad: number;
    conIndicadorServicio: number;
    familiasMaterializadas: number;
    pendientesRevision: number;
  };
  bloqueo: string | null;
  cautela: string;
}
export function getRadarEjecucionInfrastructureIntegrity(
  params: { departamento?: string; sector?: string; estricto?: boolean },
  options?: RequestOptions,
) {
  return requestJson<InfrastructureIntegrityResponse>("radar-ejecucion", "/api/infraestructura/integridad", {
    ...options,
    query: {
      departamento: params.departamento,
      sector: params.sector,
      estricto: params.estricto,
    },
  });
}

/**
 * radar_ejecucion_infrastructure_assets — activos de infraestructura
 * materializados para un departamento (CUI/obra cuando existe, evidencia de
 * cierre/operador/mantenimiento/disponibilidad/servicio por separado).
 * Igual que infobras_public_works, solo filtra por departamento en el
 * backend — el filtro por distrito exacto se hace en el cliente (AL3-09).
 */
export interface InfrastructureAsset {
  id: string;
  familia: string;
  activo: string;
  territorio: { departamento: string | null; provincia: string | null; distrito: string | null };
  identidad: { cui: string | null; codigoInfobras: string | null; codigoSectorial: string | null; estado: string };
  etapas: {
    cierre: string;
    operador: string;
    mantenimiento: string;
    disponibilidad: string;
    servicio: string;
  };
  obraInfoBras: unknown;
  fuente: unknown;
  fechaObservada: string | null;
  limitacion: string | null;
}
export interface InfrastructureAssetsResponse {
  departamento: string;
  sector: string | null;
  resultados: InfrastructureAsset[];
  cautela: string;
}
export function getRadarEjecucionInfrastructureAssets(
  params: { departamento?: string; sector?: string },
  options?: RequestOptions,
) {
  return requestJson<InfrastructureAssetsResponse>("radar-ejecucion", "/api/infraestructura/activos", {
    ...options,
    query: { departamento: params.departamento, sector: params.sector },
  });
}

/**
 * radar_inversiones_investments — cartera de inversión pública (Invierte.pe).
 * Sin fuente/cobertura/matcher/corte en la respuesta — mismo caso que
 * `compras_publicas_suppliers` (AL3-08): el backend no los declara para
 * este endpoint. Usar `NO_APLICA` en el sitio de uso, no inventar valores.
 */
export interface Investment {
  cui: string;
  codigoSnip: string | null;
  nombre: string;
  secEjec: string | null;
  nombreUep: string | null;
  entidad: string;
  sector: string | null;
  nivel: string | null;
  estado: string;
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
  fetchedAt: string;
}
export interface InvestmentsResponse {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  resultados: Investment[];
}
export function getRadarInversionesInvestments(
  params: { departamento?: string; estado?: string; situacion?: string; funcion?: string },
  options?: RequestOptions,
) {
  return requestJson<InvestmentsResponse>("radar-inversiones", "/api/investments", {
    ...options,
    query: params,
  });
}

/** ceplan_estrategico_indicators — indicadores agregados por nivel de gobierno (sin modelo per-entidad). */
export interface CeplanIndicador {
  indicatorCode: string;
  indicatorName: string;
  serieId: string;
  serieLabel: string;
  nivelGobierno: string;
  value: number;
  measurementDate: string;
  unitOfMeasure: string | null;
  frequency: string | null;
  fuente: { dataset: string };
}
export interface CeplanIndicadoresResponse {
  resultados: CeplanIndicador[];
}
export function getCeplanEstrategicoIndicators(
  params: { indicatorCode?: string; nivelGobierno?: string },
  options?: RequestOptions,
) {
  return requestJson<CeplanIndicadoresResponse>("ceplan-estrategico", "/api/indicators", {
    ...options,
    query: params,
  });
}

/**
 * ceplan_geo_territories — territorio oficial por UBIGEO o por tríada
 * departamento/provincia/distrito. A diferencia del resto, este endpoint
 * devuelve UN territorio (no una lista) cuando el filtro matchea, y 404 si
 * no. Se usa para resolver distrito exacto desde un UBIGEO (AL3-09).
 */
export interface Territory {
  ubigeo: string;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
  geometry: unknown;
  matchStatus?: string;
}
export function getCeplanGeoTerritory(
  params: { ubigeo?: string; departamento?: string; provincia?: string; distrito?: string },
  options?: RequestOptions,
) {
  return requestJson<Territory>("ceplan-geo", "/api/territories", {
    ...options,
    query: params,
  });
}

/** salud_institucional_score — score compuesto 0-100 por entidad, calculado en vivo. */
export interface ComponentScore {
  valor: number | null;
  disponible: boolean;
}
export interface EntityScore {
  entityCode: string;
  nombre: string;
  scoreCompuesto: number | null;
  componentesUsados: number;
  componentes: {
    ejecucion: ComponentScore;
    obrasNoParalizadas: ComponentScore;
    inversionesSinSobrecosto: ComponentScore;
    comprasNoConcentradas: ComponentScore;
    saludTributariaProveedores: ComponentScore;
  };
}
export interface SaludInstitucionalScoreResponse {
  departamento: string;
  anioFiscal?: number;
  resultados: EntityScore[];
}
export function getSaludInstitucionalScore(
  params: { departamento?: string; anio?: string },
  options?: RequestOptions,
) {
  return requestJson<SaludInstitucionalScoreResponse>("salud-institucional", "/api/score", {
    ...options,
    query: params,
  });
}

/**
 * actividad_agraria_wage — jornal agrícola regional (MIDAGRI). Los 3
 * endpoints "regional-monthly" (wage/tractor-rental/yunta-rental) devuelven
 * las filas de SQL tal cual (sin remapear a camelCase) — `valor_soles` es
 * el nombre real de la columna, no un error de tipeo.
 */
export interface RegionalMonthlyRow {
  departamento: string;
  anio: number;
  mes: number;
  valor_soles: number | null;
}
export interface RegionalMonthlyResponse {
  resultados: RegionalMonthlyRow[];
}
export function getActividadAgrariaWage(
  params: { departamento?: string; anio?: string },
  options?: RequestOptions,
) {
  return requestJson<RegionalMonthlyResponse>("actividad-agraria", "/api/wage", {
    ...options,
    query: params,
  });
}

/** seguridad_ciudadana_denuncias — denuncias policiales agregadas (SIDPOL). */
export interface DenunciaRow {
  departamento: string;
  provincia: string;
  distrito: string | null;
  ubigeo: string | null;
  anio: number;
  mes: number;
  modalidad: string;
  cantidad: number;
}
export interface DenunciasResponse {
  resultados: DenunciaRow[];
}
export function getSeguridadCiudadanaDenuncias(
  params: { departamento?: string; provincia?: string; anio?: string; modalidad?: string },
  options?: RequestOptions,
) {
  return requestJson<DenunciasResponse>("seguridad-ciudadana", "/api/denuncias", {
    ...options,
    query: params,
  });
}

/** bcrp_trade — comercio exterior agregado nacional (BCRP), sin desagregación territorial. */
export interface TradeRow {
  series_code: string;
  series_key: string;
  series_title: string;
  category: string | null;
  period_year: number;
  period_month: number;
  value_usd_millions: number | null;
}
export interface TradeResponse {
  resultados: TradeRow[];
  cobertura: string;
  isPartial: boolean;
}
export function getBcrpComercioExteriorTrade(
  params: { series?: string; anio?: string; desde?: string; hasta?: string },
  options?: RequestOptions,
) {
  return requestJson<TradeResponse>("bcrp-comercio-exterior", "/api/trade", {
    ...options,
    query: params,
  });
}

/** inversion_privada_projects — cartera APP/PA de PROINVERSIÓN (VERTIX). */
export interface InversionPrivadaProject {
  vertixId: number;
  slug: string | null;
  tipoProyecto: string;
  nombre: string;
  estado: string | null;
  fase: string | null;
  titular: string | null;
  sector: string | null;
  cartera: string | null;
  modalidad: string | null;
  modalidadContractual: string | null;
  montoInversionSigv: number | null;
  montoProyecto: string | null;
  greenBrownfield: string | null;
  departamentos: string[] | null;
  urlThumb: string | null;
  fuente: { dataset: string; extraidoEl: string };
}
export interface InversionPrivadaProjectsResponse {
  resultados: InversionPrivadaProject[];
  cobertura: string;
  isPartial: boolean;
  recordsTotalFuente: number | null;
  extraidoEl: string | null;
}
export function getInversionPrivadaProjects(
  params: { departamento?: string; sector?: string; tipo?: "APP" | "PA"; titular?: string; fase?: string },
  options?: RequestOptions,
) {
  return requestJson<InversionPrivadaProjectsResponse>("inversion-privada", "/api/projects", {
    ...options,
    query: params,
  });
}

/**
 * bcrp_la_libertad_indicadores — Síntesis de Actividad Económica de La
 * Libertad (BCRP Sucursal Trujillo). Ingesta MANUAL (sin scraping
 * automático, ver ADR-0014) — cobertura parcial de anexos (1,2,3,5,6,8,10;
 * 4,7,9 no se ingieren por ambigüedad de formato en el PDF fuente).
 */
export interface BcrpLaLibertadIndicador {
  anexoNumero: number;
  seccion: string | null;
  indicador: string;
  periodoAnio: number;
  periodoMes: number;
  valor: number | null;
  fuente: { dataset: string; reportePeriod: string | null };
}
export interface BcrpLaLibertadIndicadoresResponse {
  resultados: BcrpLaLibertadIndicador[];
}
export function getBcrpLaLibertadIndicadores(
  params: { anexo?: number; indicador?: string; anio?: number; mes?: number },
  options?: RequestOptions,
) {
  return requestJson<BcrpLaLibertadIndicadoresResponse>("bcrp-la-libertad", "/api/indicadores", {
    ...options,
    query: params,
  });
}

/** health-check genérico (un endpoint por app). */
export function getAppHealth(appKey: AppKey, options?: RequestOptions): Promise<{ status: string }> {
  return requestJson<{ status: string }>(appKey, "/health", options);
}
