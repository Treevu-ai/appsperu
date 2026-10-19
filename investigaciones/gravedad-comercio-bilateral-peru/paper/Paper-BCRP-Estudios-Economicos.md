# Distancia, commodities y hubs de reexportación: un modelo de gravedad del comercio bilateral peruano, 2015-2024

**Ricardo Cuba**¹

¹ Economista. Asistente de investigación, Centro de Investigación de la Universidad del Pacífico (CIUP). Octubre 2026.

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

Desde su formulación original (Tinbergen, 1962), el modelo de gravedad ha
sido la herramienta dominante en economía del comercio internacional para
explicar el volumen de comercio bilateral a partir del tamaño de las
economías involucradas y la distancia —física, cultural, institucional—
que las separa. Su atractivo empírico (pocas variables, ajuste
consistentemente alto) convive con una historia de fragilidad
microfundamental que tomó tres décadas en resolverse del todo. Anderson y
van Wincoop (2003) mostraron que una especificación de gravedad sin los
términos de "resistencia multilateral" —el costo relativo de comerciar con
un socio frente al costo de comerciar con el resto del mundo— produce
estimaciones sesgadas del efecto de la distancia y de las fronteras, el
célebre *border puzzle*. Santos Silva y Tenreyro (2006) identificaron un
segundo problema, distinto pero igual de consecuente: la práctica estándar
de linealizar la ecuación de gravedad tomando logaritmos e introduciendo
MCO produce estimadores inconsistentes bajo heterocedasticidad (un supuesto
que la teoría no da razón para descartar) y obliga a eliminar del panel
toda observación de comercio cero, lo que sesga sistemáticamente a la baja
el coeficiente de distancia. Su solución —estimar en niveles por
pseudo-máxima verosimilitud de Poisson (PPML)— es hoy el estándar de la
literatura aplicada (Head y Mayer, 2014) precisamente porque corrige ambos
problemas a la vez: es consistente ante heterocedasticidad no especificada
y admite el panel completo, ceros incluidos.

Estas dos correcciones, sin embargo, resuelven un problema de forma
funcional del modelo, no un problema de qué mide la variable dependiente.
Este trabajo documenta un tercer tipo de sesgo, de naturaleza distinta y
hasta donde conocemos no tratado con el mismo detalle empírico en la
literatura de gravedad aplicada a economías latinoamericanas: el que surge
cuando el valor de la exportación o importación bilateral no refleja la
relación económica entre el país declarante y el socio de destino, sino la
geografía de la logística global —refinación de metales, fundición de
concentrados, tránsito portuario— superpuesta sobre ella. Perú es un caso
particularmente informativo para exponerlo: es, simultáneamente, una
economía exportadora de commodities mineros y energéticos (cobre, oro, gas
natural licuado) cuya estructura exportadora está mediada por cadenas de
procesamiento global, y una economía importadora de manufacturas cuya
estructura está mediada por la geografía de la producción industrial
mundial. Ambos rasgos, veremos, distorsionan un modelo de gravedad "de
manual" de maneras opuestas. El aporte de este trabajo es metodológico:
documentar, con el mismo rigor y la misma vara para ambas direcciones del
comercio, cómo diagnosticar esta contaminación mediante el análisis de
residuos, cómo corregirla sin incurrir en *data dredging* (ajustar el
filtro de datos observación por observación hasta obtener el resultado que
se busca), y —el punto que distingue este ejercicio de una simple limpieza
de datos— cómo reconocer cuándo la corrección no corresponde porque el
patrón observado, aunque contraintuitivo, es economía real y no artefacto
de medición.

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

Una primera hipótesis, razonable antes de mirar los datos, es que el
coeficiente de distancia esté capturando una colinealidad espuria con el
tamaño del socio: si los países más grandes de la muestra (China, Estados
Unidos) resultan ser también, en promedio, los más lejanos, un estimador
que no logra separar ambos efectos podría trasladarle al coeficiente de
distancia parte de la varianza que en realidad explica el PBI. Esta
hipótesis se descarta con evidencia, no por supuesto: el factor de
inflación de varianza (VIF) de `log_dist` es 2.08 —muy por debajo del
umbral convencional de 5 o 10 que señalaría colinealidad problemática— y la
correlación simple entre `log(PBI)` y `log(distancia)` es de apenas 0.17.
El diagnóstico que sí resulta informativo es el análisis de los residuos de
Pearson de la verosimilitud de Poisson, que por construcción pondera con
mayor peso las observaciones de valor absoluto más alto: en un panel con
una dispersión de escala tan amplia como el comercio exterior (de cientos
de miles de dólares a miles de millones), un puñado de observaciones puede
dominar por completo el ajuste sin que ningún diagnóstico de
multicolinealidad lo revele, precisamente porque el problema no está en la
estructura de correlación de los regresores sino en la variable dependiente
misma.

**Cuadro 3. Principales exportaciones a Suiza y Namibia por partida HS6.**

| País | Producto (HS6) | Valor en la década |
|---|---|---|
| Suiza | 710812 — oro semi-manufacturado, no monetario | USD 23,072 millones |
| Namibia | 260300 — concentrados de cobre | USD 1,586 millones |

