-- Mapeo MEF <-> OECE por nombre (no existe ID compartido entre las dos
-- fuentes). Solo se persiste el mapeo + nivel de confianza — los montos
-- (devengado, valor de compras) se consultan en vivo en cada request para
-- no servir cifras desactualizadas.
CREATE TABLE IF NOT EXISTS entity_crosswalk (
  id                BIGSERIAL PRIMARY KEY,
  mef_entity_code   TEXT NOT NULL,
  mef_nombre        TEXT NOT NULL,
  oece_buyer_id     TEXT NOT NULL,
  oece_buyer_name   TEXT NOT NULL,
  confidence        TEXT NOT NULL CHECK (confidence IN ('confirmada', 'candidata')),
  score             NUMERIC(4, 3) NOT NULL,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mef_entity_code, oece_buyer_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_crosswalk_buyer ON entity_crosswalk (oece_buyer_id);
