import { APP_CATALOG, AppUnavailableError, type AppKey } from "./types.js";

function baseUrlFor(appKey: AppKey): string {
  const envKey = APP_CATALOG[appKey].envKey;
  return String(import.meta.env[envKey as keyof ImportMetaEnv] ?? "");
}

/** True cuando el navegador puede llamar a las APIs (no es build prod con localhost). */
export function apisPublishedForBrowser(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return true;
  return !(Object.keys(APP_CATALOG) as AppKey[]).some((key) =>
    /localhost|127\.0\.0\.1/.test(baseUrlFor(key)),
  );
}

export const APIS_NOT_PUBLISHED_MESSAGE =
  "Las 14 APIs aún no tienen URL pública. Este deploy usa localhost en el build; configura VITE_API_BASE_URL_* en Cloudflare Pages para datos en vivo.";

export function formatApiErrorForUi(err: unknown): string {
  if (!apisPublishedForBrowser()) return APIS_NOT_PUBLISHED_MESSAGE;
  if (err instanceof AppUnavailableError) {
    const label = APP_CATALOG[err.appKey]?.label ?? err.appKey;
    if (import.meta.env.PROD) {
      return `${label} no disponible (${err.kind}).`;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
