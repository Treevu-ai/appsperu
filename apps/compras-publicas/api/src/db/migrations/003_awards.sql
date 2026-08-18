-- Adjudicaciones de contratación pública, vía /api/v1/records (no /releases —
-- confirmado que /releases no siempre trae awards). Una fila por
-- (award, proveedor): un award puede tener varios proveedores (consorcios).
-- Sin FK estricta a procurement_processes: son conectores independientes,
-- un ocid puede tener award ingerido sin su release correspondiente todavía.
CREATE TABLE IF NOT EXISTS awards (
  id                BIGSERIAL PRIMARY KEY,
  ocid              TEXT NOT NULL,
  award_id          TEXT NOT NULL,
  buyer_id          TEXT,
  buyer_name        TEXT,
  departamento      TEXT,
  supplier_id       TEXT NOT NULL,
  supplier_name     TEXT NOT NULL,
  valor_monto       NUMERIC(18, 2),
  valor_moneda      TEXT,
  fecha             DATE,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_ocds_batches(id),
  UNIQUE (ocid, award_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_awards_supplier ON awards (supplier_id);
CREATE INDEX IF NOT EXISTS idx_awards_departamento ON awards (departamento) WHERE departamento IS NOT NULL;

CREATE TABLE IF NOT EXISTS awards_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_ocds_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
