# Gobernanza institucional y competitividad exportadora real (CPTPP/China)

Propuesta completa: [`propuesta/Propuesta-Gobernanza-Competitividad-CPTPP.docx`](propuesta/).

## Estado (2026-10-15)

| Pieza | Estado |
|---|---|
| Datos WDI/WGI | Completo (3,740 filas, **22 países** — incluye los 12 socios CPTPP+China, 2015-2024) |
| Datos BACI (CEPII, reconciliado) | **Completo** — Perú y mundo por capítulo HS2, 2015-2024 (960 filas c/u); bilateral Perú→12 socios CPTPP+China (7,750 filas) |
| Datos Comtrade | Parcial, **superado por BACI** — se detuvo el job en curso (agotaba cuota en esperas de hasta 52 min); `comtrade_flujos.csv` queda como referencia secundaria, no se completó |
| Datos WITS | Complementario — 2,729 filas, 12 socios, 2015-2023 (2024 aún no publicado por WITS). Usa grupos de producto propios de WITS, no HS2 — no se fusiona directo con BACI/Comtrade sin tabla de equivalencias |
| Script de extracción WDI/WGI | Funcional, corrido |
| Script de extracción BACI (mundo+Perú) | Funcional, corrido |
| Script de extracción BACI (bilateral) | Funcional, corrido |
| Script de extracción WITS | Funcional, corrido |
| Script de cálculo RCA (BACI) | **Funcional, corrido — 960 filas, 10 años completos** |
| Script de shift-share (BACI) | **Funcional, corrido 2015→2024** — ver resultado abajo |
| Script de regresión de panel | **Funcional, corrido de extremo a extremo** — ver resultado abajo |

## Primer resultado real: shift-share Perú 2015→2024

Exportaciones totales: de US$37,412M a US$76,839M (+US$39,427M). Descomposición:

| Componente | Miles de USD | % del crecimiento |
|---|---|---|
| Efecto demanda mundial | 15,809,655 | 40% |
| Efecto estructura (mezcla de productos) | 7,488,565 | 19% |
| Efecto competitividad real | 16,128,987 | 41% |

Verificado: la suma de los tres componentes cuadra con el crecimiento total observado (diferencia <1 mil USD, por redondeo). Este es el primer resultado real de la propuesta — falta correrlo por socio (no solo agregado) y cruzarlo con WGI en la regresión de panel.

## Segundo resultado real: regresión de panel (socio × año, 2016-2024)

Panel balanceado: 12 socios × 9 años = 108 observaciones. Variable dependiente: efecto de competitividad del shift-share bilateral (Perú → cada socio, demanda del socio como mercado de referencia). Variable explicativa: promedio de las 6 dimensiones WGI, rezagado un año.

**Resultado honesto: sin relación estadísticamente significativa.** Efectos fijos (entidad+tiempo): coeficiente -125,700 (t = -0.197); efectos aleatorios: coeficiente 3,201 (t = 0.055). R² dentro de entidad: 0.002. Ninguno de los dos modelos encuentra efecto significativo de la gobernanza rezagada sobre la competitividad bilateral a este nivel de agregación (capítulo HS2, 9 períodos, 12 países).

Esto **no invalida la propuesta** — es exactamente el tipo de hallazgo que una regresión de panel está para producir, y puede ser real (no todo efecto hipotetizado existe) o síntoma de especificación (muestra chica, posible no-linealidad, variable dependiente con outliers grandes sin transformar). No se forzó ni se maquilló el resultado.

## Próximos pasos

El pipeline completo corre de extremo a extremo con datos reales. Lo que sigue es refinar la especificación dado el resultado nulo, no destrabar datos:

1. Probar variantes de especificación: normalizar el efecto de competitividad (ej. como % de las exportaciones del socio, no en niveles — los niveles tienen outliers grandes que pueden estar dominando la varianza), y/o transformación logarítmica.
2. Probar cada una de las 6 dimensiones WGI por separado en vez del promedio (puede haber efecto en una dimensión específica que el promedio diluye).
3. Ampliar el panel más allá de HS2 (BACI ya está en HS6 — `07_export_baci.py`/`08_export_baci_bilateral.py`/`10_export_baci_partner_imports.py` agregan a HS2 pero pueden ajustarse) para tener más variación dentro de cada socio-año.
4. El zip de BACI (2.4GB) quedó en el scratchpad de la sesión, no en el repo — si se necesita reprocesar, volver a descargarlo de `https://www.cepii.fr/DATA_DOWNLOAD/baci/data/BACI_HS92_V202601.zip`.

## Orden de ejecución de los scripts

```
01_export_wdi_wgi.ts          # Neon -> data/raw/wdi_wgi.csv
02_export_comtrade.ts         # Neon -> data/raw/comtrade_flujos.csv (referencia, no completo)
03_export_wits.ts             # WITS API -> data/raw/wits_exportaciones_peru.csv
07_export_baci.py             # BACI zip -> data/raw/baci_peru_hs2.csv, baci_mundo_hs2.csv
08_export_baci_bilateral.py   # BACI zip -> data/raw/baci_peru_bilateral_hs2.csv
09_rca_shift_share_baci.py    # data/raw -> data/processed/rca_peru_baci.csv, shift_share_baci.csv (agregado Perú)
10_export_baci_partner_imports.py  # BACI zip -> data/raw/baci_importaciones_socios_hs2.csv
11_shift_share_panel_bilateral.py  # data/raw -> data/processed/shift_share_panel.csv (panel socio x año)
06_panel_regresion.py         # data/processed + data/raw -> regresión de panel (corrido, resultado nulo)
```
