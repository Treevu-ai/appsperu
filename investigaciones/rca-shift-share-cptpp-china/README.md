# Espacio de productos frente a gobernanza institucional en la diversificación exportadora peruana hacia CPTPP y China

Propuesta completa: [`propuesta/Propuesta-Gobernanza-Competitividad-CPTPP.docx`](propuesta/).

## Actualización 2026-10-18 — replanteo del programa de investigación

El hallazgo "la gobernanza es positiva y fuertemente significativa" (quinto resultado real,
abajo, `16_modelo_gravedad.py`, OLS log-lineal) **no sobrevivió** a la corrección
econométrica correcta para datos de comercio con ceros (PPML, Santos Silva y Tenreyro 2006)
combinada con la depuración de commodities/hubs de reexportación que ya se había aplicado en
el proyecto hermano [`gravedad-comercio-bilateral-peru`](../gravedad-comercio-bilateral-peru/).
Se probó en **cuatro canales independientes**, todos con resultado nulo o contrario a la
hipótesis original bajo PPML:

| Hipótesis | OLS log-lineal (diseño original) | PPML (estimador correcto) |
|---|---|---|
| WGI promedio explica exportaciones | +0.667, p<0.001 (n=1,496) | +0.150, p=0.35 (misma submuestra) |
| Las 6 dimensiones WGI por separado | 6/6 positivas y significativas, p<0.001 | 0/6 significativas al 5% |
| Gobernanza × intensidad contractual (Nunn 2007, H3) | — | nulo o signo contrario a la teoría (interacción negativa, p=0.014 a nivel HS6) |
| DiD de entrada en vigor del CPTPP | cp_post +0.145, p=0.043 (exportaciones totales) | +0.154 a +0.167, p=0.11-0.16 (sin commodities, sin hubs) |

Diagnóstico: sin controlar por PIB del socio, el WGI promedio sube a +0.658 (p=0.07) bajo
PPML — buena parte de lo que el OLS original capturaba como "efecto de gobernanza" era el
nivel de desarrollo del socio, correlacionado con su puntaje WGI. El VIF de todas las
variables es inferior a 2.2 en todas las especificaciones, lo que descarta
multicolinealidad como explicación — el problema es el estimador (OLS log-lineal descarta
los ceros y pondera mal la heterocedasticidad), no la estructura de los regresores.
Script ad-hoc de esta prueba: `../gravedad-comercio-bilateral-peru/data/raw/probar_wgi_vs_commodities.py`
(reusa el panel bilateral de ese proyecto hermano).

**Nota de discrepancia, no resuelta**: al intentar replicar el DiD original (`23_did_cptpp_fta.py`,
spec E, `results_avanzados/23_did_cptpp_fta.csv`, p=0.043 reportado), mi propia réplica con un
panel construido independientemente dio p=0.099 en la especificación más cercana ("exportaciones
totales"), no p=0.043. Probablemente se deba a universos de socios distintos (mi panel usa 224
socios vía GeoDist y 2015-2024; el original usa ~184 socios vía `baci_peru_todos_socios.csv` y
2016-2024). No se reconcilió esta diferencia — se deja registrada para quien retome el DiD.

**La pregunta se replantea, no se abandona**: en vez de forzar una quinta prueba sobre la misma
hipótesis de gobernanza, el proyecto gira hacia una hipótesis alternativa que ya tenía datos
calculados pero nunca regresados — el **espacio de productos** (Hidalgo-Hausmann 2007, 2009).
Script nuevo: `33_pilar_b_espacio_producto.py`. Dos pruebas independientes, ambas robustas a la
misma depuración de commodities que mató el efecto de gobernanza:

- **Prueba clásica (logit)**: de los 1,053 productos HS4 que Perú no exportaba con RCA≥1 en
  2015, la densidad de espacio de productos en 2015 predice cuáles logró adquirir para 2024
  — coeficiente 26.81, p<0.001 con todos los productos; 25.90, p=0.002 excluyendo commodities
  HS26/71/27. Salidas: `results_avanzados/33a_espacio_producto_logit_{todos,sin_commodities}.csv`,
  `data/processed/densidad_hs4_2015.csv`.
