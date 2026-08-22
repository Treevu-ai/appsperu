-- ADR-0006 Decisión 1: clasificación económica de primer nivel del gasto
-- (personal, bienes y servicios, inversión, etc.). Mismo CSV del MEF ya
-- ingerido, columnas GENERICA/GENERICA_NOMBRE confirmadas en vivo contra
-- Gastos_Diccionario.csv — no requiere re-descargar nada nuevo.
ALTER TABLE budget_execution ADD COLUMN IF NOT EXISTS generica TEXT;
ALTER TABLE budget_execution ADD COLUMN IF NOT EXISTS generica_nombre TEXT;

-- La clave de agregación pasa a incluir generica: sin esto, sumar géneros
-- distintos (personal + inversión) bajo la misma fila entidad+función+año
-- los mezclaría, perdiendo justo la desagregación que se busca (mismo tipo
-- de error de fondo que agregar sin separar MES_EJE=0 de MES_EJE 1-7, ver
-- el hallazgo de PIM=0 documentado en el data contract del MEF).
--
-- Mismo patrón que 003_fix_meta_departamento_uniqueness.sql: usar
-- COALESCE(generica, '') en vez de la columna directa, porque Postgres
-- trata cada NULL como distinto de sí mismo en una unique constraint plana
-- — sin esto, dos ingestas sin generica poblada (filas viejas anteriores a
-- esta migración) no colisionarían entre sí y cada re-ingesta insertaría
-- una fila nueva en vez de actualizar.
DROP INDEX IF EXISTS budget_execution_natural_key;

CREATE UNIQUE INDEX IF NOT EXISTS budget_execution_natural_key
  ON budget_execution (
    entity_code, funcion, anio_fiscal, fecha_corte,
    COALESCE(meta_departamento, ''), COALESCE(generica, '')
  );
