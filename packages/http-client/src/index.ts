export type HttpFailureKind = "timeout" | "network" | "http" | "invalid_json";

export class HttpRequestError extends Error {
  constructor(public readonly kind: HttpFailureKind, message: string, public readonly status?: number) {
    super(message);
    this.name = "HttpRequestError";
  }
}

function timeoutMs(): number {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const value = Number(env?.NEXT_PUBLIC_HTTP_TIMEOUT_MS ?? 10_000);
  return Number.isFinite(value) && value >= 1_000 && value <= 60_000 ? value : 10_000;
}

export function encodePathSegment(value: string): string {
  try { return encodeURIComponent(decodeURIComponent(value)); } catch { return encodeURIComponent(value); }
}

/** Shared client for local AppsPerú APIs: uncached, bounded and explicit about failures. */
export async function fetchJson<T>(baseUrl: string, path: string, options: { timeout?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout ?? timeoutMs());
  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, { cache: "no-store", signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw new HttpRequestError("timeout", `La API no respondió a tiempo para ${path}.`);
      throw new HttpRequestError("network", `No se pudo conectar a la API para ${path}.`);
    }
    if (!response.ok) throw new HttpRequestError("http", `La API respondió ${response.status} para ${path}.`, response.status);
    try { return await response.json() as T; } catch { throw new HttpRequestError("invalid_json", `La API devolvió una respuesta no JSON para ${path}.`, response.status); }
  } finally {
    clearTimeout(timeout);
  }
}
