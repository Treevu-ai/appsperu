-- Tabla: physical_targets
-- Metas físicas de las actividades operativas

CREATE TABLE IF NOT EXISTS physical_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES poi_activities(id) ON DELETE CASCADE,
  target_year INTEGER NOT NULL,
  target_value NUMERIC NOT NULL,
  unit_of_measure VARCHAR(50),
  achievement_value NUMERIC,
  achievement_pct NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(activity_id, target_year)
);

CREATE INDEX idx_physical_targets_activity_id ON physical_targets(activity_id);
CREATE INDEX idx_physical_targets_target_year ON physical_targets(target_year);
