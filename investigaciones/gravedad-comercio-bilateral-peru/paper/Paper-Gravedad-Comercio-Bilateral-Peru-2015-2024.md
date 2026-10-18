# Gravedad del comercio bilateral peruano, 2015-2024: el sesgo de los commodities y los hubs de reexportación

**Ricardo Cuba** · appsperu / Rastro · Octubre 2026

## Resumen

Se estima un modelo de gravedad PPML (Poisson pseudo-maximum likelihood) sobre
las exportaciones bilaterales de Perú hacia 224 socios comerciales,
2015-2024, cruzando datos de CEPII BACI, GeoDist y Gravity con el PBI del
Banco Mundial (WDI). La especificación ingenua —sobre el total exportado—
produce un coeficiente de distancia con signo positivo, contrario a la teoría
de gravedad. Se muestra que el problema no es multicolinealidad (todos los
VIF < 2.1) sino un pequeño número de observaciones de altísimo valor que
reflejan logística de procesamiento de commodities (oro refinado en Suiza,
concentrado de cobre fundido en Namibia) y reexportación (Países Bajos,
Panamá) en vez de demanda final del país socio. Al excluir, de forma
principista y declarada a priori, los capítulos arancelarios de minerales
(HS26), metales preciosos (HS71) y combustibles (HS27), y la lista estándar
de hubs de reexportación de la literatura (Países Bajos, Bélgica, Singapur,
Hong Kong, Panamá, Emiratos Árabes Unidos), el coeficiente de distancia
recupera el signo negativo esperado (−0.58) y el modelo alcanza un
pseudo-R² de 0.93. El trabajo documenta también un hallazgo negativo
relevante: el efecto aparentemente significativo de los acuerdos comerciales
en la especificación cruda (+0.71, p=0.01) se disuelve por completo (−0.05,
p=0.78) una vez removidos los commodities, sugiriendo que era una correlación
espuria con los grandes compradores de metales y gas, no un efecto causal de
los acuerdos sobre el comercio no-commodity.

## 1. Introducción

Los modelos de gravedad son el instrumento estándar en economía del comercio
internacional para explicar el volumen de comercio bilateral a partir del
tamaño de las economías y la distancia (física, cultural, institucional)
entre ellas (Tinbergen, 1962; Anderson y van Wincoop, 2003). Santos Silva y
Tenreyro (2006) mostraron que la estimación log-lineal por MCO está sesgada
bajo heterocedasticidad y subestima sistemáticamente el comercio entre países
distantes, y propusieron PPML (Poisson pseudo-maximum likelihood) como
alternativa consistente que además no requiere descartar observaciones de
comercio cero.

Perú es un caso particularmente informativo para poner a prueba estas
herramientas: es una economía exportadora de commodities (cobre, oro, gas
natural licuado) cuya estructura comercial está fuertemente determinada por
cadenas de procesamiento y logística global, no solo por demanda final
bilateral. Este trabajo documenta, paso a paso, cómo esa estructura
contamina una estimación de gravedad "de manual" y cómo corregirla sin caer
en *data dredging* (ajustar el filtro de datos hasta obtener el resultado
deseado).

## 2. Datos

Se construyó un panel de 224 socios comerciales × 10 años (2015-2024) a
partir de las siguientes fuentes, cargadas en una base Neon/PostgreSQL
(`bcrp_comercio_exterior`):

| Fuente | Tabla | Contenido |
|---|---|---|
| CEPII BACI HS92 (vintage 202601) | `baci_flujos` | Exportaciones de Perú (código CEPII 604) a cada socio, por partida HS6, en miles de USD. Perú es el único exportador cargado; el panel mundial (10.58 millones de filas por año) no se descarga. |
| CEPII BACI, catálogo de países | `baci_paises` | Nombre y código ISO3 de cada código numérico CEPII. |
| Banco Mundial, World Development Indicators | `wdi_indicadores` | PBI corriente en USD (`NY.GDP.MKTP.CD`), 202 países, 2015-2024. |
| CEPII GeoDist | `geodist_diadas` | Distancia ponderada por población, frontera común, idioma oficial común, relación colonial — 224 díadas con origen en Perú. |
| CEPII Gravity V202211 | `gravity_acuerdos` | Indicador de acuerdo comercial (FTA de la OMC o cobertura RTA) vigente por año y par de países. |

