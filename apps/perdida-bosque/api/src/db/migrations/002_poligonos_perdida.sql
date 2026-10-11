-- Polígonos exactos de pérdida de bosque (Geobosques/MINAM), nivel de
-- precisión real para due diligence EUDR (art. 10: no se acepta producto de
-- parcelas deforestadas después del 2020-12-31 — requiere verificar la
-- parcela exacta, no un agregado departamental como perdida_bosque_anual).
--
-- Fuente: shapefile nacional "Bosque_No_Bosque_2025" descargado manualmente
-- de geobosques.minam.gob.pe (formulario de contacto, no automatizable sin
-- intervención humana) el 2026-10-11. Proyección original EPSG:32718 (UTM
-- Zona 18S, metros), reproyectado a EPSG:4326 (WGS84) al ingerir para cruzar
-- con eudr_parcela (identidad_fiscal) vía ST_Intersects/ST_Contains.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS perdida_bosque_poligono (
  id               BIGSERIAL PRIMARY KEY,
  gridcode         INTEGER,
  cobertura        TEXT NOT NULL,
  area_ha          NUMERIC,
  shape_area_m2    NUMERIC,
  geom             GEOMETRY(MultiPolygon, 4326) NOT NULL,
  source_batch_id  BIGINT NOT NULL REFERENCES raw_geobosques_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_perdida_bosque_poligono_geom
  ON perdida_bosque_poligono USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_perdida_bosque_poligono_cobertura
  ON perdida_bosque_poligono (cobertura);
