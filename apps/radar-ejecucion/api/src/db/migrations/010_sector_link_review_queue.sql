-- SGR-10: candidatos de cruce conservados para revisión humana. No son
-- relaciones oficiales y no alimentan agregados de fichas sectoriales.
CREATE TABLE IF NOT EXISTS sector_link_review_queue (
  queue_id              BIGSERIAL PRIMARY KEY,
  candidate_type        TEXT NOT NULL CHECK (candidate_type IN ('CUI_ACTIVIDAD', 'ENTIDAD_COMPRA')),
  entity_code           TEXT REFERENCES entities(entity_code),
  cui                   TEXT REFERENCES project_evidence_links(cui),
  contracting_id        TEXT,
  reason                TEXT NOT NULL,
  evidence_urls         JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REVIEWED', 'DISMISSED', 'NEEDS_EVIDENCE')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((candidate_type='CUI_ACTIVIDAD' AND entity_code IS NOT NULL AND cui IS NOT NULL)
      OR (candidate_type='ENTIDAD_COMPRA' AND entity_code IS NOT NULL AND contracting_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sector_link_review_candidate
  ON sector_link_review_queue(candidate_type, entity_code, COALESCE(cui, ''), COALESCE(contracting_id, ''));

CREATE TABLE IF NOT EXISTS sector_link_review_events (
  review_event_id       BIGSERIAL PRIMARY KEY,
  queue_id              BIGINT NOT NULL REFERENCES sector_link_review_queue(queue_id) ON DELETE RESTRICT,
  decision              TEXT NOT NULL CHECK (decision IN ('REVIEWED', 'DISMISSED', 'NEEDS_EVIDENCE')),
  reviewer_role         TEXT NOT NULL,
  note                  TEXT NOT NULL,
  evidence_urls         JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewed_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sector_link_review_queue_status
  ON sector_link_review_queue(status, candidate_type, created_at DESC);
