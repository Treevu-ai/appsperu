-- Lake de evidencia: nunca se sobreescribe, cada ingesta agrega un lote nuevo.
CREATE TABLE IF NOT EXISTS raw_padron_batches (
  id            BIGSERIAL PRIMARY KEY,
  filename      TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un contribuyente por fila. Filtrado en la ingesta a personas jurídicas
-- (RUC-20 por defecto, ver PADRON_RUC_PREFIX) — el padrón completo trae
-- 18.3M filas y el 84.2% son personas naturales sin UBIGEO poblado, fuera
-- del caso de uso de este proyecto (ver docs/data-contracts/sunat-padron-ruc.md).
CREATE TABLE IF NOT EXISTS contribuyentes (
  ruc                     TEXT PRIMARY KEY,
  razon_social            TEXT NOT NULL,
  estado_contribuyente    TEXT,
  condicion_domicilio     TEXT,
  ubigeo                  TEXT,
  tipo_via                TEXT,
  nombre_via              TEXT,
  numero                  TEXT,
  source_batch_id         BIGINT NOT NULL REFERENCES raw_padron_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_contribuyentes_ubigeo
  ON contribuyentes (ubigeo) WHERE ubigeo IS NOT NULL AND ubigeo <> '-';

CREATE INDEX IF NOT EXISTS idx_contribuyentes_razon_social
  ON contribuyentes (razon_social);

CREATE INDEX IF NOT EXISTS idx_contribuyentes_estado
  ON contribuyentes (estado_contribuyente);

-- Filas que no pasaron validación: se conservan con su motivo, no se descartan.
CREATE TABLE IF NOT EXISTS contribuyentes_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_padron_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
