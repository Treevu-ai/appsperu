# Anexo técnico — Análisis avanzados del proyecto WGI

**Proyecto:** Gobernanza institucional y competitividad exportadora del Perú (Perú / CPTPP-China).  
**Autores:** Mg. Ricardo A. Cuba Alván · Dra. Rosa Patricia Larios Francia.  
**Fecha:** octubre de 2026.

Este anexo documenta la batería de análisis avanzados ejecutada sobre el panel de gravedad (184 socios, 2016-2024) y los insumos de producto y acuerdos disponibles. Hace explícito el alcance del hallazgo: **la asociación entre gobernanza y exportaciones es robusta en niveles entre países, pero no se sostiene en la variación dentro del país ni dentro de producto**. Se reporta, por tanto, como asociación y no como efecto causal.

Los scripts (19-32) y las tablas completas están en el repositorio del proyecto (`scripts/`, `results_avanzados/`) y en el libro `analisis_avanzados_wgi.xlsx`, hoja por análisis. Las tablas de este anexo reproducen esos resultados; las de mayor tamaño se resumen en sus primeras filas.

## Resumen

| Análisis (script) | Método | Resultado clave | Veredicto |
|---|---|---|---|
| 1. PPML y márgenes (20) | Poisson/Gamma PML con FE socio+año, con y sin ceros; LPM/Logit extensivo | OLS 0.667***; Gamma PML 0.696***; PPML 0.157 (ns) / 0.381 (ns); margen extensivo ~0 | La asociación NO se sostiene en PPML: sensible al estimador y a los flujos grandes |
| 2. Gravedad por producto (22) | PPML FE socio+año+HS2, 198k obs (Perú→184 socios × HS4) | WGI principal ns; interacción WGI×PCI = -0.58* (PPML) / -0.28*** (OLS) | Sin efecto positivo DENTRO de producto: la señal vive entre países, no dentro de producto |
| 3. CPTPP y acuerdos (23) | Control RTA + DiD (CPTPP×post2022) + event study (base 2019) | WGI sobrevive al control del acuerdo (0.655***); DiD ≈ 0 (p=0.90); sin pre-tendencia | Sin efecto detectable del CPTPP en el agregado |
| 4. IV / 2SLS (24) | Instrumentos: |latitud| y gobernanza regional (leave-one-out) | F 1ª etapa 39-67 (no débil); 2SLS 0.70-0.96**; Sargan p=0.021 | Asociación positiva y no débil, pero la validez del instrumento es discutible |
| 5. Panel dinámico (25) | Anderson-Hsiao: 2SLS en primeras diferencias | ρ (persistencia) ≈ 0.52; β(WGI) no significativo (-0.10 a -0.31) | Dentro del país no hay efecto: consistente con el fallo de primeras diferencias (18_) |
| 6. Double ML (26) | Robinson PLR con cross-fitting (gradient boosting), K=5 | θ = 0.705*** (completo) / 0.643** (+región) | Robusto a mala especificación funcional de los controles |
| 7. Curva de especificaciones (26) | 32 combinaciones (muestra, controles, rezago, FE) | 100% positivo y significativo; mediana 0.59; rango [0.46, 0.69] | En niveles, el resultado es extremadamente estable |
| 8. Oster (26) | Sesgo de variable omitida (Rmax = 1.3·R²) | δ = 2.58 (>1); β* = 0.41 (>0) | Robusto a no-observables: haría falta que pesaran 2.6× lo observado para anularlo |
| 9. Complejidad económica (27) | ECI/PCI (Hidalgo-Hausmann) desde BACI HS4 | Perú ECI = -0.72 (2024, puesto bajo); oportunidades adyacentes a recursos | Perú en la parte baja de complejidad; margen en productos vecinos a su canasta |
| 10. H3 definitiva (30-31) | Nunn (2007) y Rauch (1999) + FE producto×socio (HS4/HS6); exposición diferencial | WGI×Nunn: A -2.6 (ns); B OLS +0.7 (ns); B2 -0.07 (ns); C +0.5 (ns); Rauch -0.72 (ns); tercios: CI baja +0.83 (ns), media -0.86 (p=0.055), alta -0.44 (p=0.012); HS6 saturada -3.8 (p=0.014) | PRUEBA DEFINITIVA: se RECHAZA el efecto positivo; dentro de producto×socio el efecto no existe y en productos de alta intensidad contractual aparece una débil asociación negativa |
| 11. Panel HS6 (19 y 32) | Perú→212 socios, 4.465 productos HS6, 415.757 obs (2015-2024) | Nunn cubre 88,7% de las filas y 45,3% del valor (lo no cubierto son minerales, fuera del alcance de Nunn) | Base del test definitivo; la cobertura excluye sobre todo productos primarios |

