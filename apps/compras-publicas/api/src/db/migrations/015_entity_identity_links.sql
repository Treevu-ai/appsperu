-- GOV-05: identidad institucional auditable. No convierte un match de nombre
-- en una identidad legal: cada enlace conserva su evidencia y fuerza.
CREATE TABLE IF NOT EXISTS entity_identity_links (
  identity_link_id BIGSERIAL PRIMARY KEY,
  subject_type TEXT NOT NULL DEFAULT 'ENTIDAD_PUBLICA',
  subject_id TEXT NOT NULL,
  source_identifier_type TEXT NOT NULL CHECK (source_identifier_type IN ('MUNICIPALITY_ID', 'OECE_CODE', 'OECE_BUYER_ID', 'MEF_ENTITY_CODE', 'RUC', 'UBIGEO')),
  source_identifier_value TEXT NOT NULL,
  target_identifier_type TEXT NOT NULL CHECK (target_identifier_type IN ('OECE_CODE', 'OECE_BUYER_ID', 'MEF_ENTITY_CODE', 'RUC', 'UBIGEO')),
  target_identifier_value TEXT NOT NULL,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('MISMA_ENTIDAD', 'UNIDAD_EJECUTORA_DE', 'ENTIDAD_CONTRATANTE_DE')),
  method TEXT NOT NULL CHECK (method IN ('CLAVE_EXACTA', 'FUENTE_OFICIAL', 'REVISION_HUMANA', 'CANDIDATA_NOMBRE')),
  strength TEXT NOT NULL CHECK (strength IN ('EXACTA', 'VERIFICADA', 'CANDIDATA', 'RECHAZADA')),
  evidence_source TEXT NOT NULL,
  evidence_url TEXT,
  evidence_field TEXT,
  source_batch_id BIGINT REFERENCES raw_ocds_batches(id),
  valid_from DATE,
  valid_until DATE,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject_id, source_identifier_type, source_identifier_value, target_identifier_type, target_identifier_value, relation_type, evidence_source)
);

CREATE INDEX IF NOT EXISTS idx_entity_identity_links_subject ON entity_identity_links(subject_id);
CREATE INDEX IF NOT EXISTS idx_entity_identity_links_target ON entity_identity_links(target_identifier_type, target_identifier_value);
