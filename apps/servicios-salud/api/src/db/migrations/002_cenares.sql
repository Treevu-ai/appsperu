-- Lake de evidencia: dataset estático de CENARES (datosabiertos.gob.pe,
-- "Seguimiento de Distribución de medicamentos del Centro Nacional de
-- Abastecimiento en Recursos Estratégicos"), un único recurso CSV, sin
-- fecha en el nombre del archivo -- unicidad por checksum del contenido,
-- no por URL+fecha como RENIPRESS.
CREATE TABLE IF NOT EXISTS raw_cenares_batches (
  id            BIGSERIAL PRIMARY KEY,
  resource_url  TEXT NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  UNIQUE (checksum)
);

-- Una fila = un ítem (medicamento/insumo) dentro de un cuadro de
-- distribución (NRO_CD) hacia un establecimiento (DESTINO). No hay clave
-- natural confiable (un mismo NRO_CD trae varios ítems, y no está
-- garantizado que sea único entre sí) -- PK propia (BIGSERIAL), sin upsert;
-- cada ingesta es un snapshot completo del recurso, deduplicado a nivel de
-- lote por `checksum` en `raw_cenares_batches` (si el contenido no cambió,
-- no se vuelve a insertar).
CREATE TABLE IF NOT EXISTS cenares_distribucion (
  id                BIGSERIAL PRIMARY KEY,
  estrategia        TEXT,
  meta              TEXT,
  cod_mef           TEXT,
  destino           TEXT,
  codigo_sismed     TEXT,
  codigo_siga       TEXT,
  item              TEXT,
  cantidad          NUMERIC,
  nro_cd            TEXT,
  observacion       TEXT,
  referencia        TEXT,
  fecha_creacion    DATE,
  situacion         TEXT,
  pendiente         TEXT,
  nro_pecosa        TEXT,
  fecha_pecosa      DATE,
  estado_despacho   TEXT,
  refrigerado       TEXT,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_cenares_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_cenares_destino ON cenares_distribucion (destino) WHERE destino IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cenares_item ON cenares_distribucion (item) WHERE item IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cenares_situacion ON cenares_distribucion (situacion) WHERE situacion IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cenares_fecha_creacion ON cenares_distribucion (fecha_creacion) WHERE fecha_creacion IS NOT NULL;
