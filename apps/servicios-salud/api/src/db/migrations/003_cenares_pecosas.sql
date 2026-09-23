-- Lake de evidencia: dataset "Seguimiento de Pecosas del Centro Nacional de
-- Abastecimiento en Recursos Estratégicos" (datosabiertos.gob.pe, corte 2023).
-- Distinto del dataset ya ingerido en 002_cenares.sql (cuadro de distribución,
-- corte 2024): esta es la etapa de PECOSA (Pedido de Comprobante de Salida de
-- Almacén) y sí trae proveedor por entrega (PROVEEDOR/DESC_PROVEEDOR), algo
-- que el dataset de distribución no tiene. Mismo patrón sin upsert: unicidad
-- de lote por checksum, no por URL+fecha.
CREATE TABLE IF NOT EXISTS raw_cenares_pecosas_batches (
  id            BIGSERIAL PRIMARY KEY,
  resource_url  TEXT NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  UNIQUE (checksum)
);

-- Una fila = una pecosa (documento de salida de almacén) con su orden de
-- compra y proveedor asociados. Sin clave natural confiable garantizada --
-- PK propia (BIGSERIAL), sin upsert; cada ingesta es un snapshot completo del
-- recurso, deduplicado a nivel de lote por checksum.
CREATE TABLE IF NOT EXISTS cenares_pecosas (
  id                  BIGSERIAL PRIMARY KEY,
  anio_pecosa         TEXT,
  nro_pecosa          TEXT,
  fecha_pecosa        DATE,
  codigo_siga         TEXT,
  nombre_almacen      TEXT,
  nro_pedido          TEXT,
  desc_marca_pecosa   TEXT,
  anio_oc             TEXT,
  nro_oc              TEXT,
  observacion_oc      TEXT,
  marca_oc            TEXT,
  proveedor_codigo    TEXT,
  proveedor_desc      TEXT,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_cenares_pecosas_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_cenares_pecosas_desc_marca ON cenares_pecosas (desc_marca_pecosa) WHERE desc_marca_pecosa IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cenares_pecosas_proveedor_desc ON cenares_pecosas (proveedor_desc) WHERE proveedor_desc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cenares_pecosas_fecha ON cenares_pecosas (fecha_pecosa) WHERE fecha_pecosa IS NOT NULL;
