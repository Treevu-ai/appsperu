ALTER TABLE trade_indicators
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'millones_USD';

CREATE INDEX IF NOT EXISTS idx_trade_indicators_unit
  ON trade_indicators (unit);
