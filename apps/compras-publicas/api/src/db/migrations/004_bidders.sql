-- Participantes en licitaciones (bidders)
CREATE TABLE IF NOT EXISTS bidders (
  id              BIGSERIAL PRIMARY KEY,
  ocid            TEXT NOT NULL,          -- Enlace al procurement process
  award_id        TEXT,                   -- Si llegó a ganador
  bidder_id       TEXT NOT NULL,          -- PE-RUC-... o similar
  bidder_name     TEXT NOT NULL,
  estado          TEXT NOT NULL
    CHECK (estado IN ('participante', 'ganador', 'descalificado', 'rechazado')),
  ranking         INTEGER,                -- 1=ganador, 2=segundo, etc
  monto_ofertado  NUMERIC(18, 2),        -- Lo que ofertó (si se publicó)
  motivo_rechazo  TEXT,                   -- Si fue descalificado/rechazado
  source_batch_id BIGINT NOT NULL REFERENCES raw_ocds_batches(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (ocid, bidder_id)
);

CREATE INDEX IF NOT EXISTS idx_bidders_ocid ON bidders (ocid);
CREATE INDEX IF NOT EXISTS idx_bidders_bidder_id ON bidders (bidder_id);
CREATE INDEX IF NOT EXISTS idx_bidders_estado ON bidders (estado);
CREATE INDEX IF NOT EXISTS idx_bidders_bidder_name ON bidders (bidder_name);
CREATE INDEX IF NOT EXISTS idx_bidders_source_batch ON bidders (source_batch_id);

-- Tabla de rechazo (mantener historial)
CREATE TABLE IF NOT EXISTS bidders_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_ocds_batches(id),
  raw_bidder_data   JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bidders_rejected_batch ON bidders_rejected (source_batch_id);
