-- Captura DEPARTAMENTO_META (a dónde se dirige el gasto) como columna propia,
-- en vez de descartarla tras usarla solo como filtro de ingesta. Permite
-- distinguir "ejecución propia de una región" de "gasto nacional dirigido a
-- esa región" sin depender de qué source_batch_id se usó para ingerir.
ALTER TABLE budget_execution ADD COLUMN IF NOT EXISTS meta_departamento TEXT;

-- Null significa "no se filtró/registró un meta distinto al de la propia
-- entidad" (caso normal de ejecución regional/local). Postgres trata cada
-- NULL como distinto en una constraint UNIQUE, así que esto no rompe la
-- constraint existente para las filas ya cargadas.
ALTER TABLE budget_execution DROP CONSTRAINT IF EXISTS budget_execution_entity_code_funcion_anio_fiscal_fecha_cort_key;
ALTER TABLE budget_execution
  ADD CONSTRAINT budget_execution_natural_key
  UNIQUE (entity_code, funcion, anio_fiscal, fecha_corte, meta_departamento);

CREATE INDEX IF NOT EXISTS idx_budget_execution_meta_departamento
  ON budget_execution (meta_departamento) WHERE meta_departamento IS NOT NULL;
