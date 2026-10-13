-- Constraint único real (capa, objectid) -- sin esto, una corrida de
-- ingesta concurrente o una reanudación que vuelve a traer un rango ya
-- insertado podía duplicar filas. Confirmado en vivo el 2026-10-13: ~10
-- procesos huérfanos de midagri-connector.ts corriendo en paralelo (el
-- harness reportaba "killed" pero el proceso seguía vivo) generaron
-- duplicados masivos, y la lógica de reanudación basada en count(*) crudo
-- interpretó eso como "capa completa" y disparó un DELETE + reinicio
-- mientras otro proceso seguía insertando -- se perdieron ~3M filas ya
-- transferidas de predio_rural.
--
-- Esta migración asume que la tabla ya fue deduplicada a mano (quedarse
-- con la fila de menor id por cada par capa/objectid) antes de aplicarse.
ALTER TABLE catastro_rural
  ADD CONSTRAINT catastro_rural_capa_objectid_uniq UNIQUE (capa, objectid);
