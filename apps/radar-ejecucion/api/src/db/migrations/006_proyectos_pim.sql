-- El nivel actividad/proyecto necesita conservar su PIA/PIM propio para el
-- tablero terminal de seguimiento de lluvias. Las bases existentes ya tienen
-- la tabla de 005; los valores históricos quedan explícitamente en cero hasta
-- que una ingesta vuelva a materializarlos desde la fila MES_EJE=0 del MEF.
ALTER TABLE budget_execution_proyectos
  ADD COLUMN IF NOT EXISTS pia NUMERIC(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE budget_execution_proyectos
  ADD COLUMN IF NOT EXISTS pim NUMERIC(18, 2) NOT NULL DEFAULT 0;
