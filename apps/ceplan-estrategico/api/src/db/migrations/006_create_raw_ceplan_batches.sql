-- Tabla: raw_ceplan_batches
-- Lake de evidencia: lotes crudos de datos de CEPLAN

CREATE TABLE IF NOT EXISTS raw_ceplan_batches (
  id SERIAL PRIMARY KEY,
  resource_id VARCHAR(255) NOT NULL,
  query TEXT,
  checksum TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  payload JSONB NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(50) NOT NULL
);

CREATE INDEX idx_raw_ceplan_batches_resource_id ON raw_ceplan_batches(resource_id);
CREATE INDEX idx_raw_ceplan_batches_source ON raw_ceplan_batches(source);
CREATE INDEX idx_raw_ceplan_batches_ingested_at ON raw_ceplan_batches(ingested_at);
