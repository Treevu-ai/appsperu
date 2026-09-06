-- Fase 0 + construcción (2026-09-06): RUIAS (Registro Único de Infractores Ambientales
-- Sancionados, OEFA), confirmado en vivo. Ver docs/data-contracts/oefa-ruias.md.
--
-- `nombre_administrado` se ingiere sin cambios — mismo fundamento legal que
-- `proveedores-sancionados` (Ley 27806, registro de sanción con efecto público por diseño del
-- propio OEFA). `id_doc_administrado` se enmascara (últimos 3 dígitos) cuando
-- `tipo_doc = 'D.N.I.'` — confirmado en vivo que sí aparecen sancionados persona natural (ej.
-- mineros artesanales), mismo patrón de enmascarado que `perfilprov-conformacion`/el cruce por
-- DNI de `proveedores-sancionados`. Para R.U.C./OTROS se ingiere completo (identidad de
-- entidad, no de persona).
--
-- `distrito` (y a veces `provincia`) puede traer varios valores separados por coma en la fuente
-- real cuando una infracción abarca más de un distrito — se ingiere el texto completo tal cual,
-- sin partir en filas separadas (fuera de alcance de esta versión).

CREATE TABLE IF NOT EXISTS raw_ruias_batches (
  id            BIGSERIAL PRIMARY KEY,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS infracciones_ambientales (
  id                       BIGSERIAL PRIMARY KEY,
  tipo_doc                 TEXT,
  id_doc_administrado      TEXT,
  id_doc_enmascarado       BOOLEAN NOT NULL DEFAULT false,
  nombre_administrado      TEXT NOT NULL,
  unidad_fiscalizable      TEXT,
  subsector_economico      TEXT,
  departamento             TEXT,
  provincia                TEXT,
  distrito                 TEXT,
  nro_expediente           TEXT NOT NULL,
  nro_rd                   TEXT,
  fecha_rd                 DATE,
  fecha_inicio_sup         DATE,
  fecha_fin_sup            DATE,
  nro_rd_multa             TEXT,
  fecha_rd_multa           DATE,
  detalle_infraccion       TEXT,
  norma_tipificadora       TEXT,
  tipo_sancion             TEXT,
  tipo_infraccion          TEXT,
  medida_dictada           TEXT,
  cantidad_multa           NUMERIC,
  cantidad_infracciones    INTEGER,
  multa_expediente         NUMERIC,
  fecha_corte              DATE,
  -- Confirmado en vivo: (nro_expediente, nro_rd) NO es clave única — una misma resolución
  -- puede traer varias filas de infracción/detalle distintas (8,265 de 14,937 filas
  -- nacionales comparten expediente+RD con al menos otra fila). Se usa un hash de contenido
  -- (expediente + rd + detalle + tipo_infraccion + medida + cantidad_multa) como clave de
  -- upsert idempotente en su lugar.
  row_hash                 TEXT NOT NULL,
  source_batch_id          BIGINT NOT NULL REFERENCES raw_ruias_batches(id),
  UNIQUE (row_hash)
);

CREATE TABLE IF NOT EXISTS infracciones_ambientales_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_ruias_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_infracciones_ambientales_dpto_prov
  ON infracciones_ambientales (departamento, provincia);
CREATE INDEX IF NOT EXISTS idx_infracciones_ambientales_subsector
  ON infracciones_ambientales (subsector_economico);
