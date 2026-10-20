-- Fase 4 (última) del plan de conexión de las 20 tablas faltantes: el resto
-- de formas que no encajan en rankings planos/CUODE/sector/país.
--
-- trade_summary (cdro_01 intercambio comercial, cdro_03 CUODE solo-CIF,
-- cdro_14 convenios internacionales): árbol de categorías de profundidad
-- variable (hasta 3 niveles) con un único valor numérico por hoja, en vez
-- de rankings con FOB/CIF separados. category_path concatena los niveles
-- ancestros ("EXPORTACION DEFINITIVA > TRADICIONALES > MINERO"); item_label
-- es la hoja real de esa fila. pct_metric es flexible (estructura% en
-- cdro_01/03, grado de utilización en cdro_14) — mismo criterio pragmático
-- que ya se usó para no romper el patrón de "una tabla por forma real".
CREATE TABLE IF NOT EXISTS trade_summary (
  id             BIGSERIAL PRIMARY KEY,
  source_cdro    TEXT NOT NULL,
  category_path  TEXT NOT NULL,
  item_code      TEXT,
  item_label     TEXT NOT NULL,
  year           INTEGER NOT NULL,
  value_usd      NUMERIC(18, 2) NOT NULL,
  pct_change     NUMERIC(10, 6),
  pct_metric     NUMERIC(10, 6),
  batch_id       BIGINT NOT NULL REFERENCES raw_batches(id),
  UNIQUE (source_cdro, year, category_path, item_label)
);

CREATE INDEX IF NOT EXISTS idx_trade_summary_lookup
  ON trade_summary (source_cdro, year, category_path);

-- trade_country_bilateral (cdro_02): único árbol continente → zona
-- económica → país con export/import/total propios. NULLS NOT DISTINCT
-- porque una fila de agregado de zona (country NULL) debe quedar única
-- por (year, continent, economic_zone) para que la reingesta sea
-- idempotente — Postgres trata NULL como distinto de NULL por defecto.
CREATE TABLE IF NOT EXISTS trade_country_bilateral (
  id             BIGSERIAL PRIMARY KEY,
  continent      TEXT NOT NULL,
  economic_zone  TEXT,
  country        TEXT,
  year           INTEGER NOT NULL,
  export_usd     NUMERIC(18, 2) NOT NULL,
  import_usd     NUMERIC(18, 2) NOT NULL,
  total_usd      NUMERIC(18, 2) NOT NULL,
  pct_change     NUMERIC(10, 6),
  pct_structure  NUMERIC(10, 6),
  batch_id       BIGINT NOT NULL REFERENCES raw_batches(id),
  UNIQUE NULLS NOT DISTINCT (year, continent, economic_zone, country)
);

CREATE INDEX IF NOT EXISTS idx_trade_country_bilateral_lookup
  ON trade_country_bilateral (year, continent);

-- customs_ops_ranking (cdro_12 despachadores de aduana, cdro_13 almacenes y
-- depósitos): CIF + cantidad de DAMs + derechos e impuestos — métrica
-- distinta de todo lo anterior (sin FOB). cdro_12 agrupa por categoría de
-- despachador (ej. "AGENCIA DE ADUANA"); cdro_13 es un ranking plano sin
-- categoría (NULL). NULLS NOT DISTINCT por la misma razón que arriba.
CREATE TABLE IF NOT EXISTS customs_ops_ranking (
  id                 BIGSERIAL PRIMARY KEY,
  source_cdro        TEXT NOT NULL,
  operator_category  TEXT,
  rank               INTEGER NOT NULL,
  operator_name      TEXT NOT NULL,
  year               INTEGER NOT NULL,
  value_cif_usd      NUMERIC(18, 2) NOT NULL,
  dam_count          INTEGER NOT NULL,
  duties_usd         NUMERIC(18, 2) NOT NULL,
  batch_id           BIGINT NOT NULL REFERENCES raw_batches(id),
  UNIQUE NULLS NOT DISTINCT (source_cdro, year, operator_category, rank)
);

CREATE INDEX IF NOT EXISTS idx_customs_ops_ranking_lookup
  ON customs_ops_ranking (source_cdro, year);
