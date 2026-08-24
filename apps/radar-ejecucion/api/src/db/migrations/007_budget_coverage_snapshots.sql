-- GOV-01: una corrida MEF puede materializar la misma observación en más de
-- un corte. Esta tabla no reemplaza los hechos: declara la partición de
-- cobertura y cuál es su última versión disponible.
CREATE TABLE IF NOT EXISTS budget_coverage_snapshots (
  id                 BIGSERIAL PRIMARY KEY,
  fuente             TEXT NOT NULL DEFAULT 'MEF - Presupuesto y ejecución de gasto',
  anio_fiscal        INTEGER NOT NULL,
  origen_cobertura   TEXT NOT NULL CHECK (origen_cobertura IN ('SEDE_EJECUTORA', 'META_DEPARTAMENTO')),
  departamento       TEXT NOT NULL,
  nivel_gobierno     TEXT NOT NULL,
  fecha_corte        DATE NOT NULL,
  source_batch_ids   JSONB NOT NULL DEFAULT '[]'::jsonb,
  record_count       INTEGER NOT NULL,
  pia                NUMERIC(18,2) NOT NULL,
  pim                NUMERIC(18,2) NOT NULL,
  devengado          NUMERIC(18,2) NOT NULL,
  estado_cobertura   TEXT NOT NULL DEFAULT 'NO_VERIFICADA'
    CHECK (estado_cobertura IN ('COMPLETA_EN_EL_ALCANCE', 'PARCIAL', 'NO_VERIFICADA')),
  activo             BOOLEAN NOT NULL DEFAULT false,
  materializado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fuente, anio_fiscal, origen_cobertura, departamento, nivel_gobierno, fecha_corte)
);

CREATE INDEX IF NOT EXISTS idx_budget_coverage_snapshots_active
  ON budget_coverage_snapshots (activo, anio_fiscal, departamento);
