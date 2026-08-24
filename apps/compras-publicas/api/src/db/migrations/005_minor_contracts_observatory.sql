-- Observatorio de contratos menores <= 8 UIT.
-- Las tablas canónicas no reemplazan el lake `raw_ocds_batches`: cada fila
-- conserva el lote de origen y cualquier revisión puede volver al payload crudo.

CREATE TABLE IF NOT EXISTS municipalities (
  municipality_id      TEXT PRIMARY KEY,
  ruc                  TEXT,
  official_name        TEXT NOT NULL,
  department           TEXT NOT NULL,
  province             TEXT,
  district             TEXT,
  ubigeo               TEXT,
  entity_code_oece     TEXT,
  entity_code_mef      TEXT,
  active_status        TEXT,
  source               TEXT NOT NULL,
  source_timestamp     TIMESTAMPTZ,
  UNIQUE (entity_code_oece)
);

CREATE TABLE IF NOT EXISTS supplier_profiles (
  supplier_id          TEXT PRIMARY KEY,
  ruc                  TEXT,
  legal_name           TEXT NOT NULL,
  ruc_status           TEXT,
  ruc_condition        TEXT,
  rnp_status           TEXT,
  supplier_type        TEXT,
  first_seen           TIMESTAMPTZ,
  last_seen            TIMESTAMPTZ,
  source               TEXT NOT NULL,
  source_timestamp     TIMESTAMPTZ,
  UNIQUE (ruc)
);

CREATE TABLE IF NOT EXISTS minor_contracts (
  contracting_id               TEXT PRIMARY KEY,
  source_contracting_id        TEXT NOT NULL,
  ocid                         TEXT NOT NULL,
  award_id                     TEXT NOT NULL,
  municipality_id              TEXT NOT NULL REFERENCES municipalities(municipality_id),
  year                         INTEGER NOT NULL,
  object_original              TEXT,
  object_normalized            TEXT,
  category                     TEXT,
  subcategory                  TEXT,
  contract_type                TEXT,
  estimated_amount             NUMERIC(18,2),
  quoted_amount                NUMERIC(18,2),
  awarded_amount               NUMERIC(18,2) NOT NULL,
  publication_date             TIMESTAMPTZ,
  quotation_start_date         TIMESTAMPTZ,
  quotation_end_date           TIMESTAMPTZ,
  evaluation_date              TIMESTAMPTZ,
  award_date                   TIMESTAMPTZ,
  contract_date                TIMESTAMPTZ,
  quotation_count              INTEGER NOT NULL DEFAULT 0,
  valid_quotation_count        INTEGER,
  winning_supplier_id          TEXT REFERENCES supplier_profiles(supplier_id),
  order_number                 TEXT,
  contract_number              TEXT,
  status                       TEXT,
  source_url                   TEXT NOT NULL,
  source_timestamp             TIMESTAMPTZ,
  source_batch_id              BIGINT NOT NULL REFERENCES raw_ocds_batches(id),
  data_version                 TEXT NOT NULL,
  normalizer_version           TEXT NOT NULL,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ocid, award_id)
);

CREATE INDEX IF NOT EXISTS idx_minor_contracts_municipality ON minor_contracts(municipality_id);
CREATE INDEX IF NOT EXISTS idx_minor_contracts_supplier ON minor_contracts(winning_supplier_id);
CREATE INDEX IF NOT EXISTS idx_minor_contracts_year_amount ON minor_contracts(year, awarded_amount);
CREATE INDEX IF NOT EXISTS idx_minor_contracts_category ON minor_contracts(category);

CREATE TABLE IF NOT EXISTS contract_quotations (
  quotation_id          TEXT PRIMARY KEY,
  contracting_id        TEXT NOT NULL REFERENCES minor_contracts(contracting_id),
  supplier_id           TEXT REFERENCES supplier_profiles(supplier_id),
  amount                NUMERIC(18,2),
  submission_date       TIMESTAMPTZ,
  submission_time       TEXT,
  valid_status          TEXT NOT NULL CHECK (valid_status IN ('VALID', 'INVALID', 'UNKNOWN')),
  evaluation_result     TEXT,
  document_id           TEXT,
  source                TEXT NOT NULL,
  source_batch_id       BIGINT NOT NULL REFERENCES raw_ocds_batches(id),
  source_timestamp      TIMESTAMPTZ,
  UNIQUE (contracting_id, supplier_id, source_batch_id)
);

