CREATE TABLE IF NOT EXISTS raw_mincetur_batches (
  id            BIGSERIAL PRIMARY KEY,
  resource_id   TEXT NOT NULL,
  anio          INTEGER NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  payload       JSONB NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (resource_id, checksum)
);

CREATE TABLE IF NOT EXISTS tourism_hospitality_monthly (
  id                    BIGSERIAL PRIMARY KEY,
  departamento          TEXT NOT NULL,
  id_ubigeo_depto       TEXT NOT NULL,
  anio                  INTEGER NOT NULL,
  mes                   INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  total_arribos         INTEGER,
  total_pernoctaciones  INTEGER,
  numero_establecimientos INTEGER,
  porcentaje_tnoh       NUMERIC(8,2),
  source_batch_id       BIGINT NOT NULL REFERENCES raw_mincetur_batches(id),
  UNIQUE (departamento, anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_tourism_hospitality_dept_anio
  ON tourism_hospitality_monthly(departamento, anio);
