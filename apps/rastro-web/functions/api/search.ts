/**
 * GET /api/search?q=... (AL3-11) — Cloudflare Pages Function.
 *
 * Corre server-side (edge de Cloudflare), a diferencia del resto de
 * rastro-web que llama a las 14 APIs directo desde el navegador. Es
 * deliberado: es la única forma de aplicar el rate limit real de AL3-17
 * (ver functions/lib/rate-limit.ts) — Cloudflare Pages solo puede limitar
 * tráfico que pasa por su propio origen.
 *
 * Fuentes reales consultadas (no las 3 "ideales" del ticket original —
 * ninguna de las 3 APIs backend ofrece búsqueda de texto libre real salvo
 * identidad-fiscal; documentado inline por fuente):
 *
 * 1. identidad-fiscal `/api/contribuyentes` — búsqueda real por
 *    `razonSocial` (ILIKE server-side) o exacta por RUC. Única fuente con
 *    soporte de texto libre genuino.
 * 2. radar-inversiones `/api/investments` — NO soporta filtro de texto en
 *    `nombre` (solo filtros exactos: departamento/estado/situacion/funcion).
 *    Se trae la página de LA LIBERTAD (único departamento en alcance vigente
 *    del proyecto, ver BACKLOG_Rastro_Capa_Lectura) y se filtra por
 *    substring acá mismo, en el edge — no en el navegador ni en el backend.
 * 3. infobras `/api/public-works` — mismo caso: sin filtro de texto en
 *    `descripcion`/`nombreObra`. Sin `departamento`, el endpoint no pagina
 *    (devolvería el país completo) — se acota a LA LIBERTAD por lo mismo
 *    que radar-inversiones.
 *
 * Si `q` es un RUC de 11 dígitos, identidad-fiscal usa la ruta exacta
 * `/api/contribuyentes/{ruc}` en vez de la búsqueda por texto.
 */

const TIMEOUT_MS = 4000;
const MIN_QUERY_LENGTH = 3;
const SEARCH_DEPARTAMENTO = "LA LIBERTAD";
const RATE_LIMIT_PER_MINUTE = 30;

import { checkRateLimit, clientIp, recordRateLimitExceeded } from "../lib/rate-limit.js";

type SearchResultado = {
  tipo: "inversion" | "ruc" | "obra";
  identificador: string;
  descripcion: string;
  puntaje: number;
  fuente: string;
};

function score(q: string, text: string): number {
  const qn = q.trim().toUpperCase();
  const tn = text.toUpperCase();
  if (tn === qn) return 100;
  if (tn.startsWith(qn)) return 80;
  if (tn.includes(qn)) return 50;
  return 0;
}

async function fetchWithTimeout(url: string, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function searchContribuyentes(baseUrl: string | undefined, q: string): Promise<{ items: SearchResultado[]; disponible: boolean }> {
  if (!baseUrl) return { items: [], disponible: false };
  try {
    const isRuc = /^\d{11}$/.test(q);
    const url = isRuc
      ? `${baseUrl}/api/contribuyentes/${encodeURIComponent(q)}`
      : `${baseUrl}/api/contribuyentes?razonSocial=${encodeURIComponent(q)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { items: [], disponible: res.status !== 404 };
    const body = (await res.json()) as
      | { ruc: string; razonSocial: string }
      | { resultados: { ruc: string; razonSocial: string }[] };
    const rows = "resultados" in body ? body.resultados : [body];
    return {
      disponible: true,
      items: rows.map((r) => ({
        tipo: "ruc" as const,
        identificador: r.ruc,
        descripcion: r.razonSocial,
        puntaje: isRuc ? 100 : score(q, r.razonSocial),
        fuente: "identidad-fiscal / contribuyentes",
      })),
    };
  } catch {
    return { items: [], disponible: false };
  }
}

async function searchInvestments(baseUrl: string | undefined, q: string): Promise<{ items: SearchResultado[]; disponible: boolean }> {
  if (!baseUrl) return { items: [], disponible: false };
  try {
    const url = `${baseUrl}/api/investments?departamento=${encodeURIComponent(SEARCH_DEPARTAMENTO)}&limit=2000`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { items: [], disponible: false };
    const body = (await res.json()) as { resultados: { cui: string; nombre: string }[] };
    return {
      disponible: true,
      items: body.resultados
        .map((r) => ({ tipo: "inversion" as const, identificador: r.cui, descripcion: r.nombre, puntaje: score(q, r.nombre), fuente: "radar-inversiones / investments" }))
        .filter((r) => r.puntaje > 0),
    };
  } catch {
    return { items: [], disponible: false };
  }
}

async function searchPublicWorks(baseUrl: string | undefined, q: string): Promise<{ items: SearchResultado[]; disponible: boolean }> {
  if (!baseUrl) return { items: [], disponible: false };
  try {
    const url = `${baseUrl}/api/public-works?departamento=${encodeURIComponent(SEARCH_DEPARTAMENTO)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { items: [], disponible: false };
    const body = (await res.json()) as { resultados: { codigoInfobras: string; nombreObra: string }[] };
    return {
      disponible: true,
      items: body.resultados
        .map((r) => ({ tipo: "obra" as const, identificador: r.codigoInfobras, descripcion: r.nombreObra, puntaje: score(q, r.nombreObra), fuente: "infobras / public-works" }))
        .filter((r) => r.puntaje > 0),
    };
  } catch {
    return { items: [], disponible: false };
  }
}

export const onRequestGet: PagesFunctionHandler = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (q.length < MIN_QUERY_LENGTH) {
    return Response.json({ error: `q debe tener al menos ${MIN_QUERY_LENGTH} caracteres.` }, { status: 400 });
  }

  const ip = clientIp(request);
  const rate = await checkRateLimit(env.RATE_LIMIT, "search", ip, RATE_LIMIT_PER_MINUTE);
  if (!rate.allowed) {
    context.waitUntil(recordRateLimitExceeded(env.RATE_LIMIT));
    return Response.json(
      { error: "Demasiadas búsquedas. Intenta de nuevo en unos segundos." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const env2 = env as unknown as Record<string, string | undefined>;
  const [contribuyentes, investments, publicWorks] = await Promise.all([
    searchContribuyentes(env2.VITE_API_BASE_URL_IDENTIDAD_FISCAL, q),
    searchInvestments(env2.VITE_API_BASE_URL_RADAR_INVERSIONES, q),
    searchPublicWorks(env2.VITE_API_BASE_URL_INFOBRAS, q),
  ]);

  const resultados = [...contribuyentes.items, ...investments.items, ...publicWorks.items].sort(
    (a, b) => b.puntaje - a.puntaje,
  );

  const fuentesNoDisponibles: string[] = [];
  if (!contribuyentes.disponible) fuentesNoDisponibles.push("identidad-fiscal");
  if (!investments.disponible) fuentesNoDisponibles.push("radar-inversiones");
  if (!publicWorks.disponible) fuentesNoDisponibles.push("infobras");

  return Response.json({
    q,
    departamentoAlcance: SEARCH_DEPARTAMENTO,
    resultados,
    fuentesNoDisponibles: fuentesNoDisponibles.map((f) => `fuente ${f} no disponible en este momento`),
    limitacion:
      "Solo identidad-fiscal soporta búsqueda de texto libre real. radar-inversiones e infobras se filtran en el borde (edge), acotados a LA LIBERTAD.",
  });
};