## 1. PPML, Gamma PML y márgenes (script 20)

El OLS log-lineal descarta ceros y es sensible a la heterocedasticidad y a los flujos grandes. Se estima un Poisson pseudo-máximo-verosímil (PPML) con y sin efectos fijos de socio, un panel con ceros (margen extensivo) y una Gamma PML. El coeficiente de gobernanza (WGI promedio rezagado) por modelo:

| modelo | variable | coef | se | p | n | ratio_incidencia | r2 |
|---|---|---|---|---|---|---|---|
| A. OLS log-lineal (ref.) | wgi_promedio | 0.6668 | 0.1235 | 6.745e-08 | 1496 | 1.948 | 0.721 |
| B. PPML (sin FE socio) | wgi_promedio | 0.1568 | 0.1582 | 0.3217 | 1496 | 1.17 | 0.1362 |
| C. PPML (FE socio+año) | wgi_promedio | 0.3813 | 0.3095 | 0.218 | 1496 | 1.464 | 0.008977 |
| D. PPML sin FE (con ceros) | wgi_promedio | 0.1595 | 0.1581 | 0.3131 | 1644 | 1.173 | 0.1311 |
| D. PPML FE socio+año (con ceros) | wgi_promedio | 0.3815 | 0.3076 | 0.2148 | 1644 | 1.464 | 0.008652 |
| E. Gamma PML (sin FE) | wgi_promedio | 0.6956 | 0.1828 | 0.0001417 | 1496 | 2.005 | 0.3765 |
| F. LPM margen extensivo | wgi_promedio | -0.0002477 | 0.01901 | 0.9896 | 1644 | 0.9998 | 0.2191 |
| F. Logit margen extensivo | wgi_promedio | 0.8215 | 0.3559 | 0.02101 | 1644 | 2.274 | 0.4569 |

*Lectura:* el efecto de 0,667 (OLS) y 0,696 (Gamma PML) **cae y pierde significancia en PPML** (0,16-0,38) y el margen extensivo es nulo. El hallazgo en niveles es sensible al estimador — un resultado que el proyecto reporta explícitamente.

## 2. Gravedad por producto (script 22)

Panel Perú → 212 socios × HS4 (2015-2024), 198.159 observaciones, estimado por PPML con efectos fijos de socio, año y HS2. La gobernanza se interactúa con la complejidad del producto (PCI 2015, predeterminada).

| modelo | variable | coef | se | p | n | ratio |
|---|---|---|---|---|---|---|
| PPML FE socio+año+HS2 | wgi_promedio | -0.2707 | 0.5131 | 0.5977 | 198023 | 0.7628 |
| PPML FE socio+año+HS2 | wgi_promedio:pci_2015 | -0.5771 | 0.2368 | 0.01479 | 198023 | 0.5615 |
| PPML FE socio+año | wgi_promedio | -0.3455 | 0.6082 | 0.57 | 198023 | 0.7079 |
| PPML FE socio+año | wgi_promedio:pci_2015 | -0.8782 | 0.3324 | 0.008233 | 198023 | 0.4155 |
| OLS log FE socio+año+HS2 | wgi_promedio | 0.01586 | 0.1706 | 0.9261 | 198023 |  |
| OLS log FE socio+año+HS2 | wgi_promedio:pci_2015 | -0.2803 | 0.04636 | 8.615e-09 | 198023 |  |
| PPML complejidad baja | wgi_promedio | 0.4252 | 0.3095 | 0.1695 | 66018 | 1.53 |
| PPML complejidad media | wgi_promedio | -0.1568 | 0.2676 | 0.558 | 66059 | 0.8549 |
| PPML complejidad alta | wgi_promedio | -0.07724 | 0.2482 | 0.7557 | 65933 | 0.9257 |

