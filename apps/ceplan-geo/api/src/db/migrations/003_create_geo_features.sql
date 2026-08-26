CREATE TABLE IF NOT EXISTS geo_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id UUID NOT NULL REFERENCES geo_layers(id) ON DELETE CASCADE,
  feature_id TEXT NOT NULL,
  geometry geometry(Geometry, 4326) NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (layer_id, feature_id)
);

CREATE INDEX IF NOT EXISTS idx_geo_features_geometry ON geo_features USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_geo_features_layer_id ON geo_features (layer_id);
