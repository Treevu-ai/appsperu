-- ALSOL-IF-01 a IF-11: una obra no se confunde con un activo operativo.
-- El modelo conserva por separado cierre, operador, mantenimiento,
-- disponibilidad y cobertura; ningún vacío se completa por similitud.
CREATE TABLE IF NOT EXISTS infrastructure_evidence_batches (
  batch_id                  BIGSERIAL PRIMARY KEY,
  source_url                TEXT NOT NULL UNIQUE,
  source_label              TEXT NOT NULL,
  source_kind               TEXT NOT NULL CHECK (source_kind IN ('DOCUMENTO_PRIMARIO', 'DATOS_ESTRUCTURADOS', 'CONTEXTO_AGREGADO')),
  access_mode               TEXT NOT NULL CHECK (access_mode IN ('DOCUMENTO_PUBLICO', 'DESCARGA_PUBLICA', 'INTERFAZ_MANUAL')),
  automation_status         TEXT NOT NULL CHECK (automation_status IN ('MANUAL_ASISTIDA', 'NO_AUTOMATIZAR_HASTA_VALIDAR', 'AUTOMATIZABLE')),
  checksum                  TEXT,
  checksum_status           TEXT NOT NULL CHECK (checksum_status IN ('CALCULADO', 'NO_DESCARGADO_EN_PILOTO')),
  extracted_at              DATE NOT NULL,
  notes                     TEXT NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS infrastructure_assets (
  asset_id                  TEXT PRIMARY KEY,
  asset_family              TEXT NOT NULL CHECK (asset_family IN ('DRENAJE', 'EDUCACION', 'AGUA_SANEAMIENTO', 'TRANSPORTE', 'RIEGO', 'OTRA')),
  asset_name_published      TEXT NOT NULL,
  department                TEXT NOT NULL,
  province                  TEXT,
  district                  TEXT,
  cui                       TEXT CHECK (cui IS NULL OR cui ~ '^[0-9]{6,12}$'),
  infobras_code             TEXT,
  sector_asset_code         TEXT,
  identity_status           TEXT NOT NULL CHECK (identity_status IN ('CUI_PUBLICADO', 'CODIGO_INFOBRAS_PUBLICADO', 'CODIGO_SECTORIAL_PUBLICADO', 'FUENTE_DECLARA_SIN_CLAVE_DURABLE')),
  source_batch_id           BIGINT NOT NULL REFERENCES infrastructure_evidence_batches(batch_id),
  observed_at               DATE NOT NULL,
  limitation                TEXT NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (identity_status='CUI_PUBLICADO' AND cui IS NOT NULL) OR
    (identity_status='CODIGO_INFOBRAS_PUBLICADO' AND infobras_code IS NOT NULL) OR
    (identity_status='CODIGO_SECTORIAL_PUBLICADO' AND sector_asset_code IS NOT NULL) OR
    (identity_status='FUENTE_DECLARA_SIN_CLAVE_DURABLE' AND cui IS NULL AND infobras_code IS NULL AND sector_asset_code IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS asset_handover_evidence (
  handover_id               BIGSERIAL PRIMARY KEY,
  asset_id                  TEXT NOT NULL REFERENCES infrastructure_assets(asset_id) ON DELETE RESTRICT,
  handover_type             TEXT NOT NULL CHECK (handover_type IN ('RECEPCION', 'CIERRE', 'TRANSFERENCIA_AL_OPERADOR')),
  issuer_name               TEXT NOT NULL,
  handover_date             DATE NOT NULL,
  source_url                TEXT NOT NULL,
  source_detail             TEXT NOT NULL,
  source_batch_id           BIGINT NOT NULL REFERENCES infrastructure_evidence_batches(batch_id),
  observed_at               DATE NOT NULL,
  UNIQUE (asset_id, handover_type, handover_date, source_url)
);

CREATE TABLE IF NOT EXISTS asset_operator_assignments (
  assignment_id             BIGSERIAL PRIMARY KEY,
  asset_id                  TEXT NOT NULL REFERENCES infrastructure_assets(asset_id) ON DELETE RESTRICT,
  operator_name             TEXT NOT NULL,
  operator_role             TEXT NOT NULL CHECK (operator_role IN ('OPERADOR', 'MANTENEDOR', 'ADMINISTRADOR_DEL_SERVICIO')),
  valid_from                DATE,
  valid_to                  DATE,
  source_url                TEXT NOT NULL,
  source_detail             TEXT NOT NULL,
  source_batch_id           BIGINT NOT NULL REFERENCES infrastructure_evidence_batches(batch_id),
  observed_at               DATE NOT NULL,
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  UNIQUE (asset_id, operator_name, operator_role, source_url)
);

CREATE TABLE IF NOT EXISTS asset_maintenance_evidence (
  maintenance_id            BIGSERIAL PRIMARY KEY,
  asset_id                  TEXT REFERENCES infrastructure_assets(asset_id) ON DELETE RESTRICT,
  maintenance_scope         TEXT NOT NULL CHECK (maintenance_scope IN ('ACTIVO', 'AGREGADO_NO_ATRIBUIR')),
  evidence_status           TEXT NOT NULL CHECK (evidence_status IN ('FINANCIAMIENTO_IDENTIFICADO', 'MANTENIMIENTO_DOCUMENTADO')),
  activity_reference        TEXT,
  contract_reference        TEXT,
  fiscal_year               INTEGER CHECK (fiscal_year BETWEEN 2000 AND 2100),
  pim                       NUMERIC(16,2),
  devengado                 NUMERIC(16,2),
  source_url                TEXT NOT NULL,
  source_detail             TEXT NOT NULL,
  source_batch_id           BIGINT NOT NULL REFERENCES infrastructure_evidence_batches(batch_id),
  observed_at               DATE NOT NULL,
  CHECK ((maintenance_scope='ACTIVO' AND asset_id IS NOT NULL) OR (maintenance_scope='AGREGADO_NO_ATRIBUIR' AND asset_id IS NULL)),
  CHECK (pim IS NULL OR pim >= 0),
  CHECK (devengado IS NULL OR devengado >= 0)
);

CREATE TABLE IF NOT EXISTS asset_availability_observations (
  availability_id           BIGSERIAL PRIMARY KEY,
  asset_id                  TEXT NOT NULL REFERENCES infrastructure_assets(asset_id) ON DELETE RESTRICT,
  availability_status       TEXT NOT NULL CHECK (availability_status IN ('OPERATIVO_DOCUMENTADO', 'OPERACION_RESTRINGIDA_DOCUMENTADA', 'FUERA_DE_SERVICIO_DOCUMENTADO')),
  scope_literal             TEXT NOT NULL,
  observed_on               DATE NOT NULL,
  source_url                TEXT NOT NULL,
  source_detail             TEXT NOT NULL,
  source_batch_id           BIGINT NOT NULL REFERENCES infrastructure_evidence_batches(batch_id),
  recorded_at               DATE NOT NULL,
  UNIQUE (asset_id, availability_status, observed_on, source_url)
);

CREATE TABLE IF NOT EXISTS asset_service_indicators (
  indicator_id              BIGSERIAL PRIMARY KEY,
  asset_id                  TEXT REFERENCES infrastructure_assets(asset_id) ON DELETE RESTRICT,
  indicator_scope           TEXT NOT NULL CHECK (indicator_scope IN ('ACTIVO', 'AGREGADO_NO_ATRIBUIR')),
  indicator_name            TEXT NOT NULL,
  indicator_unit            TEXT NOT NULL,
  period_label              TEXT NOT NULL,
  value_numeric             NUMERIC(18,4),
  value_text                TEXT,
  denominator               NUMERIC(18,4),
  coverage_literal          TEXT NOT NULL,
  source_url                TEXT NOT NULL,
  source_detail             TEXT NOT NULL,
  source_batch_id           BIGINT NOT NULL REFERENCES infrastructure_evidence_batches(batch_id),
  observed_at               DATE NOT NULL,
  CHECK ((indicator_scope='ACTIVO' AND asset_id IS NOT NULL) OR (indicator_scope='AGREGADO_NO_ATRIBUIR' AND asset_id IS NULL)),
  CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS asset_evidence_review_queue (
  queue_id                  BIGSERIAL PRIMARY KEY,
  asset_id                  TEXT NOT NULL REFERENCES infrastructure_assets(asset_id) ON DELETE RESTRICT,
  candidate_kind            TEXT NOT NULL CHECK (candidate_kind IN ('SIN_RECEPCION', 'SIN_OPERADOR', 'SIN_MANTENIMIENTO', 'SIN_DISPONIBILIDAD', 'FUENTE_NO_AUTOMATIZABLE')),
  reason                    TEXT NOT NULL,
  evidence_urls             JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                    TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REVIEWED', 'DISMISSED', 'NEEDS_EVIDENCE')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, candidate_kind)
);

CREATE TABLE IF NOT EXISTS asset_evidence_review_events (
  event_id                  BIGSERIAL PRIMARY KEY,
  queue_id                  BIGINT NOT NULL REFERENCES asset_evidence_review_queue(queue_id) ON DELETE RESTRICT,
  decision                  TEXT NOT NULL CHECK (decision IN ('REVIEWED', 'DISMISSED', 'NEEDS_EVIDENCE')),
  reviewer_role             TEXT NOT NULL,
  note                      TEXT NOT NULL,
  evidence_urls             JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewed_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_infrastructure_assets_territory ON infrastructure_assets(department, asset_family);
CREATE INDEX IF NOT EXISTS idx_infrastructure_assets_cui ON infrastructure_assets(cui) WHERE cui IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_availability_latest ON asset_availability_observations(asset_id, observed_on DESC);

-- Piloto: dos activos con fuente primaria ya documentada. No se carga agua y
-- saneamiento mientras no exista fuente verificable de activo/operación.
INSERT INTO infrastructure_evidence_batches (
  source_url,source_label,source_kind,access_mode,automation_status,checksum,checksum_status,extracted_at,notes
) VALUES
  ('https://www.mef.gob.pe/contenidos/presu_publ/anexos/ppto2026/Anexo_5.PDF',
   'Ley de Presupuesto 2026, Anexo 5: drenaje Trujillo','DOCUMENTO_PRIMARIO','DOCUMENTO_PUBLICO','MANUAL_ASISTIDA',NULL,'NO_DESCARGADO_EN_PILOTO',DATE '2026-08-24',
   'Publica CUI 2539202 y asignación presupuestal. No publica recepción, operador, mantenimiento ni disponibilidad del activo.'),
  ('https://www.congreso.gob.pe/Docs/comisiones2024/Fiscalizacion/files/sesiones_extraordinarias/pre-anin2.pdf',
   'ANIN ante Congreso: drenaje Trujillo','DOCUMENTO_PRIMARIO','DOCUMENTO_PUBLICO','MANUAL_ASISTIDA',NULL,'NO_DESCARGADO_EN_PILOTO',DATE '2026-08-24',
   'Publica alcance territorial del drenaje. No acredita por sí mismo cierre u operación.'),
  ('https://www.gob.pe/institucion/anin/noticias/1373519-anin-fortalece-la-infraestructura-educativa-con-nueva-institucion-en-la-libertad',
   'ANIN: institución educativa Casa Grande','DOCUMENTO_PRIMARIO','DOCUMENTO_PUBLICO','NO_AUTOMATIZAR_HASTA_VALIDAR',NULL,'NO_DESCARGADO_EN_PILOTO',DATE '2026-08-24',
   'Publica inversión, población beneficiaria y componentes. No publica CUI, código INFOBRAS, recepción, operador ni disponibilidad.')
ON CONFLICT (source_url) DO NOTHING;

INSERT INTO infrastructure_assets (
  asset_id,asset_family,asset_name_published,department,province,district,cui,infobras_code,sector_asset_code,identity_status,source_batch_id,observed_at,limitation
) VALUES
  ('ACTIVO-DRENAJE-2539202','DRENAJE','Creación del servicio de drenaje pluvial en el ámbito urbano de Trujillo','LA LIBERTAD','TRUJILLO',NULL,'2539202',NULL,NULL,'CUI_PUBLICADO',
   (SELECT batch_id FROM infrastructure_evidence_batches WHERE source_label='Ley de Presupuesto 2026, Anexo 5: drenaje Trujillo'),DATE '2026-08-24',
   'La fuente permite identificar el CUI y el alcance publicado, pero no acredita recepción, operador, mantenimiento ni disponibilidad.'),
  ('ACTIVO-EDU-CASA-GRANDE-2026','EDUCACION','Nueva institución educativa en Casa Grande','LA LIBERTAD','ASCOPE','CASA GRANDE',NULL,NULL,NULL,'FUENTE_DECLARA_SIN_CLAVE_DURABLE',
   (SELECT batch_id FROM infrastructure_evidence_batches WHERE source_label='ANIN: institución educativa Casa Grande'),DATE '2026-08-24',
   'La fuente publica inversión y población beneficiaria, pero no CUI, código INFOBRAS, recepción, operador, mantenimiento ni disponibilidad.')
ON CONFLICT (asset_id) DO NOTHING;

INSERT INTO asset_evidence_review_queue (asset_id,candidate_kind,reason,evidence_urls) VALUES
  ('ACTIVO-DRENAJE-2539202','SIN_RECEPCION','No existe acta de recepción o cierre materializada para el activo.','["https://www.mef.gob.pe/contenidos/presu_publ/anexos/ppto2026/Anexo_5.PDF"]'),
  ('ACTIVO-DRENAJE-2539202','SIN_OPERADOR','La fuente no publica entidad operadora del activo.','["https://www.congreso.gob.pe/Docs/comisiones2024/Fiscalizacion/files/sesiones_extraordinarias/pre-anin2.pdf"]'),
  ('ACTIVO-DRENAJE-2539202','SIN_MANTENIMIENTO','No existe evidencia de mantenimiento atribuida al activo.','["https://www.mef.gob.pe/contenidos/presu_publ/anexos/ppto2026/Anexo_5.PDF"]'),
  ('ACTIVO-DRENAJE-2539202','SIN_DISPONIBILIDAD','No existe fuente materializada que documente disponibilidad del drenaje.','["https://www.congreso.gob.pe/Docs/comisiones2024/Fiscalizacion/files/sesiones_extraordinarias/pre-anin2.pdf"]'),
  ('ACTIVO-EDU-CASA-GRANDE-2026','SIN_RECEPCION','No existe acta de recepción o cierre materializada para el activo.','["https://www.gob.pe/institucion/anin/noticias/1373519-anin-fortalece-la-infraestructura-educativa-con-nueva-institucion-en-la-libertad"]'),
  ('ACTIVO-EDU-CASA-GRANDE-2026','SIN_OPERADOR','La fuente no publica entidad operadora del activo.','["https://www.gob.pe/institucion/anin/noticias/1373519-anin-fortalece-la-infraestructura-educativa-con-nueva-institucion-en-la-libertad"]'),
  ('ACTIVO-EDU-CASA-GRANDE-2026','SIN_MANTENIMIENTO','No existe evidencia de mantenimiento atribuida al activo.','["https://www.gob.pe/institucion/anin/noticias/1373519-anin-fortalece-la-infraestructura-educativa-con-nueva-institucion-en-la-libertad"]'),
  ('ACTIVO-EDU-CASA-GRANDE-2026','SIN_DISPONIBILIDAD','No existe fuente materializada que documente disponibilidad de la institución educativa.','["https://www.gob.pe/institucion/anin/noticias/1373519-anin-fortalece-la-infraestructura-educativa-con-nueva-institucion-en-la-libertad"]')
ON CONFLICT (asset_id,candidate_kind) DO NOTHING;
