CREATE TABLE IF NOT EXISTS raw_certificaciones_evaluadas_batches (
  id BIGSERIAL PRIMARY KEY,
  source_url TEXT NOT NULL,
  checksum TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fuente complementaria a `senace_cartera_proyectos` (CKAN datosabiertos.gob.pe
-- en vez del portal operativo propio de SENACE) -- trae RUC de la consultora
-- ambiental y monto de inversión, campos que la otra fuente no tiene.
CREATE TABLE IF NOT EXISTS certificaciones_evaluadas (
  id BIGSERIAL PRIMARY KEY,
  expediente TEXT NOT NULL,
  departamento TEXT,
  provincia TEXT,
  distrito TEXT,
  ubigeo TEXT,
  titular_proyecto TEXT,
  ruc_titular TEXT,
  consultora TEXT,
  ruc_consultora TEXT,
  titulo_proyecto TEXT,
  unidad_proyecto TEXT,
  tipo_iga TEXT,
  actividad TEXT,
  fecha_ingreso DATE,
  estado TEXT,
  longitud DOUBLE PRECISION,
  latitud DOUBLE PRECISION,
  nro_rd TEXT,
  fecha_rd DATE,
  monto_inversion NUMERIC,
  moneda_inversion TEXT,
  source_batch_id BIGINT NOT NULL REFERENCES raw_certificaciones_evaluadas_batches(id),
  UNIQUE (expediente)
);

CREATE INDEX IF NOT EXISTS idx_certif_eval_ruc_titular ON certificaciones_evaluadas (ruc_titular);
CREATE INDEX IF NOT EXISTS idx_certif_eval_ruc_consultora ON certificaciones_evaluadas (ruc_consultora);
CREATE INDEX IF NOT EXISTS idx_certif_eval_actividad ON certificaciones_evaluadas (actividad);
