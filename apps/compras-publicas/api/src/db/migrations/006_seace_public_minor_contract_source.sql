-- Fuente complementaria para el buscador público de contratos menores de SEACE.
-- Es una interfaz pública observada, no una API pública documentada: se conserva
-- la respuesta completa, URL y momento de captura para poder reproducirla y
-- detectar cambios de esquema antes de confiar en ella para análisis.

CREATE TABLE IF NOT EXISTS raw_minor_contract_batches (
  id              BIGSERIAL PRIMARY KEY,
  source_system   TEXT NOT NULL,
  source_url      TEXT NOT NULL,
  department      TEXT,
  year            INTEGER,
  page_from       INTEGER,
  page_to         INTEGER,
  checksum        TEXT NOT NULL,
  record_count    INTEGER NOT NULL,
  payload         JSONB NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE minor_contracts ALTER COLUMN source_batch_id DROP NOT NULL;
ALTER TABLE contract_quotations ALTER COLUMN source_batch_id DROP NOT NULL;
ALTER TABLE contract_events ALTER COLUMN source_batch_id DROP NOT NULL;
ALTER TABLE contract_documents ALTER COLUMN source_batch_id DROP NOT NULL;
ALTER TABLE contract_evidence ALTER COLUMN source_batch_id DROP NOT NULL;

ALTER TABLE minor_contracts
  ADD COLUMN IF NOT EXISTS minor_source_batch_id BIGINT REFERENCES raw_minor_contract_batches(id);
ALTER TABLE contract_quotations
  ADD COLUMN IF NOT EXISTS minor_source_batch_id BIGINT REFERENCES raw_minor_contract_batches(id);
ALTER TABLE contract_events
  ADD COLUMN IF NOT EXISTS minor_source_batch_id BIGINT REFERENCES raw_minor_contract_batches(id);
ALTER TABLE contract_documents
  ADD COLUMN IF NOT EXISTS minor_source_batch_id BIGINT REFERENCES raw_minor_contract_batches(id);
ALTER TABLE contract_evidence
  ADD COLUMN IF NOT EXISTS minor_source_batch_id BIGINT REFERENCES raw_minor_contract_batches(id);

ALTER TABLE minor_contracts
  ADD CONSTRAINT chk_minor_contracts_one_source_batch
  CHECK ((source_batch_id IS NOT NULL) <> (minor_source_batch_id IS NOT NULL));
ALTER TABLE contract_quotations
  ADD CONSTRAINT chk_contract_quotations_one_source_batch
  CHECK ((source_batch_id IS NOT NULL) <> (minor_source_batch_id IS NOT NULL));
ALTER TABLE contract_events
  ADD CONSTRAINT chk_contract_events_one_source_batch
  CHECK ((source_batch_id IS NOT NULL) <> (minor_source_batch_id IS NOT NULL));
ALTER TABLE contract_documents
  ADD CONSTRAINT chk_contract_documents_one_source_batch
  CHECK ((source_batch_id IS NOT NULL) <> (minor_source_batch_id IS NOT NULL));
ALTER TABLE contract_evidence
  ADD CONSTRAINT chk_contract_evidence_one_source_batch
  CHECK ((source_batch_id IS NOT NULL) <> (minor_source_batch_id IS NOT NULL));

DROP INDEX IF EXISTS uq_contract_evidence_version;
CREATE UNIQUE INDEX uq_contract_evidence_version
  ON contract_evidence (
    contracting_id,
    COALESCE(signal_id, ''),
    evidence_type,
    source_record,
    field,
    COALESCE(source_batch_id, 0),
    COALESCE(minor_source_batch_id, 0)
  );

CREATE INDEX IF NOT EXISTS idx_minor_contracts_public_source_batch
  ON minor_contracts(minor_source_batch_id);
