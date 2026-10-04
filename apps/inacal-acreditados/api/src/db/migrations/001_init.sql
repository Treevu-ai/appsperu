-- Reconstruida 2026-10-04 a partir del esquema real aplicado en Neon (inacal_acreditados) —
-- el archivo original se perdió antes de ser commiteado; esta es una reconstrucción fiel
-- (columnas, tipos, constraints e índices verificados contra information_schema/pg_catalog).

CREATE TABLE IF NOT EXISTS raw_inacal_batches (
  id            BIGSERIAL PRIMARY KEY,
  categoria     TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organismos_acreditados (
  id                BIGSERIAL PRIMARY KEY,
  categoria         TEXT NOT NULL,
  inacal_id         INTEGER NOT NULL,
  nombre            TEXT NOT NULL,
  direccion         TEXT,
  telefono          TEXT,
  email             TEXT,
  web               TEXT,
  resolucion        TEXT,
  registro_nro      TEXT,
  vigencia          TEXT,
  tipo              TEXT,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_inacal_batches(id),
  UNIQUE (categoria, inacal_id)
);

CREATE TABLE IF NOT EXISTS laboratorios_ensayo (
  id                BIGSERIAL PRIMARY KEY,
  inacal_id         INTEGER NOT NULL UNIQUE,
  nombre            TEXT NOT NULL,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_inacal_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_organismos_acreditados_nombre ON organismos_acreditados (nombre);
CREATE INDEX IF NOT EXISTS idx_laboratorios_ensayo_nombre ON laboratorios_ensayo (nombre);
