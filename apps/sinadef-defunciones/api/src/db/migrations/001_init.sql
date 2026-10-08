CREATE TABLE IF NOT EXISTS raw_sinadef_batches (
  id            BIGSERIAL PRIMARY KEY,
  dataset       TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS defunciones (
  id                      BIGSERIAL PRIMARY KEY,
  tipo_seguro             TEXT,
  sexo                    TEXT,
  edad                    INTEGER,
  tiempo_edad             TEXT,
  estado_civil            TEXT,
  nivel_instruccion       TEXT,
  etnia                   TEXT,
  ubigeo_domicilio        TEXT,
  pais_domicilio          TEXT,
  departamento_domicilio  TEXT,
  provincia_domicilio     TEXT,
  distrito_domicilio      TEXT,
  fecha_defuncion         DATE,
  anio_defuncion          INTEGER,
  mes_defuncion           INTEGER,
  tipo_lugar              TEXT,
  institucion             TEXT,
  muerte_violenta         TEXT,
  necropsia               TEXT,
  causa_a                 TEXT,
  cie_a                   TEXT,
  causa_b                 TEXT,
  cie_b                   TEXT,
  causa_c                 TEXT,
  cie_c                   TEXT,
  causa_d                 TEXT,
  cie_d                   TEXT,
  causa_e                 TEXT,
  cie_e                   TEXT,
  causa_f                 TEXT,
  cie_f                   TEXT,
  source_batch_id         BIGINT NOT NULL REFERENCES raw_sinadef_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_defunciones_departamento ON defunciones (departamento_domicilio);
CREATE INDEX IF NOT EXISTS idx_defunciones_provincia ON defunciones (provincia_domicilio);
CREATE INDEX IF NOT EXISTS idx_defunciones_distrito ON defunciones (distrito_domicilio);
CREATE INDEX IF NOT EXISTS idx_defunciones_muerte_violenta ON defunciones (muerte_violenta);
CREATE INDEX IF NOT EXISTS idx_defunciones_anio ON defunciones (anio_defuncion);
CREATE INDEX IF NOT EXISTS idx_defunciones_depto_anio ON defunciones (departamento_domicilio, anio_defuncion);
