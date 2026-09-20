-- Padrón de Productores Agrarios (PPA) de MIDAGRI --
-- consultapadron.midagri.gob.pe -- confirma si un RUC/DNI está registrado
-- como productor agrario formal. Dominio distinto de SUNAT/Aduanas, API
-- ABP Framework (gateway.midagri.gob.pe/sisppa) -- confirmado en vivo el
-- 2026-09-20: GET plano, sin captcha, sin sesión, sin headers especiales.
--
-- Único dato real disponible: si está registrado (razón social real) o no
-- (el sistema devuelve el literal "-", mismo sentinel que SUNAT). El
-- endpoint GetDatosProductor (que prometía cultivo/hectáreas/ubicación)
-- devuelve null incluso para RUC y DNI confirmados como registrados --
-- ningún componente de la UI lo invoca, probablemente sin terminar de
-- implementar o requiere sesión propia del titular. Ver
-- docs/data-contracts/midagri-padron-ppa.md.
CREATE TABLE IF NOT EXISTS ruc_padron_ppa (
  ruc             TEXT PRIMARY KEY,
  registrado      BOOLEAN NOT NULL,
  nombre_ppa      TEXT,
  fecha_consulta  TIMESTAMPTZ NOT NULL
);
