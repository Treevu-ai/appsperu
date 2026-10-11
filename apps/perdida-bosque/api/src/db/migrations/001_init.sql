-- Pérdida de bosque anual (Geobosques, MINAM). Fuente: endpoint real de la
-- plataforma (POST /geobosque/controller/consulta.php, con body
-- `datos={"nc":<nivel>,"ub":<ubigeo>}`), verificado en vivo 2026-10-11 por
-- inspección directa del JS del visor (la "documentación" pública del API
-- no correspondía a ningún endpoint real).
--
-- nivel "00" = nacional (ubigeo "null"), "01" = departamento (ubigeo de 2
-- dígitos). Provincia ("02") y distrito ("03") quedan fuera de esta primera
-- ingesta: son cientos/miles de llamadas, no cabían en el alcance de hoy.

CREATE TABLE IF NOT EXISTS raw_geobosques_batches (
  id            BIGSERIAL PRIMARY KEY,
  nivel         TEXT NOT NULL,
  ubigeo        TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS perdida_bosque_anual (
  id               BIGSERIAL PRIMARY KEY,
  nivel            TEXT NOT NULL CHECK (nivel IN ('00', '01')),
  ubigeo           TEXT NOT NULL,
  anio             INTEGER NOT NULL CHECK (anio >= 2001),
  perdida_ha       NUMERIC,
  rango1_ha        NUMERIC,
  rango2_ha        NUMERIC,
  rango3_ha        NUMERIC,
  rango4_ha        NUMERIC,
  rango5_ha        NUMERIC,
  tipo_bosque      TEXT,
  source_batch_id  BIGINT NOT NULL REFERENCES raw_geobosques_batches(id),
  UNIQUE (nivel, ubigeo, anio)
);

CREATE INDEX IF NOT EXISTS idx_perdida_bosque_ubigeo ON perdida_bosque_anual (ubigeo);
CREATE INDEX IF NOT EXISTS idx_perdida_bosque_anio ON perdida_bosque_anual (anio);

-- Pérdida acumulada después del corte EUDR (art. 10, Reglamento UE 2023/1115:
-- no se acepta producto de parcelas deforestadas después del 2020-12-31). Por
-- ahora solo tiene sentido a nivel departamento (nivel "01"); cuando se
-- ingiera distrito, esta vista sigue funcionando igual, solo con más filas.
CREATE OR REPLACE VIEW v_perdida_bosque_post_corte_eudr AS
SELECT
  ubigeo,
  nivel,
  SUM(perdida_ha) AS perdida_ha_post_corte,
  COUNT(*) FILTER (WHERE perdida_ha > 0) AS anios_con_perdida
FROM perdida_bosque_anual
WHERE anio > 2020
GROUP BY ubigeo, nivel;
