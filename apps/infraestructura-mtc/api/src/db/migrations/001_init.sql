-- Fase 0 + construcción (2026-09-06): tres catálogos puntuales de infraestructura MTC
-- (terminales portuarios/embarcaderos, aeródromos, unidades de peaje), confirmados en vivo.
-- Ver docs/data-contracts/mtc-infraestructura-puntual.md para el porqué de agruparlos en una
-- sola app y el detalle de cada fuente.
--
-- Los tres son snapshots anuales acumulados (una fila por instalación por corte, no solo la
-- más reciente) — el id correlativo de la fuente cambia entre cortes, así que la clave real es
-- (código natural, fecha de corte), confirmada única contra las 507/595/233 filas reales.
-- Sin dato de persona natural en ninguno: es infraestructura, no personal.

CREATE TABLE IF NOT EXISTS raw_infraestructura_mtc_batches (
  id            BIGSERIAL PRIMARY KEY,
  dataset       TEXT NOT NULL CHECK (dataset IN ('puertos', 'aerodromos', 'peajes')),
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS terminales_portuarios (
  id                    BIGSERIAL PRIMARY KEY,
  codigo_puerto         TEXT NOT NULL,
  id_departamento       TEXT,
  id_provincia          TEXT,
  id_distrito           TEXT,
  localidad             TEXT,
  nombre_terminal       TEXT,
  label_terminal        TEXT,
  ambito                TEXT,
  tipo_terminal         TEXT,
  alcance               TEXT,
  uso                   TEXT,
  trafico               TEXT,
  actividad             TEXT,
  subactividad          TEXT,
  estado                TEXT,
  estado_conservacion   TEXT,
  titularidad           TEXT,
  administrador         TEXT,
  es_concesionado       BOOLEAN,
  latitud               NUMERIC,
  longitud              NUMERIC,
  fecha_corte           DATE NOT NULL,
  source_batch_id       BIGINT NOT NULL REFERENCES raw_infraestructura_mtc_batches(id),
  UNIQUE (codigo_puerto, fecha_corte)
);

CREATE TABLE IF NOT EXISTS terminales_portuarios_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_infraestructura_mtc_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terminales_portuarios_dpto ON terminales_portuarios (id_departamento);

CREATE TABLE IF NOT EXISTS aerodromos (
  id                    BIGSERIAL PRIMARY KEY,
  -- La columna ID de la fuente vino con el literal "#¡REF!" en el corte 2025 (error de fórmula
  -- de Excel arrastrado al CSV publicado) — se usa CODIGO_AERODROMO como clave, ver contrato.
  codigo_aerodromo      TEXT NOT NULL,
  id_departamento       TEXT,
  id_provincia          TEXT,
  id_distrito           TEXT,
  departamento          TEXT,
  provincia             TEXT,
  distrito              TEXT,
  nombre                TEXT,
  label                 TEXT,
  tipo_aerodromo        TEXT,
  codigo_oaci           TEXT,
  escala                TEXT,
  estado                TEXT,
  administrador         TEXT,
  jerarquia             TEXT,
  titularidad           TEXT,
  latitud               NUMERIC,
  longitud              NUMERIC,
  es_concesionado       BOOLEAN,
  fecha_corte           DATE NOT NULL,
  source_batch_id       BIGINT NOT NULL REFERENCES raw_infraestructura_mtc_batches(id),
  UNIQUE (codigo_aerodromo, fecha_corte)
);

CREATE TABLE IF NOT EXISTS aerodromos_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_infraestructura_mtc_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aerodromos_dpto ON aerodromos (id_departamento);

CREATE TABLE IF NOT EXISTS peajes (
  id                    BIGSERIAL PRIMARY KEY,
  codigo_peaje          TEXT NOT NULL,
  nombre                TEXT,
  label                 TEXT,
  codigo_ruta           TEXT,
  inicio_km             NUMERIC,
  codigo_clog           TEXT,
  departamento          TEXT,
  provincia             TEXT,
  distrito              TEXT,
  localidad             TEXT,
  id_departamento       TEXT,
  id_provincia          TEXT,
  id_distrito           TEXT,
  es_concesionado       BOOLEAN,
  titular               TEXT,
  ubicacion             TEXT,
  estado                TEXT,
  administrador         TEXT,
  latitud               NUMERIC,
  longitud              NUMERIC,
  fecha_corte           DATE NOT NULL,
  source_batch_id       BIGINT NOT NULL REFERENCES raw_infraestructura_mtc_batches(id),
  UNIQUE (codigo_peaje, fecha_corte)
);

CREATE TABLE IF NOT EXISTS peajes_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_infraestructura_mtc_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_peajes_dpto ON peajes (id_departamento);
