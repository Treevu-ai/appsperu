-- AIRHSP: personal activo y pensionista del sector público, agregado por
-- Unidad Ejecutora / régimen laboral / cargo (columna CANTIDAD) — no es
-- personal identificable, no hay nombres. Fuente: MEF, Plataforma Nacional
-- de Datos Abiertos, CSV público sin autenticación, un archivo por año.
-- https://www.datosabiertos.gob.pe/dataset/personal-activo-y-pensionista-del-sector-p%C3%BAblico-registrado-en-el-airhsp
--
-- Sin columna de ubigeo/departamento explícita en la fuente — el filtro a
-- La Libertad se hace por texto sobre PLIEGO/UNIDAD_EJECUTORA (contienen el
-- nombre del gobierno regional/municipalidad). Se ingiere a nivel nacional
-- porque el archivo es manejable (~31K filas/año) y filtrar en la fuente
-- perdería cobertura de entidades cuyo nombre no calza un patrón exacto.

CREATE TABLE IF NOT EXISTS raw_airhsp_batches (
  id           BIGSERIAL PRIMARY KEY,
  source_url   TEXT NOT NULL,
  ejercicio    INTEGER NOT NULL,
  checksum     TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_url, checksum)
);

CREATE TABLE IF NOT EXISTS airhsp_personal (
  id                       BIGSERIAL PRIMARY KEY,
  periodo                  TEXT NOT NULL,
  ejercicio                INTEGER NOT NULL,
  mes                      INTEGER NOT NULL,
  nivel                    TEXT,
  codigo_sector            TEXT,
  sector                   TEXT,
  codigo_pliego            TEXT,
  pliego                   TEXT NOT NULL,
  codigo_ue                TEXT,
  unidad_ejecutora         TEXT NOT NULL,
  tipo_establecimiento     TEXT,
  desc_tipo_registro       TEXT,
  desc_sub_tipo_registro   TEXT,
  estado_registro          TEXT,
  desc_regimen_laboral     TEXT,
  desc_grupo_ocupacional   TEXT,
  desc_cargo_estructural   TEXT,
  desc_condicion_laboral   TEXT,
  desc_regimen_pensionario TEXT,
  cantidad                 INTEGER NOT NULL,
  costo_total_anual        NUMERIC(18, 2),
  source_batch_id          BIGINT NOT NULL REFERENCES raw_airhsp_batches(id) ON DELETE CASCADE,
  UNIQUE (
    periodo, codigo_pliego, codigo_ue, desc_tipo_registro, desc_sub_tipo_registro,
    desc_regimen_laboral, desc_grupo_ocupacional, desc_cargo_estructural,
    desc_condicion_laboral, desc_regimen_pensionario
  )
);

CREATE INDEX IF NOT EXISTS idx_airhsp_pliego ON airhsp_personal (pliego);
CREATE INDEX IF NOT EXISTS idx_airhsp_ue ON airhsp_personal (unidad_ejecutora);
CREATE INDEX IF NOT EXISTS idx_airhsp_ejercicio ON airhsp_personal (ejercicio);
