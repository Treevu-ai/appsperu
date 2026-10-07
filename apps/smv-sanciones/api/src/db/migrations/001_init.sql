CREATE TABLE IF NOT EXISTS raw_smv_batches (
  id            BIGSERIAL PRIMARY KEY,
  dataset       TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sanciones_smv (
  id                    BIGSERIAL PRIMARY KEY,
  fecha_resolucion      DATE,
  nro_resolucion        TEXT NOT NULL,
  empresa               TEXT NOT NULL,
  sumilla               TEXT,
  tipo                  TEXT,
  monto                 NUMERIC,
  con_recurso           BOOLEAN,
  nro_res_resolutiva    TEXT,
  fecha_res_resolutiva  DATE,
  source_batch_id       BIGINT NOT NULL REFERENCES raw_smv_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_sanciones_smv_empresa ON sanciones_smv (empresa);
CREATE INDEX IF NOT EXISTS idx_sanciones_smv_fecha ON sanciones_smv (fecha_resolucion);
