-- ALSOL-SC-15: observaciones sobre proveedores, separadas de contrato,
-- entrega y sanción. Una denuncia no equivale a responsabilidad; una fuente
-- externa sin RUC no se asocia a proveedor alguno.
CREATE TABLE IF NOT EXISTS supplier_observations (
  observation_id              BIGSERIAL PRIMARY KEY,
  ruc                         TEXT CHECK (ruc IS NULL OR ruc ~ '^[0-9]{11}$'),
  supplier_name_literal       TEXT,
  observation_kind            TEXT NOT NULL CHECK (observation_kind IN (
    'SANCION_FORMAL', 'DENUNCIA_CON_EXPEDIENTE', 'PROCESO_EN_CURSO',
    'ANTIGUEDAD_RUC', 'REFERENCIA_EXTERNA'
  )),
  observation_status          TEXT NOT NULL CHECK (observation_status IN (
    'VIGENTE', 'PRESENTADA', 'EN_INVESTIGACION', 'ARCHIVADA', 'RESUELTA', 'CONTEXTO'
  )),
  linkage_status              TEXT NOT NULL CHECK (linkage_status IN (
    'RUC_EXACTO_DOCUMENTADO', 'SIN_RUC_NO_VINCULAR'
  )),
  authority_name              TEXT,
  case_reference              TEXT,
  food_lot_id                 TEXT REFERENCES food_lots(lot_id) ON DELETE RESTRICT,
  contract_reference          TEXT,
  ruc_start_date              DATE,
  contract_date               DATE,
  source_url                  TEXT NOT NULL,
  source_detail               TEXT NOT NULL,
  observed_at                 DATE NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ruc IS NOT NULL OR supplier_name_literal IS NOT NULL),
  CHECK (
    (ruc IS NOT NULL AND linkage_status='RUC_EXACTO_DOCUMENTADO') OR
    (ruc IS NULL AND linkage_status='SIN_RUC_NO_VINCULAR' AND food_lot_id IS NULL)
  ),
  CHECK (
    observation_kind NOT IN ('DENUNCIA_CON_EXPEDIENTE', 'PROCESO_EN_CURSO') OR
    (authority_name IS NOT NULL AND case_reference IS NOT NULL)
  ),
  CHECK (
    observation_kind <> 'ANTIGUEDAD_RUC' OR
    (ruc IS NOT NULL AND ruc_start_date IS NOT NULL AND contract_date IS NOT NULL)
  ),
  CHECK (food_lot_id IS NULL OR ruc IS NOT NULL),
  UNIQUE NULLS NOT DISTINCT (ruc, observation_kind, case_reference, source_url, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_supplier_observations_ruc
  ON supplier_observations(ruc) WHERE ruc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_observations_unlinked
  ON supplier_observations(observation_kind, observed_at) WHERE ruc IS NULL;

COMMENT ON TABLE supplier_observations IS
  'Registro de hechos y referencias sobre proveedores. No es score ni determina cumplimiento contractual.';
COMMENT ON COLUMN supplier_observations.linkage_status IS
  'SIN_RUC_NO_VINCULAR preserva una fuente externa sin atribuirla a proveedor, lote o contrato.';
