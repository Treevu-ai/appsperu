-- DQ-18: `provincia` llega puramente numérica en el 11% de los proyectos OxI
-- a nivel nacional (no un ubigeo real — ver docblock de `provinciaEsConfiable`
-- en `src/ingest/oxi-normalize.ts`). Se marca, nunca se corrige en silencio;
-- el fallback por regex sobre `nombre_proyecto` se expone aparte.
ALTER TABLE oxi_investment_promotions
  ADD COLUMN IF NOT EXISTS provincia_confiable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS provincia_extraida_de_nombre TEXT,
  ADD COLUMN IF NOT EXISTS distrito_extraido_de_nombre TEXT;

CREATE INDEX IF NOT EXISTS idx_oxi_investment_promotions_provincia_no_confiable
  ON oxi_investment_promotions (provincia_confiable)
  WHERE provincia_confiable = false;
