-- Tabla: poi_activities
-- Actividades operativas del POI (Plan Operativo Institucional)

CREATE TABLE IF NOT EXISTS poi_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_code VARCHAR(20) NOT NULL,
  poi_code VARCHAR(50) NOT NULL,
  activity_code VARCHAR(50) NOT NULL,
  activity_name TEXT NOT NULL,
  action_id UUID REFERENCES strategic_actions(id) ON DELETE SET NULL,
  budget_code VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entity_code, poi_code, activity_code)
);

CREATE INDEX idx_poi_activities_entity_code ON poi_activities(entity_code);
CREATE INDEX idx_poi_activities_poi_code ON poi_activities(poi_code);
CREATE INDEX idx_poi_activities_action_id ON poi_activities(action_id);
