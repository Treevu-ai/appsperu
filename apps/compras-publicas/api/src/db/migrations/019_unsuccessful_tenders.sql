-- Hallazgo 2026-09-06: `normalizeAwards` descarta en silencio cualquier
-- record OCDS sin `awards`, tratando "todavía no llegó a esa etapa" (en
-- trámite) igual que "terminó sin adjudicar" (declarado desierto o nulo).
-- Verificado en vivo contra /api/v1/records: `tender.items[].statusDetails`
-- trae, entre otros, DESIERTO y NULO — estados terminales, no transitorios.
-- Muestra real (60 records, 4 meses de 2026): 41 CONTRATADO, 14 DESIERTO,
-- 5 NULO, más 3 CONVOCADO (en trámite, sí transitorio), 3
-- RETROTRAIDO_POR_RESOLUCION y 1 PENDIENTE_DE_REGISTRO_DE_EFECTO — estos
-- tres últimos no se clasifican como terminal-sin-adjudicar ni se persisten
-- aquí: no hay evidencia suficiente de qué significan operacionalmente, y
-- este proyecto no fuerza una clasificación sin evidencia.
CREATE TABLE IF NOT EXISTS unsuccessful_tenders (
  id                BIGSERIAL PRIMARY KEY,
  ocid              TEXT NOT NULL,
  tender_id         TEXT,
  item_id           TEXT NOT NULL,
  status_details    TEXT NOT NULL CHECK (status_details IN ('DESIERTO', 'NULO')),
  item_description  TEXT,
  buyer_id          TEXT,
  buyer_name        TEXT,
  departamento      TEXT,
  fecha             DATE,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_ocds_batches(id),
  UNIQUE (ocid, item_id)
);

CREATE INDEX IF NOT EXISTS idx_unsuccessful_tenders_departamento
  ON unsuccessful_tenders (departamento) WHERE departamento IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unsuccessful_tenders_status
  ON unsuccessful_tenders (status_details);
