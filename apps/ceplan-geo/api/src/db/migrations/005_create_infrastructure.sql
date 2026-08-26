CREATE TABLE IF NOT EXISTS infrastructure (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  infra_type TEXT NOT NULL,
  name TEXT NOT NULL,
  geometry geometry(Geometry, 4326) NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  source_layer_id UUID REFERENCES geo_layers(id),
  feature_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_layer_id, feature_id)
);

CREATE INDEX IF NOT EXISTS idx_infrastructure_geometry ON infrastructure USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_infrastructure_type ON infrastructure (infra_type);
