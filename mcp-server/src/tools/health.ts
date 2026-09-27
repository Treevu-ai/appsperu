/**
 * `rastro_health` — qué apps del catálogo responden de verdad en este momento.
 *
 * Existe por un fallo concreto que costó horas descubrir a mano (2026-09-27): en
 * producción el MCP anunciaba 169 tools y **ninguna funcionaba**. Las 38
 * variables `<APP>_API_URL` nunca se setearon en Fly, así que `baseUrlFor` caía
 * al fallback `http://localhost:<puerto>` y cada `rastro_llamar` devolvía
 * "No se pudo conectar a http://localhost:4000/...". El síntoma era
 * indistinguible de "no hay datos en la fuente", que es justo el error más
 * caro: un agente concluiría que el dato no existe cuando el problema era de
 * infraestructura.
 *
 * Este tool separa las dos cosas. Antes de gastar contexto en un
 * `rastro_buscar_tools` + `rastro_llamar`, un cliente puede preguntar qué
 * responde, y sobre todo **cuántos tools del catálogo tienen backend**.
 *
 * Interroga `GET <baseUrl>/health` de cada app (todas lo exponen, ej.
 * `apps/radar-ejecucion/api/src/app.ts:30`). No usa el catálogo para inferir
 * disponibilidad: un tool puede estar registrado y su API caída.
 */

import { APP_KEYS, baseUrlFor, type AppKey } from "../apps.js";
import { TOOL_CATALOG } from "../catalog.js";
import { callApi } from "../http-client.js";

/**
 * 5s, no los 30s de `callApi` por defecto: un health check de 38 apps con
 * timeout largo tarda medio minuto en decir "está todo caído", que es
 * exactamente el caso que más urge saber rápido.
 */
const HEALTH_TIMEOUT_MS = 5_000;

/**
 * No se disparan las 38 requests a la vez. Un `Promise.all` sobre 38 apps
 * abre 38 sockets contra un Postgres/API que puede estar levantando, y en uso
 * local (38 APIs Node en la misma máquina) eso se traduce en timeouts
 * espurios: reportaría apps "caídas" que en realidad solo estaban saturadas.
 */
const CONCURRENCY = 8;

export interface AppHealth {
  app: AppKey;
  url: string;
  ok: boolean;
  status: number | null;
  latencyMs: number;
  /** Tools del catálogo que apuntan a esta app — el costo de que esté caída. */
  tools: number;
  error?: string;
}

export interface HealthReport {
  generadoEn: string;
  catalogo: {
    tools: number;
    apps: number;
  };
  resumen: {
    appsOk: number;
    appsCaidas: number;
    appsTotales: number;
    toolsOperativos: number;
    toolsSinBackend: number;
  };
  apps: AppHealth[];
}

function toolsForApp(app: AppKey): number {
  return TOOL_CATALOG.filter((tool) => tool.app === app).length;
}

async function checkApp(app: AppKey): Promise<AppHealth> {
  const url = `${baseUrlFor(app).replace(/\/+$/, "")}/health`;
  const tools = toolsForApp(app);
  const startedAt = Date.now();

  try {
    const { status } = await callApi(url, { timeoutMs: HEALTH_TIMEOUT_MS });
    return {
      app,
      url,
      // /health responde 200 con {"status":"ok"}. Cualquier otro status
      // significa que algo está delante (proxy, gateway) contestando por la
      // app: se marca caída con el status para que el diagnóstico diga algo.
      ok: status === 200,
      status,
      latencyMs: Date.now() - startedAt,
      tools,
      ...(status === 200 ? {} : { error: `/health respondió ${status}, se esperaba 200.` }),
    };
  } catch (err) {
    return {
      app,
      url,
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      tools,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** `map` con techo de concurrencia — ver la nota de `CONCURRENCY`. */
async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runHealthCheck(target?: AppKey): Promise<HealthReport> {
  const apps = target ? [target] : [...APP_KEYS];
  const results = await mapWithConcurrency(apps, CONCURRENCY, checkApp);

  const appsOk = results.filter((r) => r.ok).length;
  const toolsOperativos = results.filter((r) => r.ok).reduce((sum, r) => sum + r.tools, 0);
  const toolsSinBackend = results.filter((r) => !r.ok).reduce((sum, r) => sum + r.tools, 0);

  return {
    generadoEn: new Date().toISOString(),
    catalogo: {
      tools: TOOL_CATALOG.length,
      apps: APP_KEYS.length,
    },
    resumen: {
      appsOk,
      appsCaidas: results.length - appsOk,
      appsTotales: results.length,
      toolsOperativos,
      toolsSinBackend,
    },
    // Las caídas primero: si el objetivo es diagnosticar, el primer item de
    // la lista es lo que hay que arreglar.
    apps: [...results].sort((a, b) => Number(a.ok) - Number(b.ok) || a.app.localeCompare(b.app)),
  };
}
