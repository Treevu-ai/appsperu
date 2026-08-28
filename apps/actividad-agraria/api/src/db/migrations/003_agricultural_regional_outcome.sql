-- Resultado agropecuario regional (piloto SIEA + futuros CSV MIDAGRI).
-- Distinto de insumos (jornal/tractor/yunta): métricas de productividad/VBP observadas.
CREATE TABLE IF NOT EXISTS agricultural_regional_outcome (
  id              BIGSERIAL PRIMARY KEY,
  departamento    TEXT NOT NULL,
  anio            INTEGER NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  metric_key      TEXT NOT NULL,
  metric_label    TEXT NOT NULL,
  valor_numeric   NUMERIC(18,4),
  valor_text      TEXT,
  unidad          TEXT NOT NULL,
  source_url      TEXT NOT NULL,
  source_label    TEXT NOT NULL,
  ingestion_mode  TEXT NOT NULL CHECK (ingestion_mode IN ('CSV_AUTOMATIZADO', 'MANUAL_PILOT')),
  limitation      TEXT NOT NULL,
  observed_at     DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (departamento, anio, metric_key),
  CHECK (valor_numeric IS NOT NULL OR valor_text IS NOT NULL)
);

-- Piloto La Libertad 2024 — valores observados en SIEA Power BI (Perfil Productivo Departamental),
-- documentados en docs/data-contracts/midagri-estadistica-agraria.md (2026-08-21).
-- No son descargables vía CSV público equivalente; se materializan como MANUAL_PILOT trazable.
INSERT INTO agricultural_regional_outcome (
  departamento, anio, metric_key, metric_label, valor_numeric, unidad,
  source_url, source_label, ingestion_mode, limitation, observed_at
) VALUES
  ('LA LIBERTAD', 2024, 'vbp_agropecuario_var_interanual_pct',
   'Variación interanual VBP agropecuario', 6.2, 'porcentaje',
   'https://siea.midagri.gob.pe/herramientas/estadistica-agropecuarias',
   'SIEA-MIDAGRI Perfil Productivo Departamental (Power BI)', 'MANUAL_PILOT',
   'Serie visual SIEA sin exportación CSV equivalente en PNDA; no sustituye estadística oficial detallada por cultivo.',
   DATE '2026-08-21'),
  ('LA LIBERTAD', 2024, 'vbp_agricola_var_interanual_pct',
   'Variación interanual VBP agrícola', 10.4, 'porcentaje',
   'https://siea.midagri.gob.pe/herramientas/estadistica-agropecuarias',
   'SIEA-MIDAGRI Perfil Productivo Departamental (Power BI)', 'MANUAL_PILOT',
   'Misma limitación que vbp_agropecuario_var_interanual_pct.',
   DATE '2026-08-21'),
  ('LA LIBERTAD', 2024, 'vbp_pecuario_var_interanual_pct',
   'Variación interanual VBP pecuario', 0, 'porcentaje',
   'https://siea.midagri.gob.pe/herramientas/estadistica-agropecuarias',
   'SIEA-MIDAGRI Perfil Productivo Departamental (Power BI)', 'MANUAL_PILOT',
   'Misma limitación que vbp_agropecuario_var_interanual_pct.',
   DATE '2026-08-21'),
  ('LA LIBERTAD', 2024, 'superficie_agricola_ha',
   'Superficie agrícola departamental', 2524943, 'hectáreas',
   'https://siea.midagri.gob.pe/herramientas/estadistica-agropecuarias',
   'SIEA-MIDAGRI Perfil Productivo Departamental (Power BI)', 'MANUAL_PILOT',
   'Cifra agregada departamental; no desagrega por provincia/distrito.',
   DATE '2026-08-21'),
  ('LA LIBERTAD', 2024, 'productores_agropecuarios_count',
   'Productores agropecuarios (aprox.)', 116000, 'personas',
   'https://siea.midagri.gob.pe/herramientas/estadistica-agropecuarias',
   'SIEA-MIDAGRI Perfil Productivo Departamental (Power BI)', 'MANUAL_PILOT',
   'Conteo aproximado publicado en visual SIEA; vintage no declarado en exportación.',
   DATE '2026-08-21')
ON CONFLICT (departamento, anio, metric_key) DO NOTHING;
