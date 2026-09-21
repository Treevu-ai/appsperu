CREATE TABLE raw_senace_batches (
  id BIGSERIAL PRIMARY KEY,
  source_url TEXT NOT NULL,
  estado_filtro TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE senace_cartera_proyectos (
  id BIGSERIAL PRIMARY KEY,
  senace_id INTEGER NOT NULL,
  titular TEXT,
  ruc TEXT,
  titulo_proyecto TEXT,
  unidad_proyecto TEXT,
  tipo TEXT,
  actividad TEXT,
  fecha_inicio DATE,
  estado TEXT NOT NULL,
  descripcion TEXT,
  longitud DOUBLE PRECISION,
  latitud DOUBLE PRECISION,
  resolucion TEXT,
  source_batch_id BIGINT NOT NULL REFERENCES raw_senace_batches(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (senace_id)
);

CREATE INDEX idx_senace_cartera_proyectos_estado ON senace_cartera_proyectos (estado);
CREATE INDEX idx_senace_cartera_proyectos_ruc ON senace_cartera_proyectos (ruc);
CREATE INDEX idx_senace_cartera_proyectos_geo ON senace_cartera_proyectos (latitud, longitud);

CREATE TABLE senace_cartera_proyectos_rejected (
  id BIGSERIAL PRIMARY KEY,
  source_batch_id BIGINT NOT NULL REFERENCES raw_senace_batches(id),
  raw_row JSONB NOT NULL,
  reason TEXT NOT NULL,
  rejected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
