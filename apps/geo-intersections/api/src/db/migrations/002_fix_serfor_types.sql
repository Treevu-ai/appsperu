-- 002_fix_serfor_types.sql
-- Corrige tipos de columnas forestry: INTEGER → TEXT para evitar errores de tipo
-- cuando la API ArcGIS de SERFOR devuelve floats o strings en campos numéricos.

ALTER TABLE forest_titles
  ALTER COLUMN zon_utm TYPE TEXT,
  ALTER COLUMN origen  TYPE TEXT,
  ALTER COLUMN aut_for TYPE TEXT,
  ALTER COLUMN situac  TYPE TEXT;
