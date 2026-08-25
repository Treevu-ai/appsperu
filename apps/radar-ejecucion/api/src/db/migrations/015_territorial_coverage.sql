CREATE TABLE IF NOT EXISTS territorial_jurisdictions (
  code TEXT PRIMARY KEY CHECK (code ~ '^[0-9]{2}$'),
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'DEPARTAMENTO' CHECK (kind IN ('DEPARTAMENTO','PROVINCIA_CONSTITUCIONAL')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO territorial_jurisdictions (code,name,kind) VALUES
('01','AMAZONAS','DEPARTAMENTO'),('02','ANCASH','DEPARTAMENTO'),('03','APURIMAC','DEPARTAMENTO'),('04','AREQUIPA','DEPARTAMENTO'),('05','AYACUCHO','DEPARTAMENTO'),('06','CAJAMARCA','DEPARTAMENTO'),('07','CALLAO','PROVINCIA_CONSTITUCIONAL'),('08','CUSCO','DEPARTAMENTO'),('09','HUANCAVELICA','DEPARTAMENTO'),('10','HUANUCO','DEPARTAMENTO'),('11','ICA','DEPARTAMENTO'),('12','JUNIN','DEPARTAMENTO'),('13','LA LIBERTAD','DEPARTAMENTO'),('14','LAMBAYEQUE','DEPARTAMENTO'),('15','LIMA','DEPARTAMENTO'),('16','LORETO','DEPARTAMENTO'),('17','MADRE DE DIOS','DEPARTAMENTO'),('18','MOQUEGUA','DEPARTAMENTO'),('19','PASCO','DEPARTAMENTO'),('20','PIURA','DEPARTAMENTO'),('21','PUNO','DEPARTAMENTO'),('22','SAN MARTIN','DEPARTAMENTO'),('23','TACNA','DEPARTAMENTO'),('24','TUMBES','DEPARTAMENTO'),('25','UCAYALI','DEPARTAMENTO')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,kind=EXCLUDED.kind,active=true;

CREATE TABLE IF NOT EXISTS territorial_coverage (
  id BIGSERIAL PRIMARY KEY,
  app_name TEXT NOT NULL,
  source_name TEXT NOT NULL,
  jurisdiction_code TEXT NOT NULL REFERENCES territorial_jurisdictions(code),
  requested BOOLEAN NOT NULL,
  source_records INTEGER,
  normalized_records INTEGER,
  persisted_records INTEGER,
  rejected_records INTEGER,
  completeness TEXT NOT NULL CHECK (completeness IN ('COMPLETA_VERIFICADA','PARCIAL','SIN_DATOS_EN_FUENTE','BLOQUEADA','NO_APLICA')),
  source_batch_ref TEXT,
  cutoff_at TIMESTAMPTZ,
  restriction TEXT NOT NULL,
  dependencies JSONB NOT NULL DEFAULT '[]'::jsonb,
  run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_records IS NULL OR source_records >= 0),
  CHECK (normalized_records IS NULL OR normalized_records >= 0),
  CHECK (persisted_records IS NULL OR persisted_records >= 0),
  CHECK (rejected_records IS NULL OR rejected_records >= 0)
);
CREATE INDEX IF NOT EXISTS idx_territorial_coverage_latest ON territorial_coverage(app_name,source_name,jurisdiction_code,created_at DESC);