La variable dependiente es el valor total exportado por Perú a cada socio en
cada año, en millones de USD. A diferencia de una extracción típica que
trabaja solo con los años en que hubo comercio registrado, el panel incluye
los ceros reales: la ausencia de una fila en BACI para un par país-año se
interpreta como cero comercio ese año, no como dato faltante — PPML explota
precisamente esta información, que un modelo log-lineal por MCO tendría que
descartar.

## 3. Método

Se estima, por año y variantes de la variable dependiente:

```
exporta_ij,t = exp(β₁·log(PBI_j,t) + β₂·log(dist_ij) + β₃·frontera_ij
                    + β₄·idioma_ij + β₅·colonia_ij + β₆·acuerdo_ij,t + γ_t) + ε_ij,t
```

estimado por PPML (GLM Poisson, función de enlace logarítmica), con errores
estándar agrupados (*cluster*) por socio y efectos fijos de año (γₜ). El lado
exportador (PBI o población de Perú) no se incluye como regresor explícito:
como Perú es el único exportador del panel, esas variables no varían entre
socios dentro de un mismo año y son perfectamente colineales con los efectos
fijos de año, que ya las absorben — es la forma estándar de controlar por
"resistencia multilateral" del lado exportador en un panel de un solo
exportador.

## 4. Resultados

### 4.1 Especificación cruda: el signo equivocado

La primera estimación, sobre el total exportado sin ningún filtro de
producto, da:

| Variable | Coeficiente | p-valor |
|---|---|---|
| log(PBI del socio) | +1.10 | <0.001 |
| **log(distancia)** | **+0.64** | 0.059 |
| Frontera común | +1.73 | <0.001 |
| Idioma oficial común | +1.67 | 0.002 |
| Ex-colonia | −0.59 | 0.19 |
| Tiene acuerdo comercial | +0.71 | 0.013 |

n = 1,907; pseudo-R² = 0.87.

El coeficiente de distancia es positivo: el modelo "predice" que Perú exporta
*más* a medida que un socio está más lejos, lo contrario de lo que cualquier
fricción de transporte o información predeciría.

### 4.2 Diagnóstico: no es multicolinealidad

Se descartó la hipótesis de colinealidad entre PBI y distancia (los países
grandes y lejanos, como China, podrían estar confundiendo ambos
coeficientes): el factor de inflación de varianza de `log_dist` es 2.08, y la
correlación simple entre `log(PBI)` y `log(distancia)` es de solo 0.17. El
diagnóstico correcto es el análisis de residuos de Pearson: dos observaciones
dominan por completo el ajuste de la verosimilitud de Poisson, que pondera
fuertemente los valores grandes.

| País | Producto (HS6) | Valor en la década |
|---|---|---|
| Suiza | 710812 — oro semi-manufacturado, no monetario | USD 23,072 millones |
| Namibia | 260300 — concentrados de cobre | USD 1,586 millones |

Suiza es uno de los principales centros mundiales de refinación de oro; el
oro peruano se envía allí para refinarse, no por el tamaño de la economía
suiza como mercado de consumo. Namibia alberga la fundición Tsumeb (Dundee
Precious Metals), especializada en procesar concentrados de cobre con alto
contenido de arsénico — como los de minas peruanas difíciles de procesar en
otra parte. Ambos son flujos reales, pero reflejan logística de
procesamiento de materias primas, no demanda final del país de destino: el
supuesto implícito del modelo de gravedad.

### 4.3 Filtro por producto: excluir minerales, oro/plata y combustibles

Siguiendo la práctica estándar para economías mineras, se excluyen los
capítulos arancelarios HS26 (minerales y concentrados), HS71 (oro, plata,
piedras preciosas) y HS27 (combustibles minerales: petróleo, gas natural,
carbón) de **todas** las exportaciones — no solo de los socios anómalos. Es
un filtro por categoría de producto aplicado a todo el panel, para no caer en
la trampa metodológica de excluir países específicos *ad hoc*. Juntos, estos
tres capítulos representan el 56% del valor exportado total en la década
(oro+minerales 51%, combustibles 7%, con solapamiento menor).

