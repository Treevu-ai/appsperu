-- Lake de evidencia: nunca se sobreescribe, cada ingesta agrega un lote nuevo.
CREATE TABLE IF NOT EXISTS raw_sidpol_batches (
  id            BIGSERIAL PRIMARY KEY,
  resource_id   TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Denuncias policiales (SIDPOL, vía MININTER/datosabiertos.gob.pe) ya
-- agregadas por el origen: una fila = conteo de denuncias de una modalidad
-- en un distrito, mes y año dados. No es evento a evento (no hay caso
-- individual), es un conteo pre-agregado — mismo nivel de detalle que
-- publica el portal, no se puede desagregar más desde esta fuente.
CREATE TABLE IF NOT EXISTS police_reports (
  id                BIGSERIAL PRIMARY KEY,
  anio              INTEGER NOT NULL,
  mes               SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  departamento      TEXT NOT NULL,
  provincia         TEXT NOT NULL,
  distrito          TEXT NOT NULL,
  ubigeo            TEXT NOT NULL,
  modalidad         TEXT NOT NULL,
  cantidad          INTEGER NOT NULL CHECK (cantidad >= 0),
  source_batch_id   BIGINT NOT NULL REFERENCES raw_sidpol_batches(id),
  UNIQUE (anio, mes, ubigeo, modalidad)
);

CREATE INDEX IF NOT EXISTS idx_police_reports_lookup
  ON police_reports (departamento, anio, mes);

CREATE INDEX IF NOT EXISTS idx_police_reports_ubigeo
  ON police_reports (ubigeo);

-- Filas que no pasaron validación en la normalización: se conservan, no se descartan.
CREATE TABLE IF NOT EXISTS police_reports_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_sidpol_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
