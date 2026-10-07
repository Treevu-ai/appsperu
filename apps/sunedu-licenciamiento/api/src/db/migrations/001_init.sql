CREATE TABLE IF NOT EXISTS raw_sunedu_batches (
  id            BIGSERIAL PRIMARY KEY,
  dataset       TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS licenciamiento_universidades (
  id                      BIGSERIAL PRIMARY KEY,
  codigo_entidad          TEXT,
  nombre                  TEXT NOT NULL,
  tipo_gestion            TEXT,
  estado_licenciamiento   TEXT NOT NULL,
  fecha_inicio            DATE,
  fecha_fin               DATE,
  periodo_licenciamiento  INTEGER,
  departamento            TEXT,
  provincia               TEXT,
  distrito                TEXT,
  ubigeo                  TEXT,
  latitud                 NUMERIC,
  longitud                NUMERIC,
  fecha_corte             DATE,
  source_batch_id         BIGINT NOT NULL REFERENCES raw_sunedu_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_licenciamiento_nombre ON licenciamiento_universidades (nombre);
CREATE INDEX IF NOT EXISTS idx_licenciamiento_estado ON licenciamiento_universidades (estado_licenciamiento);
CREATE INDEX IF NOT EXISTS idx_licenciamiento_departamento ON licenciamiento_universidades (departamento);
