-- ITRE (Indice de Riesgo Territorial Extractivo) -- score 0-10 por concesion
-- forestal maderable, combinando intensidad de perdida de bosque (sub A) y
-- sancion OSINFOR normalizada por hectarea (sub B). Solo incluye concesiones
-- con solapamiento real de perdida (> 0 ha) -- una concesion sin solapamiento
-- NO aparece aqui, no es que tenga score 10 (mismo principio que
-- apps/territorio-inteligencia/api/src/routes/riesgo-eudr.ts: ausencia de
-- evidencia no es evidencia de ausencia de riesgo).

CREATE TABLE IF NOT EXISTS indice_riesgo_territorial_extractivo (
  id                  BIGSERIAL PRIMARY KEY,
  cont_id             TEXT NOT NULL,
  company             TEXT,
  departamento_aprox  TEXT,
  ha_concesion        NUMERIC NOT NULL,
  ha_perdida          NUMERIC NOT NULL,
  monto_sanciones_uit NUMERIC NOT NULL DEFAULT 0,
  sub_indicador_a     NUMERIC NOT NULL,
  sub_indicador_b     NUMERIC NOT NULL,
  score               NUMERIC NOT NULL,
  fecha_corte         DATE NOT NULL DEFAULT CURRENT_DATE,
  notas               TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_itre_cont_id_fecha ON indice_riesgo_territorial_extractivo (cont_id, fecha_corte);
CREATE INDEX IF NOT EXISTS idx_itre_score ON indice_riesgo_territorial_extractivo (score);
