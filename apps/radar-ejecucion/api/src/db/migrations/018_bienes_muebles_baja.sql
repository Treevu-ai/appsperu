-- Bienes muebles patrimoniales dados de baja (activos desincorporados) del
-- sector público. Fuente: MEF, Plataforma Nacional de Datos Abiertos, CSV
-- público por año (2020-2024), sin autenticación.
-- https://www.datosabiertos.gob.pe/dataset/listado-de-bienes-muebles-patrimoniales-dados-de-baja
--
-- No es el inventario completo de bienes muebles del Estado (eso no tiene
-- fuente pública conocida — verificado 2026-09-04, sin PDF/CSV/XLSX
-- descargable) — es solo el registro de bajas (activos dados de baja por
-- chatarra, robo, obsolescencia, etc.), con resolución administrativa que
-- lo respalda. Sin columna de ubigeo/departamento — el filtro a La Libertad
-- se hace por texto sobre NOM_ENTIDAD, igual que en airhsp_personal (017).

CREATE TABLE IF NOT EXISTS raw_bienes_muebles_baja_batches (
  id            BIGSERIAL PRIMARY KEY,
  source_url    TEXT NOT NULL,
  ejercicio     INTEGER NOT NULL,
  etag          TEXT,
  last_modified TEXT,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_url, etag, last_modified)
);

CREATE TABLE IF NOT EXISTS bienes_muebles_baja (
  id                    BIGSERIAL PRIMARY KEY,
  ruc_entidad           TEXT NOT NULL,
  nom_entidad           TEXT NOT NULL,
  nro_resolucion_baja   TEXT,
  fecha_resolucion_baja DATE,
  nom_acto_baja         TEXT,
  codigo_patrimonial    TEXT NOT NULL,
  denominacion_bien     TEXT NOT NULL,
  ejercicio             INTEGER NOT NULL,
  source_batch_id       BIGINT NOT NULL REFERENCES raw_bienes_muebles_baja_batches(id) ON DELETE CASCADE,
  UNIQUE (codigo_patrimonial)
);

CREATE INDEX IF NOT EXISTS idx_bienes_muebles_baja_ruc ON bienes_muebles_baja (ruc_entidad);
CREATE INDEX IF NOT EXISTS idx_bienes_muebles_baja_entidad ON bienes_muebles_baja (nom_entidad);
CREATE INDEX IF NOT EXISTS idx_bienes_muebles_baja_ejercicio ON bienes_muebles_baja (ejercicio);
