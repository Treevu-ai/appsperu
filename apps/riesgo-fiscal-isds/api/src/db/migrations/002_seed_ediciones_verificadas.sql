-- Semilla manual revisada — mismos valores ya publicados en el tracker
-- prototipo (clasificado/archivos_conflicto_peru/tracker_mmm_pasivos_contingentes.html)
-- y verificados por búsqueda web el 13-sep-2026. Cada fila cita su fuente;
-- ninguna cifra faltante se completó por interpolación.

INSERT INTO mmm_ediciones (edicion, fecha_publicacion, fuente_url, fuente_secundaria_url, fecha_verificacion, estado, notas) VALUES
  ('2025-2028', '23-ago-2024',
   'https://www.mef.gob.pe/contenidos/pol_econ/marco_macro/MMM_2025_2028.pdf',
   NULL, '2026-09-13', 'verificado',
   'Desglose completo: 6.6% judicial/administrativo/arbitraje nacional + 2.9% ISDS + 1.4% APP = 10.9% PBI de exposición máxima a pasivos contingentes explícitos.'),
  ('2026-2029', '27-ago-2025',
   'https://www.mef.gob.pe/es/marco-macroeconomico/marco-macroeconomico-multianualmmm',
   'https://larepublica.pe/economia/2025/08/28/marco-macroeconomico-multianual-20262029-peru-proyecta-crecimiento-de-35-en-2025-y-reduccion-del-deficit-fiscal-a-22-hnews-1150492',
   '2026-09-13', 'no_localizado',
   'Fuentes secundarias contradictorias para esta edición (3.01% PBI "en valor presente" vs. 9.28% PBI de "exposición máxima" ~US$30 mil millones, sin desglose claro entre ISDS y APP). No se registra un pct_pbi de categoría hasta confirmar contra el PDF oficial.'),
  ('2027-2030', 'ago-2026 (aprobado por Consejo de Ministros)',
   'https://www.mef.gob.pe/es/marco-macroeconomico/marco-macroeconomico-multianualmmm',
   'https://gestion.pe/economia/este-es-el-impacto-economico-que-el-mef-calcula-en-caso-peru-pierda-sus-arbitrajes-y-casos-activos-en-el-ciadi-noticia/',
   '2026-09-13', 'verificado',
   'Cifra ancla del proyecto: 2.15% PBI ISDS vs. 1.58% PBI APP, ya citada en informe_isds_peru.tex y modulo_riesgo_institucional.md (proyecto clasificado). Falta localizar la categoría judicial/administrativo equivalente al 6.6% de la edición 2025-2028.');

INSERT INTO mmm_pasivos_contingentes (edicion, categoria, pct_pbi, notas) VALUES
  ('2025-2028', 'judicial_administrativo', 6.6, 'Procesos judiciales, administrativos y arbitrajes nacionales.'),
  ('2025-2028', 'isds', 2.9, 'Controversias internacionales en materia de inversión.'),
  ('2025-2028', 'app', 1.4, 'Contingencias explícitas de Asociaciones Público-Privadas.'),
  ('2025-2028', 'total', 10.9, 'Suma de las tres categorías anteriores, reportada como exposición máxima total del SPNF.'),
  ('2026-2029', 'judicial_administrativo', NULL, 'No localizado — ver notas en mmm_ediciones.'),
  ('2026-2029', 'isds', NULL, 'No localizado — ver notas en mmm_ediciones.'),
  ('2026-2029', 'app', NULL, 'No localizado — ver notas en mmm_ediciones.'),
  ('2026-2029', 'total', NULL, 'No localizado — ver notas en mmm_ediciones.'),
  ('2027-2030', 'judicial_administrativo', NULL, 'No localizado en la cobertura verificada.'),
  ('2027-2030', 'isds', 2.15, 'Cifra ancla del proyecto.'),
  ('2027-2030', 'app', 1.58, NULL),
  ('2027-2030', 'total', NULL, 'No localizado — depende de la categoría judicial/administrativo, aún no confirmada para esta edición.');

INSERT INTO mmm_serie_historica_secundaria (anio, pct_pbi, monto_usd, n_casos, fuente_url, notas) VALUES
  (2014, 0.80, NULL, NULL,
   'https://larepublica.pe/economia/2025/09/26/ex-mef-luis-miguel-castilla-advierte-que-controversias-internacionales-ponen-en-riesgo-hasta-23-del-pbi-peruano-hnews-1053416',
   'Punto de partida citado por Castilla para mostrar la tendencia de 10 años.'),
  (2021, 3.20, 'US$ 7,200 millones', 27,
   'https://larepublica.pe/economia/2025/09/26/ex-mef-luis-miguel-castilla-advierte-que-controversias-internacionales-ponen-en-riesgo-hasta-23-del-pbi-peruano-hnews-1053416',
   'Pico histórico citado: máximo número de demandas CIADI registradas en un año.'),
  (2024, 2.30, 'US$ 6,700 millones', 24,
   'https://larepublica.pe/economia/2025/09/26/ex-mef-luis-miguel-castilla-advierte-que-controversias-internacionales-ponen-en-riesgo-hasta-23-del-pbi-peruano-hnews-1053416',
   'Sector minero-energético concentra 11 de los 24 casos (46%), según la misma fuente.');
