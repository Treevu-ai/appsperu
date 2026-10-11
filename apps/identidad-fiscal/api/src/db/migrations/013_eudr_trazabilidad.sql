-- Trazabilidad EUDR: parcelas, lotes y declaraciones de diligencia debida.
--
-- Contexto. El Reglamento (UE) 2023/1115 exige, para poder comercializar café o
-- cacao en la UE, que el operador aporte "la geolocalización de todas las parcelas
-- donde se produjo el commodity, mediante el punto de latitud y longitud de cada
-- parcela y, para las parcelas de más de cuatro hectáreas, el polígono de latitud
-- y longitud de cada parcela" (art. 9(1)(d)). Hasta ahora el proyecto solo tenía
-- datos de organización, socios, certificaciones y exportaciones: no había NADA de
-- geolocalización. Esta migración abre esa dimensión.
--
-- Regla de oro del proyecto (ver 002_cooperativas.sql y 006): no se inventan
-- columnas ni se asume que una fuente trae algo que no trae. Por eso:
--   * La geometría se guarda tal como la reporta la organización, en GeoJSON,
--     con el sistema de referencia declarado. No se reproyecta ni se "corrige".
--   * El cumplimiento del requisito EUDR se CALCULA, no se declara: la columna
--     generada `cumple_geolocalizacion_eudr` compara el área con el umbral de
--     4 ha del reglamento.
--   * `fuente` distingue dato declarado por la organización, medido en campo o
--     derivado de un shapefile, porque no tienen la misma fuerza probatoria.
--
-- Relación con el resto del esquema: `ruc` es TEXT y apunta a la organización
-- (mismo tipo de clave que `contribuyentes`, `ruc_exportaciones_fob` y
-- `ruc_consulta_masiva`). El enlace con los embarques se hace por
-- (anio, aduana_codigo, dua_numero), que es la clave natural de las DUAs.
-- CORRECCIÓN 2026-10-11: la primera versión de este comentario citaba
-- `ruc_fob_dua` como tabla de la base. Verificado: ESA TABLA NO EXISTE. Las DUAs
-- viven en `BASE CONSOLIDADA.xlsx`, hoja `RUC_FOB_DUA`; la base local solo tiene
-- `ruc_exportaciones_fob` (FOB agregado por mes/aduana/agente/país, sin número de
-- DUA). Por eso `eudr_lote_embarque` no declara FK a ninguna tabla de DUAs: no
-- hay tabla con la que enlazar. El JOIN con las DUAs se resuelve contra la fuente
-- Excel, no contra la base.
--
-- Aplicación: la recoge `src/db/migrate.ts` automáticamente por orden de nombre
-- (013 = después de 012_ruc_lookup_cache.sql).

