-- Fase 3 del plan de conexión de las 20 tablas faltantes: rankings por país
-- (origen en import, destino en export).
--
-- cdro_10 (subpartida, import), cdro_11 (empresa/importador, import — 2,006
-- filas, el archivo más grande del Anuario), cdro_21 (subpartida, export),
-- cdro_22 (empresa/exportador, export). Comparten la misma forma que
-- trade_flat_ranking (Fase 1), con el país embebido en la primera fila de
-- cada grupo (igual patrón que sector_category en Fase 2) — el rank se
-- reinicia por país, así que la UNIQUE incluye country.
CREATE TABLE IF NOT EXISTS trade_country_ranking (
  id              BIGSERIAL PRIMARY KEY,
  source_cdro     TEXT NOT NULL,
  country         TEXT NOT NULL,
  dimension_type  TEXT NOT NULL CHECK (dimension_type IN ('subpartida', 'empresa')),
  rank            INTEGER NOT NULL,
  dimension_code  TEXT,
  dimension_value TEXT NOT NULL,
  year            INTEGER NOT NULL,
  value_fob_usd   NUMERIC(18, 2) NOT NULL,
  value_cif_usd   NUMERIC(18, 2),
  pct_change      NUMERIC(10, 6),
  pct_structure   NUMERIC(10, 6),
  batch_id        BIGINT NOT NULL REFERENCES raw_batches(id),
  UNIQUE (source_cdro, year, country, rank)
);

CREATE INDEX IF NOT EXISTS idx_trade_country_ranking_lookup
  ON trade_country_ranking (source_cdro, year, country);
