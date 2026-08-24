-- La tabla histórica se llama `municipalities`, pero el buscador departamental
-- también devuelve gobiernos regionales y otras entidades. El tipo permite
-- conservar el universo fuente sin mezclarlas en análisis municipales.
ALTER TABLE municipalities
  ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'UNKNOWN';

CREATE INDEX IF NOT EXISTS idx_municipalities_entity_type
  ON municipalities(department, entity_type);
