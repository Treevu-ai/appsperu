-- Ronda de verificación en vivo (2026-09-05), foco La Libertad, sobre los
-- pendientes reales de dos backlogs: IF-07–11 (Infraestructura Que Funciona)
-- y SC-08 (Trazabilidad Alimentación Escolar). No se materializa ninguna
-- entrega/recepción/operador/mantenimiento nuevo: la búsqueda en fuentes
-- públicas no encontró evidencia que cierre esos vacíos. Lo que sí se agrega
-- es (a) un dato de avance físico más reciente para el drenaje de Trujillo,
-- y (b) el registro explícito de la ausencia de acta de entrega por colegio
-- en Wasi Mikuna La Libertad — antes implícito, ahora en la cola de revisión.

-- (a) Drenaje Trujillo (CUI 2539202): confirmación en prensa de que la obra
-- física sigue en 0% de avance, con fecha oficial de entrega reprogramada a
-- mayo 2035 — consistente con por qué SIN_RECEPCION/SIN_OPERADOR/
-- SIN_MANTENIMIENTO/SIN_DISPONIBILIDAD siguen sin poder cerrarse.
INSERT INTO infrastructure_evidence_batches (
  source_url, source_label, source_kind, access_mode, automation_status, checksum, checksum_status, extracted_at, notes
) VALUES (
  'https://larepublica.pe/politica/2026/08/17/se-necesitan-s2255-millones-para-terminar-12-obras-para-afrontar-los-impactos-de-el-nino-hnews-1548122',
  'La República: drenaje Trujillo en 0% de avance físico, entrega reprogramada a mayo 2035', 'CONTEXTO_AGREGADO', 'DOCUMENTO_PUBLICO', 'NO_AUTOMATIZAR_HASTA_VALIDAR', NULL, 'NO_DESCARGADO_EN_PILOTO', DATE '2026-09-05',
  'Nota de prensa (2026-08-17) sobre 12 obras de prevención ante El Niño: "el drenaje pluvial también registra 0% de avance y el cronograma oficial fija su entrega para mayo de 2035". No publica recepción, operador, mantenimiento ni disponibilidad del activo.'
) ON CONFLICT (source_url) DO NOTHING;

INSERT INTO asset_obra_progress (asset_id, cui, etapa, avance_pct, literal_fuente, source_url, source_batch_id, observed_at)
VALUES (
  'ACTIVO-DRENAJE-2539202', '2539202', 'OTRA', 0,
  'La República (2026-08-17): "el drenaje pluvial también registra 0% de avance y el cronograma oficial fija su entrega para mayo de 2035" — avance físico de obra, distinto del avance de expediente técnico ya registrado.',
  'https://larepublica.pe/politica/2026/08/17/se-necesitan-s2255-millones-para-terminar-12-obras-para-afrontar-los-impactos-de-el-nino-hnews-1548122',
  (SELECT batch_id FROM infrastructure_evidence_batches WHERE source_url='https://larepublica.pe/politica/2026/08/17/se-necesitan-s2255-millones-para-terminar-12-obras-para-afrontar-los-impactos-de-el-nino-hnews-1548122'),
  DATE '2026-09-05'
) ON CONFLICT (asset_id, etapa, source_url) DO NOTHING;

-- Eventos de revisión: se verificó cada candidato pendiente de los dos
-- activos de La Libertad (drenaje Trujillo, IE Casa Grande) y no se encontró
-- evidencia que los cierre. Queda registrado que la verificación ocurrió,
-- en vez de dejar la cola muda desde 2026-08-24/28.
INSERT INTO asset_evidence_review_events (queue_id, decision, reviewer_role, note, evidence_urls)
SELECT queue_id, 'NEEDS_EVIDENCE', 'agente_verificacion_fuentes_publicas',
  CASE candidate_kind
    WHEN 'SIN_DISPONIBILIDAD' THEN 'Verificado 2026-09-05: sin fuente que documente disponibilidad. Para el drenaje, nueva evidencia (La República, 2026-08-17) confirma 0% de avance físico y entrega reprogramada a mayo 2035 — consistente con la ausencia, la obra no está operativa. Para Casa Grande, la única cobertura de prensa adicional hallada repite la inauguración ya conocida, sin dato de disponibilidad/apertura de clases.'
    WHEN 'SIN_MANTENIMIENTO' THEN 'Verificado 2026-09-05: sin evidencia de mantenimiento atribuido al activo. No se halló fuente nueva.'
    WHEN 'SIN_OPERADOR' THEN 'Verificado 2026-09-05: sin fuente que publique entidad operadora. No se halló fuente nueva (para Casa Grande se buscó explícitamente UGEL/administrador, sin resultado).'
    ELSE 'Verificado 2026-09-05: sin fuente que acredite recepción/cierre formal. No se halló fuente nueva.'
  END,
  '[]'::jsonb
