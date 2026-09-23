-- Recorte temático de OECE: procesos de compra pública cuyo título, descripción
-- o algún ítem menciona "reactivo" (reactivos de laboratorio/diagnóstico in
-- vitro), con el adjudicatario si ya existe (`/api/v1/records?ocid=` trae
-- `compiledRelease.awards`, a diferencia de `/releases`). No reemplaza a
-- `procurement_processes`/`awards` (esos son genéricos, todo rubro) -- esta
-- tabla es la vista de negocio "mercado de reactivos médicos" ya filtrada,
-- para no tener que re-escanear releases cada vez que se quiera este recorte.
CREATE TABLE IF NOT EXISTS reactivos_medicos_hallazgos (
  id                  BIGSERIAL PRIMARY KEY,
  ocid                TEXT NOT NULL,
  buyer_id            TEXT,
  buyer_name          TEXT,
  departamento        TEXT,
  titulo              TEXT,
  item_desc           TEXT NOT NULL,
  valor_tender        NUMERIC(18, 2),
  valor_moneda        TEXT,
  fecha_publicacion   TIMESTAMPTZ,
  award_supplier_id   TEXT,
  award_supplier_name TEXT,
  award_valor         NUMERIC(18, 2),
  award_moneda        TEXT,
  award_fecha         DATE,
  detectado_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ocid, item_desc)
);

CREATE INDEX IF NOT EXISTS idx_reactivos_medicos_departamento
  ON reactivos_medicos_hallazgos (departamento) WHERE departamento IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reactivos_medicos_supplier
  ON reactivos_medicos_hallazgos (award_supplier_id) WHERE award_supplier_id IS NOT NULL;
