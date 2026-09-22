CREATE TABLE raw_indeci_batches (
  id BIGSERIAL PRIMARY KEY,
  source_url TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE indeci_emergencias (
  id BIGSERIAL PRIMARY KEY,
  sinpad_id INTEGER,
  fecha_emergencia DATE,
  anio INTEGER,
  mes TEXT,
  cod_distrito TEXT,
  departamento TEXT,
  provincia TEXT,
  distrito TEXT,
  peligro TEXT,
  tipo_peligro TEXT,
  region_natural TEXT,
  fallecidos INTEGER,
  desaparecidos INTEGER,
  lesionados INTEGER,
  damnificados INTEGER,
  afectados INTEGER,
  viviendas_destruidas INTEGER,
  viviendas_afectadas INTEGER,
  peso_ayuda DOUBLE PRECISION,
  costo_ayuda DOUBLE PRECISION,
  detalle_edan JSONB,
  source_batch_id BIGINT NOT NULL REFERENCES raw_indeci_batches(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_indeci_emergencias_ubigeo ON indeci_emergencias (departamento, provincia, distrito);
CREATE INDEX idx_indeci_emergencias_anio ON indeci_emergencias (anio);
CREATE INDEX idx_indeci_emergencias_peligro ON indeci_emergencias (peligro);
CREATE INDEX idx_indeci_emergencias_fecha ON indeci_emergencias (fecha_emergencia);

CREATE TABLE indeci_emergencias_rejected (
  id BIGSERIAL PRIMARY KEY,
  source_batch_id BIGINT NOT NULL REFERENCES raw_indeci_batches(id),
  raw_row JSONB NOT NULL,
  reason TEXT NOT NULL,
  rejected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
