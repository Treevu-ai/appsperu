-- Lake de evidencia: nunca se sobreescribe, cada ingesta agrega un lote nuevo.
CREATE TABLE IF NOT EXISTS raw_sanciones_batches (
  id            BIGSERIAL PRIMARY KEY,
  filename      TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sección "Definitivo/Temporal" del reporte (inhabilitación para contratar
-- con el Estado). Sin ID natural único del origen — se usa (ruc, resolucion,
-- desde) como llave de upsert: un mismo RUC puede tener varias resoluciones
-- distintas (confirmado en vivo, ver docs/data-contracts/
-- proveedores-sancionados.md), y una misma resolución puede repetirse para
-- varios RUC (sanción a un consorcio completo).
CREATE TABLE IF NOT EXISTS inhabilitaciones (
  id                      BIGSERIAL PRIMARY KEY,
  ruc                     TEXT NOT NULL,
  razon_social            TEXT NOT NULL,
  resolucion              TEXT NOT NULL,
  periodo_inhabilitacion  TEXT,
  desde                   DATE,
  hasta                   DATE,
  infraccion              TEXT,
  otra_infraccion         TEXT,
  norma                   TEXT,
  estado                  TEXT,
  source_batch_id         BIGINT NOT NULL REFERENCES raw_sanciones_batches(id),
  UNIQUE (ruc, resolucion, desde)
);

CREATE INDEX IF NOT EXISTS idx_inhabilitaciones_ruc ON inhabilitaciones (ruc);
CREATE INDEX IF NOT EXISTS idx_inhabilitaciones_estado ON inhabilitaciones (estado);

-- Sección "Multa" del reporte — sanción económica, no necesariamente
-- inhabilitación (aunque puede traer un periodo de suspensión cautelar).
CREATE TABLE IF NOT EXISTS multas (
  id                      BIGSERIAL PRIMARY KEY,
  ruc                     TEXT NOT NULL,
  razon_social            TEXT NOT NULL,
  resolucion              TEXT NOT NULL,
  fecha_resolucion        DATE,
  monto_multa             NUMERIC(14, 2),
  infraccion              TEXT,
  periodo_suspension      TEXT,
  desde                   DATE,
  hasta                   DATE,
  otra_infraccion         TEXT,
  norma                   TEXT,
  verificacion_pago       TEXT,
  estado                  TEXT,
  source_batch_id         BIGINT NOT NULL REFERENCES raw_sanciones_batches(id),
  UNIQUE (ruc, resolucion, fecha_resolucion)
);

CREATE INDEX IF NOT EXISTS idx_multas_ruc ON multas (ruc);

-- Filas que no pasaron validación: se conservan con su motivo, no se descartan.
CREATE TABLE IF NOT EXISTS sanciones_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_sanciones_batches(id),
  seccion           TEXT NOT NULL,
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
