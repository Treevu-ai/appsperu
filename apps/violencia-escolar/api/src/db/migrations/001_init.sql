-- Listado detallado de casos reportados a SíseVe (MINEDU), confirmado en vivo 2026-09-21.
-- Ver docs/data-contracts/minedu-siseve-casos.md.
--
-- Fuente: exportación pública Excel (`POST /Web/Inicio/DescargarEXCEL`, sin login, sin
-- cookies) -- verificado que reproduce byte-por-byte el mismo archivo que descarga el botón
-- "Excel" del dashboard público https://siseve.minedu.gob.pe/Web/App/Mapa.
--
-- SIN CLAVE NATURAL: cada fila es un caso reportado, pero la fuente NO trae número de
-- expediente ni ningún identificador único -- dos casos reales distintos pueden tener
-- exactamente los mismos valores en las 7 columnas (misma fecha, misma UGEL, mismo tipo).
-- No se puede (ni se debe intentar) deduplicar por contenido. Cada ingesta es un snapshot
-- completo del rango "01/01/2024 hasta hoy" -- NO es incremental, se reemplaza entero en cada
-- corrida (via `source_batch_id`; la API sirve solo el batch más reciente por defecto).
--
-- SIN PII: sin nombres, sin DNI, sin identificador de alumno ni de institución educativa
-- individual -- la granularidad más fina de la fuente es UGEL, no IIEE.
--
-- CONTENIDO SENSIBLE (decisión explícita del usuario, 2026-09-21): se replica el mismo nivel
-- de detalle que ya publica MINEDU sin restricción (UGEL + subtipo de violencia completo,
-- incluyendo violencia sexual) -- MINEDU ya lo publica así, Rastro no agrega un nivel de
-- exposición nuevo. Con 225 UGELs, algunas combinaciones (sobre todo `Sexual`) tendrán
-- conteos de 1-2 casos -- ver nota en la documentación de la API sobre este riesgo conocido.

CREATE TABLE IF NOT EXISTS raw_siseve_batches (
  id            BIGSERIAL PRIMARY KEY,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS violencia_escolar_casos (
  id                    BIGSERIAL PRIMARY KEY,
  fecha_reporte         DATE NOT NULL,
  dre                   TEXT NOT NULL,
  ugel                  TEXT NOT NULL,
  nivel_educativo       TEXT,
  tipo_reporte          TEXT NOT NULL,
  tipo_violencia        TEXT NOT NULL,
  subtipo_violencia     TEXT,
  tipo_estado_reporte   TEXT,
  source_batch_id       BIGINT NOT NULL REFERENCES raw_siseve_batches(id)
);

CREATE TABLE IF NOT EXISTS violencia_escolar_casos_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_siseve_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_violencia_escolar_casos_batch ON violencia_escolar_casos (source_batch_id);
CREATE INDEX IF NOT EXISTS idx_violencia_escolar_casos_dre_ugel ON violencia_escolar_casos (dre, ugel);
CREATE INDEX IF NOT EXISTS idx_violencia_escolar_casos_fecha ON violencia_escolar_casos (fecha_reporte);
CREATE INDEX IF NOT EXISTS idx_violencia_escolar_casos_tipo ON violencia_escolar_casos (tipo_violencia);
