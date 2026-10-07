-- 008_community_coverage.sql
-- Cobertura REAL de minero/forestal por comunidad -- una fila por comunidad, no por par.
--
-- Por qué una tabla separada de community_mining_intersections/community_forest_intersections
-- (migración 006): sumar `community_overlap_pct` entre las filas de esas tablas para una
-- misma comunidad SOBRESTIMA cuando dos derechos mineros/títulos distintos se solapan entre
-- sí sobre el mismo terreno (confirmado en vivo 2026-10-06: casos reales de 131-175% al sumar
-- ingenuamente). La cobertura real exige ST_Union de todas las geometrías que intersectan
-- ANTES de medir el área contra la comunidad, no la suma de intersecciones individuales.

CREATE TABLE IF NOT EXISTS community_mining_coverage (
  id BIGSERIAL PRIMARY KEY,
  community_capa TEXT NOT NULL,
  community_objectid INTEGER NOT NULL,
  community_nombre TEXT,
  community_departamento TEXT,
  community_provincia TEXT,
  community_distrito TEXT,
  community_area_km2 NUMERIC,
  area_cubierta_km2 DOUBLE PRECISION NOT NULL,
  pct_cobertura DOUBLE PRECISION NOT NULL,
  num_derechos INTEGER NOT NULL,
  batch_id BIGINT REFERENCES raw_community_intersection_batches(id),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_capa, community_objectid)
);

CREATE INDEX IF NOT EXISTS idx_cmc_departamento ON community_mining_coverage (community_departamento);
CREATE INDEX IF NOT EXISTS idx_cmc_pct ON community_mining_coverage (pct_cobertura);
CREATE INDEX IF NOT EXISTS idx_cmc_batch ON community_mining_coverage (batch_id);

CREATE TABLE IF NOT EXISTS community_forest_coverage (
  id BIGSERIAL PRIMARY KEY,
  community_capa TEXT NOT NULL,
  community_objectid INTEGER NOT NULL,
  community_nombre TEXT,
  community_departamento TEXT,
  community_provincia TEXT,
  community_distrito TEXT,
  community_area_km2 NUMERIC,
  area_cubierta_km2 DOUBLE PRECISION NOT NULL,
  pct_cobertura DOUBLE PRECISION NOT NULL,
  num_titulos INTEGER NOT NULL,
  batch_id BIGINT REFERENCES raw_community_intersection_batches(id),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_capa, community_objectid)
);

CREATE INDEX IF NOT EXISTS idx_cfc_departamento ON community_forest_coverage (community_departamento);
CREATE INDEX IF NOT EXISTS idx_cfc_pct ON community_forest_coverage (pct_cobertura);
CREATE INDEX IF NOT EXISTS idx_cfc_batch ON community_forest_coverage (batch_id);
