-- DQ-18: `provincia` llega puramente numérica en el 11% de los proyectos OxI
-- a nivel nacional (no un ubigeo real — ver docblock de `provinciaEsConfiable`
-- en `src/ingest/oxi-normalize.ts`). Se marca, nunca se corrige en silencio;
-- el fallback por regex sobre `nombre_proyecto` se expone aparte.
ALTER TABLE oxi_investment_promotions
  ADD COLUMN IF NOT EXISTS provincia_confiable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS provincia_extraida_de_nombre TEXT,
  ADD COLUMN IF NOT EXISTS distrito_extraido_de_nombre TEXT;

-- Backfill para las filas que ya existían antes de esta migración: `migrate`
-- e `ingest:oxi` son comandos separados (hallazgo real de code review,
-- Copilot en PR #238), así que sin este UPDATE el DEFAULT true de arriba
-- deja todo marcado "confiable" —incluidas las filas numéricas— hasta que
-- corra la siguiente reingesta manual, una ventana donde la API publicaría
-- el metadato equivocado. Misma regla que `provinciaEsConfiable()`: no
-- confiable si es nula o puramente numérica. Los dos fallbacks de
-- extracción por regex quedan en NULL a propósito —replicarlos en SQL
-- arriesga divergir del regex real en TypeScript—; los repuebla la próxima
-- `ingest:oxi`, que de todos modos hay que correr para traer datos frescos.
UPDATE oxi_investment_promotions
SET provincia_confiable = (provincia IS NOT NULL AND provincia !~ '^[0-9]+$');

CREATE INDEX IF NOT EXISTS idx_oxi_investment_promotions_provincia_no_confiable
  ON oxi_investment_promotions (provincia_confiable)
  WHERE provincia_confiable = false;
