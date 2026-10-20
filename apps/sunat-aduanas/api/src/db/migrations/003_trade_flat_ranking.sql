-- Rankings planos del Anuario SUNAT (Fase 1 del plan de conexión de las 20
-- tablas faltantes): cdro_07 (subpartidas, import), cdro_08 (empresas
-- importadoras), cdro_09 (país origen), cdro_20 (productos tradicionales,
-- export). Comparten la misma forma — item + rank + valor FOB(+CIF) +
-- variación% + estructura% — así que una sola tabla con `source_cdro` y
-- `dimension_type` evita 4 esquemas casi idénticos.
--
-- Solo se persiste el año 2024 (valor_fob/cif "actual") + pct_change (vs
-- 2023) + pct_structure, igual que ya hace normalizeCdro16 para cdro_16 —
-- el 2023 crudo se lee del XLSX pero se descarta, no se duplica el dato
-- base que ya vive en pct_change.
CREATE TABLE IF NOT EXISTS trade_flat_ranking (
  id              BIGSERIAL PRIMARY KEY,
  source_cdro     TEXT NOT NULL,
  dimension_type  TEXT NOT NULL CHECK (dimension_type IN ('subpartida', 'empresa', 'pais')),
  rank            INTEGER NOT NULL,
  dimension_code  TEXT,
  dimension_value TEXT NOT NULL,
  year            INTEGER NOT NULL,
  value_fob_usd   NUMERIC(18, 2) NOT NULL,
  value_cif_usd   NUMERIC(18, 2),
  pct_change      NUMERIC(10, 6),
  pct_structure   NUMERIC(10, 6),
  batch_id        BIGINT NOT NULL REFERENCES raw_batches(id),
  UNIQUE (source_cdro, year, rank)
);

CREATE INDEX IF NOT EXISTS idx_trade_flat_ranking_lookup
  ON trade_flat_ranking (source_cdro, year, dimension_type);
