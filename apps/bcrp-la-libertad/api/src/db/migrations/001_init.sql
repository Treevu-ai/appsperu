CREATE TABLE IF NOT EXISTS raw_bcrp_ll_batches (
  id              BIGSERIAL PRIMARY KEY,
  report_period   TEXT NOT NULL, -- 'YYYY-MM' del reporte (portada del PDF)
  file_name       TEXT NOT NULL,
  checksum        TEXT NOT NULL,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bcrp_ll_indicators (
  id                BIGSERIAL PRIMARY KEY,
  anexo_numero      INTEGER NOT NULL,
  -- Encabezado de grupo o categoría padre dentro del anexo. NOT NULL DEFAULT ''
  -- (no NULL) porque forma parte de la clave única: en ANEXO 10, etiquetas
  -- como "Gobierno nacional" se repiten bajo varias categorías padre (Gastos
  -- Corrientes, Remuneraciones, Formación Bruta de Capital, ...) — sin
  -- `seccion` en la clave, esas filas se pisarían entre sí en el upsert. Con
  -- NULL, Postgres no las trataría como duplicadas para el UNIQUE (NULL <>
  -- NULL), así que se usa '' como sentinel de "sin categoría padre".
  seccion           TEXT NOT NULL DEFAULT '',
  indicador         TEXT NOT NULL,
  periodo_anio      INTEGER NOT NULL,
  periodo_mes       SMALLINT NOT NULL CHECK (periodo_mes BETWEEN 1 AND 12),
  valor             NUMERIC(18, 4),
  source_batch_id   BIGINT NOT NULL REFERENCES raw_bcrp_ll_batches(id),
  UNIQUE (anexo_numero, seccion, indicador, periodo_anio, periodo_mes)
);

CREATE INDEX IF NOT EXISTS idx_bcrp_ll_indicators_lookup
  ON bcrp_ll_indicators (anexo_numero, periodo_anio, periodo_mes);
