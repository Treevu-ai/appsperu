-- Metadata de los documentos fuente. La serie de pasivos contingentes
-- (mmm_pasivos_contingentes) NO se siembra aquí — se carga corriendo el
-- conector real (`npm run ingest:pdf -- <ruta-al-pdf>`) contra los dos PDFs
-- ya verificados. Este archivo solo registra qué documentos existen y su
-- estado de acceso.

INSERT INTO mmm_ediciones (edicion, tipo_documento, fecha_publicacion, fuente_url, fecha_verificacion, estado, notas) VALUES
  ('MMM_2024_2027', 'MMM', '27-ago-2023',
   'https://www.mef.gob.pe/contenidos/pol_econ/marco_macro/MMM_2024_2027.pdf',
   '2026-09-13', 'verificado',
   'Contiene la tabla "Tipo de contingencia fiscal explícita" con serie 2020-2022 y detalle de metodología (Recuadro con notas al pie 321/366-370). Texto extraído limpio con pdf-parse (262 páginas, ~869k caracteres).'),
  ('IAPM_2025_2028', 'IAPM', 'abril de 2025',
   'https://www.mef.gob.pe/contenidos/pol_econ/marco_macro/IAPM_2025-2028.pdf',
   '2026-09-13', 'verificado',
   'Recuadro N.° 6 "Pasivos Contingentes Explícitos del Sector Público No Financiero" con tabla consolidada 2020-2023, la serie más completa disponible. Texto extraído limpio con pdf-parse (144 páginas, ~491k caracteres).'),
  ('MMM_2027_2030', 'MMM', 'ago-2026 (aprobado por Consejo de Ministros)',
   'https://www.mef.gob.pe/es/marco-macroeconomico/marco-macroeconomico-multianualmmm',
   '2026-09-13', 'no_localizado',
   'Edición vigente — no se logró descargar el PDF de forma automatizada: mef.gob.pe/contenidos/.../MMM_2027_2030.pdf da 404 (nombre de archivo real distinto al patrón de ediciones anteriores), el mirror en bcrp.gob.pe está bloqueado por WAF Incapsula (mismo bloqueo que bcrp-la-libertad, ver ADR-0014), y la página de publicaciones en gob.pe devuelve 418 a herramientas automatizadas. Pendiente: alguien con navegador real descarga el PDF y corre `npm run ingest:pdf -- <ruta>`. Corrección importante: una cifra de 2.15%/1.58% PBI que se había atribuido a esta edición en una versión anterior de este tracker en realidad corresponde al cierre 2022 (ver MMM_2024_2027) — no se ha verificado ningún dato propio de esta edición todavía.');

INSERT INTO mmm_serie_historica_secundaria (anio, pct_pbi, monto_usd, n_casos, fuente_url, notas) VALUES
  (2014, 0.80, NULL, NULL,
   'https://larepublica.pe/economia/2025/09/26/ex-mef-luis-miguel-castilla-advierte-que-controversias-internacionales-ponen-en-riesgo-hasta-23-del-pbi-peruano-hnews-1053416',
   'Punto de partida citado por Castilla para mostrar la tendencia de 10 años. Sin dato de fuente primaria (MMM) para contrastar — los documentos verificados en esta app solo cubren 2020 en adelante.'),
  (2021, 3.20, 'US$ 7,200 millones', 27,
   'https://larepublica.pe/economia/2025/09/26/ex-mef-luis-miguel-castilla-advierte-que-controversias-internacionales-ponen-en-riesgo-hasta-23-del-pbi-peruano-hnews-1053416',
   'Consistente con la fuente primaria dentro de un margen de redondeo razonable: mmm_pasivos_contingentes reporta 3.16% PBI para ISDS en 2021 (MMM_2024_2027).'),
  (2024, 2.30, 'US$ 6,700 millones', 24,
   'https://larepublica.pe/economia/2025/09/26/ex-mef-luis-miguel-castilla-advierte-que-controversias-internacionales-ponen-en-riesgo-hasta-23-del-pbi-peruano-hnews-1053416',
   'Sector minero-energético concentra 11 de los 24 casos (46%), según la misma fuente. Sin dato de fuente primaria para 2024 todavía — ningún documento verificado en esta app llega a ese año de cierre.');
