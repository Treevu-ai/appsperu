-- Log de ingesta para cada fuente, usado por GET /api/meta/freshness para
-- reportar antiguedad de los datos.
-- Fuentes posibles: tce_osce (TCE/OSCE vía RNP), seace_ocds (SEACE OCDS),
-- ruc (RUC SUNAT / padrones).
CREATE TABLE IF NOT EXISTS ingestion_log (
  id                SERIAL PRIMARY KEY,
  fuente            TEXT NOT NULL CHECK (fuente IN ('tce_osce', 'seace_ocds', 'ruc')),
  ultima_ejecucion TIMESTAMPTZ NOT NULL DEFAULT now(),
  filas_ingeridas  INTEGER NOT NULL DEFAULT 0,
  estado            TEXT NOT NULL CHECK (estado IN ('success', 'error')),
  mensaje_error     TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingestion_log_fuente_ultima
  ON ingestion_log (fuente, ultima_ejecucion DESC);
