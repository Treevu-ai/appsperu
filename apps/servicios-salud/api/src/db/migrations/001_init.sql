-- Lake de evidencia: nunca se sobreescribe, cada ingesta agrega un lote nuevo.
-- El recurso de RENIPRESS cambia de nombre cada corte (RENIPRESS_{dd-mm-aaaa}.csv),
-- así que la unicidad es por (resource_url, checksum), no por un identificador fijo.
CREATE TABLE IF NOT EXISTS raw_renipress_batches (
  id            BIGSERIAL PRIMARY KEY,
  resource_url  TEXT NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  UNIQUE (resource_url, checksum)
);

-- Un establecimiento de salud (IPRESS) por fila. `estado` guarda el valor real
-- del CSV de SUSALUD tal cual viene (no se normaliza a un booleano hasta ver
-- todos los valores distintos que trae la fuente completa).
CREATE TABLE IF NOT EXISTS ipress (
  cod_ipress            TEXT PRIMARY KEY,
  institucion           TEXT,
  nombre                TEXT NOT NULL,
  clasificacion         TEXT,
  tipo_establecimiento  TEXT,
  departamento          TEXT,
  provincia             TEXT,
  distrito              TEXT,
  ubigeo                TEXT,
  direccion             TEXT,
  categoria             TEXT,
  estado                TEXT,
  -- Pese al nombre (NORTE/ESTE), la fuente confirma que son coordenadas
  -- decimales (lat/long), no UTM.
  norte                 NUMERIC,
  este                  NUMERIC,
  source_batch_id       BIGINT NOT NULL REFERENCES raw_renipress_batches(id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ipress_ubigeo
  ON ipress (ubigeo) WHERE ubigeo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ipress_estado
  ON ipress (estado) WHERE estado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ipress_departamento
  ON ipress (departamento) WHERE departamento IS NOT NULL;
