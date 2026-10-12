-- Etiqueta cada polígono de perdida_bosque_poligono con su ubigeo/departamento/
-- provincia/distrito real, para poder consultar por nombre de lugar en vez de
-- por geometría a mano.
--
-- La tabla `territories` se puebla aparte, corriendo
-- `npm run transfer:territories` (src/ingest/transfer-territories.ts), que
-- copia geo_intersections.territories (otra base del mismo proyecto Neon) vía
-- una conexión directa pg-a-pg — no hay forma de hacer esto con un simple
-- CREATE TABLE porque los datos viven en otra base de datos.
CREATE TABLE IF NOT EXISTS territories (
  ubigeo        TEXT PRIMARY KEY,
  departamento  TEXT NOT NULL,
  provincia     TEXT NOT NULL,
  distrito      TEXT NOT NULL,
  geom          GEOMETRY(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_territories_geom ON territories USING GIST (geom);

ALTER TABLE perdida_bosque_poligono ADD COLUMN IF NOT EXISTS ubigeo TEXT;
ALTER TABLE perdida_bosque_poligono ADD COLUMN IF NOT EXISTS departamento TEXT;
ALTER TABLE perdida_bosque_poligono ADD COLUMN IF NOT EXISTS provincia TEXT;
ALTER TABLE perdida_bosque_poligono ADD COLUMN IF NOT EXISTS distrito TEXT;

CREATE INDEX IF NOT EXISTS idx_perdida_bosque_poligono_ubigeo ON perdida_bosque_poligono (ubigeo);
CREATE INDEX IF NOT EXISTS idx_perdida_bosque_poligono_departamento ON perdida_bosque_poligono (departamento);

-- El etiquetado en sí (UPDATE ... ST_Contains(territorio.geom, ST_Centroid(poligono.geom)))
-- se corre aparte, en lotes por rango de id, no como parte de esta migración —
-- sobre 2.66M filas no cabe en una sola transacción de migración sin arriesgar
-- un timeout. Ver sesión 2026-10-11: corrido manualmente, 2,662,688/2,664,000
-- filas etiquetadas (99.95%; el resto queda NULL por caer fuera de cualquier
-- distrito, ej. recortes en frontera internacional).