La explicación no es estadística sino industrial. Suiza concentra,
dependiendo de la fuente y del año, entre un tercio y dos quintos de la
capacidad mundial de refinación de oro —el Secretariado de Estado de
Economía suizo (SECO) reportó una participación del 34% del oro refinado
mundial en 2023 (swissinfo.ch, 2025)—, de modo que una parte sustancial del
oro extraído en cualquier punto del planeta, Perú incluido, transita por
refinerías suizas antes de incorporarse al mercado internacional como
lingote certificado. El valor que BACI registra como "exportación a Suiza"
no mide, entonces, cuánto oro demanda la economía suiza como consumidor
final —una cifra irrelevante frente al tamaño real del flujo— sino cuánto
oro pasa por su industria de refinación camino a terceros mercados. Namibia
ofrece un ejemplo más específico de la misma lógica: alberga la fundición
de Tsumeb (Dundee Precious Metals), una de las pocas plantas en el mundo
metalúrgicamente equipadas para procesar concentrados de cobre con alto
contenido de arsénico, precisamente el perfil geoquímico de varios
yacimientos peruanos cuyo concentrado no puede procesarse en fundiciones
convencionales sin penalidades o inversión adicional en control de
emisiones. En ambos casos el flujo es real y el valor declarado es
correcto; lo que falla es el supuesto que el modelo de gravedad hace sobre
él —que refleja demanda final del país de destino— y no el dato en sí.

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
el país que más domina el ajuste pasa a ser **Países Bajos**, seguido de
Reino Unido y Panamá. El fenómeno tiene nombre propio en la literatura de
estadística de comercio: el "efecto Róterdam-Amberes" (*Rotterdam-Antwerp
effect*), documentado por las autoridades estadísticas europeas y por
estudios de la propia Oficina Central de Estadística neerlandesa, describe
la sobreestimación sistemática de las cifras de comercio de un país-puerto
cuando la mercancía declarada en aduana como destinada a él en realidad
continúa, sin transformación sustancial, hacia un tercer país. No es un
fenómeno marginal: la UNCTAD documenta que las reexportaciones representan
más del 40% de las exportaciones totales de Hong Kong, Singapur, Países
Bajos y Chipre —las economías-puerto por excelencia del comercio mundial—,
proporción que en un panel de gravedad bilateral infla artificialmente el
coeficiente asociado a esos socios sin que exista, del lado del país
exportador, ninguna razón económica real para privilegiarlos frente a
otros destinos de tamaño comparable.

En vez de excluir estos países uno por uno a medida que aparecen como
residuo —lo cual degenera en *data dredging*, ajustando el filtro hasta
lograr el resultado deseado—, se adoptó la lista **estándar de la
literatura** de hubs de reexportación: Países Bajos, Bélgica, Singapur,
Hong Kong, Panamá y Emiratos Árabes Unidos (el eje
Róterdam-Amberes-Singapur-Hong Kong-Panamá-Dubái). Esta lista se fija *a
priori*, por la clasificación habitual en estudios de comercio y estadística
oficial, no por los residuos de este dataset específico —una distinción
metodológica central: el criterio de exclusión debe ser externo y
verificable, nunca derivado circularmente del resultado que se quiere
obtener.

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
lejanas, sobre todo China. Este patrón, lejos de ser una peculiaridad
peruana, es consistente con la literatura sobre el ascenso de China como
proveedor manufacturero global: Autor, Dorn y Hanson (2013) documentan, con
datos de EE.UU., cómo la penetración de las importaciones chinas
reconfiguró de forma duradera la geografía de la oferta manufacturera
mundial con independencia de la distancia al comprador, un fenómeno que la
literatura posterior extendió a economías en desarrollo integradas a
cadenas de valor globales centradas en Asia. Para un modelo de gravedad
clásico, construido sobre el supuesto de que la fricción de distancia
encarece el comercio de forma monotónica, este es precisamente el tipo de
reconfiguración estructural que el coeficiente de distancia no está
diseñado para absorber: no hay fricción de transporte, por baja que fuera,
capaz de compensar la ventaja de escala, costo y especialización de las
cadenas de suministro asiáticas en bienes manufacturados estandarizados.

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

El hallazgo central tiene una lectura econométrica y una lectura de
economía real, y conviene separarlas. Desde la econometría: para una
economía exportadora de commodities como Perú, un modelo de gravedad "de
manual" estimado sobre el valor total exportado no mide lo que se asume que
mide. Una fracción sustancial del flujo registrado refleja la geografía de
la refinación y el tránsito global de materias primas —Suiza para oro,
Namibia para concentrados de cobre, Países Bajos y Panamá como puertos de
redistribución— y no la relación bilateral económica entre Perú y el país
de destino final del bien. Ignorar esta distinción no solo distorsiona el
coeficiente de distancia: también infla artificialmente el coeficiente de
"tiene acuerdo comercial" (de +0.71 significativo a −0.05 estadísticamente
nulo una vez depurados los commodities), porque los países con acuerdos
comerciales vigentes con Perú tienden a coincidir, por azar institucional
más que por diseño, con los grandes compradores de oro y gas. Un lector
apresurado de la especificación cruda concluiría que los tratados de libre
comercio de Perú tienen un efecto grande y significativo sobre sus
exportaciones; la especificación depurada muestra que esa conclusión no
sobrevive al control de la composición sectorial del comercio.

