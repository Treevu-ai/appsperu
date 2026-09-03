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

/**
 * Único origin al que es seguro adjuntar el Service Token de Cloudflare
 * Access. Si `VITE_API_BASE_URL_*` alguna vez apuntara a otro host (typo,
 * ambiente mal configurado, o una respuesta 3xx que el runtime siguiera
 * automáticamente hacia otro origin), los headers `CF-Access-Client-*` NO
 * deben viajar ahí — son credenciales, no datos de request genéricos.
 * `fetch()` en el runtime de Pages Functions sigue redirects por defecto
 * (`redirect: "follow"`), así que la validación de origin por sí sola no
 * cubre una redirección post-conexión; por eso además se fuerza
 * `redirect: "manual"` en `fetchWithTimeout` cuando hay Access headers de
 * por medio — cualquier 3xx se trata como fallo (cae al índice bundleado)
 * en vez de reenviar credenciales a un destino no verificado.
 */
const ACCESS_PROTECTED_ORIGIN = "https://api.rastro.pe";

import { checkRateLimit, clientIp, recordRateLimitExceeded } from "../lib/rate-limit.js";
import searchIndex from "../../src/data/search-index.json" with { type: "json" };

type SearchResultado = {
  tipo: "inversion" | "ruc" | "obra";
  identificador: string;
  descripcion: string;
  puntaje: number;
  fuente: string;
};

/**
 * Corte semanal (ver export-snapshot.mjs): cuando una de las 3 fuentes en
 * vivo no responde, en vez de devolver 0 resultados para esa fuente se
 * busca en el índice bundleado (mismo formato, misma lógica de score que
 * el resto de este archivo). Cubre el universo de proveedores/obras/
 * inversiones ya conocido por Rastro — no el padrón completo de SUNAT.
 */
type SearchIndexItem = { tipo: SearchResultado["tipo"]; identificador: string; descripcion: string; fuente: string };

function searchIndexOffline(tipo: SearchResultado["tipo"], q: string): SearchResultado[] {
  const isRuc = tipo === "ruc" && /^\d{11}$/.test(q);
  const items = searchIndex.items as SearchIndexItem[];
  return items
    .filter((item) => item.tipo === tipo)
    .map((item) => ({
      ...item,
      puntaje: isRuc ? (item.identificador === q ? 100 : 0) : score(q, item.descripcion),
    }))
    .filter((item) => item.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje);
}

function score(q: string, text: string): number {
  const qn = q.trim().toUpperCase();
  const tn = text.toUpperCase();
  if (tn === qn) return 100;
  if (tn.startsWith(qn)) return 80;
  if (tn.includes(qn)) return 50;
  return 0;
}

/**
 * Trae `url` con timeout y, si hay Access headers, valida que el origin sea
 * exactamente `ACCESS_PROTECTED_ORIGIN` antes de adjuntarlos — nunca manda
 * credenciales a un host que no sea ese, y fuerza `redirect: "manual"` en
 * ese caso para que un 3xx no las reenvíe a otro destino sin verificar.
 *
 * El `AbortController` se mantiene vivo hasta `done()`, que el llamador
 * invoca recién después de leer el body — si se limpiara apenas `fetch()`
 * resuelve (como en la versión anterior), una lectura de body colgada
 * podría superar `timeoutMs` sin abortar.
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs = TIMEOUT_MS,
  extraHeaders: Record<string, string> = {},
): Promise<{ response: Response; done: () => void }> {
  const hasAccessHeaders = Object.keys(extraHeaders).length > 0;
  if (hasAccessHeaders && !url.startsWith(`${ACCESS_PROTECTED_ORIGIN}/`)) {
    throw new Error(`Rechazado: no se envían credenciales de Access a un origin distinto de ${ACCESS_PROTECTED_ORIGIN}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(url, {
    headers: { Accept: "application/json", ...extraHeaders },
    signal: controller.signal,
    ...(hasAccessHeaders ? { redirect: "manual" as const } : {}),
  });
  return { response, done: () => clearTimeout(timer) };
}

/**
 * Construye los headers de Cloudflare Access (Service Token) que la Function
 * envía a las 3 APIs de origen (`identidad-fiscal`, `radar-inversiones`,
 * `infobras`). Vacío si no hay tokens configurados — la Function sigue
 * funcionando en local contra `localhost` sin Access en el camino, y en
 * producción si por alguna razón faltaran, Cloudflare Access devolverá 403
 * y la Function caerá al fallback del `search-index` bundleado (mismo
 * comportamiento que hoy cuando la API está caída).
 *
 * Razonamiento: NO fallamos "fuerte" si faltan los tokens en producción.
 * El snapshot semanal cubre la búsqueda aunque las APIs en vivo no
 * respondan. Romper la búsqueda por un secret faltante es peor UX que
 * degradar al corte bundleado — el usuario sigue obteniendo resultados,
 * solo del corte en vez de en vivo.
 */
function cfAccessHeaders(env: PagesEnv): Record<string, string> {
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    return {
      "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID,
      "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET,
    };
  }
  return {};
}

type SourceResult = { items: SearchResultado[]; disponible: boolean; usedIndex: boolean };