*Lectura:* no hay efecto **positivo** dentro de producto; la interacción gobernanza × complejidad es negativa y significativa. La señal agregada vive entre países, no dentro de la canasta.

## 3. Acuerdos comerciales y DiD del CPTPP (script 23)

Control de acuerdos comerciales (base CEPII RTA), diferencias en diferencias de la entrada en vigor del CPTPP para Perú (19-sep-2021) y evento-estudio (año base 2019).

| modelo | variable | coef | se | p | n | estimador | r2 |
|---|---|---|---|---|---|---|---|
| A. Gravedad sin acuerdo | wgi_promedio | 0.6668 | 0.1235 | 6.745e-08 | 1496 | OLS | 0.721 |
| B. Gravedad + acuerdo (rta) | wgi_promedio | 0.6551 | 0.1261 | 2.039e-07 | 1496 | OLS | 0.7215 |
| B. Gravedad + acuerdo (rta) | rta | 0.2076 | 0.278 | 0.4552 | 1496 | OLS | 0.7215 |
| C. DiD (CPTPP x post2022) | cp_post | 0.02152 | 0.1775 | 0.9035 | 1496 | OLS | 0.9393 |
| D. Event study (año x CPTPP, base 2019) | cp_2016 | 0.3141 | 0.2668 | 0.2391 | 1496 | OLS | 0.9393 |
| D. Event study (año x CPTPP, base 2019) | cp_2017 | 0.2721 | 0.2084 | 0.1915 | 1496 | OLS | 0.9393 |
| D. Event study (año x CPTPP, base 2019) | cp_2018 | 0.09378 | 0.1843 | 0.6108 | 1496 | OLS | 0.9393 |
| D. Event study (año x CPTPP, base 2019) | cp_2020 | 0.1734 | 0.2059 | 0.3996 | 1496 | OLS | 0.9393 |
| D. Event study (año x CPTPP, base 2019) | cp_2021 | 0.3201 | 0.2644 | 0.226 | 1496 | OLS | 0.9393 |
| D. Event study (año x CPTPP, base 2019) | cp_2022 | 0.2344 | 0.2049 | 0.2527 | 1496 | OLS | 0.9393 |
| D. Event study (año x CPTPP, base 2019) | cp_2023 | 0.2138 | 0.261 | 0.4127 | 1496 | OLS | 0.9393 |
| D. Event study (año x CPTPP, base 2019) | cp_2024 | 0.2029 | 0.2288 | 0.3752 | 1496 | OLS | 0.9393 |
| E. PPML DiD (con ceros) | cp_post | 0.1454 | 0.07169 | 0.04251 | 1644 | PPML | 0.00866 |
| F. Acuerdo (efecto puro, sin FE socio) | rta | 0.2076 | 0.278 | 0.4552 | 1496 | OLS | 0.7215 |

*Lectura:* la gobernanza sobrevive al control del acuerdo (0,655; p < 0,001); el DiD del CPTPP es nulo (coeficiente ≈ 0; p = 0,90) y no hay pre-tendencia ni efecto posterior.

## 4. Variables instrumentales (script 24)

2SLS con dos instrumentos exógenos: |latitud| del socio (proxy histórico de instituciones) y gobernanza promedio de su región, excluyendo al propio país (leave-one-out).

| modelo | coef | se | p | n | F_1a_etapa | sargan_p |
|---|---|---|---|---|---|---|
| OLS (referencia) | 0.6668 | 0.1235 | 6.745e-08 | 1496 |  |  |
| IV — año FE | 0.8671 | 0.276 | 0.001684 | 1496 | 64.99 | 0.0211 |
| IV — año FE + región FE | 0.7331 | 0.2261 | 0.001184 | 1496 | 66.56 | 0.07977 |
| IV — solo latitud (just-id) | 0.7015 | 0.2766 | 0.01121 | 1496 | 39.39 |  |
| IV — solo gobernanza regional (just-id) | 0.9641 | 0.3438 | 0.005045 | 1496 | 54.32 |  |

*Lectura:* primera etapa fuerte (F = 39-67) y coeficiente 2SLS positivo (0,70-0,96; p < 0,01). El contraste de sobreidentificación no respalda del todo los instrumentos (Sargan p = 0,02-0,08), por lo que la lectura causal es limitada.

