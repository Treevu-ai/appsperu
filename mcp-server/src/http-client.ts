const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class McpHttpError extends Error {
  constructor(public readonly kind: "timeout" | "network", message: string) {
    super(message);
    this.name = "McpHttpError";
  }
}

/**
 * Construye la URL final combinando `baseUrl` + `path` + query params no
 * vacíos. `undefined` se omite (no se manda `campo=undefined`); el resto se
 * manda tal cual, ya validado por el zod schema de cada tool antes de llegar
 * acá.
 */
export function buildUrl(baseUrl: string, path: string, query: Record<string, string | undefined>): string {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

export interface ApiCallResult {
  status: number;
  body: unknown;
}

/**
 * Hace el GET contra la API real y devuelve status + body ya parseado como
 * JSON, sin lanzar en respuestas 4xx/5xx — esas también son información útil
 * para el agente (ej. 404 "no encontrado en los datos ingeridos" es una
 * respuesta válida del dominio, no una falla del tool). Solo lanza si la
 * request en sí no pudo completarse (app caída, timeout, DNS, etc.) — ese sí
 * es un error de infraestructura que el agente debe distinguir de un 404/400
 * de negocio.
 */
export async function callApi(url: string, options: { timeoutMs?: number } = {}): Promise<ApiCallResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new McpHttpError("timeout", `La API no respondió dentro del tiempo máximo para ${url}.`);
    }
    throw new McpHttpError("network", `No se pudo conectar a ${url}. Verifica que la app esté disponible y consulta docs/ESTADO.md.`);
  } finally {
    clearTimeout(timeout);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await res.json() : await res.text();

  return { status: res.status, body };
}
