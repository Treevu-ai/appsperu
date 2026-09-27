-- Tabla de lotes crudos para trazabilidad
CREATE TABLE IF NOT EXISTS raw_batches (
  id           BIGSERIAL PRIMARY KEY,
  source_file  TEXT NOT NULL,
  year         INTEGER NOT NULL,
  checksum     TEXT NOT NULL,
  row_count    INTEGER NOT NULL,
  ingested_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Importaciones por aduana y año (fuente: SUNAT Anuario cdro_15)
CREATE TABLE IF NOT EXISTS port_imports (
  id                BIGSERIAL PRIMARY KEY,
  aduana_code       INTEGER NOT NULL,
  aduana_name       TEXT NOT NULL,
  year              INTEGER NOT NULL,
  quarter           SMALLINT CHECK (quarter BETWEEN 1 AND 4),
  is_total          BOOLEAN NOT NULL DEFAULT false,
  value_cif_usd     NUMERIC(18, 2) NOT NULL,
  batch_id          BIGINT NOT NULL REFERENCES raw_batches(id),
  UNIQUE (aduana_code, year, quarter, is_total)
);

-- Importaciones por aduana + subpartida (fuente: SUNAT Anuario cdro_16)
CREATE TABLE IF NOT EXISTS port_subpartida_imports (
  id                BIGSERIAL PRIMARY KEY,
  aduana_code       INTEGER NOT NULL,
  aduana_name       TEXT NOT NULL,
  year              INTEGER NOT NULL,
  subpartida        TEXT NOT NULL,
  product_desc      TEXT NOT NULL,
  value_fob_usd     NUMERIC(18, 2) NOT NULL,
  value_cif_usd     NUMERIC(18, 2) NOT NULL,
  pct_change        NUMERIC(8, 6),
  pct_structure     NUMERIC(8, 6),
  batch_id          BIGINT NOT NULL REFERENCES raw_batches(id),
  UNIQUE (aduana_code, year, subpartida)
);

CREATE INDEX IF NOT EXISTS idx_port_imports_lookup
  ON port_imports (aduana_code, year, quarter);
CREATE INDEX IF NOT EXISTS idx_port_subp_lookup
  ON port_subpartida_imports (aduana_code, year, subpartida);
