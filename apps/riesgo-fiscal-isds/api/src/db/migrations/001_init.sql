-- Esquema para el tracker de pasivos contingentes explícitos del MEF
-- (Marco Macroeconómico Multianual / Informe de Actualización de Proyecciones
-- Macroeconómicas). Ver docs/adr/0023 — incluye una corrección posterior a la
-- primera versión de esta migración: el dato real está organizado por AÑO DE
-- CIERRE (una serie continua que cada documento nuevo extiende/revisa), no
-- por "edición del MMM" como periodo — el diseño original de esta tabla
-- modelaba mal esa estructura y quedó corregido antes de que nadie más
-- dependiera de él (nunca se desplegó fuera de un contenedor de prueba local).

-- Documentos fuente (MMM o IAPM) que efectivamente se leyeron y verificaron.
CREATE TABLE mmm_ediciones (
  edicion TEXT PRIMARY KEY,
  tipo_documento TEXT NOT NULL CHECK (tipo_documento IN ('MMM', 'IAPM')),
  fecha_publicacion TEXT NOT NULL,
  fuente_url TEXT NOT NULL,
  fecha_verificacion DATE NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('verificado', 'no_localizado')),
  notas TEXT
);

-- Una fila por (año de cierre, categoría). `edicion_fuente` documenta de qué
-- documento salió el número — cuando dos documentos reportan el mismo año
-- (ej. 2022 aparece tanto en MMM 2024-2027 como en IAPM 2025-2028), se
-- conserva la fila del documento más reciente/completo y se anota la
-- corroboración en `notas`, no se duplica la fila.
-- pct_pbi es nullable a propósito: nunca se completa con un valor supuesto.
CREATE TABLE mmm_pasivos_contingentes (
  id SERIAL PRIMARY KEY,
  anio_cierre INTEGER NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('isds', 'app', 'judicial_administrativo', 'total')),
  pct_pbi NUMERIC(5, 2),
  edicion_fuente TEXT NOT NULL REFERENCES mmm_ediciones (edicion),
  notas TEXT,
  UNIQUE (anio_cierre, categoria)
);

-- Lotes de ingesta del conector pdf-parse (npm run ingest:pdf -- <ruta>),
-- mismo patrón que raw_bcrp_ll_batches en bcrp-la-libertad: descarga manual,
-- checksum del texto extraído, no de un payload de red.
CREATE TABLE raw_mmm_batches (
  id SERIAL PRIMARY KEY,
  edicion TEXT NOT NULL REFERENCES mmm_ediciones (edicion),
  file_name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  filas_insertadas INTEGER NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Serie histórica de fuente secundaria (declaración pública de Luis Miguel
-- Castilla, ex-MEF, PERUMIN 37, sept-2025) — metodología no confirmada como
-- idéntica a la categoría "isds" de mmm_pasivos_contingentes (aunque el dato
-- de 2021, 3.2% vs. 3.16% verificado en la fuente primaria, es consistente
-- dentro de un margen de redondeo razonable). Tabla separada a propósito.
CREATE TABLE mmm_serie_historica_secundaria (
  anio INTEGER PRIMARY KEY,
  pct_pbi NUMERIC(5, 2) NOT NULL,
  monto_usd TEXT,
  n_casos INTEGER,
  fuente_url TEXT NOT NULL,
  notas TEXT
);
