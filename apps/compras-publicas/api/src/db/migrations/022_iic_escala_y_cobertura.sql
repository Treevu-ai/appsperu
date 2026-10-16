-- IIC — dos correcciones aplicadas 2026-10-16.
-- Ver `docs/hallazgo-iic-integridad-contrataciones-2026-10.md` para el análisis
-- completo que motivó ambos cambios.
--
-- 1) ESCALA (`escala`)
--    El índice dejó de normalizar cada sub-indicador con min-max sobre el
--    universo calificable y pasó a escala ABSOLUTA (crudo en [0,1] * 10,
--    invertido). En La Libertad el rango real del sub-indicador A era
--    [0, 0.0023], y estirarlo a 0-10 hacía que la entidad con el valor crudo
--    MÁS alto quedara publicada como la peor del universo (MUNICIPALIDAD
--    DISTRITAL DE CARABAMBA: 4.93, sub_indicador_a=0.00 — es decir, "100% del
--    monto a proveedores sancionados" cuando el recálculo desde el crudo daba
--    0.23%).
--    Los cortes anteriores y posteriores a este cambio NO son comparables entre
--    sí: una diferencia de promedio entre dos cortes de escalas distintas es
--    puramente metodológica. Esta columna es la que hace ese quiebre
--    descubrible desde una consulta, en vez de obligar a leer el changelog.
--
-- 2) COBERTURA DEL SUB-INDICADOR A (`cobertura_monto_ruc`, `n_adjudicaciones_con_ruc`)
--    `awards.supplier_id` no siempre trae un RUC: 1.872 de 5.986 adjudicaciones
--    de La Libertad (el 31%, el 63.5% del monto) traen un identificador de 7
--    dígitos. Un RUC peruano tiene siempre 11 dígitos, así que esos valores
--    jamás pueden matchear `inhabilitaciones.ruc`.
--    El sub-indicador A ahora se calcula SOLO sobre las adjudicaciones cuyo
--    proveedor trae un RUC válido, y estas dos columnas dejan constancia de
--    cuánto monto y cuántas adjudicaciones entraron realmente. Sin ellas, un
--    score parecía estar calculado sobre el 100% del monto de la entidad cuando
--    en varias entidades lo estaba sobre una fracción.
--    Nota: `cobertura_monto_ruc = NULL` en el corte 2026-10-13 porque ese corte
--    se generó antes de esta métrica y no se recalculó retroactivamente.
ALTER TABLE indice_integridad_contrataciones
  ADD COLUMN IF NOT EXISTS escala TEXT,
  ADD COLUMN IF NOT EXISTS cobertura_monto_ruc NUMERIC,
  ADD COLUMN IF NOT EXISTS n_adjudicaciones_con_ruc INTEGER;

COMMENT ON COLUMN indice_integridad_contrataciones.escala IS
  'Metodología del score. ''absoluta'' = crudo[0,1]*10 invertido (desde 2026-10-16). ' ||
  '''relativa_minmax'' = min-max contra el universo calificable (hasta 2026-10-15), ' ||
  'que distorsiona el resultado cuando todos los pares son buenos. Cortes de escalas ' ||
  'distintas NO son comparables entre sí.';
COMMENT ON COLUMN indice_integridad_contrataciones.cobertura_monto_ruc IS
  'Fracción de monto_total cuyo proveedor trae un RUC de 11 dígitos, es decir, la fracción ' ||
  'sobre la que realmente se evaluó el sub-indicador A. Un valor bajo significa que A no ' ||
  'describe a la entidad entera.';
COMMENT ON COLUMN indice_integridad_contrataciones.n_adjudicaciones_con_ruc IS
  'Cuántas de n_adjudicaciones traen un proveedor con RUC válido de 11 dígitos.';

-- Marcar el corte anterior como no comparable. El corte 2026-10-16 en adelante lo
-- escribe la aplicación como 'absoluta'; este backfill solo toca lo anterior para
-- no etiquetar como 'relativa' un corte que ya se generó con escala absoluta.
UPDATE indice_integridad_contrataciones
   SET escala = 'relativa_minmax'
 WHERE escala IS NULL
   AND fecha_corte < DATE '2026-10-16';

CREATE INDEX IF NOT EXISTS idx_iic_escala ON indice_integridad_contrataciones (escala, fecha_corte);
