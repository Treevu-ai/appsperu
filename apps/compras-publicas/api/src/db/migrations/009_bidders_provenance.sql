-- Compatible con bases locales que ejecutaron la primera versión de 004.
-- Los registros históricos sin lote verificable no se usan en la API hasta
-- que se reingesten desde el lote OCDS correspondiente.
ALTER TABLE bidders
  ADD COLUMN IF NOT EXISTS source_batch_id BIGINT REFERENCES raw_ocds_batches(id);

CREATE INDEX IF NOT EXISTS idx_bidders_source_batch ON bidders (source_batch_id);
