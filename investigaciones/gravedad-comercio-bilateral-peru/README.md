# Por qué la distancia explica lo que Perú exporta pero no lo que importa

Modelo de gravedad PPML sobre el comercio bilateral de Perú (exportaciones
**e importaciones**, por separado) hacia 224 socios comerciales
(2015-2024), construido sobre las tablas de `bcrp-comercio-exterior` en
Neon (`baci_flujos`, `baci_paises`, `wdi_indicadores`, `geodist_diadas`,
`gravity_acuerdos`).

Documenta por qué una estimación "de manual" sobre el total exportado da el
coeficiente de distancia con signo equivocado —oro refinado en Suiza,
concentrado de cobre fundido en Namibia, reexportación vía Países Bajos y
Panamá— y cómo corregirlo excluyendo, de forma declarada a priori (no por
cherry-picking), los capítulos de commodities (HS26, HS71, HS27) y la lista
estándar de hubs de reexportación de la literatura de comercio. Repite el
mismo procedimiento del lado importador y encuentra una asimetría real: el
filtro que corrige las exportaciones **no** corrige las importaciones,
porque ahí no hay artefacto que corregir — China, Alemania, Japón y Corea
dominan genuinamente la canasta importadora peruana.

## Contenido

- `data/raw/panel_bilateral_peru_2015_2024.json` — extracción cruda de
  exportaciones (224 socios × 10 años, con ceros reales).
- `data/raw/panel_bilateral_peru_importaciones_2015_2024.json` — ídem,
  importaciones.
- `data/procesado/panel_final_estimacion_{exportaciones,importaciones}.csv`
  — paneles finales de cada especificación publicable.
- `data/procesado/tabla_comparativa_especificaciones.csv` — las 6
  especificaciones (3 exporta + 3 importa) con todos los coeficientes.
- `scripts/estimar_gravedad.py` — script que reproduce las 6
  especificaciones de punta a punta. `python scripts/estimar_gravedad.py`.
- `notebook/gravedad_comercio_peru.ipynb` — mismo recorrido narrado para
  ambos lados, ejecutado con outputs reales (18 celdas de código, 0 errores).
- `paper/Paper-Gravedad-Comercio-Bilateral-Peru-2015-2024.{md,docx}` — paper
  completo (resumen, método, resultados exportación e importación,
  discusión, limitaciones, referencias verificadas).
- `nota-ejecutiva.md` — resumen de una página en lenguaje llano.
- `referencias_verificadas.md` — verificación en vivo de las 4 citas
  académicas contra fuentes primarias.

## Resultado final

PPML, sin commodities (HS26/71/27), sin hubs de reexportación
(NLD/BEL/SGP/HKG/PAN/ARE), n=1,847, efectos fijos de año, errores
agrupados por socio:

| Variable | Exportaciones | Importaciones |
|---|---|---|
| log(PBI del socio) | +1.04 (p<0.001) | +1.19 (p<0.001) |
| log(distancia) | **−0.58** (p=0.071) | **+0.90** (p<0.001) |
| Frontera común | +1.02 (p=0.009) | +2.19 (p<0.001) |
| Idioma oficial común | +1.12 (p=0.017) | +2.64 (p<0.001) |
| Ex-colonia | +0.23 (ns) | −1.71 (p<0.001) |
| Acuerdo comercial | −0.05 (ns) | −0.06 (ns) |

pseudo-R² = 0.93 (exporta) / 0.92 (importa).

Ver el paper (sección 5) para la verificación completa de que la asimetría
no es otro artefacto sin detectar: los residuos de importaciones apuntan a
vecinos reales (Argentina, Bolivia), no a hubs de tránsito.
