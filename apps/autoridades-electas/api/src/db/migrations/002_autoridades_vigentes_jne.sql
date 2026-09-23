-- Autoridades vigentes JNE (2026-09-22) — segunda fuente dentro de esta app,
-- complementaria a `autoridades_electas` (migración 001).
--
-- Por qué una tabla distinta y no extender la existente: `autoridades_electas`
-- (001) lee el recurso "actual" de datosabiertos.gob.pe/CKAN, que hoy solo
-- trae autoridades NACIONALES recién proclamadas (Presidencia, Congreso,
-- Parlamento Andino) — el propio dataset del JNE en la PNDA todavía no
-- incluye autoridades regionales/municipales porque las Elecciones
-- Regionales y Municipales 2026 aún no se proclaman ahí. El recurso
-- histórico que sí cubre alcaldes/regidores (2014-2022) se dejó
-- deliberadamente sin ingerir por traer DNI sin enmascarar sin revisión
-- legal previa (ver 001_init.sql).
--
-- Esta tabla usa una fuente DISTINTA: la API pública "Autoridades Vigentes"
-- del propio JNE (cej.jne.gob.pe/Autoridades), que expone en tiempo real
-- quién ocupa HOY cada cargo de elección popular (presidencial, congreso,
-- parlamento andino, gobierno regional, municipalidad provincial,
-- municipalidad distrital) para el mandato en curso — confirmado en vivo
-- 2026-09-22 contra el ubigeo 120307 (Sarín, Sánchez Carrión, La Libertad):
-- devuelve al alcalde y regidores vigentes del período 2023-2026
-- (idProcesoElectoral=113, "ELECCIONES REGIONALES Y MUNICIPALES 2022").
--
-- Esta versión ingiere solo el nivel DISTRITAL y PROVINCIAL (alcaldes y
-- regidores de municipalidades distritales/provinciales) — el gap real que
-- bloqueó el análisis del caso Sarín hoy: no había forma de saber quién es
-- la autoridad municipal vigente de ningún distrito en todo el proyecto.
-- Nivel REGIONAL (gobernadores) y nacional quedan fuera de esta versión;
-- ambos son más fáciles de obtener de otras fuentes si hacen falta después.
--
-- DNI: la fuente expone `strDocumentoIdentidad` sin enmascarar (mismo
-- problema que ya llevó a excluir el recurso histórico en 001). Decisión
-- del usuario 2026-09-22: se guarda un hash SHA-256 del DNI (`dni_hash`),
-- nunca el DNI en texto plano — sirve para detectar duplicados/reemplazos
-- de la misma persona sin poder reconstruir el documento real.

CREATE TABLE IF NOT EXISTS raw_autoridades_vigentes_batches (
  id            BIGSERIAL PRIMARY KEY,
  ubigeo        TEXT NOT NULL,
  id_tipo_eleccion INTEGER NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ubigeo, id_tipo_eleccion, checksum)
);

CREATE TABLE IF NOT EXISTS autoridades_vigentes (
  id                       BIGSERIAL PRIMARY KEY,
  dni_hash                 TEXT NOT NULL,
  nombres                  TEXT NOT NULL,
  apellido_paterno         TEXT NOT NULL,
  apellido_materno         TEXT,
  organizacion_politica    TEXT,
  cargo                    TEXT NOT NULL,
  id_cargo                 INTEGER,
  posicion                 INTEGER,
  departamento             TEXT NOT NULL,
  provincia                TEXT NOT NULL,
  distrito                 TEXT NOT NULL,
  ubigeo                   TEXT NOT NULL CHECK (ubigeo ~ '^\d{6}$'),
  id_tipo_eleccion         INTEGER NOT NULL,
  tipo_eleccion            TEXT NOT NULL,
  id_proceso_electoral     INTEGER,
  proceso_electoral        TEXT,
  id_periodo_gobierno      INTEGER,
  fecha_fin_vigencia       DATE,
  ruta_foto                TEXT,
  ruta_plan_gobierno       TEXT,
  id_hoja_vida             INTEGER,
  id_conformacion_detalle  INTEGER,
  source_batch_id          BIGINT NOT NULL REFERENCES raw_autoridades_vigentes_batches(id) ON DELETE CASCADE,
  UNIQUE (id_conformacion_detalle)
);

CREATE INDEX IF NOT EXISTS idx_autoridades_vigentes_ubigeo ON autoridades_vigentes (ubigeo);
CREATE INDEX IF NOT EXISTS idx_autoridades_vigentes_cargo ON autoridades_vigentes (cargo);
CREATE INDEX IF NOT EXISTS idx_autoridades_vigentes_dni_hash ON autoridades_vigentes (dni_hash);
CREATE INDEX IF NOT EXISTS idx_autoridades_vigentes_ubicacion ON autoridades_vigentes (departamento, provincia, distrito);
