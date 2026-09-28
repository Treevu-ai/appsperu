/**
 * `rastro_health` — qué apps del catálogo responden de verdad en este momento.
 *
 * En la arquitectura MCP Worker + D1, no hay Express apps que hacer ping a
 * `/health`. En su lugar, verifica que cada binding D1 existe y responde a
 * un `SELECT 1`. Un binding inexistente o una query que falla indica que la
 * app no está disponible en ese entorno.
 *
 * Esto separa "la DB está caída/no existe" de "no hay datos en la fuente"
 * — el mismo objetivo que el HTTP health check anterior.
 */

import type { AppKey } from "../apps.js";
import { d1BindingFor } from "../apps.js";
import { TOOL_CATALOG } from "../catalog.js";

export interface AppHealth {
  app: AppKey;
  ok: boolean;
  error?: string;
  latencyMs: number;
  /** Tools del catálogo que apuntan a esta app — el costo de que esté caída. */
  tools: number;
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

async function checkApp(app: AppKey, env?: Record<string, unknown>): Promise<AppHealth> {
  const tools = toolsForApp(app);
  const startedAt = Date.now();

  if (!env) {
    return {
      app,
      ok: false,
      latencyMs: Date.now() - startedAt,
      tools,
      error: "Sin env de Worker (modo stdio): no hay bindings D1 disponibles.",
    };
  }

  const binding = d1BindingFor(app);
  const db = env[binding];
  if (!db) {
    return {
      app,
      ok: false,
      latencyMs: Date.now() - startedAt,
      tools,
      error: `Binding D1 '${binding}' no disponible en este Worker.`,
    };
  }

  try {
    const stmt = (db as import("@cloudflare/workers-types").D1Database).prepare("SELECT 1 AS alive");
    const result = await stmt.first();
    const ok = result !== null && result !== undefined;
    return {
      app,
      ok,
      latencyMs: Date.now() - startedAt,
      tools,
      ...(!ok ? { error: "SELECT 1 devolvió null/undefined — la DB está vacía o corrupta." } : {}),
    };
  } catch (err) {
    return {
      app,
      ok: false,
      latencyMs: Date.now() - startedAt,
      tools,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** `map` con techo de concurrencia — evita abrir 38 queries D1 a la vez. */
const CONCURRENCY = 8;

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

export async function runHealthCheck(target?: AppKey, env?: Record<string, unknown>): Promise<HealthReport> {
  const apps = target ? [target] : [...TOOL_CATALOG.map((t) => t.app)];
  const uniqueApps = [...new Set(apps)] as AppKey[];
  const results = await mapWithConcurrency(uniqueApps, CONCURRENCY, (app) => checkApp(app, env));

  const appsOk = results.filter((r) => r.ok).length;
  const toolsOperativos = results.filter((r) => r.ok).reduce((sum, r) => sum + r.tools, 0);
  const toolsSinBackend = results.filter((r) => !r.ok).reduce((sum, r) => sum + r.tools, 0);

  return {
    generadoEn: new Date().toISOString(),
    catalogo: {
      tools: TOOL_CATALOG.length,
      apps: uniqueApps.length,
    },
    resumen: {
      appsOk,
      appsCaidas: results.length - appsOk,
      appsTotales: results.length,
      toolsOperativos,
      toolsSinBackend,
    },
    apps: [...results].sort((a, b) => Number(a.ok) - Number(b.ok) || a.app.localeCompare(b.app)),
  };
}
