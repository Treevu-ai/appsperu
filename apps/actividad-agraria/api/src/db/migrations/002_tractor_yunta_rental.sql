-- Precio de alquiler de tractor y yunta por región (MIDAGRI-03.04 / 03.05).
-- Misma forma que agricultural_wage: fila anual del CSV → 12 filas mensuales.

CREATE TABLE IF NOT EXISTS agricultural_tractor_rental (
  id              BIGSERIAL PRIMARY KEY,
  departamento    TEXT NOT NULL,
  anio            INTEGER NOT NULL,
  mes             INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor_soles     NUMERIC(12, 2),
  source_batch_id BIGINT NOT NULL REFERENCES raw_midagri_batches(id),
  UNIQUE (departamento, anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_agricultural_tractor_rental_lookup
  ON agricultural_tractor_rental (departamento, anio);

CREATE TABLE IF NOT EXISTS agricultural_tractor_rental_rejected (
  id              BIGSERIAL PRIMARY KEY,
  source_batch_id BIGINT NOT NULL REFERENCES raw_midagri_batches(id),
  raw_row         JSONB NOT NULL,
  reason          TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agricultural_yunta_rental (
  id              BIGSERIAL PRIMARY KEY,
  departamento    TEXT NOT NULL,
  anio            INTEGER NOT NULL,
  mes             INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor_soles     NUMERIC(12, 2),
  source_batch_id BIGINT NOT NULL REFERENCES raw_midagri_batches(id),
  UNIQUE (departamento, anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_agricultural_yunta_rental_lookup
  ON agricultural_yunta_rental (departamento, anio);

CREATE TABLE IF NOT EXISTS agricultural_yunta_rental_rejected (
  id              BIGSERIAL PRIMARY KEY,
  source_batch_id BIGINT NOT NULL REFERENCES raw_midagri_batches(id),
  raw_row         JSONB NOT NULL,
  reason          TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
