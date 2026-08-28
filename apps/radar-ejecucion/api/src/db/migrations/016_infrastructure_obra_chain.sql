-- Cadena obra → etapa de proyecto → recepción → operador.
-- La etapa de obra (diseño/ejecución) es distinta de recepción/cierre documentado.
CREATE TABLE IF NOT EXISTS asset_obra_progress (
  progress_id     BIGSERIAL PRIMARY KEY,
  asset_id        TEXT NOT NULL REFERENCES infrastructure_assets(asset_id) ON DELETE RESTRICT,
  cui             TEXT,
  etapa           TEXT NOT NULL CHECK (etapa IN ('DISENO', 'EJECUCION_OBRA', 'LICITACION', 'PARALIZADA', 'OTRA')),
  avance_pct      NUMERIC(5,2) CHECK (avance_pct IS NULL OR (avance_pct >= 0 AND avance_pct <= 100)),
  literal_fuente  TEXT NOT NULL,
  source_url      TEXT NOT NULL,
  source_batch_id BIGINT NOT NULL REFERENCES infrastructure_evidence_batches(batch_id),
  observed_at     DATE NOT NULL,
  UNIQUE (asset_id, etapa, source_url)
);

INSERT INTO infrastructure_evidence_batches (
  source_url, source_label, source_kind, access_mode, automation_status, checksum, checksum_status, extracted_at, notes
) VALUES
  ('https://www.gob.pe/institucion/munitrujillo/noticias/1338294-expediente-tecnico-para-el-drenaje-pluvial-de-trujillo-esta-retrasado',
   'MPT: expediente técnico drenaje pluvial en diseño', 'DOCUMENTO_PRIMARIO', 'DOCUMENTO_PUBLICO', 'MANUAL_ASISTIDA', NULL, 'NO_DESCARGADO_EN_PILOTO', DATE '2026-08-28',
   'ANIN informa etapa de diseño del CUI 2539202; no constituye recepción ni operador.'),
  ('https://www.gob.pe/institucion/anin/noticias/1373519-anin-fortalece-la-infraestructura-educativa-con-nueva-institucion-en-la-libertad',
   'ANIN: IE Casa Grande — entrega/inauguración', 'DOCUMENTO_PRIMARIO', 'DOCUMENTO_PUBLICO', 'MANUAL_ASISTIDA', NULL, 'NO_DESCARGADO_EN_PILOTO', DATE '2026-08-28',
   'Nota de inauguración/entrega; no equivale a acta de recepción formal ni operador de servicio.'),
  ('https://www.gob.pe/institucion/mvcs/noticias',
   'MVCS: saneamiento urbano — cohorte piloto estructural', 'CONTEXTO_AGREGADO', 'INTERFAZ_MANUAL', 'NO_AUTOMATIZAR_HASTA_VALIDAR', NULL, 'NO_DESCARGADO_EN_PILOTO', DATE '2026-08-28',
   'Placeholder de familia agua/saneamiento hasta fuente reproducible de activo/operador.')
ON CONFLICT (source_url) DO NOTHING;

INSERT INTO asset_obra_progress (asset_id, cui, etapa, avance_pct, literal_fuente, source_url, source_batch_id, observed_at)
VALUES (
  'ACTIVO-DRENAJE-2539202', '2539202', 'DISENO', 96.5,
  'ANIN informó avance del expediente técnico en etapa de diseño; obra aún no en ejecución.',
  'https://www.gob.pe/institucion/munitrujillo/noticias/1338294-expediente-tecnico-para-el-drenaje-pluvial-de-trujillo-esta-retrasado',
  (SELECT batch_id FROM infrastructure_evidence_batches WHERE source_label='MPT: expediente técnico drenaje pluvial en diseño'),
  DATE '2026-08-28'
) ON CONFLICT (asset_id, etapa, source_url) DO NOTHING;

INSERT INTO infrastructure_assets (
  asset_id, asset_family, asset_name_published, department, province, district, cui, infobras_code, sector_asset_code,
  identity_status, source_batch_id, observed_at, limitation
) VALUES (
  'ACTIVO-SANEAMIENTO-LL-PILOTO', 'AGUA_SANEAMIENTO',
  'Cohorte piloto saneamiento urbano La Libertad (sin activo durable publicado)',
  'LA LIBERTAD', NULL, NULL, NULL, NULL, NULL, 'FUENTE_DECLARA_SIN_CLAVE_DURABLE',
  (SELECT batch_id FROM infrastructure_evidence_batches WHERE source_label='MVCS: saneamiento urbano — cohorte piloto estructural'),
  DATE '2026-08-28',
  'Estructura replicable a saneamiento; pendiente fuente con activo/acto/operador verificable (IF-01–03).'
) ON CONFLICT (asset_id) DO NOTHING;

INSERT INTO asset_evidence_review_queue (asset_id, candidate_kind, reason, evidence_urls) VALUES
  ('ACTIVO-SANEAMIENTO-LL-PILOTO', 'FUENTE_NO_AUTOMATIZABLE', 'Sin fuente reproducible de activo/operador para saneamiento en La Libertad.', '[]')
ON CONFLICT (asset_id, candidate_kind) DO NOTHING;

-- Casa Grande: etapa de obra documentada (inauguración), sin confundir con recepción formal.
INSERT INTO asset_obra_progress (asset_id, cui, etapa, avance_pct, literal_fuente, source_url, source_batch_id, observed_at)
VALUES (
  'ACTIVO-EDU-CASA-GRANDE-2026', NULL, 'EJECUCION_OBRA', 100,
  'ANIN publica inauguración/entrega de institución educativa; ALSOL no materializa acta de recepción.',
  'https://www.gob.pe/institucion/anin/noticias/1373519-anin-fortalece-la-infraestructura-educativa-con-nueva-institucion-en-la-libertad',
  (SELECT batch_id FROM infrastructure_evidence_batches WHERE source_label='ANIN: IE Casa Grande — entrega/inauguración'),
  DATE '2026-08-28'
) ON CONFLICT (asset_id, etapa, source_url) DO NOTHING;
