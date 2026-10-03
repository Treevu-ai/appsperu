-- Cargas portuarias históricas (APN, "CARGAS_2010_2017.xlsx") — VUL-03
-- Ver apps/infraestructura-mtc/docs/estructura-cargas-apn-2010-2017.md para el porqué de este
-- diseño: la fuente mezcla filas de agregado (puerto/ámbito/total) y filas de detalle (terminal
-- con Uso Público/Privado) en la misma columna, sin desagregación por tipo de carga ni dato
-- mensual, y sin cobertura Lacustre.

ALTER TABLE raw_infraestructura_mtc_batches DROP CONSTRAINT IF EXISTS raw_infraestructura_mtc_batches_dataset_check;
ALTER TABLE raw_infraestructura_mtc_batches ADD CONSTRAINT raw_infraestructura_mtc_batches_dataset_check
  CHECK (dataset IN ('puertos', 'aerodromos', 'peajes', 'cargas_portuarias'));

CREATE TABLE IF NOT EXISTS cargas_portuarias_historico (
  id               BIGSERIAL PRIMARY KEY,
  nivel            TEXT NOT NULL CHECK (nivel IN ('total_general', 'ambito', 'puerto', 'terminal')),
  ambito           TEXT CHECK (ambito IN ('MARITIMO', 'FLUVIAL')),
  puerto           TEXT,              -- nombre del puerto/bahía agregador; NULL para total_general/ambito
  nombre_fuente    TEXT NOT NULL,     -- etiqueta tal como aparece en la columna "Terminales Portuarios"
  uso              TEXT CHECK (uso IN ('Público', 'Privado')), -- NULL en filas de agregado
  anio             INT NOT NULL CHECK (anio BETWEEN 2010 AND 2017),
  volumen_tm       NUMERIC NOT NULL,
  source_batch_id  BIGINT NOT NULL REFERENCES raw_infraestructura_mtc_batches(id)
);

-- `source_batch_id` queda fuera de la clave: re-ingestar el mismo dataset estático debe
-- actualizar la fila existente (ON CONFLICT ... DO UPDATE), no duplicar el histórico en cada
-- corrida — mismo patrón que terminales_portuarios/aerodromos/peajes en infraestructura-mtc-connector.ts.
-- `puerto` es NULL en filas total_general/ambito; Postgres trata NULL como distinto de NULL en
-- una UNIQUE normal, así que se usa COALESCE para que esas filas también deduplique entre corridas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cargas_portuarias_fuente_puerto_anio
  ON cargas_portuarias_historico (nombre_fuente, COALESCE(puerto, ''), anio);

CREATE INDEX IF NOT EXISTS idx_cargas_portuarias_puerto ON cargas_portuarias_historico (puerto);
CREATE INDEX IF NOT EXISTS idx_cargas_portuarias_ambito ON cargas_portuarias_historico (ambito);
CREATE INDEX IF NOT EXISTS idx_cargas_portuarias_anio ON cargas_portuarias_historico (anio);

CREATE TABLE IF NOT EXISTS cargas_portuarias_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_infraestructura_mtc_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
