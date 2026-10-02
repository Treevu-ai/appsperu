CREATE TABLE IF NOT EXISTS precios_combustibles_distribuidores (
  id BIGSERIAL PRIMARY KEY,
  registro_hidrocarburos TEXT,
  ruc TEXT,
  razon_social TEXT NOT NULL,
  departamento TEXT,
  provincia TEXT,
  distrito TEXT,
  direccion TEXT,
  departamento_reparto TEXT,
  provincia_reparto TEXT,
  fecha_registro TIMESTAMPTZ,
  producto TEXT NOT NULL,
  precio_min_soles NUMERIC,
  precio_max_soles NUMERIC,
  unidad TEXT,
  source_batch_id BIGINT NOT NULL REFERENCES raw_osinergmin_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_precios_ruc ON precios_combustibles_distribuidores (ruc);
CREATE INDEX IF NOT EXISTS idx_precios_departamento ON precios_combustibles_distribuidores (departamento);
CREATE INDEX IF NOT EXISTS idx_precios_producto ON precios_combustibles_distribuidores (producto);
CREATE INDEX IF NOT EXISTS idx_precios_batch ON precios_combustibles_distribuidores (source_batch_id);
