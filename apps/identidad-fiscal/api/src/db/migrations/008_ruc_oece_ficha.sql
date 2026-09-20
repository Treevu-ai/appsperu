-- Buscador de Proveedores del Estado (OECE, ex-OSCE) -- eap.oece.gob.pe --
-- confirmado en vivo el 2026-09-20: GET plano, sin captcha, sin sesion,
-- dominio no bloqueado para este entorno. Trae datos SUNAT frescos +
-- contacto (telefono/email) + toda la conformacion societaria/directiva
-- con DNI de cada persona -- mucho mas rico que ficha_ruc_representantes
-- (que solo tiene 1 registro, cargado a mano por el bloqueo de reCAPTCHA
-- de la ficha individual de SUNAT). Ver
-- docs/data-contracts/oece-ficha-proveedor.md.
CREATE TABLE IF NOT EXISTS ruc_oece_ficha (
  ruc             TEXT PRIMARY KEY,
  razon_social    TEXT,
  tipo_empresa    TEXT,
  estado_sunat    TEXT,
  condicion_sunat TEXT,
  departamento    TEXT,
  provincia       TEXT,
  distrito        TEXT,
  telefono        TEXT,
  email           TEXT,
  codigo_registro TEXT,
  fecha_consulta  TIMESTAMPTZ NOT NULL
);

-- Representantes legales, miembros del órgano de administración (consejo
-- directivo) y socios/accionistas -- un tipo de organización solo trae
-- alguno de los tres (cooperativas: representantes + órganos de
-- administración; societarias tipo S.A.C.: típicamente socios). El campo
-- `rol` distingue de cuál de los 3 arreglos de la fuente viene cada fila.
-- `source_id` es el id interno de OECE (idRepresentante/idOrgano) -- clave
-- natural real de la fuente, estable entre consultas.
CREATE TABLE IF NOT EXISTS ruc_oece_personas (
  ruc             TEXT NOT NULL,
  rol             TEXT NOT NULL CHECK (rol IN ('REPRESENTANTE', 'ORGANO_ADMINISTRACION', 'SOCIO')),
  source_id       BIGINT NOT NULL,
  dni             TEXT,
  nombre          TEXT NOT NULL,
  tipo_organo     TEXT,
  cargo           TEXT,
  fecha_ingreso   DATE,
  fecha_consulta  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (ruc, rol, source_id)
);

CREATE INDEX IF NOT EXISTS idx_ruc_oece_personas_dni ON ruc_oece_personas (dni);
