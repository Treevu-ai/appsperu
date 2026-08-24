-- ALSOL-SC-01: registro de evidencia para servicios que cuidan.
-- No se crea una relación por nombres, vecindad o similitud. Cada fila declara
-- qué identificador oficial existe y qué parte de la cadena sigue sin evidencia.
CREATE TABLE IF NOT EXISTS care_service_records (
  service_id                 TEXT PRIMARY KEY,
  service_type               TEXT NOT NULL CHECK (service_type IN ('INFRAESTRUCTURA', 'ALIMENTACION')),
  service_name               TEXT NOT NULL,
  responsible_entity         TEXT NOT NULL,
  period_label               TEXT NOT NULL,
  department                 TEXT NOT NULL,
  cui                        TEXT,
  cui_status                 TEXT NOT NULL CHECK (cui_status IN ('CUI_PUBLICADO', 'CUI_NO_PUBLICADO_EN_FUENTE')),
  work_code                  TEXT,
  work_status                TEXT NOT NULL CHECK (work_status IN ('CODIGO_INFOBRAS_PUBLICADO', 'SIN_CODIGO_INFOBRAS_PUBLICADO', 'NO_APLICA')),
  beneficiary_students       INTEGER,
  beneficiary_schools        INTEGER,
  purchase_committees        INTEGER,
  published_lots             INTEGER,
  awarded_lots               INTEGER,
  delivery_evidence_status   TEXT NOT NULL CHECK (delivery_evidence_status IN ('EVIDENCIA_ENTREGA_PUBLICADA', 'SIN_EVIDENCIA_DE_ENTREGA_INGRESADA', 'NO_APLICA')),
  verification_status        TEXT NOT NULL DEFAULT 'EVIDENCIA_OFICIAL'
    CHECK (verification_status IN ('EVIDENCIA_OFICIAL', 'CANDIDATO_NO_USADO', 'REQUIERE_EVIDENCIA')),
  observed_at                DATE NOT NULL,
  limitation                 TEXT NOT NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (beneficiary_students IS NULL OR beneficiary_students >= 0),
  CHECK (beneficiary_schools IS NULL OR beneficiary_schools >= 0),
  CHECK (purchase_committees IS NULL OR purchase_committees >= 0),
  CHECK (published_lots IS NULL OR published_lots >= 0),
  CHECK (awarded_lots IS NULL OR awarded_lots >= 0),
  CHECK (awarded_lots IS NULL OR published_lots IS NULL OR awarded_lots <= published_lots)
);

CREATE TABLE IF NOT EXISTS care_service_sources (
  source_id                  BIGSERIAL PRIMARY KEY,
  service_id                 TEXT NOT NULL REFERENCES care_service_records(service_id) ON DELETE CASCADE,
  label                      TEXT NOT NULL,
  url                        TEXT NOT NULL,
  detail                     TEXT NOT NULL,
  UNIQUE (service_id, url)
);

CREATE TABLE IF NOT EXISTS care_service_territories (
  territory_id               BIGSERIAL PRIMARY KEY,
  service_id                 TEXT NOT NULL REFERENCES care_service_records(service_id) ON DELETE CASCADE,
  department                 TEXT NOT NULL,
  province                   TEXT,
  district                   TEXT,
  territory_status           TEXT NOT NULL,
  UNIQUE NULLS NOT DISTINCT (service_id, department, province, district)
);

-- RUC solo se registra cuando una fuente oficial vincula explícitamente al
-- proveedor con el lote/servicio. Un domicilio fiscal nunca se vuelve territorio
-- beneficiado y una ausencia de proveedor no se rellena con inferencias.
CREATE TABLE IF NOT EXISTS care_service_supplier_links (
  supplier_link_id           BIGSERIAL PRIMARY KEY,
  service_id                 TEXT NOT NULL REFERENCES care_service_records(service_id) ON DELETE CASCADE,
  ruc                        TEXT NOT NULL CHECK (ruc ~ '^[0-9]{11}$'),
  supplier_name              TEXT NOT NULL,
  lot_id                     TEXT,
  product_or_service         TEXT NOT NULL,
  contract_reference         TEXT,
  link_status                TEXT NOT NULL DEFAULT 'VINCULO_OFICIAL'
    CHECK (link_status IN ('VINCULO_OFICIAL', 'CANDIDATO_NO_USADO', 'REQUIERE_EVIDENCIA')),
  evidence_url               TEXT NOT NULL,
  evidence_detail            TEXT NOT NULL,
  observed_at                DATE NOT NULL,
  UNIQUE NULLS NOT DISTINCT (service_id, ruc, lot_id, contract_reference)
);

