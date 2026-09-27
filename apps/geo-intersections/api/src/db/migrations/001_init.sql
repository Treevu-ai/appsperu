-- geo-intersections — schema inicial
-- PostGIS para operaciones geoespaciales (ST_Within, ST_Intersects, ST_Contains, ST_Area)
--
-- Diseño:
--   1. Replica geometry de INGEMMET y SERFOR (polígonos como GEOMETRY(Polygon, 4326))
--   2. Calcula intersecciones MINERÍA ∩ BOSQUE usando ST_Intersects
--   3. Endpoint puntual: dado un punto (lat/lon) → qué derechos/minas lo cubren
--   4. Reporte batch: todas las superposiciones minería ∩ bosque en el país
--
-- Verificado: INGEMMET y SERFOR devuelven geometry.rings (polígonos cerrados en WGS84)
-- como Polygon GeoJSON. Confirmado en vivo 2026-09-24.

-- ─── PostGIS ────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;
COMMENT ON EXTENSION postgis IS 'Geoespacial: ST_Intersects, ST_Contains, ST_Area, ST_GeomFromGeoJSON';

-- ─── Raw batches ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS raw_ingemmet_geometry_batches (
  id          BIGSERIAL PRIMARY KEY,
  source_url  TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raw_serfor_geometry_batches (
  id          BIGSERIAL PRIMARY KEY,
  source_url  TEXT NOT NULL,
  capa        TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raw_intersection_batches (
  id          BIGSERIAL PRIMARY KEY,
  record_count INTEGER NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Mining rights con geometría ────────────────────────────────────────────────
-- Replicado de INGEMMET. Clave: codigou (única, verificada en INGEMMET GEO-01).
-- geometry: GEOMETRY(Polygon, 4326) desde GeoJSON rings[].

CREATE TABLE IF NOT EXISTS mining_rights (
  id                 BIGSERIAL PRIMARY KEY,
  objectid           INTEGER NOT NULL,
  codigou            TEXT NOT NULL,
  fecha_denuncio     DATE,
  concesion          TEXT,
  titular            TEXT,
  hectareas          DOUBLE PRECISION,
  estado             TEXT,
  estado_descripcion TEXT,
  sustancia          TEXT,
  departamento       TEXT,
  provincia          TEXT,
  distrito           TEXT,
  fecha_actualizacion TIMESTAMPTZ,
  -- Geometría del polígono en WGS84
  geometry           GEOMETRY(Polygon, 4326) NOT NULL,
  -- Área en grados² (para filtrar polígonos degenerados) y en km² (útil para ranking)
  area_deg2          DOUBLE PRECISION,
  area_km2           DOUBLE PRECISION,
  source_batch_id    BIGINT REFERENCES raw_ingemmet_geometry_batches(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_mining_rights_codigou UNIQUE (codigou)
);

-- Índices geoespaciales y de filtro
CREATE INDEX IF NOT EXISTS idx_mining_rights_geom
  ON mining_rights USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_mining_rights_departamento
  ON mining_rights (departamento);
CREATE INDEX IF NOT EXISTS idx_mining_rights_estado
  ON mining_rights (estado);
CREATE INDEX IF NOT EXISTS idx_mining_rights_sustancia
  ON mining_rights (sustancia);
CREATE INDEX IF NOT EXISTS idx_mining_rights_batch
  ON mining_rights (source_batch_id);

-- ─── Forest titles con geometría ──────────────────────────────────────────────
-- Replicado de SERFOR. Clave compuesta: (capa, objectid) — objectid no es único global.
-- Los títulos se borran y re-insertan en cada ingesta (snapshot completo, mismo criterio
-- que en catastro-forestal para datos sin clave estable verificable).

CREATE TABLE IF NOT EXISTS forest_titles (
  id                 BIGSERIAL PRIMARY KEY,
  capa               TEXT NOT NULL,
  objectid           INTEGER NOT NULL,
  fuente             TEXT,
  doc_reg            TEXT,
  fec_reg            DATE,
  observ             TEXT,
  zon_utm            TEXT,
  origen             TEXT,
  -- Territorial — en 9/10 capas son códigos UBIGEO numéricos; en 1 capa son nombres reales
  nom_dis            TEXT,
  nom_pro            TEXT,
  nom_dep            TEXT,
  aut_for            TEXT,
  fec_ini            DATE,
  fec_ter            DATE,
  situac             TEXT,
  sup_sig            DOUBLE PRECISION,
  sup_apr            DOUBLE PRECISION,
  doc_leg            TEXT,
  fec_leg            DATE,
  -- Atributos específicos de la capa que no caben en columnas fijas
  atributos_extra    JSONB,
  -- Geometría del polígono en WGS84
  geometry           GEOMETRY(Polygon, 4326) NOT NULL,
  area_deg2          DOUBLE PRECISION,
  area_km2           DOUBLE PRECISION,
  source_batch_id    BIGINT REFERENCES raw_serfor_geometry_batches(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forest_titles_geom
  ON forest_titles USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_forest_titles_capa
  ON forest_titles (capa);
CREATE INDEX IF NOT EXISTS idx_forest_titles_nomdep
  ON forest_titles (nom_dep);
CREATE INDEX IF NOT EXISTS idx_forest_titles_batch
  ON forest_titles (source_batch_id);

-- ─── Intersecciones mining_rights ∩ forest_titles ─────────────────────────────
-- Toda combinación donde los polígonos se superponen (ST_Intersects = true).
-- Se recalcula en cada batch; se borra y re-inserta completo.

CREATE TABLE IF NOT EXISTS intersection_results (
  id                       BIGSERIAL PRIMARY KEY,
  -- Derecho minero
  mining_codigou           TEXT NOT NULL,
  mining_concesion         TEXT,
  mining_titular           TEXT,
  mining_estado            TEXT,
  mining_sustancia         TEXT,
  mining_departamento     TEXT,
  mining_area_km2         DOUBLE PRECISION,
  -- Título forestal
  forest_capa              TEXT NOT NULL,
  forest_objectid          INTEGER NOT NULL,
  forest_fuente            TEXT,
  forest_situac            INTEGER,
  forest_nom_dep           TEXT,
  forest_area_km2          DOUBLE PRECISION,
  -- Intersección
  intersection_geom        GEOMETRY(Polygon, 4326) NOT NULL,
  intersection_area_km2    DOUBLE PRECISION NOT NULL,
  -- Superficie superpuesta en km² / área del derecho × 100
  mining_overlap_pct       DOUBLE PRECISION,
  -- Superficie superpuesta en km² / área del bosque × 100
  forest_overlap_pct       DOUBLE PRECISION,
  batch_id                BIGINT REFERENCES raw_intersection_batches(id),
  computed_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para queries del endpoint
CREATE INDEX IF NOT EXISTS idx_intersections_mining
  ON intersection_results (mining_codigou);
CREATE INDEX IF NOT EXISTS idx_intersections_forest
  ON intersection_results (forest_capa, forest_objectid);
CREATE INDEX IF NOT EXISTS idx_intersections_departamento
  ON intersection_results (mining_departamento);
CREATE INDEX IF NOT EXISTS idx_intersections_geom
  ON intersection_results USING GIST (intersection_geom);

-- ─── Rejected rows ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mining_rights_rejected (
  id              BIGSERIAL PRIMARY KEY,
  source_batch_id BIGINT NOT NULL REFERENCES raw_ingemmet_geometry_batches(id),
  raw_row         JSONB NOT NULL,
  reason          TEXT NOT NULL,
  rejected_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forest_titles_rejected (
  id              BIGSERIAL PRIMARY KEY,
  source_batch_id BIGINT NOT NULL REFERENCES raw_serfor_geometry_batches(id),
  capa            TEXT NOT NULL,
  raw_row         JSONB NOT NULL,
  reason          TEXT NOT NULL,
  rejected_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
