-- Exportaciones FOB por RUC, fuente "Consulta por Importador/Exportador" de
-- Aduanas-SUNAT (aduanet.gob.pe/cl-ad-itconsultadwh/ieITS01Alias, régimen 40
-- = exportación definitiva). Confirmado en vivo el 2026-09-19: accesible por
-- HTTP plano con querystring, SIN captcha, SIN bloqueo de dominio para este
-- entorno (a diferencia de los dominios *.sunat.gob.pe usados por
-- ruc_consulta_masiva/ficha_ruc) — se ingiere con un conector automatizado,
-- no requiere navegador ni carga manual. Ver
-- docs/data-contracts/aduanet-exportaciones-fob.md.
--
-- Solo trae FOB USD agregado por mes/aduana/agente/país — NO trae kilos ni
-- peso; esa granularidad exige entrar al detalle de cada DUA, que no es
-- público sin más credenciales.
CREATE TABLE IF NOT EXISTS ruc_exportaciones_fob (
  ruc             TEXT NOT NULL,
  anio            INTEGER NOT NULL,
  mes             INTEGER NOT NULL,
  aduana_codigo   TEXT NOT NULL,
  aduana_nombre   TEXT,
  agente_codigo   TEXT NOT NULL,
  agente_nombre   TEXT,
  pais_codigo     TEXT NOT NULL,
  pais_nombre     TEXT,
  fob_usd         NUMERIC(14, 2) NOT NULL,
  fecha_consulta  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (ruc, anio, mes, aduana_codigo, agente_codigo, pais_codigo)
);

CREATE INDEX IF NOT EXISTS idx_ruc_exportaciones_fob_ruc ON ruc_exportaciones_fob (ruc);
CREATE INDEX IF NOT EXISTS idx_ruc_exportaciones_fob_anio ON ruc_exportaciones_fob (anio);