FROM asset_evidence_review_queue
WHERE asset_id IN ('ACTIVO-DRENAJE-2539202', 'ACTIVO-EDU-CASA-GRANDE-2026')
  AND candidate_kind IN ('SIN_RECEPCION', 'SIN_OPERADOR', 'SIN_MANTENIMIENTO', 'SIN_DISPONIBILIDAD')
  AND NOT EXISTS (
    SELECT 1 FROM asset_evidence_review_events e
    WHERE e.queue_id = asset_evidence_review_queue.queue_id
      AND e.note LIKE 'Verificado 2026-09-05%'
  );

-- (b) Wasi Mikuna La Libertad: los tres lotes materializados (Guadalupe,
-- Paiján, Casa Grande) nunca tuvieron una fila ENTREGA_SIN_ACTA en la cola de
-- revisión — la ausencia de acta de entrega por colegio quedaba implícita en
-- vez de explícita. Verificación en vivo (2026-09-05) no encontró acta
-- alguna; se registra el vacío formalmente para los tres.
INSERT INTO food_evidence_review_queue (period_id, candidate_kind, lot_id, reason, evidence_urls) VALUES
  ('WASI-MIKUNA-LL-2025', 'ENTREGA_SIN_ACTA', 'WASI-2025-LL5-GUADALUPE',
   'Verificado 2026-09-05: no existe acta/guía/recepción por colegio para este lote en fuentes públicas; el expediente solo refiere número de entrega, no destino escolar.',
   '["https://info.qaliwarma.gob.pe/normatividad/export/?id=TWVLY3B6bXFML2cvcXJKL2FpUzAvUT09"]'),
  ('WASI-MIKUNA-LL-2025', 'ENTREGA_SIN_ACTA', 'WASI-2025-LL5-PAIJAN',
   'Verificado 2026-09-05: no existe acta/guía/recepción por colegio para este lote en fuentes públicas; el expediente solo refiere número de entrega, no destino escolar.',
   '["https://info.qaliwarma.gob.pe/normatividad/export/?id=VC96eHduZFU5ekpEWDBMMVNQTXo0dz09"]'),
  ('WASI-MIKUNA-LL-2025', 'ENTREGA_SIN_ACTA', 'WASI-2025-LL5-CASA-GRANDE',
   'Verificado 2026-09-05: no existe acta/guía/recepción por colegio para este lote en fuentes públicas; el expediente solo refiere número de entrega y una causal de penalidad documental, no destino escolar.',
   '["https://info.qaliwarma.gob.pe/normatividad/export/?id=VzZHVFA3OUpGMHlNbnV3NGJXOUFKUT09"]')
ON CONFLICT DO NOTHING;

INSERT INTO food_evidence_review_events (queue_id, decision, reviewer_role, note, evidence_urls)
SELECT queue_id, 'NEEDS_EVIDENCE', 'agente_verificacion_fuentes_publicas',
  'Verificado 2026-09-05: búsqueda en prensa y fuentes oficiales de Wasi Mikuna La Libertad no encontró acta de entrega por colegio; solo se confirma un operativo de supervisión agregado (ya registrado) sin desagregar a nivel de lote/colegio.',
  '[]'::jsonb
FROM food_evidence_review_queue
WHERE period_id = 'WASI-MIKUNA-LL-2025' AND candidate_kind = 'ENTREGA_SIN_ACTA';
