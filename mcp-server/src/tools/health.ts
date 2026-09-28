/**
 * `rastro_health` — qué apps del catálogo responden de verdad en este momento.
 *
 * En la arquitectura MCP Worker + Neon no hay Express apps que hacer ping a
 * `/health`. En su lugar, abre una conexión a la base de cada app y ejecuta
 * `SELECT 1`. Una app sin base todavía provisionada, o con la base caída,
 * aparece como no operativa.
 *
 * Esto separa "la base no existe o está caída" de "no hay datos en la fuente"
 * — el mismo objetivo que el HTTP health check anterior.
 */

import type { AppKey } from "../apps.js";
import { APP_KEYS } from "../apps.js";
import { getPoolForApp, databaseNameFor, type NeonEnv } from "../db/neon-env.js";
import { TOOL_CATALOG } from "../catalog.js";

/**
 * Apps cuya base se pospone a la segunda fase de la migración: ambas dependen
 * de PostGIS, que tampoco existe en la alternativa que se descartó, pero cuya
 *anucia de datos no se quiere reportar como caída.
 */
export const DEFERRED_APPS: readonly AppKey[] = ["geo-intersections", "ceplan-geo"];

export type AppStatus = "ok" | "sin_base" | "caida" | "diferida";

export interface AppHealth {
  app: AppKey;
  status: AppStatus;
  latencyMs: number;
  /** Tools del catálogo que apuntan a esta app — el costo de que esté caída. */
  tools: number;
  base?: string;
  error?: string;
}

export interface HealthReport {
  generadoEn: string;
  catalogo: { tools: number; apps: number };
  resumen: {
    ok: number;
    sinBase: number;
    caidas: number;
    diferidas: number;
    toolsOperativos: number;
    toolsSinBackend: number;
  };
  apps: AppHealth[];
}

function toolsForApp(app: AppKey): number {
  return TOOL_CATALOG.filter((tool) => tool.app === app).length;
}

async function checkApp(app: AppKey, env: NeonEnv | undefined): Promise<AppHealth> {
  const tools = toolsForApp(app);
  const startedAt = Date.now();

  if (DEFERRED_APPS.includes(app)) {
    return {
      app,
      status: "diferida",
      latencyMs: 0,
      tools,
      error: "Postposición a la segunda fase de la migración (requiere PostGIS).",
    };
  }

  if (!env?.NEON_DATABASE_URL) {
    return {
      app,
      status: "sin_base",
      latencyMs: 0,
      tools,
      error: "Sin NEON_DATABASE_URL en el entorno (modo stdio, o secret sin configurar).",
    };
  }

  const db = getPoolForApp(env, app);
  if (!db) {
    return { app, status: "sin_base", latencyMs: 0, tools, base: databaseNameFor(app) };
  }

  try {
    const row = await db.queryRow<{ alive: number }>("SELECT 1 AS alive");
    const ok = row !== null && row !== undefined;
    return {
      app,
      status: ok ? "ok" : "sin_base",
      latencyMs: Date.now() - startedAt,
      tools,
      base: databaseNameFor(app),
      ...(!ok ? { error: "SELECT 1 no devolvió fila — la base existe pero está vacía o inaccesible." } : {}),
    };
  } catch (err) {
    return {
      app,
      status: "caida",
      latencyMs: Date.now() - startedAt,
      tools,
      base: databaseNameFor(app),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Techo de concurrencia deliberadamente bajo (4, no 8): Workers permite 6
 * conexiones simultáneas por invocación contando las que esperan headers, y
 * cada chequeo abre un WebSocket a Neon. Bajar de 6 evita que el health check
 * se auto-limite y reporte falsos `caida`.
 */
const CONCURRENCY = 4;

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

const RANK: Record<AppStatus, number> = { caida: 0, sin_base: 1, diferida: 2, ok: 3 };

export async function runHealthCheck(target?: AppKey, env?: Record<string, unknown>): Promise<HealthReport> {
  const uniqueApps = target ? [target] : [...new Set(APP_KEYS)] as AppKey[];
  const results = await mapWithConcurrency(uniqueApps, CONCURRENCY, (app) =>
    checkApp(app, env as NeonEnv | undefined)
  );

  const count = (status: AppStatus) => results.filter((r) => r.status === status).length;
  const toolsFor = (status: AppStatus) =>
    results.filter((r) => r.status === status).reduce((sum, r) => sum + r.tools, 0);

  return {
    generadoEn: new Date().toISOString(),
    catalogo: { tools: TOOL_CATALOG.length, apps: uniqueApps.length },
    resumen: {
      ok: count("ok"),
      sinBase: count("sin_base"),
      caidas: count("caida"),
      diferidas: count("diferida"),
      toolsOperativos: toolsFor("ok"),
      toolsSinBackend: toolsFor("caida") + toolsFor("sin_base") + toolsFor("diferida"),
    },
    apps: [...results].sort((a, b) => RANK[a.status] - RANK[b.status] || a.app.localeCompare(b.app)),
  };
}
