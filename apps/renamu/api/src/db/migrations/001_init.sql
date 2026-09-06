-- Fase 0 (2026-09-06): RENAMU (Registro Nacional de Municipalidades, INEI),
-- dataset censal anual verificado en vivo (ver docs/data-contracts/inei-renamu-municipalidades.md).
--
-- ALCANCE DELIBERADAMENTE PARCIAL de esta primera versión, por diseño verificado
-- contra el diccionario de variables real (`928-Modulo1814/2.Diccionario de
-- VariablesF01-RENAMU 2024.pdf`), 52 páginas, 5 módulos:
--
--   MÓDULO I  (datos generales): EXCLUIDO EN SU TOTALIDAD (columnas P04-P10).
--     Este módulo mezcla datos institucionales (dirección, redes sociales de
--     la municipalidad) con datos de PERSONA NATURAL del alcalde (nombres,
--     apellido paterno, apellido materno, sexo, teléfono móvil personal,
--     correo electrónico personal). El layout de tabla del PDF fuente no
--     permitió mapear con certeza qué código P0X_X exacto corresponde a cada
--     campo del alcalde — en vez de arriesgar ingerir PII sin saberlo con
--     certeza, se excluye el módulo completo. Ver "Pendiente" en el data
--     contract antes de reconsiderar ingerir la porción no-personal.
--   MÓDULO II (equipamiento y TIC): ingerido PARCIALMENTE — vehículos (P11A),
--     telefonía (P12) e internet (P14). NO se ingiere maquinaria pesada
--     (P11B), computadoras por tipo de procesador (P13) ni equipos de oficina
--     (P15) en esta primera versión — mismo patrón de "cierre parcial
--     documentado" que ya usa `bcrp-la-libertad` (7/10 anexos).
--   MÓDULOS III-V (recursos humanos, competencias, servicios públicos):
--     NO explorados todavía, fuera de alcance de esta primera versión.
--
-- Ninguna columna de este esquema contiene nombre, documento de identidad ni
-- ningún dato de persona natural — es información institucional agregada por
-- municipalidad, verificado contra el header real del CSV fuente.

CREATE TABLE IF NOT EXISTS raw_renamu_batches (
  id            BIGSERIAL PRIMARY KEY,
  anio          INTEGER NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Identificación de la municipalidad (Módulo I, solo campos no personales).
CREATE TABLE IF NOT EXISTS renamu_municipalidades (
  id                BIGSERIAL PRIMARY KEY,
  anio              INTEGER NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  idmunici          TEXT NOT NULL,
  ubigeo            TEXT NOT NULL CHECK (ubigeo ~ '^\d{6}$'),
  departamento      TEXT NOT NULL,
  provincia         TEXT NOT NULL,
  distrito          TEXT NOT NULL,
  -- Tipomuni real del CSV: '1'=Provincial, '2'=Distrital, '3'=Centro Poblado.
  tipomuni          TEXT NOT NULL CHECK (tipomuni IN ('1', '2', '3')),
  source_batch_id   BIGINT NOT NULL REFERENCES raw_renamu_batches(id),
  UNIQUE (idmunici, anio)
);

CREATE TABLE IF NOT EXISTS renamu_municipalidades_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_renamu_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bienes muebles vehiculares (Módulo II, bloque P11A) — formato largo
-- (un registro por municipalidad x tipo de bien), en vez de una columna por
-- tipo, para no comprometerse a un esquema ancho de ~40 columnas cuando la
-- fuente crece a más módulos en una versión futura.
CREATE TABLE IF NOT EXISTS renamu_vehiculos (
  id                    BIGSERIAL PRIMARY KEY,
  municipio_id          BIGINT NOT NULL REFERENCES renamu_municipalidades(id),
  -- Código de pregunta original (P11A_1..P11A_10), confirmado contra el
  -- diccionario de variables y contra filas reales del CSV 2024.
  item_codigo           TEXT NOT NULL CHECK (item_codigo IN (
                           'P11A_1', 'P11A_2', 'P11A_3', 'P11A_4', 'P11A_5',
                           'P11A_6', 'P11A_7', 'P11A_8', 'P11A_9', 'P11A_10'
                         )),
  item_descripcion      TEXT NOT NULL,
  tiene                 BOOLEAN NOT NULL,
  cantidad_operativa    INTEGER CHECK (cantidad_operativa >= 0),
  cantidad_no_operativa INTEGER CHECK (cantidad_no_operativa >= 0),
  especifique           TEXT,
  source_batch_id       BIGINT NOT NULL REFERENCES raw_renamu_batches(id),
  UNIQUE (municipio_id, item_codigo)
);

-- Telefonía e internet (Módulo II, bloques P12 y P14) — un registro por
-- municipalidad, campos ya son de baja cardinalidad (no ameritan formato largo).
CREATE TABLE IF NOT EXISTS renamu_conectividad (
  id                          BIGSERIAL PRIMARY KEY,
  municipio_id                BIGINT NOT NULL UNIQUE REFERENCES renamu_municipalidades(id),
  tiene_linea_fija            BOOLEAN NOT NULL,
  lineas_fijas                INTEGER CHECK (lineas_fijas >= 0),
  tiene_linea_movil           BOOLEAN NOT NULL,
  lineas_moviles              INTEGER CHECK (lineas_moviles >= 0),
  tiene_internet              BOOLEAN NOT NULL,
  computadoras_con_internet   INTEGER CHECK (computadoras_con_internet >= 0),
  -- Código real de P14A_2: 1=Wifi, 2=Banda ancha móvil, 3=ADSL/DSL,
  -- 4=Satelital, 5=Fibra óptica (confirmado en el diccionario de variables).
  tipo_conexion_codigo        INTEGER CHECK (tipo_conexion_codigo BETWEEN 1 AND 5),
  source_batch_id             BIGINT NOT NULL REFERENCES raw_renamu_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_renamu_municipalidades_ubigeo ON renamu_municipalidades (ubigeo);
CREATE INDEX IF NOT EXISTS idx_renamu_vehiculos_municipio ON renamu_vehiculos (municipio_id);
