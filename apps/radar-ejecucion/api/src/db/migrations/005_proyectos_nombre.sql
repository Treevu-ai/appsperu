-- Complementa budget_execution (agregado por entidad+función+generica+año)
-- con el detalle de PROYECTO real (ACTIVIDAD_ACCION_OBRA_NOMBRE del CSV del
-- MEF) — el campo que confirmó con nombres reales que el gasto de ANIN es
-- reconstrucción (ej. "RECUPERACION DE HOSPITALES", "CONTROL DE
-- INUNDACIONES Y DEFENSAS RIBEREÑAS"), no solo inferido de la función.
--
-- Tabla APARTE, no una columna más en budget_execution: una misma fila
-- entidad+función+generica+año puede cubrir MUCHOS proyectos distintos (ANIN
-- en La Libertad tiene ~13 solo bajo ORDEN PUBLICO Y SEGURIDAD/generica=6) —
-- meterlo en la clave de agregación de budget_execution explotaría el
-- número de filas y rompería todo lo que ya consume esa tabla (execution.ts,
-- los cruces de actividad-agraria/ceplan-estrategico/salud-institucional).
-- Esta tabla es un nivel de detalle adicional, no un reemplazo.
CREATE TABLE IF NOT EXISTS budget_execution_proyectos (
  id                  BIGSERIAL PRIMARY KEY,
  entity_code         TEXT NOT NULL REFERENCES entities(entity_code),
  funcion             TEXT NOT NULL,
  generica            TEXT,
  proyecto_nombre     TEXT NOT NULL,
  programa_ppto_nombre TEXT,
  anio_fiscal         INTEGER NOT NULL,
  pia                 NUMERIC(18, 2) NOT NULL DEFAULT 0,
  pim                 NUMERIC(18, 2) NOT NULL DEFAULT 0,
  devengado           NUMERIC(18, 2) NOT NULL,
  fecha_corte         DATE NOT NULL,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_mef_batches(id),
  meta_departamento   TEXT
);

-- COALESCE(generica, '') y COALESCE(meta_departamento, '') — no una UNIQUE
-- plana — por el mismo motivo que 003_fix_meta_departamento_uniqueness.sql:
-- Postgres trata cada NULL como distinto de sí mismo en una unique
-- constraint plana, así que sin esto dos ingestas con generica/meta ausente
-- nunca colisionarían y cada re-ingesta insertaría filas nuevas en vez de
-- actualizar.
CREATE UNIQUE INDEX IF NOT EXISTS budget_execution_proyectos_natural_key
  ON budget_execution_proyectos (
    entity_code, funcion, proyecto_nombre, anio_fiscal, fecha_corte,
    COALESCE(generica, ''), COALESCE(meta_departamento, '')
  );

CREATE INDEX IF NOT EXISTS idx_budget_execution_proyectos_entity
  ON budget_execution_proyectos (entity_code, anio_fiscal);
CREATE INDEX IF NOT EXISTS idx_budget_execution_proyectos_meta_departamento
  ON budget_execution_proyectos (meta_departamento) WHERE meta_departamento IS NOT NULL;
