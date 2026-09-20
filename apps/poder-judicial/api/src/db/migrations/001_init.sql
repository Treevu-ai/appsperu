-- Estadística jurisdiccional del Poder Judicial — procesos judiciales
-- principales a nivel nacional, agregados por año/mes/órgano jurisdiccional.
--
-- FUENTE (confirmado en vivo 2026-09-20): dataset publicado en
-- datosabiertos.gob.pe por el propio Poder Judicial — "Procesos judiciales
-- principales a nivel nacional, a partir del 2023". A diferencia de CEJ
-- (consulta de expedientes por navegador, protegida con Radware y desde
-- 2026 exige N° de expediente exacto para proteger datos personales de las
-- partes), este dataset es agregado/estadístico: NO hay expedientes
-- individuales ni nombres de partes, solo conteos por dependencia judicial.
-- Sin PII. Ver docs/data-contracts/poder-judicial-procesos-jurisdiccionales.md.
--
-- Descarga directa, sin auth: un único CSV plano (no requiere resolver vía
-- CKAN package_show — a diferencia del resto del catálogo que usa
-- @appsperu/ckan-client, este dataset expone un enlace de descarga estático
-- en la página del dataset, `/sites/default/files/<nombre>.csv`). Encoding
-- Latin-1 (confirmado: "Apurímac"/"Cañete"/"Extinción" llegan corruptos bajo
-- lectura UTF-8 ingenua).
--
-- CLAVE NATURAL verificada en vivo contra el CSV real (58,568 filas,
-- 2026-09-20): (anio, mes, codigo_dependencia, tipo_organo, espec_exp,
-- espec_dep, condicion) es única — 0 colisiones. `codigo_dependencia`
-- identifica 1:1 al órgano jurisdiccional (3,041 códigos distintos, cada uno
-- con un único nombre de `dependencia` en toda la muestra).
--
-- NOMBRES DE COLUMNAS: se preservan tal cual el CSV fuente (solo
-- minúsculas), sin reinterpretar su significado — el dataset no trae un
-- diccionario de variables publicado (a diferencia de otros datasets del
-- catálogo, ej. MINDEF); los nombres abreviados (PENDIENTET, INGRESOT_SIN,
-- RDEV_ANULADA, etc.) son los que usa el propio Poder Judicial en su reporte
-- de gestión, sin glosario público encontrado.
CREATE TABLE IF NOT EXISTS raw_poder_judicial_batches (
  id            BIGSERIAL PRIMARY KEY,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS procesos_judiciales_jurisdiccional (
  id                      BIGSERIAL PRIMARY KEY,
  anio                    INTEGER NOT NULL,
  mes                     TEXT NOT NULL,
  distrito_judicial       TEXT NOT NULL,
  provincia               TEXT,
  distrito                TEXT,
  codigo_dependencia      TEXT NOT NULL,
  dependencia             TEXT NOT NULL,
  estado                  TEXT NOT NULL,
  tipo_organo             TEXT NOT NULL,
  espec_exp               TEXT NOT NULL,
  espec_dep               TEXT NOT NULL,
  condicion               TEXT NOT NULL,
  -- Conteos de expedientes por etapa/resultado procesal (todos NOT NULL,
  -- default 0 -- el CSV fuente no trae vacíos en estas columnas).
  pendientet              INTEGER NOT NULL DEFAULT 0,
  pplazoimpug             INTEGER NOT NULL DEFAULT 0,
  pendientee              INTEGER NOT NULL DEFAULT 0,
  pendiente               INTEGER NOT NULL DEFAULT 0,
  improcedentei           INTEGER NOT NULL DEFAULT 0,
  nadmitido               INTEGER NOT NULL DEFAULT 0,
  ape_insinferior         INTEGER NOT NULL DEFAULT 0,
  ape_inssuperioranulada  INTEGER NOT NULL DEFAULT 0,
  ingresot_sin            INTEGER NOT NULL DEFAULT 0,
  deotradepent            INTEGER NOT NULL DEFAULT 0,
  ingresot_con            INTEGER NOT NULL DEFAULT 0,
  resconsentida           INTEGER NOT NULL DEFAULT 0,
  ape_confirmadai         INTEGER NOT NULL DEFAULT 0,
  ape_revocadai           INTEGER NOT NULL DEFAULT 0,
  ingresoe_sin            INTEGER NOT NULL DEFAULT 0,
  deotradepene            INTEGER NOT NULL DEFAULT 0,
  ingresoe_con            INTEGER NOT NULL DEFAULT 0,
  ingreso_sin             INTEGER NOT NULL DEFAULT 0,
  ingreso_con             INTEGER NOT NULL DEFAULT 0,
  improcedenter           INTEGER NOT NULL DEFAULT 0,
  sentencia               INTEGER NOT NULL DEFAULT 0,
  autodefinitivo          INTEGER NOT NULL DEFAULT 0,
  conciliado              INTEGER NOT NULL DEFAULT 0,
  informefinal            INTEGER NOT NULL DEFAULT 0,
  ape_confirmadar         INTEGER NOT NULL DEFAULT 0,
  ape_revocadar           INTEGER NOT NULL DEFAULT 0,
  ape_anuladar            INTEGER NOT NULL DEFAULT 0,
  ape_resuelta            INTEGER NOT NULL DEFAULT 0,
  resueltot               INTEGER NOT NULL DEFAULT 0,
  otrosegresost           INTEGER NOT NULL DEFAULT 0,
  resueltoe               INTEGER NOT NULL DEFAULT 0,
  otrosegresose           INTEGER NOT NULL DEFAULT 0,
  resuelto                INTEGER NOT NULL DEFAULT 0,
  confirmada_adef         INTEGER NOT NULL DEFAULT 0,
  revocada_adef           INTEGER NOT NULL DEFAULT 0,
  rdev_confirmada         INTEGER NOT NULL DEFAULT 0,
  rdev_anulada            INTEGER NOT NULL DEFAULT 0,
  rdev_revocada           INTEGER NOT NULL DEFAULT 0,
  pendientecalf           INTEGER NOT NULL DEFAULT 0,
  ingresocalf             INTEGER NOT NULL DEFAULT 0,
  resueltocalf            INTEGER NOT NULL DEFAULT 0,
  pendientecuad           INTEGER NOT NULL DEFAULT 0,
  ingresocuad             INTEGER NOT NULL DEFAULT 0,
  resueltocuad            INTEGER NOT NULL DEFAULT 0,
  pendienteexh            INTEGER NOT NULL DEFAULT 0,
  ingresoexh              INTEGER NOT NULL DEFAULT 0,
  resueltoexh             INTEGER NOT NULL DEFAULT 0,
  source_batch_id         BIGINT NOT NULL REFERENCES raw_poder_judicial_batches(id),
  UNIQUE (anio, mes, codigo_dependencia, tipo_organo, espec_exp, espec_dep, condicion)
);

CREATE INDEX IF NOT EXISTS idx_pj_jurisdiccional_distrito_judicial ON procesos_judiciales_jurisdiccional (distrito_judicial);
CREATE INDEX IF NOT EXISTS idx_pj_jurisdiccional_anio_mes ON procesos_judiciales_jurisdiccional (anio, mes);
CREATE INDEX IF NOT EXISTS idx_pj_jurisdiccional_codigo_dependencia ON procesos_judiciales_jurisdiccional (codigo_dependencia);

CREATE TABLE IF NOT EXISTS poder_judicial_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_poder_judicial_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
