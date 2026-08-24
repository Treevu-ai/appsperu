-- GOV-13: una señal algorítmica se revisa mediante eventos trazables; no se
-- reemplaza ni se sobreescribe la evidencia de la corrida que la generó.
CREATE TABLE IF NOT EXISTS signal_review_events (
  review_event_id BIGSERIAL PRIMARY KEY,
  signal_id TEXT NOT NULL REFERENCES contract_signals(signal_id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('REVIEWED', 'DISMISSED')),
  reviewer_role TEXT NOT NULL,
  note TEXT NOT NULL,
  evidence_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_review_events_signal
  ON signal_review_events(signal_id, reviewed_at DESC);
