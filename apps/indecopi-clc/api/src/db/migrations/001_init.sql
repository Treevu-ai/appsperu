-- Reconstruida 2026-10-04 a partir del esquema real aplicado en Neon (indecopi_clc) —
-- el archivo original se perdió antes de ser commiteado; esta es una reconstrucción fiel
-- (columnas, tipos, constraints e índices verificados contra information_schema/pg_catalog).

CREATE TABLE IF NOT EXISTS raw_indecopi_batches (
  id            BIGSERIAL PRIMARY KEY,
  dataset       TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expedientes_spc (
  id                      BIGSERIAL PRIMARY KEY,
  nro_expediente          TEXT NOT NULL UNIQUE,
  nro_expediente_origen   TEXT,
  tipo_expediente         TEXT,
  fecha_presentacion      DATE,
  denunciado              TEXT,
  tipo_documento          TEXT,
  numero_documento        TEXT,
  materia                 TEXT,
  source_batch_id         BIGINT NOT NULL REFERENCES raw_indecopi_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_expedientes_spc_documento ON expedientes_spc (numero_documento);
CREATE INDEX IF NOT EXISTS idx_expedientes_spc_denunciado ON expedientes_spc (denunciado);
