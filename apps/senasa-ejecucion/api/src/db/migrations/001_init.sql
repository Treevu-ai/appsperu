-- Reconstruida 2026-10-04 a partir del esquema real aplicado en Neon (senasa_ejecucion) —
-- el archivo original se perdió antes de ser commiteado; esta es una reconstrucción fiel
-- (columnas, tipos, constraints e índices verificados contra information_schema/pg_catalog).

CREATE TABLE IF NOT EXISTS raw_senasa_batches (
  id            BIGSERIAL PRIMARY KEY,
  dataset       TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ejecucion_fisica (
  id                BIGSERIAL PRIMARY KEY,
  anio              INTEGER NOT NULL,
  mes               INTEGER NOT NULL,
  cod_dep           TEXT,
  nom_dep           TEXT,
  cod_pro           TEXT,
  nom_pro           TEXT,
  cod_dis           TEXT,
  nom_dis           TEXT,
  actividad         TEXT,
  unidad_medida     TEXT,
  ejecucion_fisica  NUMERIC NOT NULL,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_senasa_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_ejecucion_fisica_dep ON ejecucion_fisica (nom_dep);
CREATE INDEX IF NOT EXISTS idx_ejecucion_fisica_actividad ON ejecucion_fisica (actividad);
