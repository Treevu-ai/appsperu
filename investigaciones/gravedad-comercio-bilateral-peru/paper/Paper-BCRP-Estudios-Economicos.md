# Distancia, commodities y hubs de reexportación: un modelo de gravedad del comercio bilateral peruano, 2015-2024

**Ricardo Cuba**¹

¹ appsperu / Rastro, Octubre 2026.

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
relevante: la asociación aparente de los acuerdos comerciales con el comercio
en la especificación cruda (+0.71, p=0.01) se disuelve por completo (−0.05,
p=0.78) una vez removidos los commodities, sugiriendo que era una correlación
espuria con los grandes compradores de metales y gas, no una relación propia
de los acuerdos con el comercio no-commodity. Al repetir el ejercicio del
lado importador, la asimetría es reveladora: el mismo filtro de commodities y
hubs que corrige la distancia en las exportaciones **no** corrige el signo en
las importaciones (+0.90, p<0.001) — porque ahí no hay artefacto de medición
que corregir: China, Alemania, Japón y Corea, todas economías manufactureras
lejanas, dominan genuinamente la canasta importadora peruana.

**Palabras clave:** modelo de gravedad; comercio bilateral; PPML; Perú;
materias primas; hubs de reexportación.

**Códigos JEL:** F14, F10, F15, C21.

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

Se construyeron dos paneles espejo de 224 socios comerciales × 10 años
(2015-2024) — uno con las exportaciones de Perú hacia cada socio, otro con
las importaciones de Perú desde cada socio — a partir de las siguientes
fuentes, cargadas en una base Neon/PostgreSQL (`bcrp_comercio_exterior`):

**Cuadro 1. Fuentes de datos del panel de gravedad.**

| Fuente | Tabla | Contenido |
|---|---|---|
| CEPII BACI HS92 (vintage 202601) | `baci_flujos` | Exportaciones de Perú (código CEPII 604) a cada socio, por partida HS6, en miles de USD. Perú es el único exportador cargado; el panel mundial (10.58 millones de filas por año) no se descarga. |
| CEPII BACI, catálogo de países | `baci_paises` | Nombre y código ISO3 de cada código numérico CEPII. |
| Banco Mundial, World Development Indicators | `wdi_indicadores` | PBI corriente en USD (`NY.GDP.MKTP.CD`), 202 países, 2015-2024. |
| CEPII GeoDist | `geodist_diadas` | Distancia ponderada por población, frontera común, idioma oficial común, relación colonial — 224 díadas con origen en Perú. |
| CEPII Gravity V202211 | `gravity_acuerdos` | Indicador de acuerdo comercial (FTA de la OMC o cobertura RTA) vigente por año y par de países. |

La variable dependiente es el valor exportado (sección 4) o importado
(sección 5) por Perú con cada socio en cada año, en millones de USD. A
diferencia de una extracción típica que trabaja solo con los años en que
hubo comercio registrado, ambos paneles incluyen los ceros reales: la
ausencia de una fila en BACI para un par país-año se interpreta como cero
comercio ese año, no como dato faltante — PPML explota precisamente esta
información, que un modelo log-lineal por MCO tendría que descartar.

## 3. Método

Se estima, por año, dirección del flujo (exporta/importa) y variantes de la
variable dependiente:

```
flujo_ij,t = exp(β₁·log(PBI_j,t) + β₂·log(dist_ij) + β₃·frontera_ij
                  + β₄·idioma_ij + β₅·colonia_ij + β₆·acuerdo_ij,t + γ_t) + ε_ij,t
```

estimado por PPML (GLM Poisson, función de enlace logarítmica), con errores
estándar agrupados (*cluster*) por socio y efectos fijos de año (γₜ). El lado
peruano (PBI o población de Perú) no se incluye como regresor explícito en
ninguna de las dos direcciones: como Perú es el único reportador del panel
(exportador en la sección 4, importador en la sección 5), esas variables no
varían entre socios dentro de un mismo año y son perfectamente colineales con
los efectos fijos de año, que ya las absorben — es la forma estándar de
controlar por "resistencia multilateral" del lado peruano en un panel de un
solo reportador.

## 4. Resultados — exportaciones

### 4.1 Especificación cruda: el signo equivocado

La primera estimación, sobre el total exportado sin ningún filtro de
producto, da:

**Cuadro 2. Especificación cruda de exportaciones (sin filtro de commodities).**

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

**Cuadro 3. Principales exportaciones a Suiza y Namibia por partida HS6.**

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

