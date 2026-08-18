-- Lake de evidencia: nunca se sobreescribe, cada ingesta agrega un lote nuevo.
CREATE TABLE IF NOT EXISTS raw_ocds_batches (
  id            BIGSERIAL PRIMARY KEY,
  page_from     INTEGER NOT NULL,
  page_to       INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  payload       JSONB NOT NULL
);

-- Un release OCDS por fila. No hay tabla de proveedores/awards todavía —
-- ver docs/data-contracts/oece-contrataciones-abiertas.md: los releases
-- muestreados no siempre traen esa etapa (`tag` incluye "award").
CREATE TABLE IF NOT EXISTS procurement_processes (
  ocid              TEXT PRIMARY KEY,
  tender_id         TEXT NOT NULL,
  source_id         TEXT,
  buyer_id          TEXT NOT NULL,
  buyer_name        TEXT NOT NULL,
  departamento      TEXT,
  provincia         TEXT,
  distrito          TEXT,
  categoria         TEXT,
  titulo            TEXT,
  valor_monto       NUMERIC(18, 2),
  valor_moneda      TEXT,
  fecha_publicacion TIMESTAMPTZ,
  tender_inicio     TIMESTAMPTZ,
  tender_fin        TIMESTAMPTZ,
  tags              JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_ocds_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_procurement_processes_departamento
  ON procurement_processes (departamento) WHERE departamento IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_procurement_processes_buyer
  ON procurement_processes (buyer_id);

-- Releases que no pasaron validación: se conservan con su motivo, no se descartan.
CREATE TABLE IF NOT EXISTS procurement_processes_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_ocds_batches(id),
  raw_release       JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
