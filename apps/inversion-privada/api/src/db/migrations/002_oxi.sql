CREATE TABLE IF NOT EXISTS raw_oxi_batches (
  id              BIGSERIAL PRIMARY KEY,
  records_total   INTEGER NOT NULL,
  checksum        TEXT NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oxi_investment_promotions (
  oxi_id                        INTEGER PRIMARY KEY,
  fase                          TEXT,
  tipo_inversion                TEXT,
  nivel_estudio                 TEXT,
  nivel_gobierno                TEXT,
  departamento                  TEXT,
  provincia                     TEXT,
  distrito                      TEXT,
  entidad                       TEXT,
  codigo_referencia             TEXT,
  nombre_proyecto               TEXT NOT NULL,
  funcion                       TEXT,
  tipologia                     TEXT,
  monto_inversion_referencial   NUMERIC(18, 2),
  rango_monto                   TEXT,
  source_batch_id               BIGINT NOT NULL REFERENCES raw_oxi_batches(id),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oxi_investment_promotions_departamento
  ON oxi_investment_promotions (departamento);

CREATE INDEX IF NOT EXISTS idx_oxi_investment_promotions_codigo_referencia
  ON oxi_investment_promotions (codigo_referencia);