## 5. Panel dinámico (script 25)

Estimación de Anderson-Hsiao (2SLS en primeras diferencias) para medir la persistencia de las exportaciones y el efecto de la gobernanza **dentro** del país.

| modelo | var | coef | p | n |
|---|---|---|---|---|
| A. WGI exógeno | rho (persistencia) | 0.5158 | 0.3537 | 1134 |
| A. WGI exógeno | beta (WGI) | -0.1014 | 0.891 | 1134 |
| B. WGI endógeno | rho (persistencia) | 0.5293 | 0.1993 | 1134 |
| B. WGI endógeno | beta (WGI) | -0.3091 | 0.9465 | 1134 |
| C. OLS en diferencias | rho (persistencia) | -0.3543 | 8.17e-20 | 1134 |
| C. OLS en diferencias | beta (WGI) | 0.2643 | 0.5991 | 1134 |

*Lectura:* fuerte persistencia (ρ ≈ 0,5) y efecto de gobernanza no significativo dentro del país, consistente con el fallo en primeras diferencias.

## 6. Doble aprendizaje automático y sesgo de Oster (script 26)

| analisis | coef | se | p |
|---|---|---|---|
| DML controles completos | 0.7046 | 0.1401 | 4.954e-07 |
| DML controles + región | 0.6429 | 0.2098 | 0.002179 |
| Oster delta | 2.583 |  |  |
| Oster beta_estrella (delta=1) | 0.4086 |  |  |

*Lectura:* θ = 0,705 (p < 0,001) con controles completos y δ = 2,58 > 1 en Oster (2019): haría falta un sesgo de selección no observado dos veces y media mayor que el observado para anular la asociación en niveles.

## 7. Curva de especificaciones (script 26)

32 combinaciones de muestra (todas / sin China / sin CPTPP / winsor 5%), controles (mínimos / completos), rezago (t-1 / t-2) y efectos fijos (año / año + región).

| rezago | muestra | controles | fe | coef | p | n |
|---|---|---|---|---|---|---|
| t-1 | todas | mínimos | año FE | 0.6657 | 3.284e-08 | 1496 |
| t-1 | todas | mínimos | año+región FE | 0.5583 | 0.0005646 | 1496 |
| t-1 | todas | completos | año FE | 0.6668 | 6.745e-08 | 1496 |
| t-1 | todas | completos | año+región FE | 0.5201 | 0.001887 | 1496 |
| t-1 | sin China | mínimos | año FE | 0.685 | 1.092e-08 | 1487 |
| t-1 | sin China | mínimos | año+región FE | 0.5775 | 0.0003666 | 1487 |
| t-1 | sin China | completos | año FE | 0.6881 | 2.178e-08 | 1487 |
| t-1 | sin China | completos | año+región FE | 0.5424 | 0.001239 | 1487 |
| t-1 | sin CPTPP | mínimos | año FE | 0.6888 | 8.912e-08 | 1406 |
| t-1 | sin CPTPP | mínimos | año+región FE | 0.6111 | 0.0003586 | 1406 |
| t-1 | sin CPTPP | completos | año FE | 0.6853 | 2.936e-07 | 1406 |
| t-1 | sin CPTPP | completos | año+región FE | 0.5562 | 0.001997 | 1406 |
| t-1 | winsor 5% | mínimos | año FE | 0.5804 | 8.248e-08 | 1346 |
| t-1 | winsor 5% | mínimos | año+región FE | 0.4696 | 0.0005682 | 1346 |
| t-1 | winsor 5% | completos | año FE | 0.5979 | 1.44e-07 | 1346 |
| t-1 | winsor 5% | completos | año+región FE | 0.4675 | 0.001097 | 1346 |
| t-2 | todas | mínimos | año FE | 0.667 | 4.446e-08 | 1325 |
| t-2 | todas | mínimos | año+región FE | 0.5555 | 0.0006304 | 1325 |
| t-2 | todas | completos | año FE | 0.6676 | 9.188e-08 | 1325 |
| t-2 | todas | completos | año+región FE | 0.5167 | 0.002043 | 1325 |
| t-2 | sin China | mínimos | año FE | 0.687 | 1.467e-08 | 1317 |
| t-2 | sin China | mínimos | año+región FE | 0.5752 | 0.0004037 | 1317 |
| t-2 | sin China | completos | año FE | 0.6897 | 2.94e-08 | 1317 |
| t-2 | sin China | completos | año+región FE | 0.5395 | 0.001321 | 1317 |
| t-2 | sin CPTPP | mínimos | año FE | 0.6938 | 9.796e-08 | 1245 |
| t-2 | sin CPTPP | mínimos | año+región FE | 0.6111 | 0.0003677 | 1245 |
| t-2 | sin CPTPP | completos | año FE | 0.6899 | 3.248e-07 | 1245 |
| t-2 | sin CPTPP | completos | año+región FE | 0.5555 | 0.002003 | 1245 |
| t-2 | winsor 5% | mínimos | año FE | 0.5838 | 1.701e-07 | 1191 |
| t-2 | winsor 5% | mínimos | año+región FE | 0.4649 | 0.0008995 | 1191 |
| t-2 | winsor 5% | completos | año FE | 0.5998 | 3.008e-07 | 1191 |
| t-2 | winsor 5% | completos | año+región FE | 0.4615 | 0.001642 | 1191 |

