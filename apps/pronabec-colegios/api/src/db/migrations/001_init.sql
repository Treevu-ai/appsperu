-- Reconstruida 2026-10-04 a partir del esquema real aplicado en Neon (pronabec_colegios) —
-- el archivo original se perdió antes de ser commiteado; esta es una reconstrucción fiel
-- (columnas, tipos, constraints e índices verificados contra information_schema/pg_catalog).

CREATE TABLE IF NOT EXISTS raw_pronabec_batches (
  id            BIGSERIAL PRIMARY KEY,
  dataset       TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS colegios_habiles (
  id                  BIGSERIAL PRIMARY KEY,
  colegio_nombre      TEXT NOT NULL,
  modalidad_estudio   TEXT,
  educacion_forma     TEXT,
  tipo_gestion        TEXT,
  telefono            TEXT,
  direccion           TEXT,
  localidad           TEXT,
  centro_poblado      TEXT,
  ugel                TEXT,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_pronabec_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_colegios_ugel ON colegios_habiles (ugel);
CREATE INDEX IF NOT EXISTS idx_colegios_tipo_gestion ON colegios_habiles (tipo_gestion);
