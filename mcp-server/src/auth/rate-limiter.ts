import { pool } from "../db/pool.js";
import { getMcpPool, type NeonEnv } from "../db/neon-env.js";
import type { Env } from "../env.js";

export type RateLimitResult = { allowed: true } | { allowed: false; reason: "BUDGET_EXCEEDED" };

/**
 * Chequea presupuesto e incrementa `queries_used` atómicamente en una sola
 * sentencia (evita condición de carrera entre "leer contador" y "escribir
 * contador" si dos llamadas del mismo código llegan casi al mismo tiempo).
 * Solo cuenta contra el presupuesto las llamadas reales a `rastro_llamar`
 * (las que golpean una base real) — no la búsqueda local en el catálogo.
 *
 * Con `env.NEON_DATABASE_URL` usa Neon; sin él, el pg Pool de siempre
 * (stdio/local). El SQL es idéntico: es Postgres en los dos casos.
 */
export async function consumeQuery(
  keyId: number,
  env?: Env | Record<string, unknown>
): Promise<RateLimitResult> {
  const sql = `UPDATE mcp_api_keys
       SET queries_used = queries_used + 1
     WHERE id = $1 AND is_active = true AND queries_used < query_limit
     RETURNING queries_used`;

  const mcp = getMcpPool((env ?? {}) as NeonEnv);
  if (mcp) {
    const row = await mcp.queryRow<{ queries_used: number }>(sql, [keyId]);
    return row ? { allowed: true } : { allowed: false, reason: "BUDGET_EXCEEDED" };
  }

  const { rows } = await pool.query<{ queries_used: number }>(sql, [keyId]);
  return rows.length === 0 ? { allowed: false, reason: "BUDGET_EXCEEDED" } : { allowed: true };
}

export async function logUsage(
  input: { keyId: number; toolName: string; success: boolean; errorMessage?: string },
  env?: Env | Record<string, unknown>
): Promise<void> {
  const values = [input.keyId, input.toolName, input.success, input.errorMessage ?? null];
  const sql = `INSERT INTO mcp_usage_log (key_id, tool_name, success, error_message) VALUES ($1, $2, $3, $4)`;

  const mcp = getMcpPool((env ?? {}) as NeonEnv);
  if (mcp) {
    await mcp.execute(sql, values);
    return;
  }

  await pool.query(sql, values);
}
