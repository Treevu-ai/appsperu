-- Sanciones emitidas por OSINFOR a títulos habilitantes forestales
-- (concesiones, permisos, autorizaciones). Fuente: datosabiertos.gob.pe,
-- CSV único actualizado anualmente, cobertura 2004-2026.
-- https://www.datosabiertos.gob.pe/dataset/sanciones-emitidas-por-osinfor-t%C3%ADtulos-habilitantes-organismo-de-supervisi%C3%B3n-de-los-recursos
--
-- TITULO (ej. "25-PUC/C-J-071-02") es el mismo identificador que cont_id en
-- forest_concessions (apps/perdida-bosque) -- permite distinguir tala
-- autorizada de sobre-extracción sancionada en el cruce concesiones x
-- deforestación.

CREATE TABLE IF NOT EXISTS raw_osinfor_batches (
  id            BIGSERIAL PRIMARY KEY,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL DEFAULT 0,
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sanciones_osinfor (
  id                  BIGSERIAL PRIMARY KEY,
  fecha_corte         DATE,
  anio_superv         INTEGER,
  titular             TEXT NOT NULL,
  titulo              TEXT,
  modalidad           TEXT,
  ubigeo              TEXT,
  departamento        TEXT,
  provincia           TEXT,
  distrito             TEXT,
  rd_termino          TEXT,
  infracciones        TEXT,
  num_resodirec_rr    TEXT,
  num_resodirec_tffs  TEXT,
  caducidad           BOOLEAN,
  sancion             TEXT,
  monto_multa_uit     NUMERIC,
  area_otorgada_ha    NUMERIC,
  source_batch_id     BIGINT NOT NULL REFERENCES raw_osinfor_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_sanciones_osinfor_titulo ON sanciones_osinfor (titulo);
CREATE INDEX IF NOT EXISTS idx_sanciones_osinfor_titular ON sanciones_osinfor (titular);
CREATE INDEX IF NOT EXISTS idx_sanciones_osinfor_departamento ON sanciones_osinfor (departamento);
CREATE INDEX IF NOT EXISTS idx_sanciones_osinfor_sancion ON sanciones_osinfor (sancion);