*Lectura:* 100% de las especificaciones son positivas y significativas; mediana 0,59, rango [0,46; 0,69]. Estabilidad alta en niveles.

## 8. Complejidad económica — ECI por país (script 27)

Índice de complejidad económica (Hidalgo-Hausmann) calculado desde BACI HS4. Se muestran los 15 países más complejos de 2024 y el Perú.

| iso3 | eci_2015 | eci_2024 |
|---|---|---|
| S19 | 2.055 | 2.154 |
| JPN | 2.435 | 2.106 |
| CHE | 2.094 | 2.103 |
| KOR | 2.017 | 2.099 |
| NIU | 1.761 | 1.883 |
| DEU | 1.968 | 1.773 |
| CZE | 1.655 | 1.657 |
| AND | 0.7934 | 1.62 |
| AUT | 1.618 | 1.57 |
| SWE | 1.698 | 1.557 |
| SGP | 1.852 | 1.552 |
| GBR | 1.597 | 1.54 |
| SVN | 1.541 | 1.498 |
| USA | 1.583 | 1.434 |
| ISR | 1.171 | 1.406 |
| PER | -0.5587 | -0.7192 |

*Lectura:* el Perú registra ECI = -0,72 (2024), en la parte baja de la distribución.

## 9. Complejidad de producto — PCI por HS4 (script 27)

Los 10 productos HS4 más complejos (PCI 2024) y su ubicuidad (número de países con ventaja revelada).

| hs4 | pci_2015 | ubicuidad_2015 | n_paises_2015 | pci_2024 | ubicuidad_2024 | n_paises_2024 |
|---|---|---|---|---|---|---|
| 3705 | 1.934 | 8 | 108 | 2.278 | 7 | 84 |
| 3707 | 1.97 | 9 | 159 | 2.175 | 6 | 128 |
| 8457 | 2.216 | 11 | 148 | 2.125 | 13 | 95 |
| 3810 | 1.814 | 17 | 149 | 2.05 | 15 | 132 |
| 7223 | 1.016 | 19 | 122 | 2.037 | 13 | 120 |
| 3818 | 2.145 | 10 | 106 | 2.027 | 10 | 89 |
| 9012 | 1.834 | 10 | 110 | 2.009 | 7 | 112 |
| 8479 | 1.475 | 21 | 221 | 1.961 | 13 | 221 |
| 7221 | 1.967 | 13 | 84 | 1.942 | 11 | 88 |
| 8446 | 0.2455 | 12 | 102 | 1.94 | 8 | 75 |

## 10. Oportunidades de diversificación del Perú (script 27)

Productos aún sin ventaja revelada (RCA < 1) con mayor densidad (vecindad en el espacio de productos).

| hs4 | densidad |
|---|---|
| 2602 | 0.2032 |
| 2609 | 0.2008 |
| 1301 | 0.183 |
| 1202 | 0.1766 |
| 2615 | 0.1759 |
| 5201 | 0.1749 |
| 2401 | 0.1703 |
| 5202 | 0.1688 |
| 2709 | 0.1673 |
| 1701 | 0.1668 |
| 2612 | 0.1663 |
| 1212 | 0.1663 |
| 6305 | 0.1658 |
| 807 | 0.1653 |
| 802 | 0.1642 |
| 1511 | 0.1638 |
| 3105 | 0.1615 |
| 2529 | 0.1604 |
| 702 | 0.1601 |
| 1507 | 0.1572 |

