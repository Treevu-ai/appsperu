-- Corrección/refuerzo del indicador de cobertura del drenaje de Trujillo
-- (migración 021): investigando por qué el conector de radar-inversiones
-- solo veía inversiones "ACTIVO" del MEF (ver PR de esa investigación,
-- 2026-09-06), se encontró que `DETALLE_INVERSIONES.csv` trae una columna
-- oficial `NUM_HABITANTES_BENEF` por CUI que el conector nunca leía. Para el
-- CUI 2539202 (mismo activo que ACTIVO-DRENAJE-2539202) el valor oficial es
-- 416,115 — más autoritativo que la cifra de prensa de 2023 (250,000) ya
-- cargada en la migración 021, porque está atada directamente al CUI por el
-- propio MEF, no a una estimación de ARCC de hace tres años.
--
-- No se borra ni se sobreescribe el indicador de 2023 (evidencia append-only,
-- igual que el resto del proyecto) — se agrega este como el más reciente y
-- autoritativo; un consumidor que ordene por `observed_at` ve primero el
-- oficial.
INSERT INTO infrastructure_evidence_batches (
  source_url, source_label, source_kind, access_mode, automation_status, checksum, checksum_status, extracted_at, notes
) VALUES (
  'https://www.datosabiertos.gob.pe/dataset/detalle-de-inversiones',
  'MEF: Detalle de Inversiones (Banco de Inversiones) — NUM_HABITANTES_BENEF del CUI 2539202', 'DATOS_ESTRUCTURADOS', 'DESCARGA_PUBLICA', 'AUTOMATIZABLE', NULL, 'NO_DESCARGADO_EN_PILOTO', DATE '2026-09-06',
  'Columna oficial NUM_HABITANTES_BENEF de DETALLE_INVERSIONES.csv para el CUI 2539202: 416,115. Confirmado en vivo leyendo la fila cruda del CSV (offset ~188.7MB del archivo publicado el 2026-09-06). No es una cifra de prensa — es el dato que el propio MEF asocia al CUI en su Banco de Inversiones.'
) ON CONFLICT (source_url) DO NOTHING;

INSERT INTO asset_service_indicators (
  asset_id, indicator_scope, indicator_name, indicator_unit, period_label,
  value_numeric, coverage_literal, source_url, source_detail, source_batch_id, observed_at
) VALUES (
  'ACTIVO-DRENAJE-2539202', 'ACTIVO', 'Población beneficiada (NUM_HABITANTES_BENEF oficial del MEF, por CUI)', 'habitantes', '2026 (corte del Banco de Inversiones)',
  416115,
  'MEF publica 416,115 habitantes beneficiados directamente para el CUI 2539202 en su Banco de Inversiones — más autoritativo que la estimación de prensa de 2023 (250,000, ver indicador previo de la migración 021), porque viene atado al CUI por la propia fuente oficial, no a una nota periodística sobre la firma del contrato de diseño.',
  'https://www.datosabiertos.gob.pe/dataset/detalle-de-inversiones',
  'MEF, DETALLE_INVERSIONES.csv, columna NUM_HABITANTES_BENEF, fila CUI=2539202 (confirmado en vivo 2026-09-06).',
  (SELECT batch_id FROM infrastructure_evidence_batches WHERE source_url='https://www.datosabiertos.gob.pe/dataset/detalle-de-inversiones'),
  DATE '2026-09-06'
);
