-- SGR-02: catálogo explícito de entidades que pueden participar en una ficha
-- sectorial. `entity_code` proviene del MEF; el sector y la regla territorial
-- tienen fuente y revisión propias. No se llena por similitud de nombres.
CREATE TABLE IF NOT EXISTS sector_entity_registry (
  registry_id            BIGSERIAL PRIMARY KEY,
  sector_id              TEXT NOT NULL,
  sector_nombre          TEXT NOT NULL,
  entity_code            TEXT NOT NULL REFERENCES entities(entity_code),
  entity_name_publicado  TEXT NOT NULL,
  entity_kind            TEXT NOT NULL CHECK (entity_kind IN ('MINISTERIO', 'ORGANISMO', 'PROGRAMA', 'GOBIERNO_REGIONAL', 'UNIDAD_EJECUTORA')),
  nivel_gobierno         TEXT NOT NULL CHECK (nivel_gobierno IN ('GOBIERNO NACIONAL', 'GOBIERNOS REGIONALES')),
  scope_rule             TEXT NOT NULL CHECK (scope_rule IN ('META_DEPARTAMENTO', 'SEDE_EJECUTORA')),
  verification_status    TEXT NOT NULL DEFAULT 'VERIFICADO'
    CHECK (verification_status IN ('VERIFICADO', 'CANDIDATO', 'RECHAZADO')),
  evidence_source        TEXT NOT NULL,
  evidence_field         TEXT NOT NULL,
  evidence_url           TEXT,
  valid_from             DATE,
  valid_to               DATE,
  reviewed_at            DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sector_id, entity_code)
);

CREATE INDEX IF NOT EXISTS idx_sector_entity_registry_sector
  ON sector_entity_registry(sector_id, verification_status);
CREATE INDEX IF NOT EXISTS idx_sector_entity_registry_entity
  ON sector_entity_registry(entity_code, verification_status);
