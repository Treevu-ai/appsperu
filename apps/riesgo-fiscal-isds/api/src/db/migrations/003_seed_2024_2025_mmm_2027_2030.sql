-- Semilla manual revisada: años 2024 y 2025 leídos directamente del PDF de
-- MMM_2027_2030.pdf (no vía conector automatizado — esa edición usa el
-- formato de tabla "año actual/previo + Contingencia Esperada + Diferencia",
-- que parsePasivosContingentesTable descarta deliberadamente por ambiguo,
-- ver docs/adr/0023). A diferencia de la primera versión de este proyecto
-- (que citaba prensa sin leer el PDF), esta cifra se leyó directamente del
-- documento oficial, página 208-209 de 295:
--
--   Contingencia Esperada / Diferencias
--   2024    2025    2026    2025/2024
--   Total                                    9,17    10,70   0,89    1,53
--   1. Procesos Judiciales, admin. y arbitrajes  5,85    5,59    0,86    -0,26
--   2. Controversias internacionales - CIADI     2,29    4,24    0,01    1,95
--   3. Contingencias explícitas APP              1,03    0,87    0,02    -0,16
--
-- Las columnas "2026" y "2025/2024" del PDF son "Contingencia Esperada" y
-- "Diferencia" respectivamente, NO años de cierre adicionales — no se cargan
-- como filas de mmm_pasivos_contingentes (esa tabla es estrictamente
-- anio_cierre -> pct_pbi de Exposición Máxima).

INSERT INTO mmm_pasivos_contingentes (anio_cierre, categoria, pct_pbi, edicion_fuente, notas) VALUES
  (2024, 'total', 9.17, 'MMM_2027_2030', 'Leído directamente del PDF, p. 208/295. Exposición Máxima (EM).'),
  (2024, 'judicial_administrativo', 5.85, 'MMM_2027_2030', 'Leído directamente del PDF, p. 208/295.'),
  (2024, 'isds', 2.29, 'MMM_2027_2030', 'Leído directamente del PDF, p. 208/295.'),
  (2024, 'app', 1.03, 'MMM_2027_2030', 'Leído directamente del PDF, p. 208/295.'),
  (2025, 'total', 10.70, 'MMM_2027_2030', 'Leído directamente del PDF, p. 208/295. Máximo de toda la serie 2020-2025.'),
  (2025, 'judicial_administrativo', 5.59, 'MMM_2027_2030', 'Leído directamente del PDF, p. 208/295.'),
  (2025, 'isds', 4.24, 'MMM_2027_2030', 'Leído directamente del PDF, p. 208/295. Máximo de ISDS en toda la serie 2020-2025 — casi el doble del 2.15% de 2022.'),
  (2025, 'app', 0.87, 'MMM_2027_2030', 'Leído directamente del PDF, p. 208/295.')
ON CONFLICT (anio_cierre, categoria) DO UPDATE SET
  pct_pbi = EXCLUDED.pct_pbi,
  edicion_fuente = EXCLUDED.edicion_fuente,
  notas = EXCLUDED.notas;

-- La edición ya existía en mmm_ediciones (migración 002) con estado
-- 'no_localizado' porque no se había podido descargar. Ahora sí se descargó
-- y se leyó — actualizar su estado y notas.
UPDATE mmm_ediciones SET
  estado = 'verificado',
  fecha_verificacion = CURRENT_DATE,
  notas = 'Descargado con navegador real (Claude in Chrome) el 13-sep-2026 — la descarga automatizada seguía bloqueada (404/WAF/418), pero un navegador real sí pasa el bloqueo. 295 páginas, 15,674,847 bytes. Tabla de pasivos contingentes en formato "año actual/previo + Contingencia Esperada + Diferencia" (no soportado por el conector automático) — años 2024/2025 cargados a mano, leídos directamente del PDF (no de prensa), ver notas por fila.'
WHERE edicion = 'MMM_2027_2030';
