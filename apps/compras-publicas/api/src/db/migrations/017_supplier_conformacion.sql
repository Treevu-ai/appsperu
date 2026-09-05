-- Conformación societaria de proveedores del Estado (accionistas, representantes
-- legales, órganos de administración), vía el "Buscador de Proveedores del Estado"
-- de OSCE (eap.oece.gob.pe/ficha-proveedor-cns) — API JSON pública, sin auth, sin
-- captcha, verificada en vivo el 2026-09-03. No es un feed documentado: se conserva
-- la respuesta completa, URL y momento de captura, mismo patrón que
-- raw_minor_contract_batches (006).
--
-- Limitación conocida: el campo `socios` de la fuente viene vacío para consorcios
-- (Contratos de Colaboración Empresarial) — no tienen accionistas en el sentido
-- societario. Funciona para personas jurídicas (S.A.C., S.R.L., E.I.R.L., etc.)
-- con socios/accionistas reales.

CREATE TABLE IF NOT EXISTS raw_conformacion_batches (
  id            BIGSERIAL PRIMARY KEY,
  source_system TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  ruc           TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  payload       JSONB NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_conformacion (
  id                BIGSERIAL PRIMARY KEY,
  ruc               TEXT NOT NULL,
  cod_prov          TEXT,
  rol               TEXT NOT NULL CHECK (rol IN ('SOCIO', 'REPRESENTANTE', 'ORGANO_ADMINISTRACION')),
  nombre            TEXT NOT NULL,
  tipo_documento    TEXT,
  numero_documento  TEXT,
  cargo             TEXT,
  numero_acciones   NUMERIC(18, 2),
  porcentaje_acciones NUMERIC(6, 3),
  fecha_ingreso     DATE,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_conformacion_batches(id) ON DELETE CASCADE,
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ruc, rol, numero_documento, nombre)
);

CREATE INDEX IF NOT EXISTS idx_supplier_conformacion_ruc ON supplier_conformacion (ruc);
CREATE INDEX IF NOT EXISTS idx_supplier_conformacion_doc ON supplier_conformacion (numero_documento);

-- Estado de la consulta por RUC: separa "consultado y sin datos" (p.ej. consorcio,
-- o empresa sin socios registrados) de "nunca consultado" — evita repreguntar RUCs
-- que ya sabemos que no traen nada.
CREATE TABLE IF NOT EXISTS supplier_conformacion_lookup (
  ruc             TEXT PRIMARY KEY,
  cod_prov        TEXT,
  razon_social    TEXT,
  tipo_empresa    TEXT,
  estado_sunat    TEXT,
  condicion_sunat TEXT,
  tiene_socios    BOOLEAN NOT NULL DEFAULT false,
  source_batch_id BIGINT NOT NULL REFERENCES raw_conformacion_batches(id) ON DELETE CASCADE,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
