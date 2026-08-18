-- Mapeo radar-ejecucion (MEF) <-> INFOBRAS por nombre de entidad (no existe
-- ID compartido entre las dos fuentes; el cruce por CUI ya existe con
-- radar-inversiones, este es el pendiente por nombre con radar-ejecucion).
-- Mismo patrón que `entity_crosswalk` en compras-publicas: solo se persiste
-- el mapeo + confianza, los montos/indicadores se consultan en vivo.
CREATE TABLE IF NOT EXISTS entity_crosswalk (
  id                       BIGSERIAL PRIMARY KEY,
  ejecucion_entity_code    TEXT NOT NULL,
  ejecucion_nombre         TEXT NOT NULL,
  infobras_codigo_entidad  TEXT NOT NULL,
  infobras_entidad_nombre  TEXT NOT NULL,
  confidence               TEXT NOT NULL CHECK (confidence IN ('confirmada', 'candidata')),
  score                    NUMERIC(4, 3) NOT NULL,
  computed_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ejecucion_entity_code, infobras_codigo_entidad)
);

CREATE INDEX IF NOT EXISTS idx_entity_crosswalk_infobras_entidad ON entity_crosswalk (infobras_codigo_entidad);
