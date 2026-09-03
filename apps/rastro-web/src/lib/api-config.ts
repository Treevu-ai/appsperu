import { APP_CATALOG, AppUnavailableError, type AppKey } from "./types.js";

function baseUrlFor(appKey: AppKey): string {
  const envKey = APP_CATALOG[appKey].envKey;
  return String(import.meta.env[envKey as keyof ImportMetaEnv] ?? "");
}

/** True cuando el navegador debe llamar APIs (dev local o APIs publicadas en prod). */
export function apisPublishedForBrowser(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return true;

  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return true;

  const live = String(import.meta.env.VITE_PUBLIC_APIS_LIVE ?? "").toLowerCase();
  if (live === "false" || live === "0" || live === "no") return false;

  return !(Object.keys(APP_CATALOG) as AppKey[]).some((key) =>
    /localhost|127\.0\.0\.1/.test(baseUrlFor(key)),
  );
}

export const APIS_NOT_PUBLISHED_MESSAGE =
  "Esta vista necesita datos en vivo, que por ahora no están disponibles en la web pública. (¿Desarrollador? El servidor MCP local o scripts/dev-local.sh sí los tienen — ver /docs/api.)";

export function formatApiErrorForUi(err: unknown): string {
  if (!apisPublishedForBrowser()) return APIS_NOT_PUBLISHED_MESSAGE;
  if (err instanceof AppUnavailableError) {
    if (err.kind === "snapshot_miss") {
      return "Esta consulta específica no forma parte del corte semanal publicado.";
    }
    if (err.kind === "network" || err.kind === "timeout") {
      return "api.rastro.pe no responde. Los datos en vivo están disponibles via MCP local (ver /docs/api).";
    }
    const label = APP_CATALOG[err.appKey]?.label ?? err.appKey;
    if (import.meta.env.PROD) {
      return `${label} no disponible (${err.kind}).`;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
