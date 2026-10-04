-- Reconstruida 2026-10-04 a partir del esquema real aplicado en Neon (midagri_dgaaa) —
-- el archivo original se perdió antes de ser commiteado; esta es una reconstrucción fiel
-- (columnas, tipos, constraints e índices verificados contra information_schema/pg_catalog).

CREATE TABLE IF NOT EXISTS raw_dgaaa_batches (
  id            BIGSERIAL PRIMARY KEY,
  dataset       TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS estudios_suelos (
  id                      BIGSERIAL PRIMARY KEY,
  cut                     TEXT NOT NULL UNIQUE,
  nombre_estudio          TEXT,
  nivel_detalle           TEXT,
  escala_trabajo          TEXT,
  superficie_ha           NUMERIC,
  titular                 TEXT NOT NULL,
  documento_aprobacion    TEXT,
  fecha_registro          TEXT,
  sistema_ctcum           TEXT,
  source_batch_id         BIGINT NOT NULL REFERENCES raw_dgaaa_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_estudios_suelos_titular ON estudios_suelos (titular);
