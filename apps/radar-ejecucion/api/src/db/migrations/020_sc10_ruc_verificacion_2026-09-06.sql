-- Intento de resolución de RUC para SC-10 (cumplimiento SUNAT/RNP de
-- proveedores Wasi Mikuna La Libertad), 2026-09-06. No se cierra ningún
-- LOTE_SIN_RUC: no hay fuente citable.
--
-- Se intentaron dos vías:
-- 1. contratacionesabiertas.osce.gob.pe (portal OCDS oficial de OSCE): DNS no
--    resuelve desde este entorno (NXDOMAIN, confirmado con nslookup/curl),
--    aunque es el portal vigente enlazado desde gob.pe/institucion/oece.
-- 2. datosabiertos.gob.pe, dataset "Qali Warma Proveedores": el recurso
--    disponible está desactualizado a 2021 (Listado_Proveedores_12-03.csv),
--    anterior a los lotes 2025 de La Libertad — no puede contener estos
--    proveedores.
--
-- Búsqueda manual (fuera de este entorno) encontró nombres/RUC candidatos
-- para ambos consorcios, pero sin URL de fuente primaria citable en ningún
-- caso, y con una discrepancia de razón social sin confirmar para uno de
-- ellos ("CONSORCIO SUYANNA" del expediente vs. "Consorcio Nueva Suyana").
-- Regla del proyecto: ningún RUC se persiste sin URL y fecha de una fuente
-- verificable (SC-05, Definition of Done). Se registra el intento, no el dato.
INSERT INTO food_evidence_review_events (queue_id, decision, reviewer_role, note, evidence_urls)
SELECT queue_id, 'NEEDS_EVIDENCE', 'agente_verificacion_fuentes_publicas',
  CASE lot_id
    WHEN 'WASI-2025-LL5-GUADALUPE' THEN 'Verificado 2026-09-06: se intentó ubicar el RUC de CONSORCIO SUYANNA en contratacionesabiertas.osce.gob.pe (DNS no resuelve desde este entorno) y en el dataset de datosabiertos.gob.pe (desactualizado a 2021). Búsqueda manual encontró un candidato ("Consorcio Nueva Suyana") con razón social distinta a la publicada en el expediente y sin URL de fuente primaria — no se carga por no ser verificable.'
    WHEN 'WASI-2025-LL5-PAIJAN' THEN 'Verificado 2026-09-06: mismo proveedor (CONSORCIO SUYANNA) que WASI-2025-LL5-GUADALUPE — mismo resultado: sin fuente verificable.'
    WHEN 'WASI-2025-LL5-CASA-GRANDE' THEN 'Verificado 2026-09-06: se intentó ubicar el RUC de CONSORCIO SAMI en contratacionesabiertas.osce.gob.pe (DNS no resuelve desde este entorno) y en el dataset de datosabiertos.gob.pe (desactualizado a 2021). Búsqueda manual encontró un RUC candidato (20608760424) con razón social coincidente, pero sin URL de fuente primaria — no se carga por no ser verificable.'
  END,
  '[]'::jsonb
FROM food_evidence_review_queue
WHERE candidate_kind = 'LOTE_SIN_RUC'
  AND lot_id IN ('WASI-2025-LL5-GUADALUPE', 'WASI-2025-LL5-PAIJAN', 'WASI-2025-LL5-CASA-GRANDE');
