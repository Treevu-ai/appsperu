-- Sprint 1 (2026-08-17): el único dataset público descargable de ObservaPerú trae los
-- indicadores agregados por serie (nivel de gobierno u otro corte, según el indicador),
-- no por pliego individual — ver docs/data-contracts/ceplan-strategic-planning.md y
-- ADR-0003 para el porqué. strategic_objectives, strategic_actions, poi_activities y
-- physical_targets quedan sin poblar en este sprint (requieren datos per-entidad del
-- Aplicativo CEPLAN V.01, hoy caído) — se conservan tal cual para cuando esa fuente esté
-- disponible.
--
-- La hoja "Observaciones" del Excel agrupa cada indicador por una "Serie ID" (ej. "gn",
-- "gr", "mp", "md", "total", pero también series no territoriales como "vigentes" en
-- PN02) — no todas las series representan nivel de gobierno, así que se guarda la serie
-- cruda (serie_id/serie_label) y, por separado, nivel_gobierno solo cuando el JSON de
-- "Filtros" trae esa clave.
ALTER TABLE strategic_indicators
  ADD COLUMN IF NOT EXISTS serie_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS serie_label VARCHAR(200),
  ADD COLUMN IF NOT EXISTS nivel_gobierno VARCHAR(10),
  ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_strategic_indicators_nivel_gobierno
  ON strategic_indicators(nivel_gobierno);

-- entity_code queda NULL para las filas agregadas de este sprint.
ALTER TABLE strategic_indicators
  ALTER COLUMN entity_code DROP NOT NULL;

-- Necesaria para el upsert idempotente del connector (una fila por indicador + serie +
-- periodo medido).
ALTER TABLE strategic_indicators
  ADD CONSTRAINT strategic_indicators_code_serie_date_key
  UNIQUE (indicator_code, serie_id, measurement_date);
