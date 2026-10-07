CREATE TABLE IF NOT EXISTS raw_onp_batches (
  id            BIGSERIAL PRIMARY KEY,
  dataset       TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ejecucion_presupuestal_onp (
  id               BIGSERIAL PRIMARY KEY,
  anio             INTEGER NOT NULL,
  descripcion      TEXT NOT NULL,
  fuente           TEXT NOT NULL,
  ejecutado        NUMERIC,
  source_batch_id  BIGINT NOT NULL REFERENCES raw_onp_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_onp_ejecucion_anio ON ejecucion_presupuestal_onp (anio);
CREATE INDEX IF NOT EXISTS idx_onp_ejecucion_descripcion ON ejecucion_presupuestal_onp (descripcion);
