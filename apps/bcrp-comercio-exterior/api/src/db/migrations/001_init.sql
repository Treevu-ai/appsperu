CREATE TABLE IF NOT EXISTS raw_bcrp_batches (
  id             BIGSERIAL PRIMARY KEY,
  series_codes   TEXT NOT NULL,
  period_start   TEXT NOT NULL,
  period_end     TEXT NOT NULL,
  checksum       TEXT NOT NULL,
  payload        JSONB NOT NULL,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trade_indicators (
  id             BIGSERIAL PRIMARY KEY,
  series_code    TEXT NOT NULL,
  series_key     TEXT NOT NULL,
  series_title   TEXT NOT NULL,
  category       TEXT NOT NULL,
  period_year    INTEGER NOT NULL,
  period_month   SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  value_usd_millions NUMERIC(18, 6) NOT NULL,
  source_batch_id BIGINT NOT NULL REFERENCES raw_bcrp_batches(id),
  UNIQUE (series_code, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_trade_indicators_lookup
  ON trade_indicators (series_key, period_year, period_month);
