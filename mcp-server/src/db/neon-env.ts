import { NeonPool } from "./neon-pool.js";
import { APP_KEYS, type AppKey } from "../apps.js";

/**
 * Entorno del MCP Worker. A diferencia de D1 (que exige un binding por base),
 * Neon expone un único secret porque las 36 bases viven en el mismo proyecto
 * — mismo host, mismo rol, mismo compute. Lo único que cambia entre apps es
 * el nombre de la base, que se deriva del `AppKey`.
 *
 * Secret:  NEON_DATABASE_URL  →  postgresql://USER:PASS@ep-xxx.region.aws.neon.tech/postgres
 * Derivado: postgresql://USER:PASS@ep-xxx.region.aws.neon.tech/radar_ejecucion
 */
export interface NeonEnv {
  NEON_DATABASE_URL?: string;
  [key: string]: unknown;
}

/** Base que hospeda las tablas de auth (`mcp_api_keys`, `mcp_usage_log`), budgets y rate limits. */
export const MCP_DATABASE_NAME = "mcp";

/**
 * Nombre de la base Neon de una app. Es determinista a propósito: una app sin
 * base propia (salud-institucional, territorio-inteligencia) simplemente no
 * tiene entrada, y el resolver devuelve null en vez de inventar una base vacía.
 */
export function databaseNameFor(app: AppKey): string {
  return app.replace(/-/g, "_");
}

/**
 * Reemplaza el nombre de base en una connection string de Neon sin tocar el
 * resto (host, puerto, query params como `sslmode` y `channel_binding`).
 * La forma del path siempre es un único segmento tras el host.
 */
export function withDatabase(baseUrl: string, database: string): string {
  const parsed = new URL(baseUrl);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/** Connection string de una app, o null si falta el secret base. */
export function connectionStringFor(env: NeonEnv, database: string): string | null {
  const base = env.NEON_DATABASE_URL;
  if (typeof base !== "string" || base.length === 0) return null;
  try {
    return withDatabase(base, database);
  } catch {
    return null;
  }
}

/** Pool de una app del catálogo, o null si no hay secret configurado. */
export function getPoolForApp(env: NeonEnv, app: AppKey): NeonPool | null {
  const connectionString = connectionStringFor(env, databaseNameFor(app));
  return connectionString ? new NeonPool(connectionString) : null;
}

/** Pool de la base de auth/budget del propio MCP. */
export function getMcpPool(env: NeonEnv): NeonPool | null {
  const connectionString = connectionStringFor(env, MCP_DATABASE_NAME);
  return connectionString ? new NeonPool(connectionString) : null;
}

/**
 * Apps del catálogo cuya base todavía no existe en Neon.
 * Se completa a medida que se provisiona; hoy está vacía y sirve como checklist.
 */
export function appsPendingProvisioning(env: NeonEnv): AppKey[] {
  return APP_KEYS.filter((app) => connectionStringFor(env, databaseNameFor(app)) === null);
}
