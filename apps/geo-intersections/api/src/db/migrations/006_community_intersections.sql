-- 006_community_intersections.sql
-- Cruce geoespacial: rural_communities ∩ mining_rights y rural_communities ∩ forest_titles.
-- Mismo patrón que intersection_results (migración 001) / geometry_valid (migración 004).

-- geometry_valid para rural_communities: repara geometrías inválidas UNA SOLA VEZ
-- (confirmado en vivo: 25/4,492 fallan ST_IsValid) y evita el costo de ST_MakeValid
-- en cada JOIN de intersección.
ALTER TABLE rural_communities ADD COLUMN IF NOT EXISTS geometry_valid GEOMETRY;
CREATE INDEX IF NOT EXISTS idx_rural_communities_valid_geom ON rural_communities USING GIST (geometry_valid);
UPDATE rural_communities SET geometry_valid = ST_MakeValid(geometry) WHERE geometry_valid IS NULL;

-- Batches compartidos, discriminados por tipo (una corrida de ingest hace los dos pases)
CREATE TABLE IF NOT EXISTS raw_community_intersection_batches (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL, -- 'minero' o 'forestal'
  record_count INTEGER NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Comunidades ∩ derechos mineros titulados ──────────────────────────────────
CREATE TABLE IF NOT EXISTS community_mining_intersections (
  id BIGSERIAL PRIMARY KEY,
  community_capa TEXT NOT NULL,
  community_objectid INTEGER NOT NULL,
  community_nombre TEXT,
  community_departamento TEXT,
  community_provincia TEXT,
  community_area_km2 NUMERIC,
  mining_codigou TEXT NOT NULL,
  mining_concesion TEXT,
  mining_titular TEXT,
  mining_estado TEXT,
  mining_sustancia TEXT,
  mining_area_km2 DOUBLE PRECISION,
  intersection_geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
  intersection_area_km2 DOUBLE PRECISION NOT NULL,
  -- Superficie superpuesta en km² / área de la comunidad × 100
  community_overlap_pct DOUBLE PRECISION,
  -- Superficie superpuesta en km² / área del derecho minero × 100
  mining_overlap_pct DOUBLE PRECISION,
  batch_id BIGINT REFERENCES raw_community_intersection_batches(id),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmi_community ON community_mining_intersections (community_capa, community_objectid);
CREATE INDEX IF NOT EXISTS idx_cmi_mining ON community_mining_intersections (mining_codigou);
CREATE INDEX IF NOT EXISTS idx_cmi_departamento ON community_mining_intersections (community_departamento);
CREATE INDEX IF NOT EXISTS idx_cmi_geom ON community_mining_intersections USING GIST (intersection_geom);
CREATE INDEX IF NOT EXISTS idx_cmi_batch ON community_mining_intersections (batch_id);

-- ─── Comunidades ∩ títulos forestales ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_forest_intersections (
  id BIGSERIAL PRIMARY KEY,
  community_capa TEXT NOT NULL,
  community_objectid INTEGER NOT NULL,
  community_nombre TEXT,
  community_departamento TEXT,
  community_provincia TEXT,
  community_area_km2 NUMERIC,
  forest_capa TEXT NOT NULL,
  forest_objectid INTEGER NOT NULL,
  forest_fuente TEXT,
  forest_nom_dep TEXT,
  forest_area_km2 DOUBLE PRECISION,
  intersection_geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
  intersection_area_km2 DOUBLE PRECISION NOT NULL,
  community_overlap_pct DOUBLE PRECISION,
  forest_overlap_pct DOUBLE PRECISION,
  batch_id BIGINT REFERENCES raw_community_intersection_batches(id),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cfi_community ON community_forest_intersections (community_capa, community_objectid);
CREATE INDEX IF NOT EXISTS idx_cfi_forest ON community_forest_intersections (forest_capa, forest_objectid);
CREATE INDEX IF NOT EXISTS idx_cfi_departamento ON community_forest_intersections (community_departamento);
CREATE INDEX IF NOT EXISTS idx_cfi_geom ON community_forest_intersections USING GIST (intersection_geom);
CREATE INDEX IF NOT EXISTS idx_cfi_batch ON community_forest_intersections (batch_id);
