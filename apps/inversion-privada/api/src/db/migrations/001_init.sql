CREATE TABLE IF NOT EXISTS raw_vertix_batches (
  id              BIGSERIAL PRIMARY KEY,
  records_total   INTEGER NOT NULL,
  checksum        TEXT NOT NULL,
  payload         JSONB NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS private_investment_projects (
  vertix_id               INTEGER PRIMARY KEY,
  slug                    TEXT NOT NULL,
  tipo_proyecto           TEXT NOT NULL,
  id_tipo_proyecto        INTEGER,
  nombre                  TEXT NOT NULL,
  nombre_corto            TEXT,
  estado                  TEXT,
  fase                    TEXT,
  id_fase                 INTEGER,
  titular                 TEXT,
  sector                  TEXT,
  cartera                 TEXT,
  modalidad               TEXT,
  modalidad_contractual   TEXT,
  iniciativa              TEXT,
  monto_inversion_sigv    NUMERIC(18, 4),
  monto_proyecto          TEXT,
  green_brownfield        TEXT,
  buena_pro_prevista      TEXT,
  anho_concesion          INTEGER,
  departamentos_inei      TEXT[] NOT NULL DEFAULT '{}',
  departamentos           TEXT[] NOT NULL DEFAULT '{}',
  url_thumb               TEXT,
  url_geo                 TEXT,
  source_batch_id         BIGINT NOT NULL REFERENCES raw_vertix_batches(id),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_private_investment_projects_sector
  ON private_investment_projects (sector);

CREATE INDEX IF NOT EXISTS idx_private_investment_projects_tipo
  ON private_investment_projects (tipo_proyecto);

CREATE INDEX IF NOT EXISTS idx_private_investment_projects_departamentos
  ON private_investment_projects USING GIN (departamentos);