- **Panel bilateral PPML** (HS4 × socio CPTPP/China × año, 2016-2024, no-commodity): la densidad
  del producto es el predictor más fuerte del panel — coeficiente log(densidad) = +5.68,
  p<0.001 — controlando por PIB del socio, distancia, frontera e idioma común. El WGI promedio
  en esta muestra acotada (11 socios) sale significativo pero con signo negativo (-0.79,
  p<0.001) — inestable dado el número reducido de clusters, no se interpreta como evidencia de
  que la gobernanza perjudique. Salida: `results_avanzados/33b_bilateral_densidad_vs_wgi.csv`.

Esto convierte el proyecto en un diseño de **dos pilares**: (1) la corrección metodológica en sí
(por qué OLS log-lineal sobrestima el efecto de gobernanza en comercio) y (2) la hipótesis de
capacidades productivas como explicación alternativa, con evidencia propia. La propuesta formal
(`propuesta/build.js` → `.docx`) ya se reescribió con esta estructura — ver secciones
"Pregunta de investigación", "Marco metodológico" (ahora 4 enfoques, no 3) y "Resultados
preliminares" (nueva) del documento.

Todo lo que sigue en este README bajo "Estado (2026-10-15)" documenta el camino que llevó hasta
aquí — incluido el resultado de gobernanza hoy superado — y se conserva sin editar como registro
del proceso, consistente con cómo se documentó cada hallazgo anterior en este mismo archivo.

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
| Script de dimensiones WGI en gravedad (`17_`) | **Funcional, corrido** — las 6 dimensiones positivas y significativas |
| Script de endogeneidad en gravedad (`18_`) | **Funcional, corrido** — ver resultado abajo |
| Borradores de postulación (UP, Hinrich, propuesta general) | Fuera del árbol público — presupuestos y datos de postulación no se versionan |

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

## Sexto resultado real: las 6 dimensiones WGI en el modelo de gravedad (`17_gravedad_dimensiones_wgi.py`)

Panel: 1,479 observaciones (182 países × 9 años; 17 menos que el modelo principal por valores faltantes en alguna dimensión). Misma especificación que `16_`, una dimensión por vez:

| Dimensión WGI | Coeficiente | p-valor |
|---|---|---|
| Calidad regulatoria | +0.681 | <0.001 |
| Efectividad gubernamental | +0.671 | <0.001 |
| Estado de derecho | +0.599 | <0.001 |
| Control de la corrupción | +0.552 | <0.001 |
| Estabilidad política | +0.580 | <0.001 |
| Voz y rendición de cuentas | +0.579 | <0.001 |

**Las 6 dimensiones son individualmente positivas y significativas.** Las dos más fuertes son calidad regulatoria y efectividad gubernamental — las más accionables para política comercial. En la regresión conjunta con las 6 dimensiones simultáneas ninguna es individualmente significativa: las dimensiones WGI tienen correlaciones de ~0.7–0.9 entre sí, así que la sesión conjunta es referencia, no especificación principal. Este resultado sustenta la afirmación de política de la propuesta.

## Séptimo resultado real: batería de endogeneidad sobre el modelo de gravedad (`18_gravedad_endogeneidad.py`) — el efecto NO es causal

| Chequeo | Resultado |
|---|---|
| Rezago t−2 en vez de t−1 | **Sobrevive intacto** (coef +0.668, p<0.001; N=1,325) |
| Primeras diferencias (Δexport ~ ΔWGI) | **Desaparece** (coef −0.063, p=0.906; N=1,312) |
| Precedencia inversa (export(t) → WGI(t+1)) | **Significativa en dirección reversa** (coef +0.128, p<0.001; N=1,339) |

**Veredicto honesto**: la asociación gobernanza–exportaciones del modelo de gravedad es robusta al rezago más largo (a diferencia del panel chico), pero **no sobrevive a primeras diferencias** y hay **causalidad reversa significativa**. El patrón es consistente con la literatura (asociación positiva estable) pero **no identifica causalidad de gobernanza → comercio**: la señal vive sobre todo en la variación entre países (nivel), no en las variaciones dentro-país (diferencias). Se reportará como **asociación**, nunca como efecto causal. Nota: esto cambia el énfasis del README anterior — el efecto es robusto como asociación de la literatura, pero la batería completa de endogeneidad (antes incompleta sobre el modelo grande) ahora muestra las mismas limitaciones causales que el panel chico, solo que sin invalidar la asociación.

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

