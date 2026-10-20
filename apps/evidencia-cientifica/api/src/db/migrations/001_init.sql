CREATE TABLE IF NOT EXISTS raw_crossref_batches (
  id             BIGSERIAL PRIMARY KEY,
  query_term     TEXT NOT NULL,
  rows_requested INTEGER NOT NULL,
  cursor_used    TEXT,
  checksum       TEXT NOT NULL,
  payload        JSONB NOT NULL,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crossref_works (
  id              BIGSERIAL PRIMARY KEY,
  doi             TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  publisher       TEXT,
  subjects        TEXT[] NOT NULL DEFAULT '{}',
  published_year  INTEGER,
  url             TEXT,
  score           NUMERIC(10, 4),
  query_term      TEXT NOT NULL,
  source_batch_id BIGINT NOT NULL REFERENCES raw_crossref_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_crossref_works_lookup
  ON crossref_works (query_term, published_year);
