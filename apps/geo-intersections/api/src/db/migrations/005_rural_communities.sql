-- 005_rural_communities.sql
-- Tablas para datos de Comunidades Campesinas/Nativas de SERFOR OCAPAS_MIDAGRI

-- Tabla principal de comunidades rurales
CREATE TABLE IF NOT EXISTS rural_communities (
  id BIGSERIAL PRIMARY KEY,
  capa TEXT NOT NULL, -- 'comunidades_campesinas' o 'comunidades_nativas'
  objectid INTEGER NOT NULL,
  nombre TEXT, -- nomcom
  departamento TEXT, -- depar
  provincia TEXT, -- provi
  distrito TEXT, -- distr
  area_ha NUMERIC, -- Aarea (confirmado en hectáreas)
  perimetro NUMERIC, -- sin fuente confiable en metros; queda NULL, usar ST_Perimeter(geometry::geography) si se necesita
  titulo TEXT, -- titcom (solo existe en comunidades_nativas)
  zona_utm INTEGER, -- sin fuente; la API no expone zona UTM para estas capas
  coordenada_x NUMERIC, -- centroide_e
  coordenada_y NUMERIC, -- centroide_n
  -- MultiPolygon, no Polygon: ~4.7% de las comunidades reales (212/4,492) tienen más de
  -- un ring, y no todos son holes (ej. OBJECTID 7 "PUERTO ANGEL" tiene 2 shells exteriores
  -- disjuntos) — el normalizador agrupa por orientación y siempre emite MultiPolygon.
  geometry GEOMETRY(MultiPolygon, 4326),
  -- Columna plana, no GENERATED: ST_Area(geometry::geography) directo revienta con
  -- "lwgeom_area_spher(oid) returned area < 0.0" ante polígonos self-intersecting/inválidos
  -- (confirmado en vivo contra datos reales de SERFOR OCAPAS). Se puebla en un UPDATE
  -- posterior al insert con ST_MakeValid, mismo patrón que mining_rights/forest_titles
  -- en replicate-geometries.ts.
  area_km2 NUMERIC,
  atributos_extra JSONB,
  source_batch_id BIGINT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (capa, objectid)
);

CREATE INDEX IF NOT EXISTS idx_rural_communities_capa ON rural_communities(capa);
CREATE INDEX IF NOT EXISTS idx_rural_communities_departamento ON rural_communities(departamento);
CREATE INDEX IF NOT EXISTS idx_rural_communities_geometry ON rural_communities USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_rural_communities_batch ON rural_communities(source_batch_id);

-- Tabla de batches para trazabilidad
CREATE TABLE IF NOT EXISTS raw_ocapas_batches (
  id BIGSERIAL PRIMARY KEY,
  source_url TEXT NOT NULL,
  capa TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raw_ocapas_batches_capa ON raw_ocapas_batches(capa);

-- Tabla de rechazos para auditoría
CREATE TABLE IF NOT EXISTS rural_communities_rejected (
  id BIGSERIAL PRIMARY KEY,
  source_batch_id BIGINT NOT NULL,
  raw_row JSONB NOT NULL,
  reason TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rural_communities_rejected_batch ON rural_communities_rejected(source_batch_id);
