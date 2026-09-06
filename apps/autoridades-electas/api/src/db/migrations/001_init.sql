-- Fase 0 (2026-09-06): "Autoridades Electas JNE", datosabiertos.gob.pe.
--
-- HALLAZGO CRÍTICO QUE CAMBIÓ EL ALCANCE ORIGINAL: el dataset del JNE en la
-- Plataforma Nacional de Datos Abiertos existe en DOS variantes con esquema
-- distinto, confirmado leyendo ambos archivos reales (no solo el diccionario):
--
--   1. Recurso "actual" (`autoridades_electas_<fecha>.xls`, el que reemplaza
--      su contenido en cada corte) — columnas con prefijo `TX`/`NU`/`FE`,
--      SIN documento de identidad. Verificado 2026-09-06 contra el corte
--      2026-07-30: 208 filas, autoridades NACIONALES recién proclamadas
--      (Presidencia, Senado, Diputados, Parlamento Andino) de "ELECCIONES
--      GENERALES 2026" — `TXPRONUNCIAMIENTO` = "ACTA PROCLAMACIÓN N° 00001"
--      (acto oficial real, no una postulación/candidatura). El esquema
--      soporta los 4 ámbitos (Nacional/Regional/Provincial/Distrital, según
--      el diccionario de datos) — hoy solo trae Nacional porque es lo único
--      que se proclamó recientemente; se espera que incluya autoridades
--      regionales/municipales cuando se proclamen las de las Elecciones
--      Regionales y Municipales (próximo proceso: octubre 2026).
--   2. Recurso histórico fechado (`Autoridades_Electas_<fecha>.xls`, ej.
--      "20251113") — esquema SIN prefijo `TX` (`NOMBRES`, `CARGO`, etc.),
--      **SÍ incluye `DOCUMENTOIDENTIDAD` (DNI) sin enmascarar**, y cubre
--      39,342 filas históricas 2014-2022 de autoridades regionales/
--      municipales (ej. "REGIDOR DISTRITAL"). Es un dataset de mayor riesgo
--      de PII y de un esquema completamente distinto — se decidió NO
--      ingerirlo en esta primera versión. Requiere su propia revisión legal
--      (enmascarado de DNI, como ya hacen `perfilprov-conformacion` y el
--      cruce por DNI de `proveedores-sancionados`) antes de considerarlo.
--
-- Esta migración solo modela el recurso "actual" (variante 1) — sin DNI,
-- sin ningún dato de persona natural más allá de lo que la propia condición
-- de autoridad electa hace público por ley (nombre, cargo, organización
-- política — mismo fundamento legal que ya usa el catálogo para
-- `proveedores-sancionados`, Ley 27806).
--
-- Clave natural sin DNI disponible: se usa (nombres, apellido_paterno,
-- apellido_materno, cargo, proceso_electoral, ubigeo) como aproximación —
-- riesgo real de colisión por homonimia si dos personas con el mismo nombre
-- completo ganan el mismo cargo en el mismo proceso electoral y ubigeo
-- (extremadamente improbable pero no imposible). Documentado como
-- limitación conocida, no oculto.

CREATE TABLE IF NOT EXISTS raw_autoridades_electas_batches (
  id            BIGSERIAL PRIMARY KEY,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS autoridades_electas (
  id                    BIGSERIAL PRIMARY KEY,
  nombres               TEXT NOT NULL,
  apellido_paterno      TEXT NOT NULL,
  apellido_materno      TEXT,
  organizacion_politica TEXT NOT NULL,
  posicion              INTEGER,
  cargo                 TEXT NOT NULL,
  region                TEXT,
  provincia             TEXT,
  distrito              TEXT,
  ubigeo                TEXT CHECK (ubigeo IS NULL OR ubigeo ~ '^\d{6}$'),
  fecha_inicio_vigencia DATE,
  fecha_fin_vigencia    DATE,
  proceso_electoral     TEXT NOT NULL,
  anio_eleccion         INTEGER CHECK (anio_eleccion BETWEEN 2000 AND 2100),
  pronunciamiento       TEXT,
  fecha_publicacion     TIMESTAMPTZ,
  ambito                TEXT CHECK (ambito IN ('NACIONAL', 'REGIONAL', 'PROVINCIAL', 'DISTRITAL')),
  genero                TEXT CHECK (genero IN ('M', 'F')),
  edad                  INTEGER CHECK (edad BETWEEN 0 AND 120),
  periodo               TEXT,
  tipo_organizacion     TEXT,
  source_batch_id       BIGINT NOT NULL REFERENCES raw_autoridades_electas_batches(id),
  UNIQUE (nombres, apellido_paterno, apellido_materno, cargo, proceso_electoral, ubigeo)
);

CREATE TABLE IF NOT EXISTS autoridades_electas_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_autoridades_electas_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autoridades_electas_ubigeo ON autoridades_electas (ubigeo) WHERE ubigeo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_autoridades_electas_nombre_completo
  ON autoridades_electas (apellido_paterno, apellido_materno, nombres);
