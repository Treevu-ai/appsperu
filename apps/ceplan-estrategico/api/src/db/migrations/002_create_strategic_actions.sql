-- Tabla: strategic_actions
-- Acciones estratégicas institucionales

CREATE TABLE IF NOT EXISTS strategic_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id UUID NOT NULL REFERENCES strategic_objectives(id) ON DELETE CASCADE,
  action_code VARCHAR(50) NOT NULL,
  action_name TEXT NOT NULL,
  responsible_unit VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(objective_id, action_code)
);

CREATE INDEX idx_strategic_actions_objective_id ON strategic_actions(objective_id);
