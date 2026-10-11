-- Catastro Rural (MIDAGRI/UEGPS - PTRT3).
-- Fuente: https://georural.midagri.gob.pe/geoservicios/rest/services/public/Catastro_Rural/MapServer
-- ArcGIS REST MapServer real, sin auth, 10 capas, MaxRecordCount=1000.
-- Confirmado en vivo 2026-10-09: service + 10 capas + muestra de features + paginación.
--
-- PAGINACIÓN: a diferencia de INGEMMET (que rechaza resultRecordCount/resultOffset con
-- "Pagination is not supported"), el MIDAGRI ACEPTA resultOffset+resultRecordCount
-- (verificado en vivo: offset=0 vs offset=2 devolvieron filas distintas de la capa 5).
-- Se usa paginación estándar por offset, iterando mientras la respuesta traiga features.
--
-- GEOMETRÍA: las capas devuelven `geometry.rings` (polígonos cerrados en WGS84, mismo
-- formato que SERFOR/INGEMMET). Se persiste como GEOMETRY(Polygon, 4326) vía
-- ST_GeomFromGeoJSON, con ST_MakeValid + ST_Area(::geography) para área en km².
--
-- CLAVE: NINGUNA de las 10 capas tiene una clave única estable -- `objectid` es único
-- por capa (no global), y en capas como Mosaico de Predios Ruales (9) ni siquiera
-- tiene campos de atributo. Cada ingesta es un SNAPSHOT COMPLETO por capa (DELETE +
-- INSERT) con advisory lock por capa, mismo patrón que catastro-forestal.
--
-- ESCALA: Predio Rural (capa 0) tiene 3,060,135 features -- la tabla más grande del
-- catálogo Rastro hasta el momento. Se ingesta con paginación por offset de 1000.
--
-- TITULACIÓN: las capas 5 (Comunidades Campesinas) y 6 (Comunidades Nativas) traen
-- `estado` (ej. "TITULADAS", "PREDIO ADJUDICADO") y, en CN, `nro_titulo`/
-- `anio_titulo`/`area_titulo` -- son la capa de titulación del PTRT3. La capa 8
-- (Proyectos Catastrales) traee `cod_proy`/`nombre_proy`/`id_dpto` (440 proyectos).

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS raw_midagri_batches (
  id            BIGSERIAL PRIMARY KEY,
  source_url    TEXT NOT NULL,
  capa          TEXT NOT NULL,
  record_count  INTEGER NOT NULL DEFAULT 0,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catastro_rural (
  id                 BIGSERIAL PRIMARY KEY,
  capa               TEXT NOT NULL,
  objectid           INTEGER,
  area_ha            DOUBLE PRECISION,
  perimetro          DOUBLE PRECISION,
  id_dist            TEXT,
  cod_proy           TEXT,
  nom_dpto           TEXT,
  nom_prov           TEXT,
  nom_dist           TEXT,
  nombre             TEXT,
  estado             TEXT,
  fuente             TEXT,
  tipo_proceso       TEXT,
  nro_titulo        TEXT,
  anio_titulo       TEXT,
  geometry           GEOMETRY(Polygon, 4326),
  area_km2           DOUBLE PRECISION,
  geometry_valid     GEOMETRY(Polygon, 4326),
  atributos_extra    JSONB,
  source_batch_id    BIGINT NOT NULL REFERENCES raw_midagri_batches(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catastro_rural_capa ON catastro_rural (capa);
CREATE INDEX IF NOT EXISTS idx_catastro_rural_ubigeo ON catastro_rural (nom_dpto, nom_prov, nom_dist);
CREATE INDEX IF NOT EXISTS idx_catastro_rural_estado ON catastro_rural (estado);
CREATE INDEX IF NOT EXISTS idx_catastro_rural_cod_proy ON catastro_rural (cod_proy);
CREATE INDEX IF NOT EXISTS idx_catastro_rural_geometry ON catastro_rural USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_catastro_rural_batch ON catastro_rural (source_batch_id);

CREATE TABLE IF NOT EXISTS catastro_rural_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_midagri_batches(id),
  capa              TEXT NOT NULL,
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);