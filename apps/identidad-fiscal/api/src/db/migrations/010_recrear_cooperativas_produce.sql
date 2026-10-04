-- Recrea `cooperativas`/`raw_cooperativas_batches`/`cooperativas_rejected`,
-- eliminadas en 003_drop_cooperativas.sql (2026-09-18) porque `representante`
-- quedó desactualizado frente a SUNAT. Esa razón sigue vigente -- `ficha_ruc`
-- sigue siendo la fuente de verdad para representante legal -- pero PRODUCE
-- es la ÚNICA fuente en el repo con `ubicacion_texto` (departamento-
-- provincia-distrito en texto libre) y `socios` (número de socios) por
-- cooperativa, dato que no existe en ningún otro conector. Se recupera para
-- análisis EUDR café/cacao (ubicación real + escala de la cooperativa),
-- tratando `representante`/`direccion`/`telefono`/`correo` como
-- complementarios y potencialmente desactualizados, nunca como fuente de
-- verdad por encima de `ficha_ruc`.
CREATE TABLE IF NOT EXISTS raw_cooperativas_batches (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL,
  params        JSONB NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
