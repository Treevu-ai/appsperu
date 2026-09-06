-- Fase 0 (2026-09-06): Padrón de Instituciones y Programas Educativos (ESCALE/MINEDU),
-- confirmado en vivo. Ver docs/data-contracts/minedu-padron-iiee.md.
--
-- Fuente: descarga directa de un ZIP con un DBF de 180,828 filas (censal nacional completo,
-- sin muestreo), corte más reciente confirmado 2026-08-28. Encoding real cp850 (no UTF-8 ni
-- Latin-1) — único conector del catálogo que necesita este encoding y este formato (DBF).
--
-- EXCLUSIÓN DE PII DELIBERADA: la fuente real trae 4 columnas de dato personal/ambiguo que
-- este esquema NUNCA lee ni persiste — `DIRECTOR` (nombre completo del director/a de la IE),
-- `TELEFONO`/`EMAIL` (ambiguos entre contacto institucional y personal en esta fuente) y
-- `PROMOTOR` (para instituciones privadas pequeñas puede ser el nombre de una persona natural,
-- no siempre una razón social). Mismo patrón que `informes-control` (excluye campos de persona
-- natural del objeto crudo, no solo de la respuesta de la API) y que `renamu` (excluye datos de
-- contacto del alcalde). `NRORUC`/`RZSOCIAL` sí se ingieren — identidad de entidad operadora,
-- mismo tratamiento que proveedores en `compras-publicas`/`identidad-fiscal`.

CREATE TABLE IF NOT EXISTS raw_padron_batches (
  id            BIGSERIAL PRIMARY KEY,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS instituciones_educativas (
  id                    BIGSERIAL PRIMARY KEY,
  cod_mod               TEXT NOT NULL,
  anexo                 TEXT NOT NULL,
  cod_local             TEXT,
  cod_inst              TEXT,
  nombre                TEXT NOT NULL,
  nivel_modalidad       TEXT,
  forma                 TEXT,
  tipo_sexo             TEXT,
  gestion               TEXT,
  gestion_dependencia   TEXT,
  direccion             TEXT,
  localidad             TEXT,
  cod_ccpp              TEXT,
  centro_poblado        TEXT,
  area_censo            TEXT,
  ubigeo                TEXT CHECK (ubigeo IS NULL OR ubigeo ~ '^\d{6}$'),
  departamento          TEXT NOT NULL,
  provincia             TEXT NOT NULL,
  distrito              TEXT NOT NULL,
  dre                   TEXT,
  cod_ugel              TEXT,
  ugel                  TEXT,
  latitud               DOUBLE PRECISION,
  longitud              DOUBLE PRECISION,
  tipo_programa         TEXT,
  turno                 TEXT,
  ruc                   TEXT,
  razon_social          TEXT,
  estado                TEXT,
  fecha_actualizacion   DATE,
  source_batch_id       BIGINT NOT NULL REFERENCES raw_padron_batches(id),
  UNIQUE (cod_mod, anexo)
);

CREATE TABLE IF NOT EXISTS instituciones_educativas_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_padron_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instituciones_educativas_ubigeo ON instituciones_educativas (ubigeo);
CREATE INDEX IF NOT EXISTS idx_instituciones_educativas_dpto_prov_dist
  ON instituciones_educativas (departamento, provincia, distrito);
CREATE INDEX IF NOT EXISTS idx_instituciones_educativas_estado ON instituciones_educativas (estado);
