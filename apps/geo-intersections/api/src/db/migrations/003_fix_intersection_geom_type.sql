-- 003_fix_intersection_geom_type.sql
-- intersection_results.intersection_geom: GEOMETRY(Polygon,4326) → GEOMETRY
-- La intersección de dos Polygon puede devolver MultiPolygon o GeometryCollection.
-- Sin subtipo, Postgres rechaza por tipo incompatible con el constraint de columna.

ALTER TABLE intersection_results
  ALTER COLUMN intersection_geom TYPE GEOMETRY;
