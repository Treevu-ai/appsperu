-- Esquema para el tracker de pasivos contingentes explícitos del MEF
-- (Marco Macroeconómico Multianual, sección "controversias internacionales
-- de inversión" / ISDS vs. contingencias de APP). Ver docs/adr/0023 para la
-- decisión de arrancar con semilla manual en vez de un conector de descarga.

CREATE TABLE mmm_ediciones (
  edicion TEXT PRIMARY KEY,
  fecha_publicacion TEXT NOT NULL,
  fuente_url TEXT NOT NULL,
  fuente_secundaria_url TEXT,
  fecha_verificacion DATE NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('verificado', 'no_localizado')),
  notas TEXT
);

-- Una fila por categoría de pasivo contingente dentro de cada edición.
-- pct_pbi es nullable a propósito: una categoría "no_localizado" se registra
-- con pct_pbi = NULL, nunca con un valor supuesto.
CREATE TABLE mmm_pasivos_contingentes (
  id SERIAL PRIMARY KEY,
  edicion TEXT NOT NULL REFERENCES mmm_ediciones (edicion),
  categoria TEXT NOT NULL CHECK (categoria IN ('isds', 'app', 'judicial_administrativo', 'total')),
  pct_pbi NUMERIC(5, 2),
  notas TEXT,
  UNIQUE (edicion, categoria)
);

-- Serie histórica de fuente secundaria (declaración pública de Luis Miguel
-- Castilla, ex-MEF, PERUMIN 37, sept-2025) — metodología distinta a la
-- categoría "isds" de mmm_pasivos_contingentes, tabla separada a propósito
-- para no mezclarlas.
CREATE TABLE mmm_serie_historica_secundaria (
  anio INTEGER PRIMARY KEY,
  pct_pbi NUMERIC(5, 2) NOT NULL,
  monto_usd TEXT,
  n_casos INTEGER,
  fuente_url TEXT NOT NULL,
  notas TEXT
);
