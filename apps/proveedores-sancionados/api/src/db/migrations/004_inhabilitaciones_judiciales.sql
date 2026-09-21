-- Inhabilitaciones por mandato judicial vigentes [OECE] — investigado y
-- construido 2026-09-20 (ver docs/data-contracts/oece-inhabilitaciones-judiciales.md).
-- Base legal DISTINTA a `inhabilitaciones`/`multas` (sanción administrativa
-- del Tribunal de Contrataciones, migración 001): esto es inhabilitación
-- dictada por el Poder Judicial y solo comunicada a OSCE/OECE para su
-- registro en el RNP, no una sanción propia de contrataciones públicas.
-- Fuente: no es CKAN estándar — el recurso real vive en un espacio de
-- Confluence de OSCE (osce-gob-pe.atlassian.net), resuelto vía su API REST
-- de attachments, con URL de descarga firmada y temporal (no se puede
-- hardcodear, ver oece-inhabilitaciones-judiciales-connector.ts).
CREATE TABLE IF NOT EXISTS raw_inhabilitaciones_judiciales_batches (
  id            BIGSERIAL PRIMARY KEY,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Columna fuente se llama literalmente RUC_DNI: trae DNI (persona natural,
-- sin el envoltorio "10"+DNI+dígito verificador que sí usa `inhabilitaciones.ruc`),
-- RUC-10 completo, o RUC-20 (empresa) según la fila — se guarda tal cual,
-- sin forzar un formato. `dni` se deriva solo del caso RUC-10 (mismo patrón
-- que `inhabilitaciones.dni`, migración 002) — el resto queda NULL, no se
-- adivina.
CREATE TABLE IF NOT EXISTS inhabilitaciones_judiciales (
  id                      BIGSERIAL PRIMARY KEY,
  fecha_corte             DATE NOT NULL,
  ruc_dni                 TEXT NOT NULL,
  dni                     TEXT GENERATED ALWAYS AS (
                            CASE WHEN left(ruc_dni, 2) = '10' AND length(ruc_dni) = 11 THEN substring(ruc_dni from 3 for 8) ELSE NULL END
                          ) STORED,
  nombre                  TEXT NOT NULL,
  organo_jurisdiccional   TEXT NOT NULL,
  numero_resolucion       TEXT NOT NULL,
  fecha_inicio            DATE,
  fecha_fin               DATE,
  source_batch_id         BIGINT NOT NULL REFERENCES raw_inhabilitaciones_judiciales_batches(id),
  UNIQUE (ruc_dni, numero_resolucion, fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_inhabilitaciones_judiciales_ruc_dni ON inhabilitaciones_judiciales (ruc_dni);
CREATE INDEX IF NOT EXISTS idx_inhabilitaciones_judiciales_dni ON inhabilitaciones_judiciales (dni) WHERE dni IS NOT NULL;

-- Filas que no pasaron validación (ej. fecha_inicio posterior a fecha_fin,
-- hallazgo real verificado en vivo el 2026-09-20 en al menos 1 fila de la
-- fuente) — se conservan con su motivo, no se descartan en silencio.
CREATE TABLE IF NOT EXISTS inhabilitaciones_judiciales_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_inhabilitaciones_judiciales_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