CREATE TABLE IF NOT EXISTS care_service_delivery_evidence (
  delivery_id                BIGSERIAL PRIMARY KEY,
  service_id                 TEXT NOT NULL REFERENCES care_service_records(service_id) ON DELETE CASCADE,
  supplier_link_id           BIGINT REFERENCES care_service_supplier_links(supplier_link_id) ON DELETE SET NULL,
  school_code                TEXT,
  school_name                TEXT,
  department                 TEXT NOT NULL,
  province                   TEXT,
  district                   TEXT,
  delivery_date              DATE,
  delivery_status            TEXT NOT NULL CHECK (delivery_status IN ('ENTREGADO', 'RECIBIDO', 'OBSERVADO', 'NO_CONFORME')),
  evidence_url               TEXT NOT NULL,
  evidence_detail            TEXT NOT NULL,
  observed_at                DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_care_service_records_type_department
  ON care_service_records(service_type, department);
CREATE INDEX IF NOT EXISTS idx_care_service_supplier_links_ruc
  ON care_service_supplier_links(ruc);
CREATE INDEX IF NOT EXISTS idx_care_service_deliveries_service
  ON care_service_delivery_evidence(service_id);

-- Semillas exclusivamente con hechos identificables en fuentes oficiales.
INSERT INTO care_service_records (
  service_id, service_type, service_name, responsible_entity, period_label,
  department, cui, cui_status, work_code, work_status,
  beneficiary_students, beneficiary_schools, purchase_committees, published_lots, awarded_lots,
  delivery_evidence_status, verification_status, observed_at, limitation
) VALUES
  (
    'INFRA-DRENAJE-2539202', 'INFRAESTRUCTURA',
    'Creación del servicio de drenaje pluvial en el ámbito urbano de Trujillo',
    'AUTORIDAD NACIONAL DE INFRAESTRUCTURA (ANIN)', '2026',
    'LA LIBERTAD', '2539202', 'CUI_PUBLICADO', NULL, 'SIN_CODIGO_INFOBRAS_PUBLICADO',
    NULL, NULL, NULL, NULL, NULL,
    'NO_APLICA', 'EVIDENCIA_OFICIAL', DATE '2026-08-24',
    'El CUI y los distritos se conservan desde documentos oficiales. No existe en este registro un código INFOBRAS publicado ni se infiere una obra por similitud de título.'
  ),
  (
    'INFRA-EDU-CASA-GRANDE-2026', 'INFRAESTRUCTURA',
    'Nueva institución educativa en Casa Grande',
    'AUTORIDAD NACIONAL DE INFRAESTRUCTURA (ANIN)', '2026',
    'LA LIBERTAD', NULL, 'CUI_NO_PUBLICADO_EN_FUENTE', NULL, 'SIN_CODIGO_INFOBRAS_PUBLICADO',
    900, NULL, NULL, NULL, NULL,
    'NO_APLICA', 'EVIDENCIA_OFICIAL', DATE '2026-03-31',
    'La nota oficial publica inversión superior a S/85 millones, población beneficiaria y condiciones de drenaje, agua y saneamiento; no publica CUI ni código INFOBRAS para usar como llave.'
  ),
  (
    'ALIM-WASI-MIKUNA-LA-LIBERTAD-2025', 'ALIMENTACION',
    'Servicio alimentario escolar de La Libertad',
    'PROGRAMA NACIONAL DE ALIMENTACION ESCOLAR COMUNITARIA WASI MIKUNA', 'Año escolar 2025',
    'LA LIBERTAD', NULL, 'CUI_NO_PUBLICADO_EN_FUENTE', NULL, 'NO_APLICA',
    276812, 3692, 5, 35, 27,
    'SIN_EVIDENCIA_DE_ENTREGA_INGRESADA', 'EVIDENCIA_OFICIAL', DATE '2025-02-04',
    'Las fuentes oficiales publican cobertura planificada y resultado agregado de adjudicación. ALSOL aún no tiene lotes, RUC de proveedores ni actas de entrega vinculados oficialmente; no los deduce de compras generales.'
  )
ON CONFLICT (service_id) DO NOTHING;

INSERT INTO care_service_sources (service_id, label, url, detail) VALUES
  ('INFRA-DRENAJE-2539202', 'Ley de Presupuesto 2026, Anexo 5', 'https://www.mef.gob.pe/contenidos/presu_publ/anexos/ppto2026/Anexo_5.PDF', 'Identifica el CUI 2539202 y una asignación de S/ 11,490,390 para ANIN.'),
  ('INFRA-DRENAJE-2539202', 'Presentación de ANIN ante la Comisión de Fiscalización del Congreso', 'https://www.congreso.gob.pe/Docs/comisiones2024/Fiscalizacion/files/sesiones_extraordinarias/pre-anin2.pdf', 'Identifica el CUI 2539202 y publica distritos de alcance.'),
  ('INFRA-EDU-CASA-GRANDE-2026', 'ANIN: infraestructura educativa en La Libertad', 'https://www.gob.pe/institucion/anin/noticias/1373519-anin-fortalece-la-infraestructura-educativa-con-nueva-institucion-en-la-libertad', 'Publica inversión superior a S/85 millones, más de 900 estudiantes y condiciones de drenaje, agua y saneamiento.'),
  ('ALIM-WASI-MIKUNA-LA-LIBERTAD-2025', 'Wasi Mikuna: nuevas instituciones usuarias en La Libertad', 'https://www.gob.pe/institucion/wasimikuna/noticias/1102955-wasi-mikuna-refuerza-trabajo-con-directores-y-padres-de-familia-de-nuevas-instituciones-educativas-usuarias-en-la-libertad', 'Publica atención planificada para 276,812 estudiantes en 3,692 instituciones educativas de La Libertad.'),
  ('ALIM-WASI-MIKUNA-LA-LIBERTAD-2025', 'Wasi Mikuna: adjudicación del servicio alimentario', 'https://www.gob.pe/institucion/wasimikuna/noticias/1082618-wasi-mikuna-en-la-libertad-se-adjudico-servicio-alimentario-para-mas-de-270-000-escolares', 'Publica cinco Comités de Compra, 35 ítems evaluados y 27 adjudicados en el proceso 2025.')
ON CONFLICT DO NOTHING;

INSERT INTO care_service_territories (service_id, department, province, district, territory_status) VALUES
  ('INFRA-DRENAJE-2539202', 'LA LIBERTAD', 'TRUJILLO', 'ALTO TRUJILLO', 'PUBLICADO_POR_ANIN_EN_DOCUMENTO_DEL_CONGRESO'),
  ('INFRA-DRENAJE-2539202', 'LA LIBERTAD', 'TRUJILLO', 'LA ESPERANZA', 'PUBLICADO_POR_ANIN_EN_DOCUMENTO_DEL_CONGRESO'),
  ('INFRA-DRENAJE-2539202', 'LA LIBERTAD', 'TRUJILLO', 'EL PORVENIR', 'PUBLICADO_POR_ANIN_EN_DOCUMENTO_DEL_CONGRESO'),
  ('INFRA-DRENAJE-2539202', 'LA LIBERTAD', 'TRUJILLO', 'FLORENCIA DE MORA', 'PUBLICADO_POR_ANIN_EN_DOCUMENTO_DEL_CONGRESO'),
  ('INFRA-DRENAJE-2539202', 'LA LIBERTAD', 'TRUJILLO', 'TRUJILLO', 'PUBLICADO_POR_ANIN_EN_DOCUMENTO_DEL_CONGRESO'),
  ('INFRA-DRENAJE-2539202', 'LA LIBERTAD', 'TRUJILLO', 'VICTOR LARCO HERRERA', 'PUBLICADO_POR_ANIN_EN_DOCUMENTO_DEL_CONGRESO'),
  ('INFRA-EDU-CASA-GRANDE-2026', 'LA LIBERTAD', 'ASCOPE', 'CASA GRANDE', 'PUBLICADO_POR_ANIN_EN_NOTA_OFICIAL'),
  ('ALIM-WASI-MIKUNA-LA-LIBERTAD-2025', 'LA LIBERTAD', NULL, NULL, 'COBERTURA_REGIONAL_PUBLICADA')
ON CONFLICT DO NOTHING;
