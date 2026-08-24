-- La interfaz histórica de SEACE exporta un XLS binario por entidad, mes y RUC.
-- Se conserva el artefacto original separado del JSON normalizado para que una
-- revisión pueda reproducir exactamente lo que la fuente entregó.
CREATE TABLE IF NOT EXISTS raw_minor_contract_artifacts (
  artifact_id           BIGSERIAL PRIMARY KEY,
  minor_source_batch_id BIGINT NOT NULL REFERENCES raw_minor_contract_batches(id) ON DELETE CASCADE,
  filename              TEXT NOT NULL,
  media_type            TEXT NOT NULL,
  content_sha256        TEXT NOT NULL,
  content               BYTEA NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (minor_source_batch_id, content_sha256)
);

CREATE INDEX IF NOT EXISTS idx_minor_contract_artifacts_batch
  ON raw_minor_contract_artifacts(minor_source_batch_id);
