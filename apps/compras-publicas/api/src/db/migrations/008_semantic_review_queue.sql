-- Vectores derivados sólo del objeto público normalizado. JSONB evita requerir
-- pgvector en este piloto; el cálculo de similitud es reproducible en la app y
-- conserva modelo, proveedor y hash del texto exacto vectorizado.
CREATE TABLE IF NOT EXISTS contract_object_embeddings (
  contracting_id       TEXT PRIMARY KEY REFERENCES minor_contracts(contracting_id),
  object_normalized    TEXT NOT NULL,
  content_hash         TEXT NOT NULL,
  provider             TEXT NOT NULL,
  model                TEXT NOT NULL,
  dimensions           INTEGER NOT NULL CHECK (dimensions > 0),
  embedding            JSONB NOT NULL,
  generated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contract_object_embeddings_model ON contract_object_embeddings(provider, model);

ALTER TABLE contract_signals DROP CONSTRAINT IF EXISTS contract_signals_signal_type_check;
ALTER TABLE contract_signals ADD CONSTRAINT contract_signals_signal_type_check
  CHECK (signal_type IN ('S01','S02','S03','S04','S05','S06','S07','S08','S09','S10','S11','S12','S13'));
