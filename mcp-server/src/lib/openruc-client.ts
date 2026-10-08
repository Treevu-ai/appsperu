const BASE_URL = "https://openruc.com/api/ruc";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
/** Sin esto, un openruc.com que acepta la conexión y se queda colgado deja la invocación del Worker ocupada indefinidamente. */
const FETCH_TIMEOUT_MS = 5000;

export interface OpenRucResult {
  ruc: string;
  razonSocial: string;
  estado: string | null;
  condicion: string | null;
  direccion: string | null;
  ubigeo: string | null;
  asOf: string | null;
}

interface OpenRucResponse {
  ruc?: string;
  razon_social?: string;
  estado?: string;
  condicion?: string;
  direccion?: string;
  ubigeo?: string;
  as_of?: string;
}

/**
 * Copia local de apps/identidad-fiscal/api/src/lib/openruc-client.ts —
 * mcp-server tiene su propio package-lock.json y no puede importar fuera de
 * `src` (mismo patrón que `db/latest-budget.ts`). En `src/lib/`, no dentro
 * de `handlers/<app>/`, para que `gen-handler-registry.mjs` no la escanee
 * como módulo de handlers (solo excluye el nombre literal `_helpers.ts`,
 * no cualquier archivo con guion bajo). Mantener en sync manualmente si
 * cambia el original.
 */
export async function fetchRucLive(ruc: string): Promise<OpenRucResult | null> {
  try {
    const res = await fetch(`${BASE_URL}/${encodeURIComponent(ruc)}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const body = (await res.json()) as OpenRucResponse;
    if (!body.razon_social) return null;

    return {
      ruc: body.ruc ?? ruc,
      razonSocial: body.razon_social,
      estado: body.estado ?? null,
      condicion: body.condicion ?? null,
      direccion: body.direccion ?? null,
      ubigeo: body.ubigeo ?? null,
      asOf: body.as_of ?? null,
    };
  } catch {
    return null;
  }
}
