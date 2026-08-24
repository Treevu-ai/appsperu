-- Un lote OCDS puede provenir de /releases o /records y de ventanas distintas.
-- Guardar el endpoint y los parámetros evita atribuir cobertura de procesos a
-- un lote de adjudicaciones (o viceversa) durante consultas en terminal.
ALTER TABLE raw_ocds_batches
  ADD COLUMN IF NOT EXISTS source_endpoint TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS query_params JSONB;

CREATE INDEX IF NOT EXISTS idx_raw_ocds_batches_endpoint_fetched
  ON raw_ocds_batches(source_endpoint, fetched_at DESC);
