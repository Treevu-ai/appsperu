-- 002 agregó meta_departamento a la UNIQUE constraint, pero Postgres trata
-- cada NULL como distinto de sí mismo en una unique constraint plana: dos
-- ingestas normales (sin filtro meta -> meta_departamento IS NULL) para la
-- misma entidad+función+año+fecha_corte NO chocarían entre sí, y ON CONFLICT
-- nunca las detectaría como duplicado -> cada re-ingesta insertaría una fila
-- nueva en vez de actualizar. Se reemplaza por un índice único de expresión
-- que usa '' como centinela para "sin filtro meta", donde NULL sí colisiona
-- consigo mismo.
ALTER TABLE budget_execution DROP CONSTRAINT IF EXISTS budget_execution_natural_key;

CREATE UNIQUE INDEX IF NOT EXISTS budget_execution_natural_key
  ON budget_execution (entity_code, funcion, anio_fiscal, fecha_corte, COALESCE(meta_departamento, ''));
