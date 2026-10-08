const BASE_URL = "https://openruc.com/api/ruc";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
/** Sin esto, un openruc.com que acepta la conexión y se queda colgado deja el request de Express ocupado indefinidamente. */
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
 * Enriquecimiento en vivo de un RUC vía openruc.com — proxy gratuito, sin
 * auth, de datos SUNAT. Fallback para cuando el RUC consultado no está en
 * `ficha_ruc` (ficha completa, importada manualmente porque
 * e-consultaruc.sunat.gob.pe está protegida por reCAPTCHA v3 server-side y
 * un intento automatizado dejó el IP de origen temporalmente bloqueado —
 * ver `db/migrations/004_ficha_ruc.sql`). Devuelve mucho menos campo que la
 * ficha completa (sin actividades CIIU ni representantes legales) — es un
 * dato "mejor que nada", no un reemplazo.
 *
 * Devuelve `null` en cualquier fallo (red, RUC inexistente, forma de
 * respuesta inesperada) — nunca lanza, para que el caller pueda caer al 404
 * normal sin romper el request.
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
