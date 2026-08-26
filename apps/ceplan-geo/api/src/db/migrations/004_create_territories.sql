CREATE TABLE IF NOT EXISTS territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ubigeo TEXT NOT NULL UNIQUE,
  departamento TEXT NOT NULL,
  provincia TEXT,
  distrito TEXT,
  geometry geometry(Geometry, 4326) NOT NULL,
  source_layer_id UUID REFERENCES geo_layers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_territories_geometry ON territories USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_territories_departamento ON territories (departamento);
