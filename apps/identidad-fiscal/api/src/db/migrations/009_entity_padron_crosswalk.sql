-- Mapeo MEF (radar-ejecucion) <-> padron RUC por nombre — no existe un ID
-- compartido entre las dos fuentes, asi que el cruce sale del matcher difuso
-- (`@appsperu/entity-matcher`, ADR-0017) y no de una consulta.
--
-- Se precomputa en vez de correr en cada request: el origen
-- (`routes/crossref.ts` -> GET /api/crossref/entidades) acotaba el padron por
-- prefijo UBIGEO (~107k contribuyentes en La Libertad) y aun asi el matcher
-- tardaba segundos en cada llamada. En Cloudflare Workers ese trabajo por
-- request compite por los limites de CPU y memoria (128 MB) del isolate, asi
-- que el handler MCP solo lee esta tabla; el cruce se recalcula con
-- `src/crossref/build-crosswalk.ts`.
--
-- Se persiste el mapeo + nivel de confianza — el estado tributario
-- (`estado_contribuyente`, `condicion_domicilio`) se consulta en vivo en cada
-- request, porque `contribuyentes` se sobrescribe en cada reingesta y servido
-- desde la tabla serviria un estado desactualizado.
CREATE TABLE IF NOT EXISTS entity_padron_crosswalk (
  id               BIGSERIAL PRIMARY KEY,
  mef_entity_code  TEXT NOT NULL,
  mef_nombre       TEXT NOT NULL,
  ruc              TEXT NOT NULL,
  razon_social     TEXT NOT NULL,
  confidence       TEXT NOT NULL CHECK (confidence IN ('confirmada', 'candidata')),
  score            NUMERIC(4, 3) NOT NULL,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mef_entity_code, ruc)
);

CREATE INDEX IF NOT EXISTS idx_entity_padron_crosswalk_ruc ON entity_padron_crosswalk (ruc);
