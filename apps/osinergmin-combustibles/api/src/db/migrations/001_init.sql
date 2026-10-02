CREATE TABLE IF NOT EXISTS raw_osinergmin_batches (
  id BIGSERIAL PRIMARY KEY,
  dataset TEXT NOT NULL,
  source_url TEXT NOT NULL,
  checksum TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grifos_estaciones (
  id BIGSERIAL PRIMARY KEY,
  expediente TEXT NOT NULL,
  codigo_osinergmin TEXT,
  registro TEXT,
  ruc TEXT,
  razon_social TEXT NOT NULL,
  direccion_operativa TEXT,
  departamento TEXT,
  provincia TEXT,
  distrito TEXT,
  tipo_establecimiento TEXT,
  capacidad_total_cl_gln NUMERIC,
  fecha_emision DATE,
  termino_vigencia TEXT,
  representante TEXT,
  source_batch_id BIGINT NOT NULL REFERENCES raw_osinergmin_batches(id),
  UNIQUE (expediente)
);

CREATE INDEX IF NOT EXISTS idx_grifos_ruc ON grifos_estaciones (ruc);
CREATE INDEX IF NOT EXISTS idx_grifos_departamento ON grifos_estaciones (departamento);
