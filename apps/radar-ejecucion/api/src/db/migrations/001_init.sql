-- FTS-003: lake de evidencia. Nunca se actualiza in-place, solo se inserta.
CREATE TABLE IF NOT EXISTS raw_mef_batches (
  id              BIGSERIAL PRIMARY KEY,
  resource_id     TEXT NOT NULL,
  query           TEXT NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum        TEXT NOT NULL,
  record_count    INTEGER NOT NULL,
  payload         JSONB NOT NULL
);

-- FTS-004: catálogo maestro territorial.
CREATE TABLE IF NOT EXISTS territories (
  ubigeo          TEXT PRIMARY KEY,
  departamento    TEXT NOT NULL,
  provincia       TEXT,
  distrito        TEXT,
  vigente_desde   DATE NOT NULL,
  fuente          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entities (
  entity_code     TEXT PRIMARY KEY,
  nombre          TEXT NOT NULL,
  nivel_gobierno  TEXT NOT NULL,
  sector          TEXT,
  ubigeo          TEXT REFERENCES territories(ubigeo)
);

-- FTS-011: medidas normalizadas de ejecución presupuestal.
CREATE TABLE IF NOT EXISTS budget_execution (
  id                BIGSERIAL PRIMARY KEY,
  entity_code       TEXT NOT NULL REFERENCES entities(entity_code),
  funcion           TEXT NOT NULL,
  anio_fiscal       INTEGER NOT NULL,
  pia               NUMERIC(18, 2) NOT NULL,
  pim               NUMERIC(18, 2) NOT NULL,
  devengado         NUMERIC(18, 2) NOT NULL,
  fecha_corte       DATE NOT NULL,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_mef_batches(id),
  UNIQUE (entity_code, funcion, anio_fiscal, fecha_corte)
);

CREATE INDEX IF NOT EXISTS idx_budget_execution_lookup
  ON budget_execution (anio_fiscal, funcion, entity_code);

-- Filas que no pasaron validación en la normalización: se conservan, no se descartan (FTS-011).
CREATE TABLE IF NOT EXISTS budget_execution_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_mef_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FTS-012: cohortes territoriales comparables, versionadas.
CREATE TABLE IF NOT EXISTS cohort_rules (
  id              TEXT PRIMARY KEY,
  version         INTEGER NOT NULL,
  nivel_gobierno  TEXT NOT NULL,
  funcion         TEXT NOT NULL,
  min_n           INTEGER NOT NULL DEFAULT 5,
  descripcion     TEXT NOT NULL,
  UNIQUE (nivel_gobierno, funcion, version)
);
