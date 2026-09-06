-- Lake de evidencia: nunca se sobreescribe.
CREATE TABLE IF NOT EXISTS raw_contraloria_batches (
  id            BIGSERIAL PRIMARY KEY,
  periodo       INTEGER NOT NULL,
  page_number   INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  UNIQUE (periodo, page_number, checksum)
);

-- Informes de control de la Contraloría (auditorías/servicios de control),
-- a nivel de entidad — NUNCA a nivel de persona.
--
-- DECISIÓN DE DISEÑO DELIBERADA: la fuente real (BusquedaInformesCGR.ashx,
-- Action=loadInformesElastic) devuelve, en la misma respuesta, campos de
-- entidad/informe (los que sí se guardan acá) MEZCLADOS con campos de
-- persona natural cuando un informe tiene responsabilidad identificada
-- (`Funcionarios`, `TotalFuncionarios`, `Responsabilidad`, y el campo de
-- índice de texto libre `Text`, que podría concatenar nombres). Esos cuatro
-- campos se descartan en el parseo (`informes-control-parse.ts`, función
-- `normalizeInforme`) ANTES de llegar a esta tabla — nunca se persisten,
-- nunca se exponen. `es_con_responsabilidad` sí se guarda porque es un
-- booleano (existe o no un hallazgo de responsabilidad), no un nombre.
CREATE TABLE IF NOT EXISTS informes_control (
  codigo_informe            TEXT PRIMARY KEY,
  numero_informe            TEXT,
  ciac_codigo               TEXT,
  entidad                   TEXT,
  codigo_entidad            TEXT,
  sector                    TEXT,
  codigo_sector             TEXT,
  nivel_gobierno            TEXT,
  departamento              TEXT,
  provincia                 TEXT,
  distrito                  TEXT,
  descripcion               TEXT,
  modalidad_servicio        TEXT,
  servicio_control          TEXT,
  tipo_informe              TEXT,
  periodo                   INTEGER,
  fecha_emision             DATE,
  fecha_publicacion         DATE,
  fecha_fin_ejecucion       DATE,
  es_con_responsabilidad    BOOLEAN,
  total_recomendaciones     INTEGER,
  es_covid                  BOOLEAN,
  es_reconstruccion         BOOLEAN,
  url_resumen_ejecutivo     TEXT,
  url_resumen_informe       TEXT,
  url_informe_completo      TEXT,
  source_batch_id           BIGINT NOT NULL REFERENCES raw_contraloria_batches(id),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_informes_control_entidad
  ON informes_control (entidad) WHERE entidad IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_informes_control_periodo
  ON informes_control (periodo);

CREATE INDEX IF NOT EXISTS idx_informes_control_departamento
  ON informes_control (departamento) WHERE departamento IS NOT NULL;
