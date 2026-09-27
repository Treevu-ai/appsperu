-- Migración 002: Comisarías Lima (extracto de informes-control + SEACE equipamiento)

-- Tabla: Comisarías mencionadas en auditorías de Contraloría
CREATE TABLE IF NOT EXISTS comisarias_auditadas (
  id                BIGSERIAL PRIMARY KEY,
  nombre            TEXT NOT NULL,
  departamento      TEXT NOT NULL,
  provincia         TEXT NOT NULL,
  distrito          TEXT NOT NULL,
  ubicacion_aprox   TEXT,
  coordenadas_lat   FLOAT,
  coordenadas_lng   FLOAT,
  anio_auditoria    INTEGER,
  fuente_informe_id TEXT,         -- Referencia a id en informes-control
  fuente_informe_url TEXT,
  hallazgos         JSONB,        -- Array: [{anio, hallazgo_tipo, description}]
  ultima_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nombre, departamento)
);

CREATE INDEX IF NOT EXISTS idx_comisarias_departamento
  ON comisarias_auditadas (departamento);

CREATE INDEX IF NOT EXISTS idx_comisarias_lima
  ON comisarias_auditadas (departamento) WHERE departamento = 'LIMA';

-- Tabla: Equipamiento PNP (vehículos, armamento, comunicaciones) desde SEACE
CREATE TABLE IF NOT EXISTS pnp_equipamiento_seace (
  id                BIGSERIAL PRIMARY KEY,
  anio              INTEGER NOT NULL,
  tipo_equipamiento TEXT NOT NULL,  -- VEHICULO, ARMAMENTO, COMUNICACIONES, etc.
  cantidad_comprada INTEGER NOT NULL,
  monto_soles       NUMERIC(15,2),
  proveedor         TEXT,
  contrato_seace_id TEXT,            -- Referencia a SEACE award ID
  contrato_url      TEXT,
  observacion       TEXT,
  ingestion_date    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (anio, tipo_equipamiento, contrato_seace_id)
);

CREATE INDEX IF NOT EXISTS idx_pnp_equipamiento_anio
  ON pnp_equipamiento_seace (anio);

CREATE INDEX IF NOT EXISTS idx_pnp_equipamiento_tipo
  ON pnp_equipamiento_seace (tipo_equipamiento);

-- Tabla: Batch tracking para conectores
CREATE TABLE IF NOT EXISTS comisarias_extraction_batches (
  id                BIGSERIAL PRIMARY KEY,
  batch_type        TEXT NOT NULL,  -- 'informes_control_parser', 'seace_pnp_equipamiento'
  source_name       TEXT NOT NULL,
  checksum          TEXT,
  record_count      INTEGER,
  extracted_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