-- ---------------------------------------------------------------- parcelas
CREATE TABLE IF NOT EXISTS eudr_parcela (
  parcela_id            BIGSERIAL PRIMARY KEY,
  ruc                   TEXT NOT NULL,
  -- Código que la organización usa para identificar la parcela en su propia
  -- contabilidad. NO se inventa: si la organización no tiene código, se genera
  -- uno con el formato ORG-NN y se marca `codigo_generado = TRUE`.
  codigo_parcela        TEXT NOT NULL,
  codigo_generado       BOOLEAN NOT NULL DEFAULT FALSE,
  cultivo               TEXT NOT NULL CHECK (cultivo IN ('CAFE', 'CACAO')),
  area_ha               NUMERIC(10, 4) NOT NULL CHECK (area_ha > 0),
  -- El umbral de 4 ha es del reglamento: hasta 4 ha basta un punto, por encima
  -- hace falta polígono. Se valida para que no entre una parcela de 9 ha con
  -- solo un punto y se dé por buena.
  tipo_geometria        TEXT NOT NULL CHECK (tipo_geometria IN ('PUNTO', 'POLIGONO')),
  latitud               NUMERIC(9, 6),
  longitud              NUMERIC(9, 6),
  -- Polígono en GeoJSON (RFC 7946), anillo exterior como mínimo. Se guarda el
  -- JSON tal cual; no se parsea a PostGIS para no obligar a esa extensión.
  poligono_geojson      JSONB,
  sistema_referencia    TEXT NOT NULL DEFAULT 'WGS84 (EPSG:4326)',
  altitud_msnm           INTEGER,
  fecha_establecimiento DATE,
  estado                TEXT NOT NULL DEFAULT 'ACTIVA'
                          CHECK (estado IN ('ACTIVA', 'INACTIVA', 'EN_VERIFICACION')),
  -- Procedencia del dato: DECLARADA (la organización la reportó), MEDIDA (GPS en
  -- campo), DERIVADA_GIS (digitalizada de imagen o shapefile), ESTIMADA.
  fuente                TEXT NOT NULL DEFAULT 'DECLARADA'
                          CHECK (fuente IN ('DECLARADA', 'MEDIDA', 'DERIVADA_GIS', 'ESTIMADA')),
  -- Quién cargó el registro, para poder devolver la ficha a revisión.
  cargado_por           TEXT,
  fecha_registro        TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_actualizacion   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Consistencia interna: un PUNTO trae lat/lon y ningún polígono; un POLIGONO
  -- trae polígono y ningún punto. Sin esto, entran filas híbridas inutilizables.
  CONSTRAINT chk_eudr_parcela_geometria CHECK (
    (tipo_geometria = 'PUNTO'
       AND latitud IS NOT NULL AND longitud IS NOT NULL
       AND poligono_geojson IS NULL)
    OR
    (tipo_geometria = 'POLIGONO'
       AND poligono_geojson IS NOT NULL
       AND latitud IS NULL AND longitud IS NULL)
  ),
  -- Coordenadas dentro de rango plausible para el Perú (-18° a 1° lat,
  -- -81° a -68° lon). Evita errores de signo y de orden lat/lon, que son el
  -- fallo más común al cargar datos a mano.
  CONSTRAINT chk_eudr_parcela_rango CHECK (
    latitud IS NULL OR (latitud BETWEEN -18.5 AND 1.0
                        AND longitud BETWEEN -81.5 AND -68.0)
  ),
  -- No se permite superponer el umbral del reglamento: >4 ha exige polígono.
  CONSTRAINT chk_eudr_parcela_umbral CHECK (
    area_ha <= 4 OR tipo_geometria = 'POLIGONO'
  )
);

-- Columna generada: ¿esta parcela cumple el requisito de geolocalización del
-- art. 9(1)(d)? Se calcula, no se declara, para que el indicador no se pueda
-- "maquillar" desde la carga.
-- Por debajo de 4 ha basta un punto, pero un polígono también cumple (es un
-- dato más preciso que el mínimo exigido, no uno peor): por eso el caso
-- ELSE no exige PUNTO, solo que exista una geometría válida, que ya está
-- garantizado por chk_eudr_parcela_geometria.
ALTER TABLE eudr_parcela
  ADD COLUMN IF NOT EXISTS cumple_geolocalizacion_eudr BOOLEAN
  GENERATED ALWAYS AS (
    CASE WHEN area_ha > 4
         THEN tipo_geometria = 'POLIGONO'
         ELSE TRUE
    END
  ) STORED;

-- Una organización no puede tener dos parcelas con el mismo código.
CREATE UNIQUE INDEX IF NOT EXISTS uq_eudr_parcela_org_codigo
  ON eudr_parcela (ruc, codigo_parcela);

-- No se agrega índice separado por (ruc): uq_eudr_parcela_org_codigo ya
-- cubre ese filtro como prefijo izquierdo de (ruc, codigo_parcela).
CREATE INDEX IF NOT EXISTS idx_eudr_parcela_cultivo ON eudr_parcela (cultivo);

-- Índice para las consultas de cumplimiento, que son las que se van a hacer.
CREATE INDEX IF NOT EXISTS idx_eudr_parcela_cumple
  ON eudr_parcela (ruc, cumple_geolocalizacion_eudr);

-- ---------------------------------------------------------------- lotes
-- Un lote es la unidad de producto trazable: el café o cacao de una campaña que
-- se puede atribuir a un conjunto de parcelas. Es la pieza que une la parcela
-- con el embarque.
CREATE TABLE IF NOT EXISTS eudr_lote (
  lote_id          BIGSERIAL PRIMARY KEY,
  ruc              TEXT NOT NULL,
  codigo_lote      TEXT NOT NULL,
  cultivo          TEXT NOT NULL CHECK (cultivo IN ('CAFE', 'CACAO')),
  -- Campaña en formato texto libre (p. ej. "2024/2025") porque cada organización
  -- la escribe como quiere; no se normaliza a fecha para no perder el original.
  campania         TEXT,
  fecha_cosecha    DATE,
  peso_kg          NUMERIC(12, 2) CHECK (peso_kg IS NULL OR peso_kg > 0),
  -- Proceso y variedad: útiles para el control de calidad y para el dossier,
  -- aunque el reglamento no los exija.
  proceso          TEXT,
  variedad         TEXT,
  estado           TEXT NOT NULL DEFAULT 'ACTIVO'
                     CHECK (estado IN ('ACTIVO', 'AGOTADO', 'EN_VERIFICACION')),
  fecha_registro   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_eudr_lote_org_codigo UNIQUE (ruc, codigo_lote)
);

