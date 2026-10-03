CREATE TABLE IF NOT EXISTS raw_salas_autorizadas_batches (
  id            BIGSERIAL PRIMARY KEY,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS salas_autorizadas (
  codigo_sala      TEXT PRIMARY KEY,
  ruc              TEXT NOT NULL,
  empresa          TEXT NOT NULL,
  establecimiento  TEXT NOT NULL,
  giro             TEXT,
  resolucion       TEXT,
  fecha_vigencia   DATE,
  direccion        TEXT,
  distrito         TEXT,
  provincia        TEXT,
  departamento     TEXT,
  fecha_corte      DATE NOT NULL,
  source_batch_id  BIGINT NOT NULL REFERENCES raw_salas_autorizadas_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_salas_autorizadas_ruc ON salas_autorizadas (ruc);
CREATE INDEX IF NOT EXISTS idx_salas_autorizadas_departamento ON salas_autorizadas (departamento);
