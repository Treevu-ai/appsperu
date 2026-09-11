-- Candidatos ERM 2026 (Elecciones Regionales y Municipales, octubre 2026).
--
-- FUENTE Y DECISIÓN (2026-09-10): no existe un dataset abierto oficial
-- (CKAN/PNDA) de candidatos para este proceso electoral. Las plataformas
-- interactivas del propio JNE (`votoinformado.jne.gob.pe`,
-- `plataformaelectoral.jne.gob.pe`) están protegidas contra automatización
-- (Cloudflare Turnstile / Incapsula respectivamente) — verificado en vivo,
-- no se intenta evadir esa protección bajo ninguna circunstancia. Se usa,
-- en su lugar, un JSON estático republicado por un tercero (Datapol,
-- `datapol.lat/articulos/erm-2026-candidatos/buscador/data/candidatos.json`),
-- derivado de las mismas hojas de vida que el JNE hace públicas. Riesgo
-- aceptado explícitamente: si Datapol deja de publicar ese archivo o cambia
-- su estructura sin aviso, la ingesta falla de forma visible (ver
-- `candidatos-connector.ts`), no de forma silenciosa. Ver `docs/conectores.md`
-- para el detalle de esta decisión y su fecha de verificación.
--
-- DNI SIN ENMASCARAR A NIVEL DE INGESTA — decisión distinta, y por una razón
-- distinta, a la ya tomada en `autoridades-electas/001_init.sql` (que excluyó
-- el recurso histórico con DNI del JNE por riesgo de PII de un dataset masivo
-- no pensado para consulta pública fila por fila). Aquí el DNI SÍ se
-- almacena tal cual porque es exactamente el mismo dato que el candidato
-- declaró bajo juramento y que el JNE publica hoy, sin enmascarar, en la
-- ficha pública de cada candidato (verificado en vivo el 2026-09-10 contra
-- `votoinformado.jne.gob.pe/candidatos/hoja-vida/...` para varios casos reales
-- de La Libertad y Lima) — es la declaración jurada de hoja de vida, un acto
-- de transparencia electoral obligatorio, no un padrón administrativo interno.
-- Cualquier endpoint que EXPONGA este DNI hacia afuera de esta app (ver
-- OE-03, el cruce candidato↔sanción) debe seguir enmascarándolo igual que ya
-- hace `proveedores-sancionados/personas-sancionadas.ts` — la decisión de no
-- enmascarar es solo para el almacenamiento interno, no para toda respuesta
-- pública de la plataforma.

CREATE TABLE IF NOT EXISTS raw_candidatos_erm_batches (
  id            BIGSERIAL PRIMARY KEY,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS candidatos_erm (
  id                    BIGSERIAL PRIMARY KEY,
  dni                   TEXT NOT NULL CHECK (dni ~ '^\d{8}$'),
  nombre_completo       TEXT NOT NULL,
  cargo                 TEXT NOT NULL,
  tipo_eleccion         TEXT NOT NULL CHECK (tipo_eleccion IN ('REGIONAL', 'MUNICIPAL PROVINCIAL', 'MUNICIPAL DISTRITAL')),
  organizacion_politica TEXT NOT NULL,
  organizacion_estado   TEXT,
  estado                TEXT NOT NULL,
  ubigeo                TEXT CHECK (ubigeo IS NULL OR ubigeo ~ '^\d{6}$'),
  departamento          TEXT,
  provincia             TEXT,
  distrito              TEXT,
  posicion              INTEGER,
  sexo                  TEXT CHECK (sexo IS NULL OR sexo IN ('M', 'F')),
  edad                  INTEGER CHECK (edad IS NULL OR edad BETWEEN 0 AND 120),
  provincia_consejero   TEXT,
  sentencias_declaradas INTEGER CHECK (sentencias_declaradas IS NULL OR sentencias_declaradas >= 0),
  source_batch_id       BIGINT NOT NULL REFERENCES raw_candidatos_erm_batches(id),
  UNIQUE (dni, tipo_eleccion, ubigeo, cargo, organizacion_politica)
);

CREATE TABLE IF NOT EXISTS candidatos_erm_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_candidatos_erm_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidatos_erm_dni ON candidatos_erm (dni);
CREATE INDEX IF NOT EXISTS idx_candidatos_erm_departamento ON candidatos_erm (departamento) WHERE departamento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_candidatos_erm_estado ON candidatos_erm (estado);