-- No se agrega índice separado por (ruc): uq_eudr_lote_org_codigo ya cubre
-- ese filtro como prefijo izquierdo de (ruc, codigo_lote).

-- Qué parcelas componen un lote y en qué proporción. Un lote puede venir de
-- varias parcelas y una parcela puede alimentar varios lotes.
CREATE TABLE IF NOT EXISTS eudr_lote_parcela (
  lote_id     BIGINT NOT NULL REFERENCES eudr_lote (lote_id) ON DELETE CASCADE,
  parcela_id  BIGINT NOT NULL REFERENCES eudr_parcela (parcela_id) ON DELETE CASCADE,
  -- Aporte de la parcela al lote, en porcento. Se llena cuando la organización
  -- lo conoce; si no, queda NULL y el lote sigue siendo válido, solo con la
  -- atribución sin ponderar.
  aporte_pct  NUMERIC(5, 2) CHECK (aporte_pct IS NULL OR (aporte_pct > 0 AND aporte_pct <= 100)),
  PRIMARY KEY (lote_id, parcela_id)
);

CREATE INDEX IF NOT EXISTS idx_eudr_lote_parcela_parcela
  ON eudr_lote_parcela (parcela_id);

-- ---------------------------------------------------------------- embarques
-- Une un lote con una DUA. La clave (anio, aduana_codigo, dua_numero) es la que
-- usa `ruc_fob_dua`, así que el JOIN con exportaciones es directo.
CREATE TABLE IF NOT EXISTS eudr_lote_embarque (
  lote_id       BIGINT NOT NULL REFERENCES eudr_lote (lote_id) ON DELETE CASCADE,
  anio          INTEGER NOT NULL,
  aduana_codigo TEXT NOT NULL,
  dua_numero    TEXT NOT NULL,
  peso_kg       NUMERIC(12, 2) CHECK (peso_kg IS NULL OR peso_kg > 0),
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lote_id, anio, aduana_codigo, dua_numero)
);

CREATE INDEX IF NOT EXISTS idx_eudr_lote_embarque_dua
  ON eudr_lote_embarque (anio, aduana_codigo, dua_numero);

