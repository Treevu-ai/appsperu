-- Conciliación conservadora entre las dos vistas OCDS de OECE.
-- Sólo se enlaza cuando el OCID es idéntico; nunca se infiere por nombre,
-- monto o fecha. Los no enlazados permanecen visibles.
CREATE TABLE IF NOT EXISTS oece_ocid_reconciliations (
  ocid                    TEXT PRIMARY KEY,
  release_source_batch_id BIGINT REFERENCES raw_ocds_batches(id),
  record_source_batch_id  BIGINT REFERENCES raw_ocds_batches(id),
  release_present         BOOLEAN NOT NULL,
  award_present           BOOLEAN NOT NULL,
  award_rows              INTEGER NOT NULL DEFAULT 0,
  reconciliation_status   TEXT NOT NULL CHECK (reconciliation_status IN ('matched_exact_ocid', 'release_only', 'record_only')),
  match_method            TEXT NOT NULL CHECK (match_method = 'ocid_exact'),
  scope_start             DATE NOT NULL,
  scope_end               DATE NOT NULL,
  reconciled_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (reconciliation_status = 'matched_exact_ocid' AND release_present AND award_present) OR
    (reconciliation_status = 'release_only' AND release_present AND NOT award_present) OR
    (reconciliation_status = 'record_only' AND NOT release_present AND award_present)
  )
);

CREATE INDEX IF NOT EXISTS idx_oece_ocid_reconciliations_status
  ON oece_ocid_reconciliations (reconciliation_status);
