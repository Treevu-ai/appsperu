CREATE TABLE IF NOT EXISTS population_by_ubigeo (
  ubigeo        TEXT PRIMARY KEY,
  departamento  TEXT NOT NULL,
  provincia     TEXT NOT NULL,
  distrito      TEXT NOT NULL,
  poblacion     INTEGER NOT NULL CHECK (poblacion > 0),
  fuente        TEXT NOT NULL,
  vintage       TEXT NOT NULL,
  observed_at   DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_population_provincia ON population_by_ubigeo(departamento, provincia);

INSERT INTO population_by_ubigeo (ubigeo, departamento, provincia, distrito, poblacion, fuente, vintage, observed_at) VALUES
  ('130101', 'LA LIBERTAD', 'TRUJILLO', 'TRUJILLO', 286549, 'INEI Censo Nacional 2017', '2017', DATE '2017-12-31'),
  ('130102', 'LA LIBERTAD', 'TRUJILLO', 'EL PORVENIR', 191025, 'INEI Censo Nacional 2017', '2017', DATE '2017-12-31'),
  ('130103', 'LA LIBERTAD', 'TRUJILLO', 'FLORENCIA DE MORA', 42209, 'INEI Censo Nacional 2017', '2017', DATE '2017-12-31'),
  ('130104', 'LA LIBERTAD', 'TRUJILLO', 'HUANCHACO', 78285, 'INEI Censo Nacional 2017', '2017', DATE '2017-12-31'),
  ('130105', 'LA LIBERTAD', 'TRUJILLO', 'LA ESPERANZA', 151845, 'INEI Censo Nacional 2017', '2017', DATE '2017-12-31'),
  ('130106', 'LA LIBERTAD', 'TRUJILLO', 'LAREDO', 25691, 'INEI Censo Nacional 2017', '2017', DATE '2017-12-31'),
  ('130107', 'LA LIBERTAD', 'TRUJILLO', 'MOCHE', 29641, 'INEI Censo Nacional 2017', '2017', DATE '2017-12-31'),
  ('130108', 'LA LIBERTAD', 'TRUJILLO', 'POROTO', 1642, 'INEI Censo Nacional 2017', '2017', DATE '2017-12-31'),
  ('130109', 'LA LIBERTAD', 'TRUJILLO', 'SALAVERRY', 10731, 'INEI Censo Nacional 2017', '2017', DATE '2017-12-31'),
  ('130110', 'LA LIBERTAD', 'TRUJILLO', 'SIMBAL', 5898, 'INEI Censo Nacional 2017', '2017', DATE '2017-12-31'),
  ('130111', 'LA LIBERTAD', 'TRUJILLO', 'VICTOR LARCO HERRERA', 130706, 'INEI Censo Nacional 2017', '2017', DATE '2017-12-31')
ON CONFLICT (ubigeo) DO NOTHING;
