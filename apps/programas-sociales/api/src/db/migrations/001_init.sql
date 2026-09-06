-- Lake de evidencia: nunca se sobreescribe. El nombre de archivo de INFOMIDIS
-- es demasiado inconsistente entre cortes para usarlo como identificador
-- estable, así que la unicidad es por (resource_url, checksum).
CREATE TABLE IF NOT EXISTS raw_infomidis_batches (
  id            BIGSERIAL PRIMARY KEY,
  resource_url  TEXT NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  UNIQUE (resource_url, checksum)
);

-- Cobertura de programas sociales MIDIS, ya agregada por distrito por el
-- propio MIDIS (INFOMIDIS) — nunca un registro individual. Un valor NULL
-- en cualquier columna de programa significa "sin dato ese corte para ese
-- distrito", no cero — un distrito sin dato no es lo mismo que cobertura 0.
CREATE TABLE IF NOT EXISTS cobertura_social (
  ubigeo                            TEXT NOT NULL,
  fecha_corte                       DATE NOT NULL,
  cunamas_cuidado_diurno            NUMERIC,
  cunamas_acompanamiento_familias   NUMERIC,
  juntos_hogares_afiliados          NUMERIC,
  juntos_hogares_abonados           NUMERIC,
  foncodes_usuarios_estimados       NUMERIC,
  qaliwarma_ninos_atendidos         NUMERIC,
  qaliwarma_iiee                    NUMERIC,
  -- Conteo agregado por MIDIS, nunca un listado nominal de usuarios —
  -- ver docs/data-contracts/infomidis-cobertura-social.md.
  pension65_usuarios                NUMERIC,
  contigo_usuarios                  NUMERIC,
  pais_tambos                       NUMERIC,
  pais_atenciones                   NUMERIC,
  pais_beneficiarios                NUMERIC,
  source_batch_id                   BIGINT NOT NULL REFERENCES raw_infomidis_batches(id),
  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ubigeo, fecha_corte)
);

CREATE INDEX IF NOT EXISTS idx_cobertura_social_fecha_corte
  ON cobertura_social (fecha_corte);
