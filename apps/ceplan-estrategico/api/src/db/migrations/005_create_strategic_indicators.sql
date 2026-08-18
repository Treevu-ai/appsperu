-- Tabla: strategic_indicators
-- Indicadores estratégicos (ej. CUMP01, CUMP02, PN03)

CREATE TABLE IF NOT EXISTS strategic_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_code VARCHAR(20) NOT NULL,
  indicator_code VARCHAR(50) NOT NULL,
  indicator_name TEXT NOT NULL,
  value NUMERIC,
  target_value NUMERIC,
  measurement_date DATE,
  frequency VARCHAR(20),
  source VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_strategic_indicators_entity_code ON strategic_indicators(entity_code);
CREATE INDEX idx_strategic_indicators_indicator_code ON strategic_indicators(indicator_code);
CREATE INDEX idx_strategic_indicators_measurement_date ON strategic_indicators(measurement_date);
