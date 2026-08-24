-- ALSOL-SC-01 a SC-10: trazabilidad de alimentación escolar.
-- Todas las relaciones son append-only y requieren una fuente primaria. Los
-- nombres de proveedor pueden conservarse como literal publicado, pero no se
-- convierten en un RUC hasta tener una clave exacta de 11 dígitos.
CREATE TABLE IF NOT EXISTS food_evidence_batches (
  batch_id                  BIGSERIAL PRIMARY KEY,
  source_url                TEXT NOT NULL UNIQUE,
  source_label              TEXT NOT NULL,
  source_kind               TEXT NOT NULL CHECK (source_kind IN ('DOCUMENTO_PRIMARIO', 'CONTEXTO_AGREGADO', 'INTERFAZ_POR_VALIDAR')),
  access_mode               TEXT NOT NULL CHECK (access_mode IN ('DOCUMENTO_PUBLICO', 'PAGINA_PUBLICA', 'INTERFAZ_MANUAL')),
  automation_status         TEXT NOT NULL CHECK (automation_status IN ('MANUAL_ASISTIDA', 'NO_AUTOMATIZAR_HASTA_VALIDAR', 'AUTOMATIZABLE')),
  source_checksum           TEXT,
  checksum_status           TEXT NOT NULL CHECK (checksum_status IN ('CALCULADO', 'NO_DESCARGADO_EN_PILOTO')),
  extracted_at              DATE NOT NULL,
  notes                     TEXT NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS food_service_periods (
  period_id                 TEXT PRIMARY KEY,
  service_id                TEXT NOT NULL REFERENCES care_service_records(service_id) ON DELETE RESTRICT,
  year                      INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  territorial_unit          TEXT NOT NULL,
  modality                  TEXT,
  planned_students          INTEGER,
  planned_schools           INTEGER,
  published_lots            INTEGER,
  awarded_lots              INTEGER,
  materialized_lots         INTEGER NOT NULL DEFAULT 0,
  school_denominator_status TEXT NOT NULL CHECK (school_denominator_status IN ('PADRON_OFICIAL_INGRESADO', 'PUBLICADO_AGREGADO_SIN_PADRON', 'NO_PUBLICADO')),
  coverage_status           TEXT NOT NULL CHECK (coverage_status IN ('PARCIAL_DECLARADA', 'COMPLETA_EN_EL_ALCANCE', 'NO_VERIFICADA')),
  source_batch_id           BIGINT NOT NULL REFERENCES food_evidence_batches(batch_id),
  observed_at               DATE NOT NULL,
  limitation                TEXT NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (planned_students IS NULL OR planned_students >= 0),
  CHECK (planned_schools IS NULL OR planned_schools >= 0),
  CHECK (published_lots IS NULL OR published_lots >= 0),
  CHECK (awarded_lots IS NULL OR awarded_lots >= 0),
  CHECK (awarded_lots IS NULL OR published_lots IS NULL OR awarded_lots <= published_lots)
);

CREATE TABLE IF NOT EXISTS food_lots (
  lot_id                    TEXT PRIMARY KEY,
  period_id                 TEXT NOT NULL REFERENCES food_service_periods(period_id) ON DELETE RESTRICT,
  committee_name            TEXT NOT NULL,
  item_literal              TEXT NOT NULL,
  contract_reference        TEXT NOT NULL,
  modality                  TEXT NOT NULL,
  supplier_name_published   TEXT,
  supplier_ruc              TEXT CHECK (supplier_ruc IS NULL OR supplier_ruc ~ '^[0-9]{11}$'),
  supplier_ruc_status       TEXT NOT NULL CHECK (supplier_ruc_status IN ('RUC_PUBLICADO_Y_VERIFICADO', 'RUC_NO_PUBLICADO_EN_EVIDENCIA')),
  documented_delivery_number INTEGER,
  lot_status                TEXT NOT NULL CHECK (lot_status IN ('CONTRATO_PUBLICADO', 'ENTREGA_REFERIDA_EN_DOCUMENTO', 'OBSERVACION_CONTRACTUAL_DOCUMENTADA')),
  source_batch_id           BIGINT NOT NULL REFERENCES food_evidence_batches(batch_id),
  observed_at               DATE NOT NULL,
  limitation                TEXT NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((supplier_ruc IS NOT NULL AND supplier_ruc_status='RUC_PUBLICADO_Y_VERIFICADO')
      OR (supplier_ruc IS NULL AND supplier_ruc_status='RUC_NO_PUBLICADO_EN_EVIDENCIA')),
  CHECK (documented_delivery_number IS NULL OR documented_delivery_number > 0)
);

CREATE TABLE IF NOT EXISTS food_lot_evidence (
  evidence_id               BIGSERIAL PRIMARY KEY,
  lot_id                    TEXT NOT NULL REFERENCES food_lots(lot_id) ON DELETE CASCADE,
  evidence_type             TEXT NOT NULL CHECK (evidence_type IN ('CONTRATO', 'TRANSFERENCIA_POR_ENTREGA', 'OBSERVACION_CONTRACTUAL')),
  evidence_url              TEXT NOT NULL,
  evidence_detail           TEXT NOT NULL,
  observed_at               DATE NOT NULL,
  UNIQUE (lot_id, evidence_url, evidence_type)
);

-- Solo ingresa un colegio cuando la fuente publica un código modular u otra
-- clave oficial durable; el nombre de la IE no es suficiente para deduplicar.
CREATE TABLE IF NOT EXISTS food_schools (
  school_id                 TEXT PRIMARY KEY,
  period_id                 TEXT NOT NULL REFERENCES food_service_periods(period_id) ON DELETE RESTRICT,
  modular_code              TEXT NOT NULL,
  school_name_published     TEXT NOT NULL,
  department                TEXT NOT NULL,
  province                  TEXT,
  district                  TEXT,
  source_batch_id           BIGINT NOT NULL REFERENCES food_evidence_batches(batch_id),
  observed_at               DATE NOT NULL,
  UNIQUE (period_id, modular_code)
);

CREATE TABLE IF NOT EXISTS food_delivery_evidence (
  delivery_id               BIGSERIAL PRIMARY KEY,
  lot_id                    TEXT NOT NULL REFERENCES food_lots(lot_id) ON DELETE RESTRICT,
  school_id                 TEXT NOT NULL REFERENCES food_schools(school_id) ON DELETE RESTRICT,
  delivery_date             DATE NOT NULL,
  delivery_status           TEXT NOT NULL CHECK (delivery_status IN ('ENTREGADO', 'RECIBIDO', 'OBSERVADO', 'NO_CONFORME')),
  evidence_url              TEXT NOT NULL,
  evidence_detail           TEXT NOT NULL,
  source_batch_id           BIGINT NOT NULL REFERENCES food_evidence_batches(batch_id),
  observed_at               DATE NOT NULL,
  UNIQUE (lot_id, school_id, delivery_date, delivery_status, evidence_url)
);

-- El control permanece separado de la entrega: puede ser territorial/agregado
-- y no demostrar que un alimento específico llegó a un colegio concreto.
CREATE TABLE IF NOT EXISTS food_quality_evidence (
  quality_id                BIGSERIAL PRIMARY KEY,
  period_id                 TEXT NOT NULL REFERENCES food_service_periods(period_id) ON DELETE RESTRICT,
  lot_id                    TEXT REFERENCES food_lots(lot_id) ON DELETE RESTRICT,
  school_id                 TEXT REFERENCES food_schools(school_id) ON DELETE RESTRICT,
  control_scope             TEXT NOT NULL CHECK (control_scope IN ('TERRITORIAL_AGREGADO', 'LOTE', 'COLEGIO', 'PROVEEDOR')),
  control_type              TEXT NOT NULL,
  literal_result            TEXT NOT NULL,
  evidence_url              TEXT NOT NULL,
  source_batch_id           BIGINT NOT NULL REFERENCES food_evidence_batches(batch_id),
  observed_at               DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS food_evidence_review_queue (
  queue_id                  BIGSERIAL PRIMARY KEY,
  period_id                 TEXT NOT NULL REFERENCES food_service_periods(period_id) ON DELETE RESTRICT,
  candidate_kind            TEXT NOT NULL CHECK (candidate_kind IN ('LOTE_SIN_RUC', 'LOTE_SIN_COLEGIO', 'ENTREGA_SIN_ACTA', 'FUENTE_NO_AUTOMATIZABLE')),
  lot_id                    TEXT REFERENCES food_lots(lot_id) ON DELETE RESTRICT,
  reason                    TEXT NOT NULL,
  evidence_urls             JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                    TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REVIEWED', 'DISMISSED', 'NEEDS_EVIDENCE')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (period_id, candidate_kind, lot_id)
);

CREATE TABLE IF NOT EXISTS food_evidence_review_events (
  event_id                  BIGSERIAL PRIMARY KEY,
  queue_id                  BIGINT NOT NULL REFERENCES food_evidence_review_queue(queue_id) ON DELETE RESTRICT,
  decision                  TEXT NOT NULL CHECK (decision IN ('REVIEWED', 'DISMISSED', 'NEEDS_EVIDENCE')),
  reviewer_role             TEXT NOT NULL,
  note                      TEXT NOT NULL,
  evidence_urls             JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewed_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_lots_period ON food_lots(period_id);
CREATE INDEX IF NOT EXISTS idx_food_lots_ruc ON food_lots(supplier_ruc) WHERE supplier_ruc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_food_schools_territory ON food_schools(period_id, province, district);
CREATE INDEX IF NOT EXISTS idx_food_delivery_lot ON food_delivery_evidence(lot_id);

-- Fase 0: fuentes públicas que contienen claves comprobables, pero no una API
-- documentada ni un padrón estructurado integral. Quedan manual-asistidas.
INSERT INTO food_evidence_batches (
  source_url,source_label,source_kind,access_mode,automation_status,source_checksum,checksum_status,extracted_at,notes
) VALUES
  ('https://www.gob.pe/institucion/wasimikuna/noticias/1082618-wasi-mikuna-en-la-libertad-se-adjudico-servicio-alimentario-para-mas-de-270-000-escolares',
   'Wasi Mikuna: adjudicación del servicio alimentario La Libertad 2025','CONTEXTO_AGREGADO','PAGINA_PUBLICA','NO_AUTOMATIZAR_HASTA_VALIDAR',NULL,'NO_DESCARGADO_EN_PILOTO',DATE '2026-08-24',
   'Publica cinco comités, 35 ítems evaluados y 27 adjudicados. No publica un export estructurado de lote, RUC, colegio y entrega.'),
  ('https://info.qaliwarma.gob.pe/normatividad/export/?id=TWVLY3B6bXFML2cvcXJKL2FpUzAvUT09',
   'Expediente 000418-2025: Guadalupe, La Libertad 5','DOCUMENTO_PRIMARIO','DOCUMENTO_PUBLICO','MANUAL_ASISTIDA',NULL,'NO_DESCARGADO_EN_PILOTO',DATE '2026-08-24',
   'Documento público indexado que publica comité, ítem, contrato, proveedor literal y número de entrega; no publica RUC de consorcio ni colegio receptor.'),
  ('https://info.qaliwarma.gob.pe/normatividad/export/?id=VC96eHduZFU5ekpEWDBMMVNQTXo0dz09',
   'Expediente 004146-2025: Paiján, La Libertad 5','DOCUMENTO_PRIMARIO','DOCUMENTO_PUBLICO','MANUAL_ASISTIDA',NULL,'NO_DESCARGADO_EN_PILOTO',DATE '2026-08-24',
   'Documento público indexado que publica comité, ítem, contrato, proveedor literal y número de entrega; no publica RUC de consorcio ni colegio receptor.'),
  ('https://info.qaliwarma.gob.pe/normatividad/export/?id=VzZHVFA3OUpGMHlNbnV3NGJXOUFKUT09',
   'Expediente 008012-2025: Casa Grande, La Libertad 5','DOCUMENTO_PRIMARIO','DOCUMENTO_PUBLICO','MANUAL_ASISTIDA',NULL,'NO_DESCARGADO_EN_PILOTO',DATE '2026-08-24',
   'Documento público indexado que publica comité, ítem, contrato, proveedor literal, entrega y una causal de penalidad documental; no publica RUC de consorcio ni colegio receptor.'),
  ('https://www.gob.pe/institucion/wasimikuna/noticias?sheet=15',
   'Wasi Mikuna: supervisión de almacenes de proveedores en La Libertad','CONTEXTO_AGREGADO','PAGINA_PUBLICA','NO_AUTOMATIZAR_HASTA_VALIDAR',NULL,'NO_DESCARGADO_EN_PILOTO',DATE '2026-08-24',
   'Confirma una acción de supervisión territorial agregada; no identifica proveedor, lote, colegio ni resultado individual en la publicación listada.')
ON CONFLICT (source_url) DO NOTHING;

INSERT INTO food_service_periods (
  period_id,service_id,year,territorial_unit,modality,planned_students,planned_schools,published_lots,awarded_lots,materialized_lots,school_denominator_status,coverage_status,source_batch_id,observed_at,limitation
) VALUES (
  'WASI-MIKUNA-LL-2025','ALIM-WASI-MIKUNA-LA-LIBERTAD-2025',2025,'LA LIBERTAD','PRODUCTOS Y RACIONES',276812,3692,35,27,3,'PUBLICADO_AGREGADO_SIN_PADRON','PARCIAL_DECLARADA',
  (SELECT batch_id FROM food_evidence_batches WHERE source_label='Wasi Mikuna: adjudicación del servicio alimentario La Libertad 2025'),DATE '2025-02-04',
  'ALSOL materializa tres lotes de documentos públicos de La Libertad 5. La cobertura no equivale a los 35 ítems ni identifica colegios, entregas o RUC de todos los proveedores.'
) ON CONFLICT (period_id) DO NOTHING;

INSERT INTO food_lots (
  lot_id,period_id,committee_name,item_literal,contract_reference,modality,supplier_name_published,supplier_ruc,supplier_ruc_status,documented_delivery_number,lot_status,source_batch_id,observed_at,limitation
) VALUES
  ('WASI-2025-LL5-GUADALUPE','WASI-MIKUNA-LL-2025','LA LIBERTAD 5','GUADALUPE','0002-2025-CC-LA LIBERTAD 5/PRODUCTOS','PRODUCTOS','CONSORCIO SUYANNA',NULL,'RUC_NO_PUBLICADO_EN_EVIDENCIA',1,'ENTREGA_REFERIDA_EN_DOCUMENTO',
   (SELECT batch_id FROM food_evidence_batches WHERE source_label='Expediente 000418-2025: Guadalupe, La Libertad 5'),DATE '2025-04-16',
   'El expediente refiere entrega 1 y transferencia/contrato; no publica colegio, acta de recepción ni RUC exacto del consorcio.'),
  ('WASI-2025-LL5-PAIJAN','WASI-MIKUNA-LL-2025','LA LIBERTAD 5','PAIJAN','0003-2025-CC-LA LIBERTAD 5/PRODUCTOS','PRODUCTOS','CONSORCIO SUYANNA',NULL,'RUC_NO_PUBLICADO_EN_EVIDENCIA',4,'ENTREGA_REFERIDA_EN_DOCUMENTO',
   (SELECT batch_id FROM food_evidence_batches WHERE source_label='Expediente 004146-2025: Paiján, La Libertad 5'),DATE '2025-08-12',
   'El expediente refiere entrega 4 y transferencia/contrato; no publica colegio, acta de recepción ni RUC exacto del consorcio.'),
  ('WASI-2025-LL5-CASA-GRANDE','WASI-MIKUNA-LL-2025','LA LIBERTAD 5','CASA GRANDE','0005-2025-CC-LA LIBERTAD 5/PRODUCTOS','PRODUCTOS','CONSORCIO SAMI',NULL,'RUC_NO_PUBLICADO_EN_EVIDENCIA',5,'OBSERVACION_CONTRACTUAL_DOCUMENTADA',
   (SELECT batch_id FROM food_evidence_batches WHERE source_label='Expediente 008012-2025: Casa Grande, La Libertad 5'),DATE '2025-10-31',
   'El expediente refiere entrega 5 y una causal de penalidad documental. No permite concluir entrega a colegio, incumplimiento material ni RUC exacto del consorcio.')
ON CONFLICT (lot_id) DO NOTHING;

INSERT INTO food_lot_evidence (lot_id,evidence_type,evidence_url,evidence_detail,observed_at) VALUES
  ('WASI-2025-LL5-GUADALUPE','TRANSFERENCIA_POR_ENTREGA','https://info.qaliwarma.gob.pe/normatividad/export/?id=TWVLY3B6bXFML2cvcXJKL2FpUzAvUT09','Expediente 000418-2025 publica Comité La Libertad 5, ítem Guadalupe, contrato 0002-2025 y referencia a entrega 1.',DATE '2025-04-16'),
  ('WASI-2025-LL5-PAIJAN','TRANSFERENCIA_POR_ENTREGA','https://info.qaliwarma.gob.pe/normatividad/export/?id=VC96eHduZFU5ekpEWDBMMVNQTXo0dz09','Expediente 004146-2025 publica Comité La Libertad 5, ítem Paiján, contrato 0003-2025 y referencia a entrega 4.',DATE '2025-08-12'),
  ('WASI-2025-LL5-CASA-GRANDE','OBSERVACION_CONTRACTUAL','https://info.qaliwarma.gob.pe/normatividad/export/?id=VzZHVFA3OUpGMHlNbnV3NGJXOUFKUT09','Expediente 008012-2025 publica Comité La Libertad 5, ítem Casa Grande, contrato 0005-2025, referencia a entrega 5 y causal documental de penalidad.',DATE '2025-10-31')
ON CONFLICT DO NOTHING;

INSERT INTO food_quality_evidence (period_id,lot_id,school_id,control_scope,control_type,literal_result,evidence_url,source_batch_id,observed_at) VALUES
  ('WASI-MIKUNA-LL-2025',NULL,NULL,'TERRITORIAL_AGREGADO','SUPERVISION_DE_ALMACENES','La publicación oficial lista una supervisión de almacenes de proveedores en La Libertad; no identifica lote, proveedor ni colegio individual en la evidencia materializada.',
   'https://www.gob.pe/institucion/wasimikuna/noticias?sheet=15',(SELECT batch_id FROM food_evidence_batches WHERE source_label='Wasi Mikuna: supervisión de almacenes de proveedores en La Libertad'),DATE '2025-05-31')
ON CONFLICT DO NOTHING;

INSERT INTO food_evidence_review_queue (period_id,candidate_kind,lot_id,reason,evidence_urls) VALUES
  ('WASI-MIKUNA-LL-2025','LOTE_SIN_RUC','WASI-2025-LL5-GUADALUPE','El expediente publica proveedor literal, pero no RUC exacto para vincular condición tributaria o sanciones.','["https://info.qaliwarma.gob.pe/normatividad/export/?id=TWVLY3B6bXFML2cvcXJKL2FpUzAvUT09"]'),
  ('WASI-MIKUNA-LL-2025','LOTE_SIN_RUC','WASI-2025-LL5-PAIJAN','El expediente publica proveedor literal, pero no RUC exacto para vincular condición tributaria o sanciones.','["https://info.qaliwarma.gob.pe/normatividad/export/?id=VC96eHduZFU5ekpEWDBMMVNQTXo0dz09"]'),
  ('WASI-MIKUNA-LL-2025','LOTE_SIN_RUC','WASI-2025-LL5-CASA-GRANDE','El expediente publica proveedor literal, pero no RUC exacto para vincular condición tributaria o sanciones.','["https://info.qaliwarma.gob.pe/normatividad/export/?id=VzZHVFA3OUpGMHlNbnV3NGJXOUFKUT09"]'),
  ('WASI-MIKUNA-LL-2025','LOTE_SIN_COLEGIO',NULL,'La cobertura regional publicada no incluye padrón oficial de colegios/código modular en la evidencia materializada.','["https://www.gob.pe/institucion/wasimikuna/noticias/1102955-wasi-mikuna-refuerza-trabajo-con-directores-y-padres-de-familia-de-nuevas-instituciones-educativas-usuarias-en-la-libertad"]'),
  ('WASI-MIKUNA-LL-2025','FUENTE_NO_AUTOMATIZABLE',NULL,'Los documentos públicos se clasifican manual-asistidos hasta validar una descarga/documentación estable y sus condiciones de uso.','["https://info.qaliwarma.gob.pe/normatividad/export/?id=TWVLY3B6bXFML2cvcXJKL2FpUzAvUT09"]')
ON CONFLICT DO NOTHING;
