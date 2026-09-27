-- 004_add_geometry_valid.sql
-- Agrega columnas geometry_valid (GEOMETRY, sin subtype constraint) pobladas con ST_MakeValid.
-- Esto repara invalid geometries (self-intersecting, holes outside shell) UNA SOLA VEZ
-- y evita el costo de ST_MakeValid en cada JOIN de intersección.

-- Mining rights: columna paralela con geometría reparada
ALTER TABLE mining_rights ADD COLUMN IF NOT EXISTS geometry_valid GEOMETRY;
CREATE INDEX IF NOT EXISTS idx_mining_rights_valid_geom ON mining_rights USING GIST (geometry_valid);

-- Forest titles: columna paralela con geometría reparada
ALTER TABLE forest_titles ADD COLUMN IF NOT EXISTS geometry_valid GEOMETRY;
CREATE INDEX IF NOT EXISTS idx_forest_titles_valid_geom ON forest_titles USING GIST (geometry_valid);

-- Poblar geometrías válidas: ST_MakeValid para las que fallan ST_IsValid
UPDATE mining_rights
SET geometry_valid = ST_MakeValid(geometry)
WHERE geometry_valid IS NULL;

UPDATE forest_titles
SET geometry_valid = ST_MakeValid(geometry)
WHERE geometry_valid IS NULL;
