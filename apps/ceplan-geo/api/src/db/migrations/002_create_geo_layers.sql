CREATE TABLE IF NOT EXISTS geo_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_name TEXT NOT NULL UNIQUE,
  layer_title TEXT,
  workspace TEXT,
  service_type TEXT NOT NULL DEFAULT 'WFS',
  geometry_type TEXT,
  extent_minx NUMERIC,
  extent_miny NUMERIC,
  extent_maxx NUMERIC,
  extent_maxy NUMERIC,
  feature_count INTEGER,
  last_ingested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
