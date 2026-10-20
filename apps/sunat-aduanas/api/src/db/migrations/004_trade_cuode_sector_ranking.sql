-- Fase 2 del plan de conexión de las 20 tablas faltantes: rankings con
-- categoría padre.
--
-- trade_cuode_ranking (cdro_04 subpartida, cdro_05 empresa, cdro_06 país):
-- import, CUODE (categoría económica) como fila propia con su propio valor
-- agregado, ítems debajo listados por rank. El rank se reinicia por
-- categoría CUODE (cada categoría tiene su propio top-N), así que la
-- UNIQUE incluye cuode_category, no solo rank.
CREATE TABLE IF NOT EXISTS trade_cuode_ranking (
  id              BIGSERIAL PRIMARY KEY,
  source_cdro     TEXT NOT NULL,
  cuode_category  TEXT NOT NULL,
  dimension_type  TEXT NOT NULL CHECK (dimension_type IN ('subpartida', 'empresa', 'pais')),
  rank            INTEGER NOT NULL,
  dimension_code  TEXT,
  dimension_value TEXT NOT NULL,
  year            INTEGER NOT NULL,
  value_fob_usd   NUMERIC(18, 2) NOT NULL,
  value_cif_usd   NUMERIC(18, 2) NOT NULL,
  pct_change      NUMERIC(10, 6),
  pct_structure   NUMERIC(10, 6),
  batch_id        BIGINT NOT NULL REFERENCES raw_batches(id),
  UNIQUE (source_cdro, year, cuode_category, rank)
);

CREATE INDEX IF NOT EXISTS idx_trade_cuode_ranking_lookup
  ON trade_cuode_ranking (source_cdro, year, cuode_category);

-- trade_sector_ranking (cdro_18 empresa, cdro_19 producto): export, SIN
-- columna CIF (las exportaciones del Anuario solo publican FOB). A
-- diferencia de CUODE, el sector económico no tiene su propia fila con
-- valor agregado — viaja embebido en la primera fila de cada grupo (ej.
-- "MINERO") y se omite en las filas siguientes del mismo grupo.
CREATE TABLE IF NOT EXISTS trade_sector_ranking (
  id              BIGSERIAL PRIMARY KEY,
  source_cdro     TEXT NOT NULL,
  sector_category TEXT NOT NULL,
  dimension_type  TEXT NOT NULL CHECK (dimension_type IN ('subpartida', 'empresa')),
  rank            INTEGER NOT NULL,
  dimension_code  TEXT,
  dimension_value TEXT NOT NULL,
  year            INTEGER NOT NULL,
  value_fob_usd   NUMERIC(18, 2) NOT NULL,
  pct_change      NUMERIC(10, 6),
  pct_structure   NUMERIC(10, 6),
  batch_id        BIGINT NOT NULL REFERENCES raw_batches(id),
  UNIQUE (source_cdro, year, sector_category, rank)
);

CREATE INDEX IF NOT EXISTS idx_trade_sector_ranking_lookup
  ON trade_sector_ranking (source_cdro, year, sector_category);