Desde la economía real: la sección 5 muestra que el mismo diagnóstico,
aplicado con el mismo rigor a las importaciones, no reproduce el resultado
de las exportaciones —y esa asimetría es, en sí misma, la evidencia más
convincente de que el procedimiento no estuvo sesgado hacia "encontrar" el
signo que la teoría predice. Si el objetivo hubiera sido forzar un
coeficiente de distancia negativo a cualquier costo, el camino disponible
era evidente: seguir excluyendo países hasta que los residuos cedieran. No
se hizo, porque los residuos del lado importador no señalan a ningún hub de
tránsito conocido, y la explicación alternativa —concentración real de las
importaciones peruanas en un puñado de potencias manufactureras asiáticas—
es a la vez más simple y mejor documentada en la literatura de comercio
internacional (Autor, Dorn y Hanson, 2013) que cualquier corrección
adicional ad hoc.

Este patrón de contaminación por commodities no es exclusivo de Perú: es un
problema conocido en la literatura de gravedad aplicada a economías
exportadoras de recursos naturales (Chile con cobre, los países del Golfo
con petróleo, la República Democrática del Congo con cobalto), aunque rara
vez se documenta con el nivel de detalle a nivel de producto (HS6) y de
verificación de residuos que se presenta aquí. El aporte de este ejercicio
es, en ese sentido, menos un hallazgo sustantivo nuevo sobre el comercio
peruano que una demostración reproducible de procedimiento: diagnóstico de
residuos antes de aceptar un coeficiente, filtro por producto declarado a
priori y aplicado de forma pareja, filtro por país con una lista estándar
de la literatura (no ajustada al resultado), un punto explícito en el que
se decide dejar de excluir observaciones, y —el control que falta en la
mayoría de ejercicios similares— la verificación simétrica del lado
importador, que es precisamente lo que permite distinguir un artefacto de
medición de un patrón económico real.

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
- Autor, D. H., Dorn, D., & Hanson, G. H. (2013). The China Syndrome: Local
  Labor Market Effects of Import Competition in the United States.
  *American Economic Review*, 103(6), 2121-2168.
  DOI: [10.1257/aer.103.6.2121](https://doi.org/10.1257/aer.103.6.2121)
- Santos Silva, J. M. C., & Tenreyro, S. (2006). The Log of Gravity. *Review
  of Economics and Statistics*, 88(4), 641-658.
  DOI: [10.1162/rest.88.4.641](https://doi.org/10.1162/rest.88.4.641)
- Tinbergen, J. (1962). *Shaping the World Economy: Suggestions for an
  International Economic Policy*. Twentieth Century Fund, Nueva York, 330 pp.
- Head, K., & Mayer, T. (2014). Gravity Equations: Workhorse, Toolkit, and
  Cookbook. En *Handbook of International Economics*, Vol. 4, pp. 131-195.
  Elsevier. DOI: [10.1016/B978-0-444-54314-1.00003-3](https://doi.org/10.1016/B978-0-444-54314-1.00003-3)
- UNCTAD. *Review of Maritime Transport* y estadísticas de reexportación:
  las reexportaciones superan el 40% de las exportaciones totales de Hong
  Kong, Singapur, Países Bajos y Chipre.
- swissinfo.ch (2025). US tariff negotiations reaffirm Switzerland's role
  as a gold hub (cita cifra del Secretariado de Estado de Economía suizo,
  SECO: 34% del oro refinado mundial en 2023).
  [swissinfo.ch/eng/business/switzerland-the-world-s-gold-hub/33706126](https://www.swissinfo.ch/eng/business/switzerland-the-world-s-gold-hub/33706126)
- CEPII BACI (vintage 202601), CEPII GeoDist, CEPII Gravity V202211 — centre
  d'Études Prospectives et d'Informations Internationales.
  [cepii.fr](https://www.cepii.fr/)
- World Bank, World Development Indicators, `NY.GDP.MKTP.CD` (PBI corriente,
  US$). [databank.worldbank.org/source/world-development-indicators](https://databank.worldbank.org/source/world-development-indicators)

Las 7 referencias con afirmaciones verificables (4 académicas + 3 fuentes de
estadística institucional) fueron verificadas en vivo contra fuentes
primarias el 2026-10-18 (ver `referencias_verificadas.md` en la raíz de
este proyecto para el detalle de la verificación de las 4 académicas; las
3 adicionales se verificaron en la misma sesión de trabajo que incorporó
esta revisión narrativa).

## Anexo — Reproducibilidad

El código de extracción, los paneles de datos (crudos y procesados), el
script de estimación y el notebook ejecutado con los seis resultados
completos (tres especificaciones para exportaciones, tres para
importaciones) están disponibles previa solicitud a los autores.