## 11. H3 definitiva — intensidad contractual de Nunn (2007) con efectos fijos producto×socio (scripts 30-31)

El test central del proyecto lleva su forma definitiva. Se reemplaza la proxy de complejidad (PCI) por la **intensidad contractual de Nunn (2007)** —la fracción de insumos intermedios diferenciados de la industria, medida liberal— y se añade la clasificación de **Rauch (1999)** como contraste. Ambas se mapean a HS6/HS4 sobre la nomenclatura HS 1988/92 de BACI (con las concordancias ISIC rev.2 y SITC rev.2 de la clasificación de las Naciones Unidas). Los Nunn cubren 88,7% de las filas y 45,3% del valor exportado (lo no cubierto son, sobre todo, minerales). La especificación de exposición diferencial interactúa la gobernanza rezagada del socio con la intensidad contractual del producto y satura la variación entre países con **efectos fijos producto×socio** (más año; y una variante saturada con socio×año):

| modelo | variable | coef | se | p | n | ratio |
|---|---|---|---|---|---|---|
| A. PPML FE producto x socio + año (HS4) | wgi_c | 0.03434 | 0.167 | 0.8371 | 162363 | 1.035 |
| A. PPML FE producto x socio + año (HS4) | wgi_c:ci_c | -2.616 | 2.129 | 0.2193 | 162363 | 0.07312 |
| B. OLS FE producto-socio + socio-año (HS4) | wgi_c:ci_c | 0.7325 | 0.6297 | 0.2464 | 162400 | 2.08 |
| B2. OLS saturada FE pj+pt+jt (HS4) | wgi_c:ci_c | -0.06573 | 0.575 | 0.9091 | 161518 | 0.9364 |
| C. OLS FE producto x socio + año (HS4) | wgi_c | -0.05981 | 0.1219 | 0.6244 | 162363 | 0.9419 |
| C. OLS FE producto x socio + año (HS4) | wgi_c:ci_c | 0.4841 | 0.6178 | 0.4344 | 162363 | 1.623 |
| D. PPML FE producto x socio + año, Rauch (HS4) | wgi_c | 0.8197 | 0.7168 | 0.2528 | 153368 | 2.27 |
| D. PPML FE producto x socio + año, Rauch (HS4) | wgi_c:rauch_lib_diff | -0.7201 | 0.7771 | 0.3541 | 153368 | 0.4867 |
| E. PPML FE pj+año, CI baja (HS4) | wgi_c | 0.8349 | 0.6574 | 0.2041 | 60625 | 2.305 |
| E. PPML FE pj+año, CI media (HS4) | wgi_c | -0.8619 | 0.449 | 0.05489 | 47436 | 0.4224 |
| E. PPML FE pj+año, CI alta (HS4) | wgi_c | -0.4406 | 0.1755 | 0.01204 | 54302 | 0.6437 |
| A. PPML FE producto x socio + año (HS6) | wgi_c | -0.2252 | 0.2241 | 0.3148 | 287191 | 0.7983 |
| A. PPML FE producto x socio + año (HS6) | wgi_c:ci_c | -2.452 | 2.159 | 0.2561 | 287191 | 0.08612 |
| B. PPML FE producto-socio + socio-año (HS6) | wgi_c:ci_c | -3.801 | 1.554 | 0.01441 | 287210 | 0.02234 |
| B2. OLS saturada FE pj+pt+jt (HS6) | wgi_c:ci_c | -0.1928 | 0.5421 | 0.7225 | 281230 | 0.8246 |
| C. OLS FE producto x socio + año (HS6) | wgi_c | -0.1652 | 0.1023 | 0.108 | 287191 | 0.8477 |
| C. OLS FE producto x socio + año (HS6) | wgi_c:ci_c | 0.1987 | 0.507 | 0.6957 | 287191 | 1.22 |
| D. PPML FE producto x socio + año, Rauch (HS6) | wgi_c | 0.587 | 0.7831 | 0.4535 | 270920 | 1.799 |
| D. PPML FE producto x socio + año, Rauch (HS6) | wgi_c:rauch_lib_diff | -0.6258 | 0.8357 | 0.454 | 270920 | 0.5349 |
| E. PPML FE pj+año, CI baja (HS6) | wgi_c | 0.5937 | 0.7146 | 0.4061 | 97215 | 1.811 |
| E. PPML FE pj+año, CI media (HS6) | wgi_c | -0.8414 | 0.4555 | 0.06475 | 95981 | 0.4311 |
| E. PPML FE pj+año, CI alta (HS6) | wgi_c | -0.5451 | 0.2313 | 0.01842 | 93995 | 0.5798 |

