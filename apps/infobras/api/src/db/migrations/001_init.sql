CREATE TABLE IF NOT EXISTS raw_infobras_batches (
  id             BIGSERIAL PRIMARY KEY,
  filename       TEXT NOT NULL,
  checksum       TEXT NOT NULL,
  record_count   INTEGER NOT NULL,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_works (
  id                        BIGSERIAL PRIMARY KEY,
  codigo_infobras           TEXT NOT NULL,
  codigo_entidad            TEXT NOT NULL,
  entidad_nombre            TEXT NOT NULL,
  nombre_obra               TEXT NOT NULL,
  modalidad_ejecucion       TEXT,
  naturaleza_obra           TEXT,
  estado_ejecucion          TEXT,
  nivel_gobierno            TEXT,
  sector_entidad            TEXT,
  cui                       TEXT,
  codigo_snip               TEXT,
  nombre_inversion          TEXT,
  monto_viable              NUMERIC(18, 2),
  costo_actualizado         NUMERIC(18, 2),
  departamento              TEXT NOT NULL,
  provincia                 TEXT,
  distrito                  TEXT,
  costo_expediente_tecnico  NUMERIC(18, 2),
  avance_fisico_prog_pct    NUMERIC(5, 2),
  avance_fisico_real_pct    NUMERIC(5, 2),
  valorizacion_prog         NUMERIC(18, 2),
  valorizacion_ejecutada    NUMERIC(18, 2),
  ejecucion_financiera_pct  NUMERIC(5, 2),
  existe_paralizacion       BOOLEAN NOT NULL DEFAULT false,
  causal_paralizacion       TEXT,
  fecha_paralizacion        DATE,
  dias_paralizado           INTEGER,
  monto_devengado_total     NUMERIC(18, 2),
  source_batch_id           BIGINT NOT NULL REFERENCES raw_infobras_batches(id),
  UNIQUE (codigo_infobras)
);

CREATE INDEX IF NOT EXISTS idx_public_works_departamento ON public_works (departamento);
CREATE INDEX IF NOT EXISTS idx_public_works_paralizacion ON public_works (existe_paralizacion) WHERE existe_paralizacion = true;

CREATE TABLE IF NOT EXISTS public_works_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_infobras_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
