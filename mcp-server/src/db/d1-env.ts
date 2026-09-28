import type { D1Database } from "@cloudflare/workers-types";
import { D1Pool } from "./d1-pool.js";

export interface D1Env {
  MCP_DB: D1Database;
  [key: string]: D1Database | unknown;
}

/**
 * Obtiene el D1Pool para una app a partir del env del Worker.
 * Usa el nombre del binding D1 declarado en wrangler.toml.
 */
export function getD1PoolForApp(env: D1Env, app: string): D1Pool | null {
  const binding = `DB_${app.toUpperCase().replace(/-/g, "_")}`;
  const db = env[binding] as D1Database | undefined;
  if (!db) return null;
  return new D1Pool(db);
}
