-- Fase 1 (sk-rastro-...): códigos de acceso con presupuesto de queries para
-- grupos controlados (talleres), como capa paralela al MCP server existente.
-- No toca ninguna de las 27 apps ni sus bases — vive en su propia DB
-- (MCP_API_DATABASE_URL), separada por diseño.

CREATE TABLE IF NOT EXISTS mcp_api_keys (
  id BIGSERIAL PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE, -- SHA-256 hex del código completo; el código plano nunca se guarda
  key_prefix TEXT NOT NULL, -- primeros caracteres del código (ej. "sk-rastro-a1b2c3") solo para identificar en logs/CLI, no valida nada
  tier TEXT NOT NULL DEFAULT 'workshop',
  group_id TEXT,
  workshop_id TEXT,
  query_limit INTEGER NOT NULL CHECK (query_limit > 0),
  queries_used INTEGER NOT NULL DEFAULT 0 CHECK (queries_used >= 0),
  queries_reset_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_group ON mcp_api_keys (group_id);

CREATE TABLE IF NOT EXISTS mcp_usage_log (
  id BIGSERIAL PRIMARY KEY,
  key_id BIGINT NOT NULL REFERENCES mcp_api_keys (id),
  tool_name TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  called_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_usage_log_key ON mcp_usage_log (key_id, called_at);