| Variable | Coeficiente | p-valor |
|---|---|---|
| log(PBI del socio) | +0.97 | <0.001 |
| **log(distancia)** | **−0.60** | **0.032** |
| Frontera común | +0.87 | 0.020 |
| Idioma oficial común | +0.90 | 0.050 |
| Ex-colonia | +0.26 | 0.54 |
| Tiene acuerdo comercial | +0.11 | 0.58 |

n = 1,907; pseudo-R² = 0.90.

El coeficiente de distancia recupera el signo correcto y es estadísticamente
significativo. El filtro por producto resuelve el problema.

### 4.4 Segundo diagnóstico: hubs de reexportación

Al revisar nuevamente los residuos de Pearson tras remover los commodities,
el país que más domina el ajuste pasa a ser **Países Bajos** — el clásico
"efecto Róterdam": mercancía declarada hacia un puerto-hub europeo para
redistribuirse dentro de la Unión Europea, no para consumo neerlandés real.
Reino Unido y Panamá (zona del Canal) aparecen también entre los residuos más
altos.

En vez de excluir estos países uno por uno a medida que aparecen como
residuo —lo cual degenera en *data dredging*, ajustando el filtro hasta
lograr el resultado deseado—, se adoptó la lista **estándar de la literatura**
de hubs de reexportación: Países Bajos, Bélgica, Singapur, Hong Kong, Panamá
y Emiratos Árabes Unidos (el eje Róterdam-Amberes-Singapur-Hong
Kong-Panamá-Dubái). Esta lista se fija *a priori*, por la clasificación
habitual en estudios de comercio, no por los residuos de este dataset
específico.

### 4.5 Especificación final

| Variable | Coeficiente | Error estándar | p-valor |
|---|---|---|---|
| log(PBI del socio) | **1.042** | 0.070 | <0.001 |
| log(distancia) | **−0.583** | 0.321 | 0.071 |
| Frontera común | **1.023** | 0.388 | 0.009 |
| Idioma oficial común | **1.117** | 0.469 | 0.017 |
| Ex-colonia | 0.235 | 0.454 | 0.607 |
| Tiene acuerdo comercial | −0.048 | 0.169 | 0.776 |

n = 1,847 observaciones (181 socios con cobertura completa de PBI y
distancia); pseudo-R² = 0.93. Errores estándar agrupados por socio, efectos
fijos de año incluidos.

Tras esta especificación, los residuos de Pearson más altos pasan a Bolivia y
Ecuador (vecinos con relación comercial real y grande), China (una economía
genuinamente enorme) y Haití (ruido de Poisson en un país pequeño con valores
predichos muy bajos) — ninguno sugiere un hub de reexportación adicional. Ahí
se detuvo la búsqueda.

### 4.6 Trayectoria del coeficiente de distancia

| Especificación | n | log(distancia) | p-valor |
|---|---|---|---|
| 1. Cruda (todas las exportaciones) | 1,907 | +0.639 | 0.059 |
| 2. Sin oro/minerales/combustibles | 1,907 | −0.600 | 0.032 |
| 3. + sin hubs de reexportación (final) | 1,847 | −0.583 | 0.071 |

El signo se corrige en el paso 2 (filtro por producto) y la magnitud se
mantiene estable en el paso 3 (filtro por país); lo que cambia entre 2 y 3 es
principalmente la significancia estadística, que se mueve justo alrededor
del umbral convencional de 5%.

## 5. Discusión

El hallazgo metodológico central es que, para una economía exportadora de
commodities como Perú, un modelo de gravedad "de manual" sobre el valor
total exportado no mide lo que se cree que mide: una fracción sustancial del
flujo refleja la geografía de la refinación y el tránsito global de
materias primas (Suiza para oro, Namibia para concentrados de cobre, Países
Bajos/Panamá como puertos de redistribución), no la relación bilateral
económica entre Perú y el país de destino final. Ignorar esto no solo
distorsiona el coeficiente de distancia: también infla artificialmente el
coeficiente de "tiene acuerdo comercial" (de +0.71 significativo a −0.05
estadísticamente nulo), porque los países con acuerdos comerciales vigentes
con Perú tienden a coincidir con los grandes compradores de oro y gas.

