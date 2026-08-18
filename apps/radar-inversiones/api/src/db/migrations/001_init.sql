-- Lake de evidencia: nunca se sobreescribe, cada ingesta agrega un lote nuevo.
CREATE TABLE IF NOT EXISTS raw_investment_batches (
  id            BIGSERIAL PRIMARY KEY,
  query         TEXT NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  payload       JSONB NOT NULL
);

-- Una inversión por fila (a diferencia del presupuesto, el CSV del MEF ya
-- viene a este nivel de granularidad — no hace falta agregar).
CREATE TABLE IF NOT EXISTS investments (
  cui                 TEXT PRIMARY KEY,
  codigo_snip         TEXT,
  nombre              TEXT NOT NULL,
  sec_ejec            TEXT,
  nombre_uep          TEXT,
  entidad             TEXT,
  sector              TEXT,
  nivel               TEXT,
  estado              TEXT,
  situacion           TEXT,
  ubigeo              TEXT,
  departamento        TEXT,
  provincia           TEXT,
  distrito            TEXT,
  monto_viable        NUMERIC(18, 2),
  costo_actualizado   NUMERIC(18, 2),
  funcion             TEXT,
  tipo_inversion      TEXT,
  fecha_registro      DATE,
  fecha_viabilidad    DATE,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_investment_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_investments_departamento
  ON investments (departamento) WHERE departamento IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_investments_sec_ejec
  ON investments (sec_ejec) WHERE sec_ejec IS NOT NULL;

-- Filas que no pasaron validación: se conservan con su motivo, no se descartan.
CREATE TABLE IF NOT EXISTS investments_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_investment_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