-- ---------------------------------------------------------------- DDS
-- Declaración de diligencia debida (Due Diligence Statement). Es el documento
-- que el operador presenta antes de importar a la UE; sin él la mercancía no
-- entra. Referencia alfanumérica que emite el sistema de información de la UE
-- (TRACES / nuevo sistema EUDR).
CREATE TABLE IF NOT EXISTS eudr_declaracion (
  declaracion_id   BIGSERIAL PRIMARY KEY,
  ruc              TEXT NOT NULL,
  referencia_dds   TEXT NOT NULL UNIQUE,
  anio             INTEGER,
  mes              INTEGER,
  -- Embarque que cubre la declaración. Puede quedar NULL si la DDS se presenta
  -- antes de conocer la DUA concreta.
  aduana_codigo    TEXT,
  dua_numero       TEXT,
  pais_destino     TEXT,
  volumen_kg       NUMERIC(14, 2) CHECK (volumen_kg IS NULL OR volumen_kg > 0),
  fecha_emision    DATE,
  estado           TEXT NOT NULL DEFAULT 'BORRADOR'
                     CHECK (estado IN ('BORRADOR', 'PRESENTADA', 'ACEPTADA',
                                       'RECHAZADA', 'RETIRADA')),
  -- Resultado de la evaluación de riesgo del operador. EUDR art. 10.
  nivel_riesgo     TEXT CHECK (nivel_riesgo IN ('BAJO', 'ESTANDAR', 'ALTO')),
  fecha_registro   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eudr_declaracion_ruc ON eudr_declaracion (ruc);
CREATE INDEX IF NOT EXISTS idx_eudr_declaracion_estado ON eudr_declaracion (estado);

-- Qué lotes respaldan cada declaración.
CREATE TABLE IF NOT EXISTS eudr_declaracion_lote (
  declaracion_id BIGINT NOT NULL REFERENCES eudr_declaracion (declaracion_id) ON DELETE CASCADE,
  lote_id        BIGINT NOT NULL REFERENCES eudr_lote (lote_id) ON DELETE CASCADE,
  PRIMARY KEY (declaracion_id, lote_id)
);

CREATE INDEX IF NOT EXISTS idx_eudr_declaracion_lote_lote
  ON eudr_declaracion_lote (lote_id);

-- ---------------------------------------------------------------- cobertura
-- Vista de avance por organización. Es la que contesta "¿cuánto falta para que
-- esta organización pueda declarar?" sin tener que escribir el GROUP BY cada vez.
-- Las métricas de parcela (parcelas, cumplimiento, área) se agregan ANTES de
-- unir con lotes/declaraciones: una parcela puede alimentar varios lotes, y un
-- lote puede respaldar varias declaraciones, así que unir primero y agregar
-- después duplicaría cada parcela una vez por cada lote/declaración que toque.
CREATE OR REPLACE VIEW v_eudr_cobertura_org AS
WITH parcelas_por_org AS (
  SELECT
    ruc,
    COUNT(*)                                       AS parcelas,
    COUNT(*) FILTER (WHERE cumple_geolocalizacion_eudr) AS parcelas_cumplen_geo,
    SUM(area_ha)                                   AS area_total_ha
  FROM eudr_parcela
  GROUP BY ruc
),
lotes_por_org AS (
  SELECT p.ruc, COUNT(DISTINCT l.lote_id) AS lotes
  FROM eudr_parcela p
  JOIN eudr_lote_parcela lp ON lp.parcela_id = p.parcela_id
  JOIN eudr_lote l          ON l.lote_id = lp.lote_id
  GROUP BY p.ruc
),
declaraciones_por_org AS (
  SELECT p.ruc, COUNT(DISTINCT e.declaracion_id) AS declaraciones
  FROM eudr_parcela p
  JOIN eudr_lote_parcela lp     ON lp.parcela_id = p.parcela_id
  JOIN eudr_lote l              ON l.lote_id = lp.lote_id
  JOIN eudr_declaracion_lote dl ON dl.lote_id = l.lote_id
  JOIN eudr_declaracion e       ON e.declaracion_id = dl.declaracion_id
  GROUP BY p.ruc
)
SELECT
  ppo.ruc,
  ppo.parcelas,
  ppo.parcelas_cumplen_geo,
  ROUND(100.0 * ppo.parcelas_cumplen_geo / NULLIF(ppo.parcelas, 0), 1)
                                     AS pct_parcelas_cumplen_geo,
  ppo.area_total_ha,
  COALESCE(lpo.lotes, 0)             AS lotes,
  COALESCE(dpo.declaraciones, 0)     AS declaraciones
FROM parcelas_por_org ppo
LEFT JOIN lotes_por_org lpo         ON lpo.ruc = ppo.ruc
LEFT JOIN declaraciones_por_org dpo ON dpo.ruc = ppo.ruc;

-- Trazabilidad completa: de la parcela al embarque, en una sola fila por parcela.
-- Sirve para responder "¿de qué parcelas salió este contenedor?" y "¿a dónde
-- fue a parar el café de esta parcela?", que son las dos preguntas de una
-- auditoría EUDR.
CREATE OR REPLACE VIEW v_eudr_trazabilidad AS
SELECT
  p.ruc,
  p.codigo_parcela,
  p.cultivo,
  p.area_ha,
  p.tipo_geometria,
  p.cumple_geolocalizacion_eudr,
  l.codigo_lote,
  l.campania,
  le.anio,
  le.aduana_codigo,
  le.dua_numero,
  d.referencia_dds,
  d.estado        AS estado_dds,
  d.pais_destino
FROM eudr_parcela p
JOIN eudr_lote_parcela lp   ON lp.parcela_id = p.parcela_id
JOIN eudr_lote l            ON l.lote_id = lp.lote_id
LEFT JOIN eudr_lote_embarque le ON le.lote_id = l.lote_id
LEFT JOIN eudr_declaracion_lote dl ON dl.lote_id = l.lote_id
LEFT JOIN eudr_declaracion d  ON d.declaracion_id = dl.declaracion_id;