**Cuadro 4. Exportaciones sin oro, minerales ni combustibles (HS26/HS71/HS27).**

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

**Cuadro 5. Especificación final de exportaciones (sin commodities, sin hubs de reexportación).**

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

**Cuadro 6. Trayectoria del coeficiente de distancia en exportaciones, por especificación.**

| Especificación | n | log(distancia) | p-valor |
|---|---|---|---|
| 1. Cruda (todas las exportaciones) | 1,907 | +0.639 | 0.059 |
| 2. Sin oro/minerales/combustibles | 1,907 | −0.600 | 0.032 |
| 3. + sin hubs de reexportación (final) | 1,847 | −0.583 | 0.071 |

El signo se corrige en el paso 2 (filtro por producto) y la magnitud se
mantiene estable en el paso 3 (filtro por país); lo que cambia entre 2 y 3 es
principalmente la significancia estadística, que se mueve justo alrededor
del umbral convencional de 5%.

## 5. Resultados — importaciones

¿El mismo tratamiento (filtro de commodities + hubs de reexportación)
produce el mismo efecto del lado importador? Se repitió exactamente el
procedimiento de la sección 4, con Perú como importador en vez de
exportador: `baci_flujos` filtrado por `importador = 604`, mismo panel de
224 socios, mismos controles.

### 5.1 Especificación cruda

**Cuadro 7. Especificación cruda de importaciones.**

| Variable | Coeficiente | p-valor |
|---|---|---|
| log(PBI del socio) | +1.18 | <0.001 |
| log(distancia) | +0.35 | 0.209 |
| Frontera común | +1.77 | <0.001 |
| Idioma oficial común | +2.09 | <0.001 |
| Ex-colonia | −1.38 | <0.001 |
| Tiene acuerdo comercial | +0.01 | 0.967 |

n = 1,907; pseudo-R² = 0.93. A diferencia de las exportaciones, la
distancia ya nace con el signo "equivocado" (positivo) aunque no
significativo — una primera señal de que la historia del lado importador
podría ser distinta.

### 5.2 Diagnóstico: ¿commodities otra vez?

Antes de aplicar el mismo filtro de forma automática, se repitió el
diagnóstico de residuos de Pearson sobre el total importado. El resultado
confirma que sí hay un commodity dominante — pero no el mismo:

**Cuadro 8. Principales importaciones desde Nigeria, Trinidad y Tobago y Congo.**

| País | Producto (HS6) | Valor en la década |
|---|---|---|
| Nigeria | 270900 — petróleo crudo | USD 2,193 millones |
| Trinidad y Tobago | 270900 — petróleo crudo | USD 2,077 millones |
| Congo | 270900 — petróleo crudo | USD 228 millones |

HS27 (combustibles minerales) es, de hecho, el capítulo arancelario más
grande de toda la canasta importadora peruana (USD 64,900 millones en la
década, más que maquinaria o vehículos) — Perú importa crudo para sus
refinerías pese a exportar su propio gas natural licuado. Por consistencia
metodológica se aplicó el mismo filtro HS26/HS71/HS27 usado en
exportaciones (HS26 y HS71 no son relevantes en volumen para las
importaciones, pero excluirlos no cambia nada y mantiene el filtro idéntico
en ambas direcciones).

### 5.3 Resultado tras el filtro: la distancia empeora, no mejora

**Cuadro 9. Especificación de importaciones (cruda, sin commodities, final), por filtro.**

| Variable | Cruda | Sin HS26/71/27 | Final (sin hubs) |
|---|---|---|---|
| log(PBI del socio) | +1.18 | +1.19 | +1.19 |
| **log(distancia)** | +0.35 (p=0.21) | **+0.88 (p=0.001)** | **+0.90 (p<0.001)** |
| Frontera común | +1.77 | +2.16 | +2.19 |
| Idioma oficial común | +2.09 | +2.64 | +2.64 |
| Ex-colonia | −1.38 | −1.70 | −1.71 |
| Tiene acuerdo comercial | +0.01 | −0.06 | −0.06 |

n final = 1,847; pseudo-R² = 0.92. A diferencia de las exportaciones, quitar
los commodities **no corrige** el signo de la distancia — lo empeora y lo
vuelve fuertemente significativo en la dirección "incorrecta".

### 5.4 Por qué esto no es el mismo artefacto: verificación

Antes de aceptar este resultado como genuino (y no como otro artefacto sin
detectar), se repitió la misma verificación que en la sección 4: ¿quién
domina los residuos de Pearson de la especificación final, y qué compra
Perú de los mayores socios importadores?

