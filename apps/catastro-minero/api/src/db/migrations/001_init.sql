-- Catastro Minero (INGEMMET) - derechos mineros, confirmado en vivo 2026-09-21 (GEO-01).
-- Ver docs/data-contracts/ingemmet-catastro-minero.md.
--
-- Fuente: https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_CATASTRO_MINERO/MapServer/0
-- -- ArcGIS REST MapServer real, sin auth, capa 0 ("Catastro Minero"). Confirmado con curl
-- directo. Actualización diaria según la descripción del propio servicio.
--
-- CLAVE REAL VERIFICADA: CODIGOU (código único del derecho minero) -- campo confirmado contra
-- el schema real de la capa (`/0?f=json`) y una respuesta de muestra real, no asumido.
--
-- SIN PAGINACIÓN ESTÁNDAR: el servicio devuelve supportsPagination=false y rechaza
-- resultRecordCount/resultOffset con "Pagination is not supported". Se pagina por rango de
-- OBJECTID (`WHERE OBJECTID > ultimoId ORDER BY OBJECTID ASC`, sin resultRecordCount), iterando
-- mientras la respuesta traiga `exceededTransferLimit=true` -- patrón estándar de ArcGIS REST
-- para servicios con este límite. maxRecordCount=1000 por respuesta, confirmado en vivo.
--
-- TIT_CONCES (titular de la concesión) puede ser una empresa o, en minería artesanal/pequeña,
-- una persona natural -- mismo tipo de dato público que un registro de propiedad (SUNARP), no se
-- trata como PII a excluir (es información pública por naturaleza de un derecho minero
-- registrado), pero se documenta aquí para que cualquier análisis futuro lo tenga presente.

CREATE TABLE IF NOT EXISTS raw_ingemmet_batches (
  id            BIGSERIAL PRIMARY KEY,
  source_url    TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catastro_minero_derechos (
  id                     BIGSERIAL PRIMARY KEY,
  objectid               INTEGER NOT NULL,
  codigou                TEXT NOT NULL,
  fecha_denuncio         DATE,
  concesion              TEXT,
  titular                TEXT,
  hectareas               DOUBLE PRECISION,
  estado                 TEXT,
  estado_descripcion     TEXT,
  sustancia              TEXT,
  departamento           TEXT,
  provincia              TEXT,
  distrito               TEXT,
  fecha_actualizacion    TIMESTAMPTZ,
  source_batch_id        BIGINT NOT NULL REFERENCES raw_ingemmet_batches(id),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (codigou)
);

CREATE TABLE IF NOT EXISTS catastro_minero_derechos_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_ingemmet_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catastro_minero_derechos_batch ON catastro_minero_derechos (source_batch_id);
CREATE INDEX IF NOT EXISTS idx_catastro_minero_derechos_depa ON catastro_minero_derechos (departamento);
CREATE INDEX IF NOT EXISTS idx_catastro_minero_derechos_estado ON catastro_minero_derechos (estado);
