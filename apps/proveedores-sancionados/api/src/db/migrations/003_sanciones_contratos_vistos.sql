-- PV-05 (docs/TICKETS_Propuesta_Valor_Bajo_Esfuerzo_v1.md): el cruce
-- contrataciones×sanciones (`crossref.ts`) recalculaba todo en cada
-- llamada sin recordar qué combinación RUC+contrato ya se había visto en
-- una corrida anterior — no había forma de saber si un caso era nuevo
-- desde la última vez que alguien lo revisó. Esta tabla no agrega ninguna
-- sanción ni contrato nuevo: solo memoriza la primera vez que el cruce
-- vio un caso concreto, para poder marcarlo como "ya conocido" en
-- corridas futuras.
CREATE TABLE IF NOT EXISTS sanciones_contratos_vistos (
  id BIGSERIAL PRIMARY KEY,
  ruc TEXT NOT NULL,
  referencia_contrato TEXT NOT NULL,
  primera_vez_visto TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ruc, referencia_contrato)
);

CREATE INDEX IF NOT EXISTS idx_sanciones_contratos_vistos_ruc
  ON sanciones_contratos_vistos (ruc);
