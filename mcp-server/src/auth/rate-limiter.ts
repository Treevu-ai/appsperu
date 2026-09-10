import { pool } from "../db/pool.js";

export type RateLimitResult = { allowed: true } | { allowed: false; reason: "BUDGET_EXCEEDED" };

/**
 * Chequea presupuesto e incrementa `queries_used` atómicamente en una sola
 * sentencia (evita condición de carrera entre "leer contador" y "escribir
 * contador" si dos llamadas del mismo código llegan casi al mismo tiempo).
 * Solo cuenta contra el presupuesto las llamadas reales a `rastro_llamar`
 * (las que golpean una API real) — no la búsqueda local en el catálogo.
 */
export async function consumeQuery(keyId: number): Promise<RateLimitResult> {
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

export async function logUsage(input: { keyId: number; toolName: string; success: boolean; errorMessage?: string }): Promise<void> {
  await pool.query(
    `INSERT INTO mcp_usage_log (key_id, tool_name, success, error_message) VALUES ($1, $2, $3, $4)`,
    [input.keyId, input.toolName, input.success, input.errorMessage ?? null]
  );
}
