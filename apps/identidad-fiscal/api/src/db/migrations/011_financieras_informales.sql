-- Épica 3 (Mapa de Gota a Gota, PRD-003) replanteada 2026-10-02: el conector
-- SBS (GOT-01 a GOT-05) queda descartado -- el portal entero
-- (sbs.gob.pe/app/pp/regiweb/... y la página nueva de registros) está
-- protegido por Incapsula (WAF anti-bot), confirmado en vivo con curl y con
-- el navegador automatizado (ambos reciben el challenge, no el contenido
-- real). No existe API ni dataset abierto alternativo para este registro
-- (verificado contra datosabiertos.gob.pe y búsqueda de APIs de SBS) --
-- construir un scraper para evadir ese WAF está fuera de lo que este
-- asistente puede hacer.
--
-- Sin el lado "casas registradas por SBS", el mapa se construye solo con lo
-- que SÍ es accesible: candidatas por nombre en el Padrón RUC nacional
-- (`contribuyentes`, 2.3M filas -- no tiene CIIU, así que no se puede
-- filtrar por código de actividad económica; se usa coincidencia de texto en
-- `razon_social`, mismo patrón que `cooperativas-ruc-seed` para café/cacao),
-- cruzadas geográficamente con la tasa de extorsión SIDPOL por departamento
-- (`seguridad-ciudadana`, ver Termómetro SIDPOL). Esto reemplaza GOT-06 a
-- GOT-10 del diseño original (que asumía un `score_riesgo` = denuncias /
-- casas_registradas, imposible sin el numerador de SBS) por dos señales
-- independientes expuestas juntas: densidad de candidatas por departamento
-- + tasa de extorsión por 100k -- sin fabricar un ratio que implique una
-- relación causal no verificada entre ambas.
CREATE TABLE IF NOT EXISTS financieras_informales_candidatas (
  ruc                   TEXT PRIMARY KEY REFERENCES contribuyentes(ruc),
  razon_social          TEXT NOT NULL,
  ubigeo                TEXT,
  departamento          TEXT,
  estado_contribuyente  TEXT,
  condicion_domicilio   TEXT,
  patron_coincidente    TEXT NOT NULL,
  materializado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financieras_informales_departamento
  ON financieras_informales_candidatas (departamento);
