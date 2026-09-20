-- Ficha individual de RUC (e-consultaruc.sunat.gob.pe), campos confirmados
-- en vivo el 2026-09-18 contra RUC 20129156083 y 20404057805 — ver
-- docs/data-contracts/sunat-ficha-ruc.md.
--
-- A diferencia del padrón reducido (`contribuyentes`, descarga masiva), esta
-- fuente es una consulta individual protegida por reCAPTCHA v3 server-side
-- (confirmado con una prueba real: un POST sin token responde error de
-- servidor, y el IP de origen quedó temporalmente bloqueado tras el intento).
-- No hay conector automatizado tipo `fetch()` — los datos se cargan vía
-- `npm run import:ficha-ruc` a partir de un JSON con lo ya extraído
-- manualmente por navegador (ver `ficha-ruc-import.ts`). Sin lake de
-- evidencia tipo `raw_*_batches`: no hay un archivo descargable que
-- checksumear, cada fila es su propia consulta puntual con su propia
-- `fecha_consulta`.
CREATE TABLE IF NOT EXISTS ficha_ruc (
  ruc                             TEXT PRIMARY KEY,
  razon_social                    TEXT NOT NULL,
  nombre_comercial                TEXT,
  tipo_contribuyente               TEXT,
  fecha_inscripcion               DATE,
  fecha_inicio_actividades        DATE,
  estado_contribuyente            TEXT,
  condicion_contribuyente         TEXT,
  domicilio_fiscal                TEXT,
  sistema_emision_comprobante     TEXT,
  actividad_comercio_exterior     TEXT,
  sistema_contabilidad            TEXT,
  comprobantes_pago               TEXT[],
  sistema_emision_electronica     TEXT[],
  emisor_electronico_desde        DATE,
  comprobantes_electronicos       TEXT,
  afiliado_ple_desde              DATE,
  padrones                        TEXT[],
  fecha_consulta                  TIMESTAMPTZ NOT NULL
);

-- Actividad(es) Económica(s) — grupo repetido de longitud variable (1
-- principal + N secundarias, N observado en 2 filas reales) en la propia
-- ficha, así que va en tabla aparte en vez de columnas fijas.
CREATE TABLE IF NOT EXISTS ficha_ruc_actividades (
  id            BIGSERIAL PRIMARY KEY,
  ruc           TEXT NOT NULL REFERENCES ficha_ruc(ruc) ON DELETE CASCADE,
  orden         SMALLINT NOT NULL,
  tipo          TEXT NOT NULL, -- 'PRINCIPAL' | 'SECUNDARIA'
  codigo_ciiu   TEXT,
  descripcion   TEXT NOT NULL
);

-- Representante(s) Legal(es) — sub-consulta aparte en la ficha real
-- (botón "Representante(s) Legal(es)"), también longitud variable.
CREATE TABLE IF NOT EXISTS ficha_ruc_representantes (
  id                BIGSERIAL PRIMARY KEY,
  ruc               TEXT NOT NULL REFERENCES ficha_ruc(ruc) ON DELETE CASCADE,
  tipo_documento    TEXT,
  numero_documento  TEXT,
  nombre            TEXT NOT NULL,
  cargo             TEXT,
  fecha_desde       DATE
);

CREATE INDEX IF NOT EXISTS idx_ficha_ruc_actividades_ruc ON ficha_ruc_actividades (ruc);
CREATE INDEX IF NOT EXISTS idx_ficha_ruc_representantes_ruc ON ficha_ruc_representantes (ruc);