*Lectura:* el término de exposición diferencial gobernanza × intensidad contractual **no es positivo en ningún modelo** y sólo resulta significativo —con signo negativo— en la especificación saturada a HS6 (-3,8; p = 0,014). Por tercios de intensidad contractual, el efecto de nivel de la gobernanza es positivo pero no significativo en la canasta de baja intensidad (+0,83) y pasa a negativo en la media (-0,86; p = 0,055) y la alta (-0,44; p = 0,012). La prueba definitiva **rechaza H3 en su forma de signo positivo**: la gobernanza no eleva las exportaciones del Perú ni siquiera en los productos más intensivos en relaciones contractuales.

## 12. Panel HS6 del Perú (script 19)

Base del test anterior: panel Perú → mundo a nivel HS6 (2015-2024), construido desde BACI, con la cobertura de la intensidad contractual de Nunn y de la clasificación de Rauch, y la magnitud de la demanda del destino (importaciones del socio desde el mundo, excluido el Perú).

| anio | productos_hs6 | socios | observaciones | valor_musd | obs_con_nunn | pct_valor_con_nunn | obs_con_rauch | demanda_mundo_musd |
|---|---|---|---|---|---|---|---|---|
| 2015 | 3830 | 187 | 40423 | 3.741e+04 | 36085 | 55 | 38303 | 1.601e+07 |
| 2016 | 3704 | 184 | 39997 | 3.843e+04 | 35510 | 50.1 | 37905 | 1.565e+07 |
| 2017 | 3749 | 188 | 41067 | 4.611e+04 | 36385 | 47.7 | 39002 | 1.758e+07 |
| 2018 | 3739 | 188 | 41969 | 4.93e+04 | 37329 | 47.1 | 39803 | 1.907e+07 |
| 2019 | 3752 | 184 | 41941 | 4.851e+04 | 37290 | 45.3 | 39827 | 1.852e+07 |
| 2020 | 3648 | 184 | 38105 | 4.245e+04 | 33589 | 44.9 | 36204 | 1.713e+07 |
| 2021 | 3763 | 184 | 41897 | 5.9e+04 | 36929 | 43.2 | 39795 | 2.138e+07 |
| 2022 | 3788 | 184 | 43271 | 6.306e+04 | 38309 | 43.7 | 40978 | 2.408e+07 |
| 2023 | 3764 | 183 | 44065 | 6.715e+04 | 39080 | 40.9 | 41773 | 2.289e+07 |
| 2024 | 3724 | 171 | 43022 | 7.684e+04 | 38102 | 42.5 | 40753 | 2.276e+07 |
| TOTAL | 4465 | 212 | 415757 | 5.283e+05 | 368608 | 45.3 | 394343 |  |

*Lectura:* la canasta exportadora del Perú es amplia en número de productos (≈3.700 HS6 al año) pero la intensidad contractual sólo está definida para el subconjunto manufacturero/agropecuario de Nunn; el valor no cubierto corresponde a minerales.

## Nota de reproducibilidad

Los scripts 19-32 y el módulo común `_comun_gravedad.py` reproducen todas las tablas. Insumos: BACI/CEPII (HS92 V202601), WGI/WDI y atributos del Banco Mundial, CEPII GeoDist y CEPII RTA; intensidad contractual de Nunn (2007) y clasificación de Rauch (1999), mapeadas a HS con las concordancias del paquete `concordance` (ISIC rev.2 y SITC rev.2). El panel de producto y la matriz país × producto se construyen desde BACI en una sola pasada (script 21). Dependencias: pandas, statsmodels, linearmodels, pyfixest, scikit-learn, pyreadr, openpyxl.
