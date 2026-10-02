-- La idempotencia por checksum de precios-combustibles-connector.ts (PR #223)
-- hacía un SELECT de existencia seguido de un INSERT aparte: dos corridas que
-- arrancan a la vez pueden ambas ver "no existe" antes de que la otra termine
-- de insertar, así que las dos insertarían el mismo reporte -- race condition
-- real, hallazgo de CodeRabbit confirmado. Esta restricción hace que el claim
-- del batch sea atómico vía `INSERT ... ON CONFLICT (dataset, checksum) DO
-- NOTHING RETURNING id` (una sola sentencia, sin ventana entre leer y
-- escribir), igual que `sanciones_contratos_vistos` en proveedores-sancionados.
--
-- Índice PARCIAL (no una constraint de tabla completa): `grifos_estaciones`
-- ya tiene 5 batches históricos con el mismo checksum (de corridas repetidas
-- en vivo durante esta sesión, antes de este fix) porque ese dataset nunca
-- necesitó deduplicar por checksum -- su idempotencia real vive en el
-- `ON CONFLICT (expediente)` de la tabla de datos, no en el batch log. Una
-- constraint sobre toda la tabla habría fallado al aplicarse contra esos
-- duplicados preexistentes; el índice parcial solo exige unicidad para el
-- dataset de precios, que sí depende de esta garantía.
CREATE UNIQUE INDEX IF NOT EXISTS raw_osinergmin_batches_precios_checksum_key
  ON raw_osinergmin_batches (dataset, checksum)
  WHERE dataset = 'osinergmin_precios_combustibles_dmin';