CREATE TABLE IF NOT EXISTS contract_events (
  event_id              TEXT PRIMARY KEY,
  contracting_id        TEXT NOT NULL REFERENCES minor_contracts(contracting_id),
  event_type            TEXT NOT NULL CHECK (event_type IN ('REQUIREMENT_PUBLICATION', 'INVITATION', 'QUESTION', 'QUOTATION', 'EVALUATION', 'AWARD', 'ORDER', 'CONTRACT', 'MODIFICATION', 'CANCELLATION')),
  event_timestamp       TIMESTAMPTZ,
  publication_timestamp TIMESTAMPTZ,
  actor                 TEXT,
  description           TEXT,
  source_url            TEXT NOT NULL,
  document_id           TEXT,
  source_batch_id       BIGINT NOT NULL REFERENCES raw_ocds_batches(id),
  UNIQUE (contracting_id, event_type, source_batch_id)
);

CREATE TABLE IF NOT EXISTS contract_documents (
  document_id           TEXT PRIMARY KEY,
  contracting_id        TEXT NOT NULL REFERENCES minor_contracts(contracting_id),
  document_type         TEXT NOT NULL,
  title                 TEXT,
  publication_date      TIMESTAMPTZ,
  document_url          TEXT NOT NULL,
  hash                  TEXT,
  text_extracted        TEXT,
  extraction_quality    TEXT,
  source                TEXT NOT NULL,
  source_batch_id       BIGINT NOT NULL REFERENCES raw_ocds_batches(id)
);

CREATE TABLE IF NOT EXISTS signal_runs (
  signal_run_id         TEXT PRIMARY KEY,
  executed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  department            TEXT NOT NULL,
  year                  INTEGER NOT NULL,
  limit_amount          NUMERIC(18,2) NOT NULL,
  rule_version          TEXT NOT NULL,
  model_version         TEXT,
  normative_version     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contract_signals (
  signal_id             TEXT PRIMARY KEY,
  signal_run_id         TEXT NOT NULL REFERENCES signal_runs(signal_run_id),
  signal_type           TEXT NOT NULL CHECK (signal_type IN ('S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10')),
  contracting_id        TEXT REFERENCES minor_contracts(contracting_id),
  municipality_id       TEXT NOT NULL REFERENCES municipalities(municipality_id),
  supplier_id           TEXT REFERENCES supplier_profiles(supplier_id),
  detected_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  metric                TEXT NOT NULL,
  observed_value        JSONB NOT NULL,
  reference_value       JSONB,
  severity              TEXT NOT NULL CHECK (severity IN ('INFO', 'REVISAR', 'PRIORIZAR')),
  confidence            NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  rule_version          TEXT NOT NULL,
  model_version         TEXT,
  explanation           TEXT NOT NULL,
  human_review_status   TEXT NOT NULL DEFAULT 'PENDING' CHECK (human_review_status IN ('PENDING', 'REVIEWED', 'DISMISSED'))
);

CREATE INDEX IF NOT EXISTS idx_contract_signals_type ON contract_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_contract_signals_contracting ON contract_signals(contracting_id);
CREATE INDEX IF NOT EXISTS idx_contract_signals_municipality ON contract_signals(municipality_id);

CREATE TABLE IF NOT EXISTS contract_evidence (
  evidence_id           BIGSERIAL PRIMARY KEY,
  contracting_id        TEXT NOT NULL REFERENCES minor_contracts(contracting_id),
  signal_id             TEXT REFERENCES contract_signals(signal_id),
  evidence_type         TEXT NOT NULL,
  source_record         TEXT NOT NULL,
  source_url            TEXT NOT NULL,
  document_id           TEXT REFERENCES contract_documents(document_id),
  field                 TEXT,
  observed_value        JSONB,
  capture_timestamp     TIMESTAMPTZ NOT NULL,
  confidence            NUMERIC(5,4) NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  source_batch_id       BIGINT NOT NULL REFERENCES raw_ocds_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_contract_evidence_contracting ON contract_evidence(contracting_id);
CREATE INDEX IF NOT EXISTS idx_contract_evidence_signal ON contract_evidence(signal_id);
-- NULL de signal_id representa evidencia de fuente (no de una señal). Se
-- normaliza dentro del índice para que reingestas del mismo lote no dupliquen
-- esa evidencia base.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_evidence_version
  ON contract_evidence (contracting_id, COALESCE(signal_id, ''), evidence_type, source_record, field, source_batch_id);
