-- Áreas naturales protegidas (SERNANP), confirmado en vivo 2026-09-21 (GEO-02).
-- Ver docs/data-contracts/sernanp-areas-protegidas.md.
--
-- Fuente: https://geoservicios.sernanp.gob.pe/arcgis/rest/services/sernanp_visor/servicio_descarga/MapServer
-- -- ArcGIS REST MapServer real, sin auth. 5 capas (todas polígonos): ANP Nacional Definitiva
-- (id=1), Zona Reservada (id=2), Área de Conservación Regional (id=3), Área de Conservación
-- Privada (id=4), Sitios Prioritarios Nivel Nacional (id=5).
--
-- SIN CLAVE ESTABLE PARA UPSERT INCREMENTAL (verificado en vivo, decisión explícita del PRD
-- tras hallazgo real de CodeRabbit): el campo de código de cada capa (`anp_codi`/`zr_codi`/
-- `acr_codi`/`acp_codi`/`sp_cod`) NO es único -- un área con geometría multi-parte (islas,
-- polígonos disjuntos) aparece en más de una fila con el mismo código (verificado: capa 1 trae
-- 104 filas pero solo 95 códigos únicos, con "RN18" repetido 4 veces). `objectid` sí es único
-- dentro de cada consulta, pero es un ID interno de ArcGIS sin garantía de estabilidad entre
-- reconstrucciones del servicio -- no se usa como clave de upsert incremental.
--
-- DECISIÓN: cada ingesta es un SNAPSHOT COMPLETO por capa -- se borran todas las filas de esa
-- capa y se insertan las nuevas en la misma transacción (no hay UNIQUE ni ON CONFLICT). Esto
-- bloquea el upsert incremental en vez de aceptar una clave que puede colisionar.
--
-- Campos comunes a las 4 capas de ANP/ZR/ACR/ACP se normalizan a columnas propias; los campos
-- específicos de cada capa (ej. `acp_titu`/`acp_tipro`/`acp_tirec`/`acp_pareg` de Área de
-- Conservación Privada, o `sp_pri`/`sp_cf`/`sp_ib`/`sp_ci`/`sp_sup` de Sitios Prioritarios) se
-- guardan en `atributos_extra` (JSONB) en vez de agregar columnas nulas para el resto de capas.

CREATE TABLE IF NOT EXISTS raw_sernanp_batches (
  id            BIGSERIAL PRIMARY KEY,
  source_url    TEXT NOT NULL,
  capa          TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sernanp_areas (
  id                            BIGSERIAL PRIMARY KEY,
  capa                          TEXT NOT NULL,
  objectid                      INTEGER NOT NULL,
  codigo                        TEXT,
  nombre                        TEXT,
  categoria                     TEXT,
  ubicacion                     TEXT,
  superficie_ha                 DOUBLE PRECISION,
  base_legal_establecimiento    TEXT,
  fecha_establecimiento         DATE,
  base_legal_modificacion       TEXT,
  fecha_modificacion            DATE,
  observaciones                 TEXT,
  atributos_extra               JSONB,
  source_batch_id               BIGINT NOT NULL REFERENCES raw_sernanp_batches(id),
  UNIQUE (capa, objectid)
);

CREATE TABLE IF NOT EXISTS sernanp_areas_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_sernanp_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sernanp_areas_capa ON sernanp_areas (capa);
CREATE INDEX IF NOT EXISTS idx_sernanp_areas_ubicacion ON sernanp_areas (ubicacion);
