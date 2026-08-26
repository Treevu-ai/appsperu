CREATE TABLE IF NOT EXISTS raw_geoserver_batches (
  id SERIAL PRIMARY KEY,
  layer_name TEXT NOT NULL,
  request_url TEXT NOT NULL,
  checksum TEXT NOT NULL,
  feature_count INTEGER NOT NULL DEFAULT 0,
  payload JSONB,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raw_geoserver_batches_layer
  ON raw_geoserver_batches (layer_name, ingested_at DESC);
