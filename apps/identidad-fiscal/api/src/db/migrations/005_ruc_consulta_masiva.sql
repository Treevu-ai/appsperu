-- "Consulta Múltiple de RUC" (e-consultaruc.sunat.gob.pe/cl-ti-itmrconsmulruc/jrmS00Alias),
-- confirmado en vivo el 2026-09-18: hasta 10 RUC por ingreso manual o hasta
-- 100 por archivo .txt subido, genera un .zip descargable con un .txt
-- delimitado por "|" — SIN reCAPTCHA, a diferencia de la ficha individual
-- (jcrS00Alias). Ver docs/data-contracts/sunat-consulta-multiple-ruc.md.
--
-- Tabla separada de `ficha_ruc` a propósito: son fuentes distintas con
-- columnas parcialmente solapadas (fecha inscripción, CIIU, comercio
-- exterior) pero cada una trae campos que la otra no tiene — esta trae
-- "Buen Contribuyente"/Agentes de Retención-Percepción, la ficha individual
-- trae representantes legales y comprobantes electrónicos.
CREATE TABLE IF NOT EXISTS ruc_consulta_masiva (
  ruc                             TEXT PRIMARY KEY,
  razon_social                    TEXT NOT NULL,
  tipo_contribuyente               TEXT,
  profesion_oficio                TEXT,
  nombre_comercial                TEXT,
  condicion_contribuyente         TEXT,
  estado_contribuyente            TEXT,
  fecha_inscripcion               DATE,
  fecha_inicio_actividades        DATE,
  departamento                    TEXT,
  provincia                       TEXT,
  distrito                        TEXT,
  direccion                       TEXT,
  telefono                        TEXT,
  fax                             TEXT,
  actividad_comercio_exterior     TEXT,
  ciiu_principal                  TEXT,
  ciiu_secundario_1               TEXT,
  ciiu_secundario_2               TEXT,
  afecto_nuevo_rus                TEXT,
  buen_contribuyente              TEXT,
  agente_retencion                TEXT,
  agente_percepcion_venta_interna TEXT,
  agente_percepcion_combustible   TEXT,
  fecha_consulta                  TIMESTAMPTZ NOT NULL
);
