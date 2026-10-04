-- Reconstruida 2026-10-04 a partir del esquema real aplicado en Neon (fonafe_empresarial) —
-- el archivo original se perdió antes de ser commiteado; esta es una reconstrucción fiel
-- (columnas, tipos, constraints e índices verificados contra information_schema/pg_catalog).

CREATE TABLE IF NOT EXISTS raw_fonafe_batches (
  id            BIGSERIAL PRIMARY KEY,
  dataset       TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS empresas_fonafe (
  id              BIGSERIAL PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  codigo_interno  TEXT NOT NULL,
  razon_social    TEXT,
  sector          TEXT
);

CREATE TABLE IF NOT EXISTS presupuesto_empresarial (
  id                      BIGSERIAL PRIMARY KEY,
  empresa_id              BIGINT NOT NULL REFERENCES empresas_fonafe(id),
  anio_ejecucion          INTEGER,
  ultimo_mes_informado    TEXT,
  rubro                   TEXT NOT NULL,
  presupuestado_anual     NUMERIC,
  presupuesto_ultimo_mes  NUMERIC,
  ejecucion_ultimo_mes    NUMERIC,
  source_batch_id         BIGINT NOT NULL REFERENCES raw_fonafe_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_presupuesto_empresa ON presupuesto_empresarial (empresa_id);
CREATE INDEX IF NOT EXISTS idx_presupuesto_rubro ON presupuesto_empresarial (rubro);
