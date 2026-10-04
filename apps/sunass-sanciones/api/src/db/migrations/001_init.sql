-- Reconstruida 2026-10-04 a partir del esquema real aplicado en Neon (sunass_sanciones) —
-- el archivo original se perdió antes de ser commiteado; esta es una reconstrucción fiel
-- (columnas, tipos, constraints e índices verificados contra information_schema/pg_catalog).

CREATE TABLE IF NOT EXISTS raw_sunass_batches (
  id            BIGSERIAL PRIMARY KEY,
  dataset       TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sanciones_eps (
  id                      BIGSERIAL PRIMARY KEY,
  expediente              TEXT NOT NULL UNIQUE,
  administrado            TEXT NOT NULL,
  ubigeo                  TEXT,
  departamento            TEXT,
  provincia               TEXT,
  distrito                TEXT,
  tema                    TEXT,
  incumplimiento          TEXT,
  resolucion              TEXT,
  multa                   BOOLEAN NOT NULL DEFAULT false,
  amonestacion_escrita    BOOLEAN NOT NULL DEFAULT false,
  remocion                BOOLEAN NOT NULL DEFAULT false,
  archivo                 BOOLEAN NOT NULL DEFAULT false,
  medida_correctiva       BOOLEAN NOT NULL DEFAULT false,
  anio                    INTEGER,
  mes                     INTEGER,
  source_batch_id         BIGINT NOT NULL REFERENCES raw_sunass_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_sanciones_eps_administrado ON sanciones_eps (administrado);
CREATE INDEX IF NOT EXISTS idx_sanciones_eps_ubigeo ON sanciones_eps (ubigeo);
