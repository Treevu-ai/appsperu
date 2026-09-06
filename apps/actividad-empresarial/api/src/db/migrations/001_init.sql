-- Lake de evidencia: nunca se sobreescribe.
CREATE TABLE IF NOT EXISTS raw_mtpe_batches (
  id            BIGSERIAL PRIMARY KEY,
  resource_url  TEXT NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  UNIQUE (resource_url, checksum)
);

-- Una fila por (ubigeo, anio, mes) — el CSV de origen trae una fila por
-- distrito con 12 columnas de mes; se normaliza a formato largo, mismo
-- patrón que `actividad-agraria/agricultural_wage`. `anio` se fija desde el
-- recurso resuelto (título del dataset), nunca desde la columna FECHA_CORTE
-- del CSV — esa columna es la fecha de publicación del corte, no el año de
-- los datos (confirmado en vivo: FECHA_CORTE=20230807 para datos de 2022).
CREATE TABLE IF NOT EXISTS empresas_privadas_distrito (
  ubigeo            TEXT NOT NULL,
  anio              INTEGER NOT NULL,
  mes               SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  distrito          TEXT,
  numero_empresas   INTEGER,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_mtpe_batches(id),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ubigeo, anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_empresas_privadas_distrito_anio_mes
  ON empresas_privadas_distrito (anio, mes);
