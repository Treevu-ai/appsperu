-- Patrimonio inmobiliario del Estado — cobertura PARCIAL, solo predios que
-- SBN ha supervisado (no el registro completo SINABIP). El dataset
-- "SBN Predios del Estado registrados en el SINABIP" (registro completo)
-- solo se publica como enlace de Google Drive, y ese enlace está roto
-- (verificado 2026-09-04: "No se encontró la página"). Este es el dataset
-- alterno real y descargable: "SBN Supervisión de predios estatales",
-- CSV público en datosabiertos.gob.pe (protegido por un WAF que bloquea
-- User-Agent no-navegador — no requiere autenticación, solo un header
-- de User-Agent normal).
-- https://www.datosabiertos.gob.pe/dataset/sbn-supervisi%C3%B3n-de-predios-estatales
--
-- Bienes MUEBLES (vehículos, equipos, mobiliario) del Estado: sin fuente
-- pública descargable encontrada tras búsqueda razonable — no hay tabla
-- para eso aquí. Ver docs/conectores.md para la nota completa.

CREATE TABLE IF NOT EXISTS raw_sbn_supervision_batches (
  id           BIGSERIAL PRIMARY KEY,
  source_url   TEXT NOT NULL,
  checksum     TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_url, checksum)
);

CREATE TABLE IF NOT EXISTS sbn_supervision_predios (
  id                    BIGSERIAL PRIMARY KEY,
  item                  INTEGER NOT NULL,
  tipo_informe          TEXT,
  numero_informe        TEXT NOT NULL,
  fecha_emision         DATE,
  actividad             TEXT,
  departamento          TEXT NOT NULL,
  provincia             TEXT NOT NULL,
  distrito              TEXT NOT NULL,
  cus                   TEXT,
  area_supervisada_m2   NUMERIC(14, 2),
  resultado_supervision TEXT,
  titular_predio        TEXT,
  zona_playa_protegida  BOOLEAN,
  source_batch_id       BIGINT NOT NULL REFERENCES raw_sbn_supervision_batches(id) ON DELETE CASCADE,
  UNIQUE (numero_informe, cus)
);

CREATE INDEX IF NOT EXISTS idx_sbn_supervision_ubicacion ON sbn_supervision_predios (departamento, provincia, distrito);
