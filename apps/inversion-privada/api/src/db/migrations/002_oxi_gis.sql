CREATE TABLE IF NOT EXISTS raw_oxi_batches (
  id              BIGSERIAL PRIMARY KEY,
  records_total   INTEGER NOT NULL,
  checksum        TEXT NOT NULL,
  payload_meta    JSONB NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oxi_promotion_projects (
  oxi_id                  INTEGER PRIMARY KEY,
  fase_oxi                TEXT,
  tipo_inversion          TEXT,
  ultimo_nivel_estudio    TEXT,
  nivel_gobierno          TEXT,
  departamento            TEXT,
  provincia               TEXT,
  distrito                TEXT,
  entidad                 TEXT,
  codigo_snip             TEXT,
  nombre                  TEXT NOT NULL,
  funcion                 TEXT,
  tipologia               TEXT,
  monto_referencial       TEXT,
  monto_referencial_soles NUMERIC(18, 2),
  rango_monto             TEXT,
  source_batch_id         BIGINT NOT NULL REFERENCES raw_oxi_batches(id),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oxi_promotion_projects_departamento
  ON oxi_promotion_projects (departamento);

CREATE INDEX IF NOT EXISTS idx_oxi_promotion_projects_codigo_snip
  ON oxi_promotion_projects (codigo_snip)
  WHERE codigo_snip IS NOT NULL AND codigo_snip <> '';
