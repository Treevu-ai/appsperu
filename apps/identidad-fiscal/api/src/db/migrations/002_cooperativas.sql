-- Lake de evidencia del Directorio Nacional de Cooperativas (PRODUCE),
-- endpoint `busqueda_ajax.php` — ver docs/data-contracts/produce-cooperativas.md.
CREATE TABLE IF NOT EXISTS raw_cooperativas_batches (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL,
  params        JSONB NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una cooperativa por fila, indexada por RUC (mismo tipo de clave que
-- `contribuyentes`, así el cruce con SUNAT es un JOIN directo en la misma
-- base). `ubicacion_texto` NO es un ubigeo real: PRODUCE la etiqueta
-- "UBIGEO" en su propia UI pero el valor es un string libre
-- "DEPARTAMENTO-PROVINCIA-DISTRITO" (confirmado en vivo, ver data contract)
-- — se guarda tal cual, sin inventar un mapeo a ubigeo numérico.
CREATE TABLE IF NOT EXISTS cooperativas (
  ruc                 TEXT PRIMARY KEY,
  razon_social        TEXT NOT NULL,
  representante       TEXT,
  direccion           TEXT,
  ubicacion_texto     TEXT,
  socios              INTEGER,
  telefono            TEXT,
  correo              TEXT,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_cooperativas_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_cooperativas_razon_social
  ON cooperativas (razon_social);

CREATE INDEX IF NOT EXISTS idx_cooperativas_ubicacion_texto
  ON cooperativas (ubicacion_texto) WHERE ubicacion_texto IS NOT NULL;

CREATE TABLE IF NOT EXISTS cooperativas_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_cooperativas_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
