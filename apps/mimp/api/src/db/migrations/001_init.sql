-- Fase 0 (2026-09-06): tres datasets de MIMP investigados en
-- datosabiertos.gob.pe; solo dos se ingieren aquí. El tercero
-- ("Servicio de Acogimiento Residencial para Niñas, Niños y Adolescentes")
-- se descartó explícitamente al revisar su diccionario de datos: es
-- individual (código de usuario pseudónimo + fecha de nacimiento exacta +
-- centro + tipología de ingreso por abuso/trata/explotación) sobre menores
-- en protección estatal — la categoría de dato más sensible que este
-- proyecto puede tocar. No se ingiere bajo ninguna circunstancia.
--
-- Los dos que sí se ingieren son agregados verificados: CEM (casos
-- atendidos por centro/año, desglosados por sexo y tipo de violencia — sin
-- identificador individual) y Chat 100 (consultas nacionales anuales por
-- sexo/edad — sin desagregación territorial ni individual).

CREATE TABLE IF NOT EXISTS raw_mimp_batches (
  id            BIGSERIAL PRIMARY KEY,
  dataset       TEXT NOT NULL CHECK (dataset IN ('cem_casos', 'chat100_consultas')),
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  payload       JSONB NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Número de casos atendidos por violencia contra la mujer, integrantes del
-- grupo familiar y violencia sexual, según sexo y departamento" — un lote
-- anual del CEM (Centro Emergencia Mujer) por centro de atención.
CREATE TABLE IF NOT EXISTS cem_casos_violencia (
  id                          BIGSERIAL PRIMARY KEY,
  anio_reporte                INTEGER NOT NULL CHECK (anio_reporte BETWEEN 2000 AND 2100),
  periodo                     TEXT,
  codigo_centro_atencion      TEXT NOT NULL,
  nombre_centro_atencion      TEXT,
  ubigeo                      TEXT,
  departamento                TEXT,
  provincia                   TEXT,
  distrito                    TEXT,
  casos_total                 INTEGER CHECK (casos_total >= 0),
  casos_hombres               INTEGER CHECK (casos_hombres >= 0),
  casos_mujeres               INTEGER CHECK (casos_mujeres >= 0),
  casos_violencia_psicologica INTEGER CHECK (casos_violencia_psicologica >= 0),
  casos_violencia_fisica      INTEGER CHECK (casos_violencia_fisica >= 0),
  casos_violencia_sexual      INTEGER CHECK (casos_violencia_sexual >= 0),
  casos_violencia_economica   INTEGER CHECK (casos_violencia_economica >= 0),
  source_batch_id             BIGINT NOT NULL REFERENCES raw_mimp_batches(id),
  UNIQUE (anio_reporte, codigo_centro_atencion)
);

CREATE INDEX IF NOT EXISTS idx_cem_casos_departamento ON cem_casos_violencia (departamento) WHERE departamento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cem_casos_anio ON cem_casos_violencia (anio_reporte);

CREATE TABLE IF NOT EXISTS cem_casos_violencia_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_mimp_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Número de consultas atendidas a través del servicio CHAT 100" — total
-- nacional anual, sin desagregación territorial en la fuente.
CREATE TABLE IF NOT EXISTS chat100_consultas (
  id                              BIGSERIAL PRIMARY KEY,
  anio_reporte                    INTEGER NOT NULL CHECK (anio_reporte BETWEEN 2000 AND 2100),
  periodo                         TEXT,
  consultas_total                 INTEGER CHECK (consultas_total >= 0),
  consultas_hombres               INTEGER CHECK (consultas_hombres >= 0),
  consultas_mujeres               INTEGER CHECK (consultas_mujeres >= 0),
  consultas_no_especifica_sexo    INTEGER CHECK (consultas_no_especifica_sexo >= 0),
  source_batch_id                 BIGINT NOT NULL REFERENCES raw_mimp_batches(id),
  UNIQUE (anio_reporte)
);

CREATE TABLE IF NOT EXISTS chat100_consultas_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_mimp_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