**Veredicto (actualizado tras la batería completa de endogeneidad, ver resultados 6 y 7 abajo)**: con el diseño metodológico correcto (panel mundial, modelo de gravedad, controles estándar), hay evidencia **robusta en niveles** de una asociación positiva entre calidad institucional y desempeño exportador de Perú — consistente con la hipótesis original de la propuesta y con la literatura (Abreo Villamizar et al. 2021; De Groot et al. 2004). La batería completa de endogeneidad (script `18_`) confirma que la asociación sobrevive al rezago t−2 pero no a primeras diferencias, con causalidad reversa significativa: **se reporta como asociación, no como causalidad**. El camino completo (hipótesis → panel chico fallido → diagnóstico en literatura real → panel mundial robusto → batería de endogeneidad completa) queda documentado como parte del proceso, no oculto.

## Próximos pasos

1. ~~Completar pruebas de endogeneidad adicionales sobre el modelo de gravedad~~ — **Completado** (script `18_gravedad_endogeneidad.py`: t−2, primeras diferencias, precedencia inversa).
2. ~~Probar las 6 dimensiones WGI por separado en el modelo de gravedad~~ — **Completado** (script `17_gravedad_dimensiones_wgi.py`: las 6 positivas y significativas; calidad regulatoria y efectividad gubernamental las más fuertes).
3. ~~Redactar propuesta en formato Hinrich Foundation en inglés~~ — el borrador de postulación no se versiona en este repositorio.
4. ~~Probar la interacción gobernanza × intensidad contractual (H3, Nunn 2007)~~ — **Completado** (script `31_h3_definitiva.py`: nulo o signo contrario a la teoría).
5. ~~Reestimar WGI (promedio, 6 dimensiones), H3 y el DiD de CPTPP bajo PPML con commodities/hubs depurados~~ — **Completado** (ver "Actualización 2026-10-18" arriba): los cuatro canales de gobernanza no sobreviven.
6. ~~Calcular ECI/PCI/densidad del espacio de productos y probar si predice la diversificación de Perú~~ — **Completado** (script `33_pilar_b_espacio_producto.py`): resultado positivo y robusto, reemplaza la gobernanza como hipótesis central.
7. Redactar el artículo con la estructura de dos pilares (corrección metodológica + espacio de productos) — en curso, ver `propuesta/Propuesta-Gobernanza-Competitividad-CPTPP.docx`.
8. Extender el panel de densidad bilateral al universo completo de socios de Perú (no solo CPTPP+China), como prueba de robustez fuera de muestra.
9. Construir una visualización de red del espacio de productos de Perú para la sección de hallazgos del artículo.
10. Reconciliar la discrepancia no resuelta entre el DiD original (p=0.043, `23_did_cptpp_fta.py`) y mi réplica (p=0.099) — ver nota de discrepancia arriba — antes de citar cualquiera de las dos cifras en el artículo final.
11. El zip de BACI (2.4GB) y los archivos GeoDist quedaron en `data/raw/geodist/` y en el scratchpad de la sesión — si se necesita reprocesar, las URLs están documentadas en los scripts `07`-`18`.

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
17_gravedad_dimensiones_wgi.py  # 6 dimensiones WGI por separado en gravedad (corrido, todas significativas)
18_gravedad_endogeneidad.py     # batería de endogeneidad sobre gravedad (corrido: t-2 sobrevive, primeras diferencias no, precedencia inversa significativa)
23_did_cptpp_fta.py             # DiD de entrada en vigor del CPTPP, incl. spec PPML (corrido; ver nota de discrepancia arriba)
27_complejidad_producto.py      # ECI/PCI/proximidad/densidad, espacio de productos (corrido; insumo de 33_)
31_h3_definitiva.py             # H3: gobernanza x intensidad contractual (Nunn 2007), FE producto x socio (corrido, resultado nulo)
33_pilar_b_espacio_producto.py  # Pilar B: densidad del espacio de productos vs. WGI, logit + panel bilateral PPML (corrido, resultado robusto)
```

GeoDist (CEPII, distancias/frontera/idioma/colonia): `https://www.cepii.fr/distance/dist_cepii.zip`.
