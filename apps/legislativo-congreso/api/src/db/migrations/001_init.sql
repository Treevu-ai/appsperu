-- Proyectos de ley del Congreso de la República, confirmado en vivo 2026-09-21 (ADS-15).
-- Ver docs/data-contracts/congreso-spley-portal-service.md.
--
-- Fuente: POST https://api.congreso.gob.pe/spley-portal-service/proyecto-ley/lista-con-filtro
-- -- fuente pública, sin auth, sin sesión de navegador (curl puro basta). Cada llamada por
-- `perParId` devuelve el snapshot completo actual de ese periodo (no incremental, no hay
-- paginación real -- `pageSize` no tiene efecto verificado en vivo), así que cada ingesta es un
-- upsert sobre el snapshot vigente, no un append.
--
-- CLAVE REAL VERIFICADA: per_par_id + pley_num. Verificado contra las 14,864 filas del periodo
-- 2021 -- 14,864 claves únicas, 0 duplicados (ver el data contract). `proyecto_ley` (ej.
-- "14864/2025-CR") es el código legible derivado de esos dos campos, pero contiene "/" y no se
-- usa como clave ni como segmento de ruta sin codificar.
--
-- PERIODOS VÁLIDOS: se descubren en vivo vía GET /periodo-parlamentario en cada ingesta, no se
-- hardcodean -- un tercero (unimauro/congreso-abierto-peru) asumía años históricos (2016, 2011,
-- 2006) que no existen en este servicio y devuelven 200 con lista vacía, no error.
--
-- SIN PII: `autores`/`proponente` son congresistas y entidades públicas (funcionarios
-- públicos), no hay dato personal de ciudadanos particulares en este endpoint.

CREATE TABLE IF NOT EXISTS raw_congreso_batches (
  id            BIGSERIAL PRIMARY KEY,
  source_url    TEXT NOT NULL,
  per_par_id    INTEGER NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legislativo_congreso_proyectos (
  id                     BIGSERIAL PRIMARY KEY,
  per_par_id             INTEGER NOT NULL,
  pley_num               INTEGER NOT NULL,
  proyecto_ley           TEXT NOT NULL,
  estado                 TEXT NOT NULL,
  fecha_presentacion     DATE,
  titulo                 TEXT NOT NULL,
  proponente             TEXT,
  autores                TEXT,
  cod_tipo_parl          TEXT,
  cod_tipo_parl_actual   TEXT,
  source_batch_id        BIGINT NOT NULL REFERENCES raw_congreso_batches(id),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (per_par_id, pley_num)
);

CREATE TABLE IF NOT EXISTS legislativo_congreso_proyectos_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_congreso_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legislativo_congreso_proyectos_batch ON legislativo_congreso_proyectos (source_batch_id);
CREATE INDEX IF NOT EXISTS idx_legislativo_congreso_proyectos_estado ON legislativo_congreso_proyectos (estado);
CREATE INDEX IF NOT EXISTS idx_legislativo_congreso_proyectos_fecha ON legislativo_congreso_proyectos (fecha_presentacion);
CREATE INDEX IF NOT EXISTS idx_raw_congreso_batches_per_par_id ON raw_congreso_batches (per_par_id);
