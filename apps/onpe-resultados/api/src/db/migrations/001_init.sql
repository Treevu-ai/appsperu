-- Reconstruida 2026-10-04 a partir del esquema real aplicado en Neon (onpe_resultados) —
-- el archivo original se perdió antes de ser commiteado; esta es una reconstrucción fiel
-- (columnas, tipos, constraints e índices verificados contra information_schema/pg_catalog).

CREATE TABLE IF NOT EXISTS raw_onpe_batches (
  id            BIGSERIAL PRIMARY KEY,
  dataset       TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resultados_mesa (
  id                    BIGSERIAL PRIMARY KEY,
  ubigeo                TEXT,
  departamento          TEXT,
  provincia             TEXT,
  distrito              TEXT,
  tipo_eleccion         TEXT NOT NULL,
  mesa                  TEXT NOT NULL,
  estado_mesa           TEXT,
  tipo_agrupacion       TEXT,
  codigo_agrupacion     TEXT,
  agrupacion_politica   TEXT NOT NULL,
  votos_obtenidos       INTEGER NOT NULL,
  electores_habiles     INTEGER,
  votos_blancos         INTEGER,
  votos_nulos           INTEGER,
  votos_impugnados      INTEGER,
  source_batch_id       BIGINT NOT NULL REFERENCES raw_onpe_batches(id),
  UNIQUE (tipo_eleccion, mesa, codigo_agrupacion)
);

CREATE INDEX IF NOT EXISTS idx_resultados_mesa_ubigeo ON resultados_mesa (ubigeo);
CREATE INDEX IF NOT EXISTS idx_resultados_mesa_agrupacion ON resultados_mesa (agrupacion_politica);
