-- IF-12: primeros indicadores de servicio/cobertura para los dos activos de
-- La Libertad. `asset_service_indicators` estaba vacía desde su creación
-- (014). Solo se cargan cifras con fuente citable, con el nivel de certeza
-- que cada fuente permite — no se homogeniza el mismo grado de confianza
-- para las dos.

-- IE Casa Grande: cifra del mismo comunicado de ANIN ya citado como fuente
-- del activo (source_batch_id existente, sin ambigüedad de entidad ni de
-- vigencia — es la nota de la propia inauguración, 2026).
INSERT INTO asset_service_indicators (
  asset_id, indicator_scope, indicator_name, indicator_unit, period_label,
  value_numeric, coverage_literal, source_url, source_detail, source_batch_id, observed_at
) VALUES (
  'ACTIVO-EDU-CASA-GRANDE-2026', 'ACTIVO', 'Estudiantes beneficiados (capacidad declarada por la fuente)', 'estudiantes', '2026 (apertura)',
  900,
  'ANIN declara "más de 900 estudiantes" al inaugurar la institución. No es un padrón de matrícula verificado — es la cifra de beneficiarios declarada por la fuente en el mismo comunicado de apertura.',
  'https://www.gob.pe/institucion/anin/noticias/1373519-anin-fortalece-la-infraestructura-educativa-con-nueva-institucion-en-la-libertad',
  'ANIN (2026): comunicado de entrega/inauguración de la institución educativa en Casa Grande, seis pabellones y 26 aulas.',
  (SELECT batch_id FROM infrastructure_evidence_batches WHERE source_url='https://www.gob.pe/institucion/anin/noticias/1373519-anin-fortalece-la-infraestructura-educativa-con-nueva-institucion-en-la-libertad'),
  DATE '2026-09-06'
);

-- Drenaje Trujillo: cifra de un anuncio de 2023 (ARCC, antecesora de ANIN en
-- este proyecto) sobre la firma del contrato de DISEÑO — no una medición de
-- cobertura post-ejecución. Se conserva con caveat explícito: mismos 5
-- distritos y mismo consultor (Lombardi) que la Ley de Presupuesto 2026, pero
-- sin confirmación posterior de que la cifra siga vigente tras el cambio de
-- entidad ejecutora y con la obra aún en 0% de avance físico (ver migración
-- 019).
INSERT INTO infrastructure_evidence_batches (
  source_url, source_label, source_kind, access_mode, automation_status, checksum, checksum_status, extracted_at, notes
) VALUES (
  'https://andina.pe/agencia/noticia-mas-250000-ciudadanos-se-beneficiaran-con-drenaje-pluvial-trujillo-925100.aspx',
  'Andina (2023-01-12): ARCC firma contrato de diseño del drenaje de Trujillo, estima 250,000 beneficiados', 'CONTEXTO_AGREGADO', 'DOCUMENTO_PUBLICO', 'NO_AUTOMATIZAR_HASTA_VALIDAR', NULL, 'NO_DESCARGADO_EN_PILOTO', DATE '2026-09-06',
  'Nota de 2023 sobre la firma del contrato de diseño (S/35M, consultor Lombardi, mismos 5 distritos que la Ley de Presupuesto 2026): "Más de 250,000 ciudadanos se beneficiarán con el drenaje pluvial de Trujillo". Predata la asignación PIA 2026 (CUI 2539202) y el cambio de entidad ejecutora de ARCC a ANIN; no confirma que la cifra siga vigente.'
) ON CONFLICT (source_url) DO NOTHING;

INSERT INTO asset_service_indicators (
  asset_id, indicator_scope, indicator_name, indicator_unit, period_label,
  value_numeric, coverage_literal, source_url, source_detail, source_batch_id, observed_at
) VALUES (
  'ACTIVO-DRENAJE-2539202', 'ACTIVO', 'Población beneficiada (declarada en el anuncio de diseño, 2023)', 'habitantes', '2023 (anuncio de contrato de diseño)',
  250000,
  'ARCC (antecesora de ANIN en este proyecto) declaró "más de 250,000 ciudadanos" al firmar el contrato de diseño en 2023, para los mismos 5 distritos que la Ley de Presupuesto 2026 (Anexo 5) y el mismo consultor (Lombardi). Sin confirmación posterior (2026) de que la cifra se mantenga tras el cambio de entidad ejecutora ni mientras la obra física siga en 0% de avance (migración 019).',
  'https://andina.pe/agencia/noticia-mas-250000-ciudadanos-se-beneficiaran-con-drenaje-pluvial-trujillo-925100.aspx',
  'Andina (2023-01-12): "Más de 250,000 ciudadanos se beneficiarán con el drenaje pluvial de Trujillo" — El Porvenir, Florencio de Mora, La Esperanza, Víctor Larco Herrera y la ciudad de Trujillo.',
  (SELECT batch_id FROM infrastructure_evidence_batches WHERE source_url='https://andina.pe/agencia/noticia-mas-250000-ciudadanos-se-beneficiaran-con-drenaje-pluvial-trujillo-925100.aspx'),
  DATE '2026-09-06'
);
