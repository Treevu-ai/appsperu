-- Lake de evidencia: nunca se sobreescribe, cada ingesta agrega un lote nuevo.
CREATE TABLE IF NOT EXISTS raw_midagri_batches (
  id            BIGSERIAL PRIMARY KEY,
  resource_id   TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  payload       JSONB NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una fila por (departamento, año, mes) — el CSV de origen trae una fila por
-- (Región, Año) con 12 columnas de mes; se normaliza a formato largo para
-- poder agregar/filtrar por mes sin parsear JSON en cada consulta.
--
-- `valor_soles` es NULL para dos casos distintos del CSV que no se
-- distinguen en el schema (ver docs/data-contracts/midagri-estadistica-agraria.md
-- y ADR-0008): mes reportado sin dato ("-", ej. La Libertad abr-jul 2020) y
-- mes futuro aún no reportado (resto de 2026 tras febrero). Ambos son
-- "no hay valor" para efectos de consulta; el motivo no se persiste.
CREATE TABLE IF NOT EXISTS agricultural_wage (
  id                BIGSERIAL PRIMARY KEY,
  departamento      TEXT NOT NULL,
  anio              INTEGER NOT NULL,
  mes               SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor_soles       NUMERIC(10, 2),
  source_batch_id   BIGINT NOT NULL REFERENCES raw_midagri_batches(id),
  UNIQUE (departamento, anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_agricultural_wage_lookup
  ON agricultural_wage (departamento, anio);

-- Filas que no pasaron validación en la normalización: se conservan, no se descartan.
CREATE TABLE IF NOT EXISTS agricultural_wage_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_midagri_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
