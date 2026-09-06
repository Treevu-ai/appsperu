-- Fase 0 + construcción (2026-09-06): "Generación anual de residuos sólidos domiciliarios y
-- municipales" (MINAM, vía SIGERSOL), confirmado en vivo. Ver
-- docs/data-contracts/minam-residuos-solidos.md.
--
-- Serie histórica real 2019-2024 (a diferencia de la mayoría de fuentes recientes del
-- catálogo, que son snapshot único). Sin dato de persona natural — población y generación
-- agregadas por distrito.

CREATE TABLE IF NOT EXISTS raw_residuos_solidos_batches (
  id            BIGSERIAL PRIMARY KEY,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS residuos_solidos_municipales (
  id                          BIGSERIAL PRIMARY KEY,
  ubigeo                      TEXT NOT NULL CHECK (ubigeo ~ '^\d{6}$'),
  anio                        INTEGER NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  departamento                TEXT NOT NULL,
  provincia                   TEXT NOT NULL,
  distrito                    TEXT NOT NULL,
  region_natural              TEXT,
  tipo_municipalidad          TEXT,
  poblacion_total             INTEGER,
  poblacion_urbana            INTEGER,
  poblacion_rural             INTEGER,
  clasificacion_municipal_mef TEXT,
  generacion_percapita_dom    NUMERIC,
  generacion_dom_urbana_tdia  NUMERIC,
  generacion_dom_urbana_tanio NUMERIC,
  generacion_mun_tanio        NUMERIC,
  generacion_mun_tdia         NUMERIC,
  generacion_percapita_mun    NUMERIC,
  fecha_corte                 DATE,
  source_batch_id             BIGINT NOT NULL REFERENCES raw_residuos_solidos_batches(id),
  UNIQUE (ubigeo, anio)
);

CREATE TABLE IF NOT EXISTS residuos_solidos_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_residuos_solidos_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_residuos_solidos_ubigeo ON residuos_solidos_municipales (ubigeo);
CREATE INDEX IF NOT EXISTS idx_residuos_solidos_dpto_prov
  ON residuos_solidos_municipales (departamento, provincia);
