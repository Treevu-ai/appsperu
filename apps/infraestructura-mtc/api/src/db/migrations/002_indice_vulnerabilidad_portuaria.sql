-- Índice de Vulnerabilidad Portuaria v1
-- Basado en inventario MTC 2025 (sin datos de volumen APN)

CREATE TABLE IF NOT EXISTS indice_vulnerabilidad_portuaria (
  id                      SERIAL PRIMARY KEY,
  codigo_puerto            TEXT NOT NULL,
  nombre_terminal          TEXT,
  id_departamento          TEXT,
  departamento             TEXT,
  ambito                   TEXT,
  alcance                  TEXT,
  estado_conservacion      TEXT,
  es_concesionado          BOOLEAN,
  tiene_geolocalizacion    BOOLEAN,
  score_vulnerabilidad    NUMERIC(5,2),
  componentes              JSONB,
  fuente_datos             TEXT DEFAULT 'MTC_2025',
  fecha_corte              DATE,
  calculado_en            DATE DEFAULT CURRENT_DATE,
  UNIQUE (codigo_puerto, fuente_datos)
);

CREATE INDEX IF NOT EXISTS idx_vuln_portuaria_score ON indice_vulnerabilidad_portuaria (score_vulnerabilidad DESC);
CREATE INDEX IF NOT EXISTS idx_vuln_portuaria_dpto ON indice_vulnerabilidad_portuaria (id_departamento);
CREATE INDEX IF NOT EXISTS idx_vuln_portuaria_ambito ON indice_vulnerabilidad_portuaria (ambito);
