-- Fase 0 (2026-09-06): tres datasets reales de MINDEF en datosabiertos.gob.pe,
-- confirmados en vivo. Los tres son agregados/institucionales — sin nombre
-- de persona, sin PII: `offset_agreements` es a nivel de convenio (empresa
-- contraparte, no persona), `training_abroad` cuenta personal por curso
-- (columna numérica, no lista de nombres), `peace_missions` cuenta personal
-- desplegado por misión/año (columna numérica, no lista de nombres).
--
-- Se descartaron explícitamente otros datasets de MINDEF encontrados en la
-- misma búsqueda (créditos financieros de personal pensionista, PEA por
-- tipo de pensión) por ser administrativos/RRHH sin relación con gestión
-- pública o rendición de cuentas — fuera del alcance de Rastro.

CREATE TABLE IF NOT EXISTS raw_mindef_batches (
  id            BIGSERIAL PRIMARY KEY,
  dataset       TEXT NOT NULL CHECK (dataset IN ('offset_agreements', 'training_abroad', 'peace_missions')),
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  payload       JSONB NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Convenios Específicos de Compensaciones Industriales y Sociales Offset —
-- DGRRMM": obligaciones de compensación industrial/social que un proveedor
-- extranjero asume como parte de un contrato de defensa. Dataset pequeño
-- (9 filas confirmadas en vivo) — es todo lo que MINDEF publica hoy.
CREATE TABLE IF NOT EXISTS offset_agreements (
  id                  BIGSERIAL PRIMARY KEY,
  tipo_convenio       TEXT NOT NULL,
  institucion         TEXT NOT NULL,
  titulo              TEXT NOT NULL,
  entidad_contraparte TEXT,
  observacion         TEXT,
  anio_inicio         INTEGER CHECK (anio_inicio BETWEEN 2000 AND 2100),
  source_batch_id     BIGINT NOT NULL REFERENCES raw_mindef_batches(id),
  UNIQUE (institucion, titulo, entidad_contraparte)
);

CREATE TABLE IF NOT EXISTS offset_agreements_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_mindef_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Consolidado del Personal Militar capacitado en el Exterior": cuenta de
-- personal (no nombres) por curso/institución/país/fecha.
CREATE TABLE IF NOT EXISTS training_abroad (
  id                  BIGSERIAL PRIMARY KEY,
  institucion         TEXT NOT NULL,
  capacitacion        TEXT NOT NULL,
  personal_cantidad   INTEGER NOT NULL CHECK (personal_cantidad >= 0),
  fecha_inicio        DATE,
  fecha_termino       DATE,
  pais                TEXT,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_mindef_batches(id),
  UNIQUE (institucion, capacitacion, fecha_inicio, pais)
);

CREATE TABLE IF NOT EXISTS training_abroad_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_mindef_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Cuadro anual de personal de las FF.AA desplegados en Misiones de Paz,
-- Observadores Militares y Contingentes Militares": cuenta de personal (no
-- nombres) por misión/modalidad/institución/país/año.
CREATE TABLE IF NOT EXISTS peace_missions (
  id                  BIGSERIAL PRIMARY KEY,
  mision              TEXT NOT NULL,
  modalidad           TEXT,
  institucion         TEXT NOT NULL,
  pais                TEXT,
  anio                INTEGER NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  cantidad            INTEGER NOT NULL CHECK (cantidad >= 0),
  source_batch_id     BIGINT NOT NULL REFERENCES raw_mindef_batches(id),
  UNIQUE (mision, modalidad, institucion, pais, anio)
);

CREATE TABLE IF NOT EXISTS peace_missions_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_mindef_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_abroad_pais ON training_abroad (pais) WHERE pais IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_peace_missions_anio ON peace_missions (anio);
