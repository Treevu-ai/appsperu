-- IIC (Índice de Integridad en Contrataciones), piloto La Libertad.
-- Granularidad: por entidad compradora (buyer_id+buyer_name), NO regional --
-- a diferencia de INCORE/IRESA/IRBG/IRIS (IPE), que solo llegan a nivel de
-- las 25 regiones. Escala 0-10, 10 = mejor (menor riesgo), para ser
-- comparable con la convención de IRIS.
--
-- datos_insuficientes=true marca entidades con <5 adjudicaciones en el
-- período -- NUNCA se les asigna un score que luzca como "riesgo cero" por
-- falta de dato (mismo principio ya aplicado en
-- apps/territorio-inteligencia/api/src/routes/riesgo-eudr.ts).
CREATE TABLE IF NOT EXISTS indice_integridad_contrataciones (
  id                  BIGSERIAL PRIMARY KEY,
  buyer_id            TEXT NOT NULL,
  buyer_name          TEXT NOT NULL,
  fecha_corte         DATE NOT NULL,
  score               NUMERIC,
  sub_indicador_a      NUMERIC, -- % monto a proveedores con inhabilitación vigente al momento de adjudicar (0-10, invertido)
  sub_indicador_b      NUMERIC, -- % adjudicaciones con un solo postor registrado (0-10, invertido)
  sub_indicador_c      NUMERIC, -- concentración de proveedores (HHI 0-1 normalizado a 0-10, invertido)
  n_subindicadores    INTEGER NOT NULL, -- cuántos de los 3 se pudieron calcular (para no promediar silenciosamente menos de 3)
  n_adjudicaciones    INTEGER NOT NULL,
  monto_total         NUMERIC NOT NULL,
  datos_insuficientes BOOLEAN NOT NULL DEFAULT false,
  notas               TEXT,
  source_batch_id     BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (buyer_id, fecha_corte)
);

CREATE INDEX IF NOT EXISTS idx_iic_score ON indice_integridad_contrataciones (score);
CREATE INDEX IF NOT EXISTS idx_iic_fecha_corte ON indice_integridad_contrataciones (fecha_corte);