async function searchContribuyentes(
  baseUrl: string | undefined,
  q: string,
  accessHeaders: Record<string, string>,
): Promise<SourceResult> {
  if (baseUrl) {
    try {
      const isRuc = /^\d{11}$/.test(q);
      const url = isRuc
        ? `${baseUrl}/api/contribuyentes/${encodeURIComponent(q)}`
        : `${baseUrl}/api/contribuyentes?razonSocial=${encodeURIComponent(q)}`;
      const { response: res, done } = await fetchWithTimeout(url, TIMEOUT_MS, accessHeaders);
      try {
        if (res.ok) {
          const body = (await res.json()) as
            | { ruc: string; razonSocial: string }
            | { resultados: { ruc: string; razonSocial: string }[] };
          const rows = "resultados" in body ? body.resultados : [body];
          return {
            disponible: true,
            usedIndex: false,
            items: rows.map((r) => ({
              tipo: "ruc" as const,
              identificador: r.ruc,
              descripcion: r.razonSocial,
              puntaje: isRuc ? 100 : score(q, r.razonSocial),
              fuente: "identidad-fiscal / contribuyentes",
            })),
          };
        }
        if (res.status === 404) return { items: [], disponible: true, usedIndex: false };
      } finally {
        done();
      }
    } catch {
      // sigue al fallback del corte semanal
    }
  }
  return { items: searchIndexOffline("ruc", q), disponible: false, usedIndex: true };
}

async function searchInvestments(
  baseUrl: string | undefined,
  q: string,
  accessHeaders: Record<string, string>,
): Promise<SourceResult> {
  if (baseUrl) {
    try {
      const url = `${baseUrl}/api/investments?departamento=${encodeURIComponent(SEARCH_DEPARTAMENTO)}&limit=2000`;
      const { response: res, done } = await fetchWithTimeout(url, TIMEOUT_MS, accessHeaders);
      try {
        if (res.ok) {
          const body = (await res.json()) as { resultados: { cui: string; nombre: string }[] };
          return {
            disponible: true,
            usedIndex: false,
            items: body.resultados
              .map((r) => ({ tipo: "inversion" as const, identificador: r.cui, descripcion: r.nombre, puntaje: score(q, r.nombre), fuente: "radar-inversiones / investments" }))
              .filter((r) => r.puntaje > 0),
          };
        }
      } finally {
        done();
      }
    } catch {
      // sigue al fallback del corte semanal
    }
  }
  return { items: searchIndexOffline("inversion", q), disponible: false, usedIndex: true };
}

async function searchPublicWorks(
  baseUrl: string | undefined,
  q: string,
  accessHeaders: Record<string, string>,
): Promise<SourceResult> {
  if (baseUrl) {
    try {
      const url = `${baseUrl}/api/public-works?departamento=${encodeURIComponent(SEARCH_DEPARTAMENTO)}`;
      const { response: res, done } = await fetchWithTimeout(url, TIMEOUT_MS, accessHeaders);
      try {
        if (res.ok) {
          const body = (await res.json()) as { resultados: { codigoInfobras: string; nombreObra: string }[] };
          return {
            disponible: true,
            usedIndex: false,
            items: body.resultados
              .map((r) => ({ tipo: "obra" as const, identificador: r.codigoInfobras, descripcion: r.nombreObra, puntaje: score(q, r.nombreObra), fuente: "infobras / public-works" }))
              .filter((r) => r.puntaje > 0),
          };
        }
      } finally {
        done();
      }
    } catch {
      // sigue al fallback del corte semanal
    }
  }
  return { items: searchIndexOffline("obra", q), disponible: false, usedIndex: true };
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
  const accessHeaders = cfAccessHeaders(env);
  const [contribuyentes, investments, publicWorks] = await Promise.all([
    searchContribuyentes(env2.VITE_API_BASE_URL_IDENTIDAD_FISCAL, q, accessHeaders),
    searchInvestments(env2.VITE_API_BASE_URL_RADAR_INVERSIONES, q, accessHeaders),
    searchPublicWorks(env2.VITE_API_BASE_URL_INFOBRAS, q, accessHeaders),
  ]);

  const resultados = [...contribuyentes.items, ...investments.items, ...publicWorks.items].sort(
    (a, b) => b.puntaje - a.puntaje,
  );

  // "no disponible" es solo cuando no hay datos en vivo NI en el corte
  // semanal. Si se usó el índice bundleado, hay resultados (aunque puedan
  // ser 0 para esta búsqueda puntual) — eso se refleja en corteUsado, no acá.
  const fuentesNoDisponibles: string[] = [];
  if (!contribuyentes.disponible && !contribuyentes.usedIndex) fuentesNoDisponibles.push("identidad-fiscal");
  if (!investments.disponible && !investments.usedIndex) fuentesNoDisponibles.push("radar-inversiones");
  if (!publicWorks.disponible && !publicWorks.usedIndex) fuentesNoDisponibles.push("infobras");

  const usedIndex = contribuyentes.usedIndex || investments.usedIndex || publicWorks.usedIndex;
  const corteUsado = usedIndex ? searchIndex.corte : null;

  return Response.json({
    q,
    departamentoAlcance: SEARCH_DEPARTAMENTO,
    resultados,
    corteUsado,
    fuentesNoDisponibles: fuentesNoDisponibles.map((f) => `fuente ${f} no disponible en este momento`),
    limitacion:
      "Solo identidad-fiscal soporta búsqueda de texto libre real. radar-inversiones e infobras se filtran en el borde (edge), acotados a LA LIBERTAD.",
  });
};
