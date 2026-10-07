CREATE TABLE IF NOT EXISTS raw_minam_batches (
  id            BIGSERIAL PRIMARY KEY,
  dataset       TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alertas tempranas de deforestación (MINAM/GeoServidor, capa
-- Tem_AlertasTempranasDeforestacion) — geometría de punto (lat/lon), no
-- polígono. No tiene superficie deforestada propia; el "riesgo" se calcula
-- contando alertas dentro del polígono de un título forestal (ver
-- riesgo-eudr.service.ts), no sumando hectáreas que esta fuente no reporta.
CREATE TABLE IF NOT EXISTS minam_alertas_deforestacion (
  id              BIGSERIAL PRIMARY KEY,
  object_id       INTEGER NOT NULL UNIQUE,
  tipo            TEXT,
  sist_ref        SMALLINT,
  fecha_alerta    DATE,
  d_legal         TEXT,
  longitud        DOUBLE PRECISION NOT NULL,
  latitud         DOUBLE PRECISION NOT NULL,
  source_batch_id BIGINT NOT NULL REFERENCES raw_minam_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_minam_alertas_lat ON minam_alertas_deforestacion (latitud);
CREATE INDEX IF NOT EXISTS idx_minam_alertas_lon ON minam_alertas_deforestacion (longitud);
CREATE INDEX IF NOT EXISTS idx_minam_alertas_fecha ON minam_alertas_deforestacion (fecha_alerta);
