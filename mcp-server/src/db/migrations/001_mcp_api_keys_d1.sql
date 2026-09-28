-- Fase 1 (sk-rastro-...): códigos de acceso con presupuesto de queries para
-- grupos controlados (talleres), como capa paralela al MCP server existente.
-- Migrado de Postgres a D1/SQLite. Ver docs/PLAN_MIGRACION_MCP_WORKER.md.

CREATE TABLE IF NOT EXISTS mcp_api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'workshop',
  group_id TEXT,
  workshop_id TEXT,
  query_limit INTEGER NOT NULL CHECK (query_limit > 0),
  queries_used INTEGER NOT NULL DEFAULT 0 CHECK (queries_used >= 0),
  queries_reset_at TEXT,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_group ON mcp_api_keys (group_id);

CREATE TABLE IF NOT EXISTS mcp_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_id INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  called_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mcp_usage_log_key ON mcp_usage_log (key_id, called_at);
