-- Matriculación y Trayectoria Estudiantil 2021-2024 (SIAGIE/MINEDU, Unidad de Estadística),
-- confirmado en vivo 2026-09-21. Ver docs/data-contracts/minedu-siagie-trayectoria.md.
--
-- Fuente: 4 CSVs anuales (~57MB c/u, ~2M filas totales), agregados por servicio educativo
-- (código modular + anexo) -- NO hay dato de alumno individual, sin PII de estudiantes.
--
-- CLAVE NATURAL REAL: (anio, cod_mod, anexo, id_nivel, edad, tipo_disca_integrada) -- verificado
-- en vivo: el mismo cod_mod/anexo/nivel/edad puede repetirse varias veces cuando hay estudiantes
-- con distinto tipo de discapacidad integrada (ej. una fila sin discapacidad y otra fila aparte
-- para "TEA" a la misma edad). `tipo_disca_integrada` se normaliza a '' (no NULL) cuando la
-- fuente lo trae vacío, para que el UNIQUE constraint funcione de forma predecible.
--
-- `id_nivel`/`edad` son NOT NULL a propósito (hallazgo real de CodeRabbit en PR #178): Postgres
-- trata NULL como siempre distinto dentro de un UNIQUE constraint, así que si cualquiera de los
-- dos pudiera ser NULL, dos filas "iguales" con esos campos vacíos no colisionarían -- el UPSERT
-- de reingestas dejaría de detectar duplicados reales. El normalizador rechaza (no persiste con
-- NULL) cualquier fila sin `id_nivel`/`Edad` -- solo 1 de 535,137 filas del CSV 2024 real carece
-- de `Edad`, pérdida insignificante frente a la garantía de integridad.
--
-- DESVÍO DE ESQUEMA ENTRE AÑOS (hallazgo real, no se oculta): 2021 y 2022 traen la columna
-- `PromocionGuiada`; 2023 y 2024 la reemplazan por `Desaprobado` -- terminología/metodología
-- distinta entre cortes, no un error de ingesta. Se guardan ambas columnas, nullable: cada fila
-- solo trae una de las dos según el año de origen.

CREATE TABLE IF NOT EXISTS raw_siagie_batches (
  id            BIGSERIAL PRIMARY KEY,
  anio          INTEGER NOT NULL,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (anio)
);

CREATE TABLE IF NOT EXISTS siagie_trayectoria (
  id                    BIGSERIAL PRIMARY KEY,
  anio                  INTEGER NOT NULL,
  cod_mod               TEXT NOT NULL,
  anexo                 TEXT NOT NULL,
  nombre                TEXT,
  gestion               TEXT,
  id_nivel              TEXT NOT NULL,
  dsc_nivel             TEXT,
  edad                  INTEGER NOT NULL,
  tipo_disca_integrada  TEXT NOT NULL DEFAULT '',
  total_estudiantes     INTEGER NOT NULL DEFAULT 0,
  discapacidad          INTEGER NOT NULL DEFAULT 0,
  mujer                 INTEGER NOT NULL DEFAULT 0,
  hombre                INTEGER NOT NULL DEFAULT 0,
  venezolanos           INTEGER NOT NULL DEFAULT 0,
  peruanos              INTEGER NOT NULL DEFAULT 0,
  extranjeros           INTEGER NOT NULL DEFAULT 0,
  dni_validado          INTEGER NOT NULL DEFAULT 0,
  dni_sin_validar       INTEGER NOT NULL DEFAULT 0,
  no_dni                INTEGER NOT NULL DEFAULT 0,
  aprobado              INTEGER NOT NULL DEFAULT 0,
  desaprobado           INTEGER,
  promocion_guiada      INTEGER,
  retirado              INTEGER NOT NULL DEFAULT 0,
  fallecido             INTEGER NOT NULL DEFAULT 0,
  requiere_recuperacion INTEGER NOT NULL DEFAULT 0,
  matriculado           INTEGER NOT NULL DEFAULT 0,
  posterga_evaluacion   INTEGER NOT NULL DEFAULT 0,
  tot_atraso            INTEGER NOT NULL DEFAULT 0,
  source_batch_id       BIGINT NOT NULL REFERENCES raw_siagie_batches(id),
  UNIQUE (anio, cod_mod, anexo, id_nivel, edad, tipo_disca_integrada)
);

CREATE TABLE IF NOT EXISTS siagie_trayectoria_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_siagie_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_siagie_trayectoria_cod_mod ON siagie_trayectoria (cod_mod, anexo);
CREATE INDEX IF NOT EXISTS idx_siagie_trayectoria_anio ON siagie_trayectoria (anio);
