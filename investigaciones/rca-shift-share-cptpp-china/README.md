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

## Tercer resultado real: normalización + dimensiones separadas (`12_panel_regresion_refinado.py`)

| Especificación | Coeficiente | p-valor |
|---|---|---|
| WGI promedio, dep. var normalizada por tamaño del mercado del socio | -0.0021 | 0.051 |
| Estabilidad política sola (dep. var normalizada) | -0.0013 | **0.031** |
| WGI promedio, excluyendo Brunéi | -0.0020 | 0.076 |
| WGI promedio, sin efectos de tiempo | -0.0028 | **0.008** |

Normalizar reveló una asociación negativa consistente en las 4 variantes — no es un artefacto de Brunéi como outlier. Signo contraintuitivo (mejor gobernanza → menor ganancia relativa de competitividad).

## Cuarto resultado real: pruebas de endogeneidad (`14_endogeneidad.py`) — la asociación NO es causal

| Chequeo | Resultado |
|---|---|
| Precedencia inversa: ¿competitividad(t) predice WGI(t+1)? | **Sí, significativo** (coef -23.6, p=0.012) |
| WGI rezagado 2 años (t-2) en vez de 1 | Desaparece (coef ≈0, p=0.896) |
| Primeras diferencias (Δcompetitividad ~ ΔWGI) | Desaparece (coef -0.0021, p=0.513) |

**Veredicto**: la asociación encontrada en niveles no sobrevive el rezago más largo ni las primeras diferencias, y hay evidencia significativa de causalidad en la dirección contraria. El patrón es más consistente con una **correlación espuria** (probablemente un confusor fijo por país no absorbido del todo por `EntityEffects`) que con un efecto causal de la gobernanza sobre la competitividad exportadora bilateral. No hay, con esta muestra y este diseño, evidencia sólida a favor de la hipótesis original de la propuesta.

## Investigación bibliográfica: por qué fallaba el panel chico

La literatura real sobre gobernanza y comercio (Abreo Villamizar, Bustillo & Rodríguez González 2021, *Journal of Economic Structures* 10:28 — Colombia vs. 136 socios, 2005-2018; Riker 2022, USITC Working Paper 2022-10-A — 78 países) usa modelos de **gravedad bilateral** con 50-120+ países y 5-25 años, no shift-share con una muestra chica. Nuestro panel de 12 países/9 años estaba muy por debajo de ese rango — un problema de poder estadístico por diseño, no solo de especificación.

## Quinto resultado real: modelo de gravedad con TODOS los socios comerciales de Perú — el hallazgo robusto (`16_modelo_gravedad.py`)

Panel: Perú vs. **184 socios comerciales reales**, 2016-2024, **1,496 observaciones**. Modelo de gravedad estándar (Tinbergen 1962): log(exportaciones) ~ log(PIB del socio) + log(distancia) + WGI promedio (rezagado) + frontera + idioma común + colonia + efectos de año, errores agrupados por país.

| Variable | Coeficiente | p-valor |
|---|---|---|
| log(PIB del socio) | 1.246 | <0.001 |
| log(distancia) | -2.164 | <0.001 |
| **WGI promedio (t-1)** | **0.667** | **<0.001** |
| Colonia (vínculo colonial) | 1.186 | 0.001 |

R² = 0.72. Todos los controles de gravedad se comportan como predice la teoría. **La gobernanza es positiva y fuertemente significativa** — lo opuesto del resultado espurio del panel chico.

**Prueba de endogeneidad (rezago t-2 en vez de t-1)**: coeficiente 0.668, p<0.001 — **prácticamente idéntico**, sobrevive intacto. Esto contrasta directamente con el panel chico, donde el mismo chequeo hacía desaparecer el efecto.

**Veredicto final**: con el diseño metodológico correcto (panel mundial, modelo de gravedad, controles estándar), sí hay evidencia robusta de una asociación positiva entre calidad institucional y desempeño exportador de Perú — consistente con la hipótesis original de la propuesta, y estable ante el cambio de rezago que había invalidado el hallazgo anterior. El camino completo (hipótesis → panel chico fallido → diagnóstico en literatura real → panel mundial robusto) queda documentado como parte del proceso, no oculto.

## Próximos pasos

1. Completar pruebas de endogeneidad adicionales sobre el modelo de gravedad (primeras diferencias, precedencia inversa) — ya se corrió t-2, falta el resto de la batería aplicada al panel chico.
2. Probar las 6 dimensiones WGI por separado en el modelo de gravedad (en el panel chico, estabilidad política pesaba más que el promedio).
3. Considerar variables instrumentales ahora que N=184 lo hace viable — a diferencia del panel chico (N=12), aquí sí hay poder estadístico para IV/GMM si se identifica un instrumento válido.
4. El zip de BACI (2.4GB) y los archivos GeoDist quedaron en `data/raw/geodist/` y en el scratchpad de la sesión — si se necesita reprocesar, las URLs están documentadas en los scripts `07`-`16`.

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
06_panel_regresion.py         # data/processed + data/raw -> regresión de panel bilateral chica (corrido, resultado nulo)
15_export_baci_peru_todos_socios.py  # BACI zip -> data/raw/baci_peru_todos_socios.csv (184+ socios reales)
16_modelo_gravedad.py         # data/raw (+ GeoDist en data/raw/geodist/) -> modelo de gravedad (corrido, resultado robusto)
```

GeoDist (CEPII, distancias/frontera/idioma/colonia): `https://www.cepii.fr/distance/dist_cepii.zip`.
