-- 007_territories.sql
-- Réplica local de ceplan_geo.territories (1,874 distritos reales, MultiPolygon) para
-- habilitar joins geométricos (ST_Intersects) sin cruce cross-base en vivo -- PostGIS no
-- puede comparar geometrías entre dos bases distintas en una sola consulta SQL, así que una
-- réplica local es la única forma de hacer esto con un join real, no solo texto (ver
-- external-pools.ts de catastro-forestal para el patrón de cruce liviano por UBIGEO, que no
-- aplica aquí porque necesitamos la geometría, no solo el nombre).
--
-- Fuente: ceplan_geo.territories vía CEPLAN_GEO_DATABASE_URL
-- (ver apps/geo-intersections/api/src/ingest/replicate-territories.ts).

CREATE TABLE IF NOT EXISTS raw_territories_batches (
  id BIGSERIAL PRIMARY KEY,
  source_url TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS territories (
  id BIGSERIAL PRIMARY KEY,
  ubigeo TEXT NOT NULL UNIQUE,
  departamento TEXT NOT NULL,
  provincia TEXT,
  distrito TEXT,
  geometry GEOMETRY(MultiPolygon, 4326) NOT NULL,
  -- geometry_valid: mismo motivo que mining_rights/forest_titles/rural_communities (migración
  -- 004 y 006) -- evita que un ST_Area/ST_Intersection sobre un polígono self-intersecting
  -- revienta en vivo.
  geometry_valid GEOMETRY,
  source_batch_id BIGINT REFERENCES raw_territories_batches(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_territories_geometry ON territories USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_territories_valid_geom ON territories USING GIST (geometry_valid);
CREATE INDEX IF NOT EXISTS idx_territories_ubigeo ON territories (ubigeo);
