/**
 * Tipos compartidos para la UI de Rastro.
 *
 * La regla P1 (vacío de evidencia, no conclusión) se codifica en el tipo
 * `WithMetadata`: cualquier número que se renderice en la UI debe traer
 * su fuente, cobertura, restricción, dependencia y corte. Si un componente
 * recibe un número "pelado", el linter AL3-13 rompe el build.
 */

export type Cobertura = "COMPLETA" | "PARCIAL" | "BLOQUEADA" | "NO_APLICA";

/**
 * Metadatos obligatorios que deben acompañar a cada cifra visible en la UI.
 *
 * - `fuente`: app y tool MCP que produjo el dato (ej. "radar-ejecucion / radar_ejecucion_sector_ficha").
 * - `corte`: timestamp o periodo del dato (ej. "2026-08-26" o "2026-Q1").
 * - `cobertura`: estado de cobertura declarado por la API.
 * - `matcher`: cómo se vinculó (clave exacta, fuzzy, etc.) — opcional pero recomendado.
 * - `restriccion`: nota textual del tool si la hubiera.
 */
export interface WithMetadata<T> {
  value: T;
  fuente: string;
  corte: string;
  cobertura: Cobertura;
  matcher?: string;
  restriccion?: string;
}

/** Estado de error tipado que el api-client puede devolver. */
export type ApiErrorKind = "timeout" | "network" | "http_4xx" | "http_5xx" | "invalid_json";

export class AppUnavailableError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly appKey: AppKey;
  readonly endpoint: string;

  constructor(appKey: AppKey, endpoint: string, kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = "AppUnavailableError";
    this.appKey = appKey;
    this.endpoint = endpoint;
    this.kind = kind;
    if (status !== undefined) this.status = status;
  }
}

export type AppKey =
  | "radar-ejecucion"
  | "compras-publicas"
  | "radar-inversiones"
  | "infobras"
  | "ceplan-estrategico"
  | "ceplan-geo"
  | "identidad-fiscal"
  | "salud-institucional"
  | "proveedores-sancionados"
  | "actividad-agraria"
  | "seguridad-ciudadana"
  | "bcrp-comercio-exterior"
  | "inversion-privada"
  | "bcrp-la-libertad";

/** Catálogo de las 14 apps con su puerto y variable de entorno. */
export const APP_CATALOG: Record<AppKey, { label: string; port: number; envKey: string }> = {
  "radar-ejecucion": { label: "Radar Ejecución (MEF)", port: 4000, envKey: "VITE_API_BASE_URL_RADAR_EJECUCION" },
  "compras-publicas": { label: "Compras Públicas (OECE/OCDS)", port: 4001, envKey: "VITE_API_BASE_URL_COMPRAS_PUBLICAS" },
  "radar-inversiones": { label: "Radar Inversiones (Invierte.pe)", port: 4002, envKey: "VITE_API_BASE_URL_RADAR_INVERSIONES" },
  infobras: { label: "INFOBRAS (Contraloría)", port: 4003, envKey: "VITE_API_BASE_URL_INFOBRAS" },
  "ceplan-estrategico": { label: "CEPLAN Estratégico", port: 4004, envKey: "VITE_API_BASE_URL_CEPLAN_ESTRATEGICO" },
  "ceplan-geo": { label: "CEPLAN Geo", port: 4005, envKey: "VITE_API_BASE_URL_CEPLAN_GEO" },
  "identidad-fiscal": { label: "Identidad Fiscal (SUNAT RUC)", port: 4006, envKey: "VITE_API_BASE_URL_IDENTIDAD_FISCAL" },
  "salud-institucional": { label: "Salud Institucional", port: 4007, envKey: "VITE_API_BASE_URL_SALUD_INSTITUCIONAL" },
  "proveedores-sancionados": { label: "Proveedores Sancionados", port: 4008, envKey: "VITE_API_BASE_URL_PROVEEDORES_SANCIONADOS" },
  "actividad-agraria": { label: "Actividad Agraria (MIDAGRI)", port: 4009, envKey: "VITE_API_BASE_URL_ACTIVIDAD_AGRARIA" },
  "seguridad-ciudadana": { label: "Seguridad Ciudadana (SIDPOL)", port: 4010, envKey: "VITE_API_BASE_URL_SEGURIDAD_CIUDADANA" },
  "bcrp-comercio-exterior": { label: "BCRP Comercio Exterior", port: 4011, envKey: "VITE_API_BASE_URL_BCRP_COMERCIO_EXTERIOR" },
  "inversion-privada": { label: "Inversión Privada (PROINVERSIÓN)", port: 4012, envKey: "VITE_API_BASE_URL_INVERSION_PRIVADA" },
  "bcrp-la-libertad": { label: "BCRP La Libertad", port: 4013, envKey: "VITE_API_BASE_URL_BCRP_LA_LIBERTAD" },
};
