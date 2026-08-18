-- Tabla: strategic_objectives
-- Objetivos estratégicos institucionales (PEI)

CREATE TABLE IF NOT EXISTS strategic_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_code VARCHAR(20) NOT NULL,
  pei_code VARCHAR(50),
  objective_code VARCHAR(50) NOT NULL,
  objective_name TEXT NOT NULL,
  perspective VARCHAR(100),
  start_year INTEGER,
  end_year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entity_code, pei_code, objective_code)
);

CREATE INDEX idx_strategic_objectives_entity_code ON strategic_objectives(entity_code);
CREATE INDEX idx_strategic_objectives_pei_code ON strategic_objectives(pei_code);
