-- Dos hallazgos de una investigación en vivo (2026-09-06) sobre el archivo
-- fuente del MEF (`DETALLE_INVERSIONES.csv`) y su diccionario oficial:
--
-- 1. El CSV activo trae `NUM_HABITANTES_BENEF`, `AVANCE_EJECUCION` y
--    `FEC_FIN_EJECUCION` por CUI — el conector nunca los leía. Son más
--    autoritativos que cualquier cifra de prensa citada a mano por proyecto.
-- 2. El MEF publica un dataset separado, `inversiones-desactivadas`
--    (INVERSIONES_DESACTIVADAS.csv, ~280MB), con las inversiones que el
--    Banco de Inversiones desactivó — incluye el supuesto oficial "el
--    proyecto de inversión ... no obtuvo la declaratoria de viabilidad"
--    (Anexo de la RD N° 001-2019-EF/63.01, "Criterios para la desactivación
--    de inversiones en el Banco de Inversiones", jul. 2021, num. 3.1.a).
--    `radar-inversiones` nunca lo había ingerido — hasta ahora Rastro solo
--    veía la mitad activa del Banco de Inversiones.

-- `AVANCE_EJECUCION` está documentado en el diccionario oficial del MEF como
-- "Porcentaje de avance de ejecución general de la inversión", pero una
-- muestra en vivo (2026-09-06, ~19,167 filas) encontró valores hasta
-- 32,995,022.75 — muy por fuera de un rango 0-100. No se asume el rango
-- documentado: se guarda tal cual viene, con precisión amplia, y no se
-- interpreta como porcentaje en las respuestas de la API.
ALTER TABLE investments
  ADD COLUMN IF NOT EXISTS num_habitantes_benef INTEGER,
  ADD COLUMN IF NOT EXISTS avance_ejecucion NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS fecha_fin_ejecucion DATE;

-- Mismo patrón de lake de evidencia que `raw_investment_batches` — un lote
-- por corrida (rango de bytes), nunca se sobreescribe.
CREATE TABLE IF NOT EXISTS raw_investment_deactivated_batches (
  id            BIGSERIAL PRIMARY KEY,
  query         TEXT NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  payload       JSONB NOT NULL
);

-- Mismo shape que `investments` (más `num_habitantes_benef`, ya presente en
-- ambos archivos fuente) — sin campo de "motivo de desactivación": el CSV
-- del MEF no publica un código de motivo por fila, solo el `ESTADO`
-- resultante (ej. "DESACTIVADO PERMANENTE"). Los supuestos del Anexo
-- RD N°001-2019-EF/63.01 explican por qué se desactiva una inversión en
-- general, pero no se puede atribuir un supuesto específico a una fila sin
-- inferencia — no se hace esa inferencia.
CREATE TABLE IF NOT EXISTS investments_deactivated (
  cui                   TEXT PRIMARY KEY,
  codigo_snip           TEXT,
  nombre                TEXT NOT NULL,
  sec_ejec              TEXT,
  nombre_uep            TEXT,
  entidad               TEXT,
  sector                TEXT,
  nivel                 TEXT,
  estado                TEXT,
  situacion             TEXT,
  ubigeo                TEXT,
  departamento          TEXT,
  provincia             TEXT,
  distrito              TEXT,
  monto_viable          NUMERIC(18, 2),
  costo_actualizado     NUMERIC(18, 2),
  funcion               TEXT,
  tipo_inversion        TEXT,
  fecha_registro        DATE,
  fecha_viabilidad      DATE,
  num_habitantes_benef  INTEGER,
  source_batch_id       BIGINT NOT NULL REFERENCES raw_investment_deactivated_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_investments_deactivated_departamento
  ON investments_deactivated (departamento) WHERE departamento IS NOT NULL;

CREATE TABLE IF NOT EXISTS investments_deactivated_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_investment_deactivated_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