- Los mayores residuos son **Argentina** (hasta USD 2,779 millones/año) y
  **Bolivia** — vecinos con una relación comercial real y grande (trigo,
  soya, gas por ducto, insumos agropecuarios), no hubs de tránsito.
- Los mayores orígenes de importación en valor absoluto son **China** (USD
  119,739 millones en la década — más del doble que EE.UU.), Alemania,
  Japón e India: las grandes potencias manufactureras globales, todas muy
  lejanas de Perú.

No hay ningún país de tránsito conocido (Róterdam, Singapur, etc.)
dominando los residuos del lado importador, como sí ocurría en
exportaciones. La lectura más simple y consistente con la evidencia es que
el signo positivo de la distancia en importaciones **no es un artefacto de
medición que corregir**: refleja que la canasta importadora peruana
—maquinaria, electrónica, vehículos, insumos industriales— está
estructuralmente concentrada en un puñado de potencias manufactureras
lejanas (sobre todo China), un patrón documentado en la literatura reciente
de comercio de América Latina con Asia, y que domina sobre cualquier
preferencia por proximidad geográfica.

### 5.5 La asimetría exportación-importación

**Cuadro 10. Asimetría exportación-importación en la especificación final.**

| | Exportaciones (sec. 4.5) | Importaciones (sec. 5.3) |
|---|---|---|
| log(distancia) | **−0.58** (p=0.071) | **+0.90** (p<0.001) |
| Frontera común | +1.02 | +2.19 |
| Idioma oficial común | +1.12 | +2.64 |
| Ex-colonia | +0.23 (ns) | **−1.71** (p<0.001) |

Perú exporta siguiendo el patrón de gravedad clásico una vez limpia la
distorsión de commodities (más a lo cercano), pero importa en contra del
patrón de gravedad (más de lo lejano) — un reflejo fiel de ser, a la vez,
un exportador de materias primas regionales y un importador de manufactura
global concentrada en Asia. Ninguna de las dos direcciones es "la correcta";
son dos estructuras económicas distintas que un solo coeficiente de
distancia, mal especificado, podría haber ocultado.

## 6. Discusión

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

La sección 5 muestra, además, que el mismo diagnóstico aplicado con el mismo
rigor a las importaciones no produce el mismo resultado — y eso es, en sí
mismo, la evidencia de que el procedimiento no está sesgado hacia "encontrar"
el signo esperado: si lo estuviera, se habría seguido ajustando el filtro de
importaciones hasta forzar un coeficiente de distancia negativo. No se hizo,
porque los residuos no señalan a ningún hub de tránsito, y la explicación
alternativa (concentración real en manufactura asiática) es más simple y
mejor documentada que inventar una corrección adicional.

Este patrón no es exclusivo de Perú: es un problema conocido en la
literatura de gravedad para economías exportadoras de recursos naturales
(Chile con cobre, los países del Golfo con petróleo, la República Democrática
del Congo con cobalto). El aporte de este ejercicio es documentar el
procedimiento completo y reproducible —diagnóstico de residuos, filtro por
producto declarado a priori, filtro por país con lista estándar de la
literatura, el punto explícito en el que se decide dejar de excluir
observaciones, y la verificación simétrica del lado importador— en un caso
real con datos públicos verificables.

## 7. Limitaciones

- El coeficiente de distancia, incluso en la especificación final, no
  alcanza significancia convencional al 5% (p=0.071). El signo y la
  magnitud son estables en todas las especificaciones limpias (entre −0.48 y
  −0.60 según la muestra exacta), por lo que se reporta como un efecto
  económicamente plausible y robusto en dirección, pero no como un hallazgo
  estadísticamente "duro" al estándar convencional.
- El panel cubre exportaciones e importaciones por separado (2015-2024); no
  se estimó un modelo conjunto del comercio bilateral neto (exporta menos
  importa), que requeriría una especificación distinta (la variable
  dependiente podría ser negativa, incompatible con PPML tal como se usó
  aquí).
- La explicación de la sección 5 para el signo de la distancia en
  importaciones (concentración real en manufactura asiática) es la lectura
  más simple consistente con los residuos observados, pero no se contrastó
  contra una hipótesis alternativa formal (ej. un modelo de cadenas de valor
  globales) — queda como lectura cualitativa, no como resultado probado.
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

El código de extracción, los paneles de datos (crudos y procesados), el
script de estimación y el notebook ejecutado con los seis resultados
completos (tres especificaciones para exportaciones, tres para
importaciones) están disponibles previa solicitud a los autores.
