CREATE TABLE IF NOT EXISTS raw_gis_batches (
  id              BIGSERIAL PRIMARY KEY,
  feature_count   INTEGER NOT NULL,
  checksum        TEXT NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vertix_project_geometries (
  codigo              TEXT PRIMARY KEY,
  id_proyecto         INTEGER,
  nombre_proyecto     TEXT,
  sector              TEXT,
  fase                TEXT,
  tipo_proyecto       TEXT,
  departamentos_inei  TEXT[] NOT NULL DEFAULT '{}',
  tipo_coordenada     TEXT,
  geometry            JSONB NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_gis_batches(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vertix_project_geometries_id_proyecto
  ON vertix_project_geometries (id_proyecto);

CREATE INDEX IF NOT EXISTS idx_vertix_project_geometries_departamentos
  ON vertix_project_geometries USING GIN (departamentos_inei);
