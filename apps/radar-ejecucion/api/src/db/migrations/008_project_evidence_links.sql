-- GOV-08/09: evidencia oficial de proyecto e igualdad explícita (o ausencia)
-- entre proyecto CUI y actividad de gasto. No hay matching por nombre.
CREATE TABLE IF NOT EXISTS project_evidence_links (
  cui TEXT PRIMARY KEY,
  actividad_literal TEXT NOT NULL,
  entidad_responsable TEXT NOT NULL,
  departamento TEXT NOT NULL,
  pia_legal NUMERIC(18,2),
  pim NUMERIC(18,2),
  devengado NUMERIC(18,2),
  estado_pim TEXT NOT NULL DEFAULT 'NO_PUBLICADO_EN_FUENTE_DE_PROYECTO',
  alerta_consistencia_territorial TEXT,
  observed_at DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_evidence_sources (
  id BIGSERIAL PRIMARY KEY,
  cui TEXT NOT NULL REFERENCES project_evidence_links(cui) ON DELETE CASCADE,
  etiqueta TEXT NOT NULL,
  url TEXT NOT NULL,
  detalle TEXT NOT NULL,
  UNIQUE (cui, url)
);

CREATE TABLE IF NOT EXISTS project_evidence_territories (
  id BIGSERIAL PRIMARY KEY,
  cui TEXT NOT NULL REFERENCES project_evidence_links(cui) ON DELETE CASCADE,
  distrito TEXT NOT NULL,
  estado TEXT NOT NULL,
  UNIQUE (cui, distrito)
);

CREATE TABLE IF NOT EXISTS project_budget_links (
  id BIGSERIAL PRIMARY KEY,
  cui TEXT NOT NULL REFERENCES project_evidence_links(cui) ON DELETE CASCADE,
  entity_code TEXT REFERENCES entities(entity_code),
  actividad_mef TEXT NOT NULL,
  link_status TEXT NOT NULL CHECK (link_status IN ('VINCULO_OFICIAL', 'CANDIDATO_NO_USADO', 'NO_VINCULADO')),
  method TEXT NOT NULL CHECK (method IN ('CLAVE_EXACTA', 'FUENTE_OFICIAL', 'REVISION_HUMANA')),
  evidence_url TEXT,
  notes TEXT,
  UNIQUE (cui, entity_code, actividad_mef)
);

INSERT INTO project_evidence_links (
  cui, actividad_literal, entidad_responsable, departamento, pia_legal,
  estado_pim, alerta_consistencia_territorial, observed_at
) VALUES (
  '2539202',
  'CREACION DEL SERVICIO DE DRENAJE PLUVIAL EN EL AMBITO URBANO DE 5 DISTRITOS DE LA PROVINCIA DE TRUJILLO - DEPARTAMENTO DE LA LIBERTAD',
  'AUTORIDAD NACIONAL DE INFRAESTRUCTURA (ANIN)', 'LA LIBERTAD', 11490390,
  'NO_PUBLICADO_EN_FUENTE_DE_PROYECTO',
  'El título y la Ley de Presupuesto se refieren a 5 distritos; una presentación de ANIN ante el Congreso enumera 6. ALSOL conserva ambos datos y no reduce ni amplía la lista por inferencia.',
  DATE '2026-08-24'
) ON CONFLICT (cui) DO NOTHING;

INSERT INTO project_evidence_sources (cui, etiqueta, url, detalle) VALUES
  ('2539202', 'Ley de Presupuesto 2026, Anexo 5', 'https://www.mef.gob.pe/contenidos/presu_publ/anexos/ppto2026/Anexo_5.PDF', 'Identifica el CUI 2539202 y una asignación PIA 2026 de S/ 11,490,390 para el pliego ANIN.'),
  ('2539202', 'Presentación de ANIN ante la Comisión de Fiscalización del Congreso', 'https://www.congreso.gob.pe/Docs/comisiones2024/Fiscalizacion/files/sesiones_extraordinarias/pre-anin2.pdf', 'Identifica el CUI 2539202 y enumera Alto Trujillo, La Esperanza, El Porvenir, Florencia de Mora, Trujillo y Víctor Larco Herrera.')
ON CONFLICT DO NOTHING;

INSERT INTO project_evidence_territories (cui, distrito, estado) VALUES
  ('2539202', 'ALTO TRUJILLO', 'PUBLICADO_POR_ANIN_EN_DOCUMENTO_DEL_CONGRESO'),
  ('2539202', 'LA ESPERANZA', 'PUBLICADO_POR_ANIN_EN_DOCUMENTO_DEL_CONGRESO'),
  ('2539202', 'EL PORVENIR', 'PUBLICADO_POR_ANIN_EN_DOCUMENTO_DEL_CONGRESO'),
  ('2539202', 'FLORENCIA DE MORA', 'PUBLICADO_POR_ANIN_EN_DOCUMENTO_DEL_CONGRESO'),
  ('2539202', 'TRUJILLO', 'PUBLICADO_POR_ANIN_EN_DOCUMENTO_DEL_CONGRESO'),
  ('2539202', 'VICTOR LARCO HERRERA', 'PUBLICADO_POR_ANIN_EN_DOCUMENTO_DEL_CONGRESO')
ON CONFLICT DO NOTHING;
