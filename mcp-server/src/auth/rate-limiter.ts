import { pool } from "../db/pool.js";
import type { Env } from "../env.js";

export type RateLimitResult = { allowed: true } | { allowed: false; reason: "BUDGET_EXCEEDED" };

/**
 * Chequea presupuesto e incrementa `queries_used` atómicamente en una sola
 * sentencia (evita condición de carrera entre "leer contador" y "escribir
 * contador" si dos llamadas del mismo código llegan casi al mismo tiempo).
 * Solo cuenta contra el presupuesto las llamadas reales a `rastro_llamar`
 * (las que golpean una API real) — no la búsqueda local en el catálogo.
 *
 * Si se provee `env` con MCP_DB (Worker), usa D1 directamente. Si no, usa
 * pg Pool (stdio/local con MCP_API_DATABASE_URL).
 */
export async function consumeQuery(
  keyId: number,
  env?: Env | Record<string, unknown>
): Promise<RateLimitResult> {
  if (env && typeof env === "object" && "MCP_DB" in env && env.MCP_DB) {
    const db = (env as Env).MCP_DB as import("@cloudflare/workers-types").D1Database;
    const stmt = db.prepare(
      `UPDATE mcp_api_keys
         SET queries_used = queries_used + 1
       WHERE id = ? AND is_active = true AND queries_used < query_limit
       RETURNING queries_used`
    );
    const result = await stmt.bind(keyId).all();
    if (result.success && result.results && result.results.length > 0) return { allowed: true };
    return { allowed: false, reason: "BUDGET_EXCEEDED" };
  }

  const { rows } = await pool.query<{ queries_used: number }>(
    `UPDATE mcp_api_keys
       SET queries_used = queries_used + 1
     WHERE id = $1 AND is_active = true AND queries_used < query_limit
     RETURNING queries_used`,
    [keyId]
  );
  if (rows.length === 0) return { allowed: false, reason: "BUDGET_EXCEEDED" };
  return { allowed: true };
}

export async function logUsage(
  input: { keyId: number; toolName: string; success: boolean; errorMessage?: string },
  env?: Env | Record<string, unknown>
): Promise<void> {
  const values = [input.keyId, input.toolName, input.success, input.errorMessage ?? null];

  if (env && typeof env === "object" && "MCP_DB" in env && env.MCP_DB) {
    const db = (env as Env).MCP_DB as import("@cloudflare/workers-types").D1Database;
    await db
      .prepare(
        `INSERT INTO mcp_usage_log (key_id, tool_name, success, error_message) VALUES (?, ?, ?, ?)`
      )
      .bind(...values)
      .run();
    return;
  }

  await pool.query(
    `INSERT INTO mcp_usage_log (key_id, tool_name, success, error_message) VALUES ($1, $2, $3, $4)`,
    values
  );
}
