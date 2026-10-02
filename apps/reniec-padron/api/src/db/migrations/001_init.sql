CREATE TABLE IF NOT EXISTS raw_reniec_batches (
  id BIGSERIAL PRIMARY KEY,
  dataset TEXT NOT NULL,
  source_url TEXT NOT NULL,
  checksum TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS padron_electoral_2026 (
  id BIGSERIAL PRIMARY KEY,
  ubigeo TEXT,
  departamento TEXT,
  provincia TEXT,
  distrito TEXT,
  sexo TEXT,
  rango_edad TEXT,
  caducidad TEXT,
  padron TEXT,
  discapacidad TEXT,
  educacion TEXT,
  estado_civil TEXT,
  tipo_dni TEXT,
  cantidad INTEGER NOT NULL,
  source_batch_id BIGINT NOT NULL REFERENCES raw_reniec_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_padron_ubigeo ON padron_electoral_2026 (ubigeo);
CREATE INDEX IF NOT EXISTS idx_padron_departamento ON padron_electoral_2026 (departamento);
