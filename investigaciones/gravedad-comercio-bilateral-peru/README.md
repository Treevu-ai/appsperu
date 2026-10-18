# Gravedad del comercio bilateral peruano, 2015-2024

Modelo de gravedad PPML sobre las exportaciones bilaterales de Perú hacia 224
socios comerciales (2015-2024), construido sobre las tablas de
`bcrp-comercio-exterior` en Neon (`baci_flujos`, `baci_paises`,
`wdi_indicadores`, `geodist_diadas`, `gravity_acuerdos`).

Documenta por qué una estimación "de manual" sobre el total exportado da el
coeficiente de distancia con signo equivocado —oro refinado en Suiza,
concentrado de cobre fundido en Namibia, reexportación vía Países Bajos y
Panamá— y cómo corregirlo excluyendo, de forma declarada a priori (no por
cherry-picking), los capítulos de commodities (HS26, HS71, HS27) y la lista
estándar de hubs de reexportación de la literatura de comercio.

## Contenido

- `data/raw/panel_bilateral_peru_2015_2024.json` — extracción cruda de Neon
  (224 socios × 10 años, con ceros reales).
- `data/procesado/panel_final_estimacion.csv` — panel final de la
  especificación publicable (1,847 filas, 181 socios).
- `data/procesado/tabla_comparativa_especificaciones.csv` — las 3
  especificaciones (cruda, sin commodities, final) con todos los coeficientes.
- `scripts/estimar_gravedad.py` — script que reproduce las 3 especificaciones
  de punta a punta. `python scripts/estimar_gravedad.py`.
- `notebook/gravedad_comercio_peru.ipynb` — mismo recorrido narrado paso a
  paso (diagnóstico de outliers, filtros, especificación final), ejecutado
  con outputs reales.
- `paper/Paper-Gravedad-Comercio-Bilateral-Peru-2015-2024.{md,docx}` — paper
  completo (resumen, método, resultados, discusión, limitaciones,
  referencias).

## Resultado final

PPML, exportaciones no-commodity, sin hubs de reexportación (n=1,847,
pseudo-R²=0.93):

| Variable | Coeficiente | p-valor |
|---|---|---|
| log(PBI del socio) | +1.04 | <0.001 |
| log(distancia) | −0.58 | 0.071 |
| Frontera común | +1.02 | 0.009 |
| Idioma oficial común | +1.12 | 0.017 |
| Ex-colonia | +0.23 | 0.61 (ns) |
| Acuerdo comercial | −0.05 | 0.78 (ns) |

Ver el paper para la discusión completa, incluyendo por qué el efecto de los
acuerdos comerciales se disuelve una vez removidos los commodities.