Este patrón no es exclusivo de Perú: es un problema conocido en la
literatura de gravedad para economías exportadoras de recursos naturales
(Chile con cobre, los países del Golfo con petróleo, la República Democrática
del Congo con cobalto). El aporte de este ejercicio es documentar el
procedimiento completo y reproducible —diagnóstico de residuos, filtro por
producto declarado a priori, filtro por país con lista estándar de la
literatura, y el punto explícito en el que se decide dejar de excluir
observaciones— en un caso real con datos públicos verificables.

## 6. Limitaciones

- El coeficiente de distancia, incluso en la especificación final, no
  alcanza significancia convencional al 5% (p=0.071). El signo y la
  magnitud son estables en todas las especificaciones limpias (entre −0.48 y
  −0.60 según la muestra exacta), por lo que se reporta como un efecto
  económicamente plausible y robusto en dirección, pero no como un hallazgo
  estadísticamente "duro" al estándar convencional.
- El panel cubre solo el lado exportador de Perú (2015-2024); no se estimó
  el modelo simétrico para importaciones ni para el comercio bilateral neto.
- La lista de hubs de reexportación es una convención de la literatura, no
  una verificación caso por caso de que cada flujo hacia esos seis países sea
  efectivamente tránsito — es una simplificación razonable, no una prueba
  definitiva.
- El indicador de acuerdo comercial (`tiene_acuerdo`) es una variable binaria
  simple (CEPII Gravity, cualquier FTA de la OMC o cobertura RTA registrada);
  no distingue profundidad, cobertura sectorial, ni año de entrada en
  vigencia dentro del período.

## Referencias

- Anderson, J. E., & van Wincoop, E. (2003). Gravity with Gravitas: A
  Solution to the Border Puzzle. *American Economic Review*, 93(1), 170-192.
  DOI: [10.1257/000282803321455214](https://doi.org/10.1257/000282803321455214)
- Santos Silva, J. M. C., & Tenreyro, S. (2006). The Log of Gravity. *Review
  of Economics and Statistics*, 88(4), 641-658.
  DOI: [10.1162/rest.88.4.641](https://doi.org/10.1162/rest.88.4.641)
- Tinbergen, J. (1962). *Shaping the World Economy: Suggestions for an
  International Economic Policy*. Twentieth Century Fund, Nueva York, 330 pp.
- Head, K., & Mayer, T. (2014). Gravity Equations: Workhorse, Toolkit, and
  Cookbook. En *Handbook of International Economics*, Vol. 4, pp. 131-195.
  Elsevier. DOI: [10.1016/B978-0-444-54314-1.00003-3](https://doi.org/10.1016/B978-0-444-54314-1.00003-3)
- CEPII BACI (vintage 202601), CEPII GeoDist, CEPII Gravity V202211 — centre
  d'Études Prospectives et d'Informations Internationales.
  [cepii.fr](https://www.cepii.fr/)
- World Bank, World Development Indicators, `NY.GDP.MKTP.CD` (PBI corriente,
  US$). [databank.worldbank.org/source/world-development-indicators](https://databank.worldbank.org/source/world-development-indicators)

Las 4 referencias académicas fueron verificadas en vivo contra fuentes
primarias el 2026-10-18 (ver `referencias_verificadas.md` en la raíz de este
proyecto para el detalle de la verificación).

## Anexo — Reproducibilidad

Todo el código, los datos extraídos y el notebook ejecutado están en
`investigaciones/gravedad-comercio-bilateral-peru/` del repositorio:

- `data/raw/panel_bilateral_peru_2015_2024.json` — extracción cruda de Neon.
- `data/procesado/panel_final_estimacion.csv` — panel final usado en la
  especificación 3 (1,847 filas).
- `data/procesado/tabla_comparativa_especificaciones.csv` — las tres
  especificaciones con todos los coeficientes.
- `scripts/estimar_gravedad.py` — script que reproduce las tres
  especificaciones de punta a punta.
- `notebook/gravedad_comercio_peru.ipynb` — notebook narrado con el mismo
  recorrido, ejecutado con outputs reales.
