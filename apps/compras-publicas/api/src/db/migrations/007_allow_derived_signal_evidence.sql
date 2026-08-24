-- La evidencia de fuente debe tener exactamente un lote de origen. La evidencia
-- derivada por el motor de señales no apunta a un nuevo lote: referencia sus
-- insumos ya trazados y por eso se permite sin lote sólo cuando tiene signal_id.

ALTER TABLE contract_evidence
  DROP CONSTRAINT IF EXISTS chk_contract_evidence_one_source_batch;

ALTER TABLE contract_evidence
  ADD CONSTRAINT chk_contract_evidence_source_or_signal
  CHECK (
    (signal_id IS NULL AND ((source_batch_id IS NOT NULL) <> (minor_source_batch_id IS NOT NULL)))
    OR
    (signal_id IS NOT NULL AND source_batch_id IS NULL AND minor_source_batch_id IS NULL)
  );
