CREATE TABLE IF NOT EXISTS territory_name_crosswalk (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  departamento TEXT NOT NULL,
  provincia TEXT,
  distrito TEXT,
  ubigeo TEXT REFERENCES territories(ubigeo),
  match_status TEXT NOT NULL CHECK (match_status IN ('confirmada', 'candidata', 'sin_match')),
  source TEXT NOT NULL DEFAULT 'infobras',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (departamento, provincia, distrito, source)
);
