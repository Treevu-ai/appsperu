CREATE TABLE IF NOT EXISTS raw_ositran_batches (
  id BIGSERIAL PRIMARY KEY,
  dataset TEXT NOT NULL,
  source_url TEXT NOT NULL,
  checksum TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reclamos_carreteras (
  id BIGSERIAL PRIMARY KEY,
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  entidad_prestadora TEXT NOT NULL,
  concesion TEXT,
  siglas_concesion TEXT,
  medio_presentacion TEXT,
  motivo_reclamo TEXT,
  materia_reclamo TEXT,
  estado_reclamo TEXT,
  cantidad_reclamos INTEGER NOT NULL,
  source_batch_id BIGINT NOT NULL REFERENCES raw_ositran_batches(id)
);

CREATE TABLE IF NOT EXISTS trafico_vehicular_carreteras (
  id BIGSERIAL PRIMARY KEY,
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  entidad_prestadora TEXT NOT NULL,
  concesion TEXT,
  siglas_concesion TEXT,
  peaje TEXT,
  clase_vehiculo TEXT,
  tipo_tarifa TEXT,
  tipo_vehiculo TEXT,
  tipo_eje_veh TEXT,
  nro_ejes TEXT,
  cantidad_vehiculos NUMERIC NOT NULL,
  source_batch_id BIGINT NOT NULL REFERENCES raw_ositran_batches(id)
);

CREATE TABLE IF NOT EXISTS recaudacion_carreteras (
  id BIGSERIAL PRIMARY KEY,
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  entidad_prestadora TEXT NOT NULL,
  concesion TEXT,
  siglas_concesion TEXT,
  peaje TEXT,
  tipo_recaudacion TEXT,
  tipo_tarifa TEXT,
  tipo_vehiculo TEXT,
  tipo_eje_veh TEXT,
  nro_ejes TEXT,
  importe_soles NUMERIC NOT NULL,
  source_batch_id BIGINT NOT NULL REFERENCES raw_ositran_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_reclamos_entidad ON reclamos_carreteras (entidad_prestadora);
CREATE INDEX IF NOT EXISTS idx_trafico_concesion ON trafico_vehicular_carreteras (siglas_concesion);
CREATE INDEX IF NOT EXISTS idx_recaudacion_concesion ON recaudacion_carreteras (siglas_concesion);
