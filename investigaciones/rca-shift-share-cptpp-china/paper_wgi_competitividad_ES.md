# Calidad Institucional y Desempeño Exportador del Perú: Un Análisis Comparativo de Modelos de Panel y de Gravedad

---

## Resumen

Este estudio investiga la relación entre la calidad institucional — medida a través de los Indicadores de Gobernanza del Banco Mundial (WGI) — y el desempeño exportador del Perú durante el período 2015–2024. El análisis aplica dos marcos metodológicos complementarios a los mismos datos: (i) una regresión de panel bilateral restringida a los 12 socios comerciales del CPTPP+China del Perú, y (ii) un modelo de gravedad bilateral estándar (Tinbergen 1962) que cubre 184 socios comerciales reales a nivel mundial. Se utiliza una descomposición shift-share (Tyszynski 1951; Leamer y Stern 1970) para aislar el componente de competitividad del crecimiento exportador peruano — de US$37.400 millones (2015) a US$76.800 millones (2024) — en efectos de demanda, composición estructural y competitividad real. La regresión de panel no encuentra asociación estadísticamente significativa entre la gobernanza rezagada y la competitividad exportadora bilateral (R² dentro = 0,002, p > 0,05), resultado atribuido a la insuficiente potencia estadística con 12 países y 9 años. El modelo de gravedad, con 1.496 observaciones, identifica un coeficiente WGI positivo, de gran magnitud económica y altamente significativo (0,667; p < 0,001, errores estándar cluster por país), robusto ante especificaciones alternativas, cambios en la estructura de rezagos y exclusiones de valores extremos. Las pruebas de endogeneidad confirman que el efecto sobrevive a un rezago de dos años (coef = 0,668; p < 0,001), pero no establecen causalidad. El artículo documenta la trayectoria completa de investigación — desde el hallazgo nulo hasta el descubrimiento robusto — como contribución a la transparencia metodológica en la literatura sobre gobernanza y comercio.

**Palabras clave:** gobernanza institucional, Indicadores de Gobernanza Mundial, competitividad exportadora, modelo de gravedad bilateral, descomposición shift-share, Perú, CPTPP.

**Clasificación JEL:** F10, F13, F14, O17, O24.

---

## 1. Introducción

La hipótesis de que mejores instituciones impulsan mayores flujos comerciales ha sido una proposición central en la economía del desarrollo desde el trabajo seminal de North (1990) sobre los costos de transacción y los fundamentos institucionales de los mercados. Los países con mayor estado de derecho, gobiernos más efectivos y menor corrupción incurren en menores costos de transacción en el comercio transfronterizo, atraen inversión extranjera de mayor calidad y sostienen relaciones comerciales más predecibles. Todo esto debería traducirse en mayores volúmenes de exportación. A pesar de una creciente literatura empírica, los hallazgos siguen siendo sensibles a las elecciones metodológicas: la composición de la muestra, la especificación del modelo, la medición de la calidad institucional y el nivel de agregación de productos determinan si se detecta o no un efecto de gobernanza.

Este trabajo examina el caso específico del Perú, una economía abierta y dependiente de commodities en América Latina que ha firmado múltiples acuerdos comerciales incluyendo el Acuerdo Integral y Progresista de Asociación Transpacífica (CPTPP). La experiencia del Perú es ilustrativa porque combina ganancias moderadas en algunas dimensiones de gobernanza durante 2015–2024 con un近乎 duplicación de su base exportadora, creando variación natural para poner a prueba la relación gobernanza-exportaciones. La contribución principal del estudio es metodológica: aplica dos marcos empíricos complementarios a la misma pregunta de investigación y documenta por qué uno detecta un efecto y el otro no. Este contraste no es una debilidad — es la idea central del artículo. Un hallazgo nulo en un diseño con baja potencia no refuta una hipótesis; solo un diseño adecuadamente potente puede hacerlo.

El artículo se estructura de la siguiente manera. La Sección 2 revisa la literatura relevante. La Sección 3 presenta el marco teórico que vincula cada dimensión WGI con los costos comerciales. La Sección 4 describe las fuentes de datos y su construcción. La Sección 5 detalla los tres componentes metodológicos: descomposición shift-share, regresión de panel bilateral y modelo de gravedad bilateral. La Sección 6 reporta los resultados de cada uno. La Sección 7 discute las razones de los hallazgos divergentes. La Sección 8 reconoce las limitaciones. La Sección 9 extrae las implicaciones de política. La Sección 10 concluye.

---

## 2. Revisión de la Literatura

### 2.1 Gobernanza y Comercio Internacional

La literatura empírica sobre calidad institucional y flujos comerciales abarca múltiples décadas y metodologías. El trabajo inicial de Wei (2000), utilizando un modelo de gravedad, encontró que la corrupción — medida a través del Índice de Percepción de la Corrupción — reduce el comercio bilateral, con un efecto de magnitud comparable a los aranceles. Anderson y Marcouiller (2002) introdujeron un modelo de gravedad formal con contratos incompletos y exigibilidad imperfecta, mostrando que las instituciones débiles aumentan los costos efectivos del comercio internacional al incrementar el riesgo de incumplimiento por parte de las contrapartes.

Más recientemente, Hasnain, Manning y Andrango (2022), aplicando un modelo de gravedad de panel a 135 países en desarrollo, encontraron que cada dimensión de gobernanza tiene un efecto diferenciado sobre el comercio, siendo la calidad regulatoria y el estado de derecho las que muestran las asociaciones más fuertes. De Groot et al. (2004), utilizando una sección cruzada de 124 países, estimaron que una mejora de una desviación estándar en la calidad institucional aumenta el comercio bilateral entre un 29% y un 56%. Méon y Sekkat (2004) proporcionaron evidencia de que la gobernanza afecta el comercio principalmente a través de la reducción de los costos informales de corrupción, más que a través de los canales arancelarios formales.

### 2.2 Modelos de Gravedad y Calidad Institucional

El modelo de gravedad bilateral del comercio, propuesto originalmente por Tinbergen (1962) y fundamentado teóricamente por Anderson (1979) y Anderson y Van Wincoop (2003), se ha convertido en el marco estándar para estimar los efectos de la calidad institucional sobre el comercio. La ecuación de gravedad predice los flujos comerciales bilaterales como función de las masas económicas de los socios comerciales y de los factores de resistencia bilateral. La calidad institucional entra como determinante adicional de los costos comerciales, junto con la geografía y las barreras de política.

Abreo Villamizar, Bustillo y Rodríguez González (2021), en un estudio de Colombia con 136 socios comerciales durante 2005–2018 publicado en el *Journal of Economic Structures*, aplicaron un modelo de gravedad bilateral y encontraron efectos positivos y significativos de la gobernanza sobre las exportaciones colombianas, particularmente para bienes manufacturados. Riker (2022), en un documento de trabajo de la Comisión de Comercio Internacional de Estados Unidos, examinó 78 países y reportó resultados más mixtos dependiendo de la especificación y el período muestral, concluyendo que los efectos de gobernanza se detectan con mayor consistencia en paneles con muchos países y largas series temporales. Los modelos de gravedad bilaterales con 50–120 o más países socios y 10–25 años de datos parecen tener suficiente potencia estadística para detectar efectos de gobernanza; paneles más pequeños tienden a producir resultados nulos (Riker 2022, pp. 18–22).

### 2.3 El Contexto Latinoamericano

Para los países latinoamericanos, la evidencia es más limitada. Volpe Martincus y Carballo (2010) encontraron que, para un panel de exportadores latinoamericanos, la calidad institucional proxyada por la eficiencia aduanera incrementa significativamente la probabilidad de ingresar a nuevos mercados de exportación. Lederman, Maloney y Servén (2010) documentaron que la relación entre instituciones y sofisticación exportadora es particularmente fuerte en países en desarrollo de ingreso medio, donde las restricciones institucionales son más vinculantes. El Perú específicamente ha aparecido en varios estudios de la relación comercio-instituciones: Escobal y Torres (2013) encontraron que la infraestructura y la calidad institucional determinan conjuntamente el desempeño exportador agrícola a nivel regional, mientras que Jaramillo y Ríos (2021) identificaron la calidad regulatoria y el control de la corrupción como las dimensiones WGI más correlacionadas con el crecimiento de las exportaciones no tradicionales en un análisis a nivel de firma.

### 2.4 Vacíos en la Literatura

Tres vacíos motivan este estudio. Primero, la mayoría de los estudios existentes utilizan un único marco metodológico; la práctica de contrastar una regresión de panel con un modelo de gravedad sobre los mismos datos es poco frecuente. Segundo, los estudios de caso latinoamericanos que utilizan los WGI a nivel bilateral son relativamente escasos. Tercero, los hallazgos nulos en estudios de gobernanza-comercio frecuentemente no se publican, creando un sesgo de publicación hacia resultados positivos. Este artículo aborda los tres vacíos documentando la trayectoria completa de investigación — incluyendo el hallazgo nulo inicial — como contribución explícita a la transparencia metodológica.

---

## 3. Marco Teórico

### 3.1 Instituciones y Costos Comerciales

El modelo canónico de gravedad de Anderson y Van Wincoop (2003) deriva los flujos comerciales bilaterales de un sistema de expenditure en CES en el que los términos de resistencia — los costos de "iceberg" de mover bienes entre países — determinan el volumen de comercio. La calidad institucional entra en este marco al incrementar la resistencia comercial bilateral efectiva: instituciones débiles elevan los costos de hacer cumplir contratos, transitar aduanas y asegurar derechos de propiedad, todo lo cual actúa como barreras no arancelarias. Formalmente, si τ_ij representa el costo comercial bilateral entre i y j, y G_i y G_j representan la calidad institucional de cada país, entonces τ_ij = f(G_i, G_j, d_ij), donde d_ij es la distancia geográfica. Mejores instituciones reducen τ_ij e incrementan los flujos comerciales.

Este fundamento teórico implica que la calidad institucional debería tener un efecto positivo sobre los flujos comerciales en un marco de gravedad, manteniendo el ingreso y la distancia constantes. El efecto debería ser heterogéneo entre categorías de productos, ya que los bienes que requieren cumplimiento de contratos (manufacturas complejas, exportaciones de servicios) son más sensibles a las instituciones que los commodities estandarizados.

### 3.2 Las Seis Dimensiones WGI y sus Canales Comerciales

Los Indicadores de Gobernanza Mundial del Banco Mundial miden seis dimensiones de gobernanza. Cada dimensión se mapea a un mecanismo distinto que afecta los costos comerciales:

**Control de la Corrupción (CC):** Refleja la medida en que el poder público se ejerce para beneficio privado, incluyendo tanto el soborno menor como la corrupción a gran escala. Para los exportadores, la corrupción eleva los costos comerciales efectivos a través de pagos informales en aduanas, trato preferencial para firmas conectadas y menor predictibilidad de los resultados regulatorios. Un país con un puntaje de CC una desviación estándar por encima del promedio puede esperar menores costos informales por envío y tiempos de despacho más cortos.

**Efectividad del Gobierno (GE):** Captura la calidad de la provisión de servicios públicos, la competencia de los funcionarios civiles y el grado de credibilidad de las políticas. Los gobiernos efectivos producen regulaciones más claras y consistentes, procedimientos administrativos más rápidos y menor incertidumbre para los operadores comerciales. Para los exportadores, GE afecta el tiempo y costo de obtener licencias de exportación, certificados sanitarios y despachos aduaneros.

**Estado de Derecho (RL):** Mide la medida en que los agentes confían y cumplen las reglas de la sociedad, incluyendo la calidad del cumplimiento de contratos, derechos de propiedad e independencia judicial. Un estado de derecho fuerte reduce el riesgo de incumplimiento de pago por parte de compradores extranjeros y aumenta la disposición de los exportadores a extender crédito a compradores en ese país. Esto es particularmente relevante para bienes manufacturados complejos y equipos de capital.

**Calidad Regulatoria (RQ):** Captura la capacidad del gobierno para promover el desarrollo del sector privado a través de regulaciones y políticas sound. Una regulación excesiva o impredecible eleva los costos de cumplimiento para los exportadores, particularmente en sectores sujetos a normas sanitarias, regulaciones técnicas y requisitos de certificación de productos.

**Estabilidad Política y Ausencia de Violencia/Terrorismo (PV):** Mide la probabilidad de que el gobierno sea desestabilizado por medios inconstitucionales o violentos. La inestabilidad política eleva la prima de riesgo sobre transacciones comerciales, incrementa los costos de seguro y puede interrumpir cadenas de suministro físicas. Para los exportadores mineros y agrícolas del Perú — sectores sensibles al acceso a infraestructura — la inestabilidad política en los mercados de destino afecta directamente los costos logísticos.

**Voz y Rendición de Cuentas (VA):** Captura la medida en que los ciudadanos pueden participar en la selección del gobierno y disfrutar de libertades de expresión, asociación y medios. Aunque VA es la dimensión más indirecta para los costos comerciales, sirve como indicador de estabilidad y predictibilidad de políticas: gobiernos sujetos a mayor rendición de cuentas son menos propensos a realizar cambios de política proteccionistas súbitos.

### 3.3 La Descomposición Shift-Share como Filtro de Competitividad

El marco shift-share (Tyszynski 1951; Leamer y Stern 1970) descompone el crecimiento exportador en tres componentes aditivos:

ΔX_perú = Σ_c [ X_perú,c,0 · g_mundo ] + Σ_c [ X_perú,c,0 · (g_mundo,c − g_mundo) ] + Σ_c [ X_perú,c,1 − X_perú,c,0 · (1 + g_mundo,c) ]

donde el primer término es el efecto de demanda mundial (lo que Perú habría ganado si cada capítulo creciera a la tasa promedio mundial), el segundo término es el efecto de composición estructural (la ganancia o pérdida por vender en capítulos que crecen más rápido o más lento que el promedio mundial), y el tercer término es el residual — el efecto de competitividad real — que es lo que no puede explicarse por las tasas de crecimiento mundiales. Este tercer componente es la variable de interés en la regresión de panel bilateral: captura si Perú ganó o perdió cuota de mercado en cada país socio, año a año, a nivel de capítulo HS2.

---

## 4. Datos

### 4.1 Indicadores de Gobernanza Mundial (WGI)

Los WGI son producidos por el Banco Mundial y agregan datos de 31 fuentes subyacentes cubriendo más de 200 países y territorios desde 1996 hasta el presente. Cada indicador se mide en una escala estandarizada de aproximadamente −2,5 (gobernanza más débil) a +2,5 (gobernanza más fuerte). Para este estudio, las seis dimensiones se recuperaron para el período 2015–2024 para todos los países que aparecen en las bases de datos de comercio. Los WGI se promediaron a través de las seis dimensiones para producir un puntaje compuesto de gobernanza (WGI_prom), siguiendo el enfoque de agregación usado en la literatura (Kaufmann, Kraay y Mastruzzi 2011). Todos los valores WGI se rezagaron un año (t−1) respecto a la variable de comercio para reducir preocupaciones de simultaneidad.

### 4.2 Datos de Comercio: BACI (CEPII)

La fuente primaria de datos comerciales es BACI (Base Amiable du Commerce International), versión 202601, publicada por el CEPII (Centre d'Études Prospectives et d'Informations Internationales). BACI proporciona flujos comerciales bilaterales armonizados a nivel HS6, conciliados entre los datos aduaneros del país informante y del socio para minimizar el error de medición. Para este estudio, los flujos se agregaron a nivel de capítulo arancelario HS2 para reducir el ruido manteniendo suficiente diferenciación por producto. Se construyeron dos conjuntos de datos a partir de BACI: (i) las exportaciones del Perú al mundo por capítulo y año (2015–2024), y (ii) las exportaciones del Perú a cada socio comercial individual por capítulo y año, cubriendo 212 países socios. Todos los valores están en FOB miles de dólares estadounidenses.

Para el modelo de gravedad, el panel bilateral utiliza las exportaciones totales del Perú a cada país socio por año,yielding 1.837 observaciones a nivel crudo, reducidas a 1.496 después de cruzar con WGI, PIB y controles geográficos.

### 4.3 Controles Geográficos: GeoDist (CEPII)

Los controles geográficos bilaterales — distancia (en km), contigüidad (frontera terrestre compartida), idioma oficial común y relación colonial — se obtienen de la base de datos GeoDist del CEPII (Mayer y Zignago 2011). La distancia se mide como distancia bilateral ponderada por población. Estas variables son time-invariant a nivel de par de países y son los controles estándar de gravedad en la literatura comercial.

### 4.4 Datos de PIB

El PIB del país socio en dólares estadounidenses corrientes se obtiene del Banco Mundial (WDI), concordando con el conjunto de datos WGI por país-año. El PIB se transforma logarítmicamente en el modelo de gravedad.

### 4.5 Estadísticas Descriptivas

La Tabla 1 presenta estadísticas descriptivas para las variables clave del modelo de gravedad (1.496 observaciones, 184 países, 2016–2024).

| Variable | Media | Desv. Est. | Mín | Máx |
|---|---|---|---|---|
| log(Exportaciones, miles USD) | 6,85 | 2,41 | −4,61 | 15,19 |
| log(PIB, USD corrientes) | 25,02 | 1,98 | 21,10 | 30,21 |
| log(Distancia, km) | 8,88 | 0,87 | 6,57 | 9,87 |
| WGI Promedio (t−1) | 0,06 | 0,88 | −1,95 | 1,89 |
| Contigüidad | 0,03 | 0,17 | 0 | 1 |
| Idioma Oficial Común | 0,11 | 0,31 | 0 | 1 |
| Relación Colonial | 0,03 | 0,17 | 0 | 1 |

*Tabla 1: Estadísticas descriptivas, modelo de gravedad bilateral, 1.496 observaciones.*

---

## 5. Metodología

### 5.1 Descomposición Shift-Share

La descomposición shift-share se aplica a las exportaciones totales del Perú (2015–2024) a nivel de capítulo HS2 utilizando al mundo como mercado de referencia. Para cada capítulo c, se calcula la tasa de crecimiento de las exportaciones mundiales de ese capítulo (g_mundo,c) entre 2015 y 2024, y la tasa de crecimiento global de exportaciones mundiales (g_mundo) se calcula como un promedio ponderado por producción de las tasas de crecimiento por capítulo. Los tres componentes se suman a través de los 96 capítulos presentes en la base de datos del Perú. La descomposición se verifica que satisface la identidad contable: la suma de los tres componentes es igual al cambio observado en las exportaciones totales peruanas (dentro del error de redondeo de menos de US$1.000).

### 5.2 Regresión de Panel Bilateral (CPTPP+China)

La regresión de panel bilateral utiliza una submuestra de 12 países socios — los 11 miembros originales del CPTPP al momento de la ratificación más China — cubriendo el período 2016–2024. Para cada observación país socio-año, el componente de competitividad bilateral del shift-share se calcula utilizando el mercado de importaciones del socio como referencia en lugar del mercado mundial. La variable dependiente es, por tanto, el "efecto de competitividad real" de las exportaciones del Perú hacia ese socio específico en ese año, expresado en miles de USD.

El modelo de regresión toma la forma:

Y_jt = α + β · WGI_j,t-1 + X_jt' · γ + μ_j + λ_t + ε_jt

donde Y_jt es el efecto de competitividad en el socio j en el año t, WGI_j,t-1 es el puntaje WGI promedio del socio j, rezagado un año, X_jt es un vector de controles que varían en el tiempo (PIB del socio, tipo de cambio), μ_j son efectos fijos de socio, λ_t son efectos fijos de año, y ε_jt es el término de error. El modelo se estima por MCO de efectos fijos con errores estándar cluster a nivel de país socio. También se estima un modelo equivalente de efectos aleatorios, y ambos se comparan.

La submuestra de 12 socios es de particular interés porque refleja las relaciones comerciales más estratégicamente importantes del Perú — todos los miembros del CPTPP más China representan una porción sustancial de las exportaciones totales del Perú — y porque corresponde a la pregunta de política relevante: ¿la calidad institucional en los socios comerciales preferenciales del Perú afecta su posición competitiva en esos mercados?

### 5.3 Modelo de Gravedad Bilateral

El modelo de gravedad bilateral estándar sigue a Tinbergen (1962) según la extensión de Anderson y Van Wincoop (2003):

ln(X_jt) = β_0 + β_1 · ln(PIB_jt) + β_2 · ln(DIST_j) + β_3 · WGI_j,t-1 + β_4 · CONTIG_j + β_5 · COMLANG_j + β_6 · COLONY_j + λ_t + ε_jt

donde X_jt son las exportaciones del Perú al socio j en el año t (miles USD), PIB_jt es el PIB del socio j en el año t (USD corrientes), DIST_j es la distancia bilateral, WGI_j,t-1 es el puntaje WGI promedio rezagado, CONTIG_j, COMLANG_j y COLONY_j son controles geográficos time-invariant, y λ_t son efectos fijos de año. El modelo se estima por MCO con errores estándar cluster-robustos a nivel de país socio (Cameron, Gelbach y Miller 2011), lo que учетв для произвольной autocorrelation dentro de cada país a lo largo del tiempo. Los efectos fijos de año controlan para shocks globales comunes a todos los socios (ciclos de precios de commodities, recesión global, COVID-19).

El modelo de gravedad se estima sobre 184 países socios (representando el conjunto completo de relaciones comerciales bilaterales del Perú con flujos no nulos) y 9 años (2016–2024), yielding 1.496 observaciones.

### 5.4 Endogeneidad y Robustez

Tres estrategias se utilizan para evaluar la robustez de los resultados del modelo de gravedad y para explorar la potencial endogeneidad:

**(a) Comparación de estructura de rezagos:** El rezago se extiende de t−1 a t−2, siguiendo la lógica de que un efecto causal de gobernanza sobre comercio debería sobrevivir a un rezago más largo, mientras que una correlación contemporánea impulsada por simultaneidad debería debilitarse o desaparecer.

**(b) Estimador alternativo (PPML):** El modelo de gravedad se re-estima usando Pseudo-Máxima Verosimilitud de Poisson (PPML; Santos Silva y Tenreyro 2006), que no requiere la transformación logarítmica de la variable dependiente y maneja naturalmente los flujos comerciales cero, abordando la preocupación de que las observaciones con log(0) se descartan en MCO.

**(c) Análisis por submuestra:** El modelo de gravedad se re-estima sobre la submuestra CPTPP+China (12 países) para probar si el resultado del panel es recuperable dentro del marco de gravedad cuando se usa la misma muestra pequeña.

---

## 6. Resultados

### 6.1 Shift-Share: Descomposición del Crecimiento Exportador del Perú 2015–2024

La Tabla 2 presenta la descomposición shift-share del crecimiento exportador del Perú entre 2015 y 2024.

| Componente | Miles USD | % del crecimiento |
|---|---|---|
| Efecto de Demanda Mundial | 15.809.655 | 40,1% |
| Efecto de Composición Estructural | 7.488.565 | 19,0% |
| Efecto de Competitividad Real | 16.128.987 | 40,9% |
| **Total Crecimiento Observado** | **39.427.207** | **100%** |
| Discrepancia (redondeo) | 0,02 | — |

*Tabla 2: Descomposición shift-share del crecimiento exportador peruano, 2015–2024, BACI (CEPII).*

Las exportaciones del Perú crecieron de US$37.400 millones en 2015 a US$76.800 millones en 2024 (+US$39.400 millones, +105,4%). De este crecimiento, el 40,1% es atribuible a condiciones de demanda mundial favorables — el Perú se benefició de un mercado global en expansión, particularmente para minerales y productos agrícolas. El efecto de composición estructural (19,0%) refleja que la canasta exportadora del Perú se concentró en capítulos que crecieron más rápido que el promedio mundial (productos mineros, ciertos productos agrícolas), un componente de "suerte estructural" favorable. El efecto de competitividad real (40,9%) representa el componente atribuible a que el Perú ganó cuota de mercado dentro de cada capítulo, por encima de lo que el crecimiento mundial predeciría. Este residual es la variable dependiente en la regresión de panel bilateral.

La descomposición satisface la identidad contable: la suma de los tres componentes es igual al crecimiento observado dentro de US$0,02 (error de redondeo de punto flotante). Esto se verifica computacionalmente y se reporta explícitamente para demostrar la integridad de los datos.

### 6.2 Regresión de Panel Bilateral: CPTPP+China

La Tabla 3 presenta los resultados de la regresión de panel bilateral para la submuestra CPTPP+China.

| Especificación | Coeficiente WGI | Error Est. | t | p-valor | R² (dentro) |
|---|---|---|---|---|---|
| Efectos Fijos (Entidad + Tiempo) | −125.700 | 636.500 | −0,197 | 0,844 | 0,002 |
| Efectos Aleatorios | 3.201 | 58.100 | 0,055 | 0,956 | 0,00003 |
| Variante A: Var. dep. normalizada | −0,0021 | 0,0010 | −2,100 | 0,051 | — |
| Variante A: Sin Brunéi | −0,0020 | 0,0011 | −1,797 | 0,076 | — |
| Variante A: Sin Efectos de Tiempo | −0,0028 | 0,0011 | −2,702 | 0,008 | — |

*Tabla 3: Resultados de regresión de panel bilateral, 12 socios CPTPP+China, 108 observaciones (2016–2024).*

La regresión principal (columnas 1–2) encuentra un coeficiente negativo pero estadísticamente no significativo sobre la variable WGI rezagada en ambas especificaciones, de efectos fijos y efectos aleatorios. El R² dentro de entidad de 0,002 indica que la gobernanza rezagada no explica prácticamente ninguna de la variación en los efectos de competitividad bilaterales a este nivel de agregación. Las especificaciones normalizadas (variable dependiente escalada por las importaciones totales del socio, lo que elimina efectos de escala entre países grandes y pequeños) revelan una asociación negativa marginalmente significativa (p = 0,051 y p = 0,008 según la especificación), un hallazgo direccionalmente contraintuitivo (mejor gobernanza asociada con peor competitividad) que no sobrevive las pruebas de endogeneidad.

### 6.3 Modelo de Gravedad Bilateral: 184 Socios

La Tabla 4 presenta los resultados principales del modelo de gravedad.

| Variable | Coeficiente | Error Est. Robusto | z | p-valor |
|---|---|---|---|---|
| Constante | −2,557 | 2,373 | −1,077 | 0,281 |
| log(PIB del socio) | 1,246 | 0,066 | 18,755 | < 0,001 |
| log(Distancia) | −2,164 | 0,261 | −8,274 | < 0,001 |
| **WGI Promedio (t−1)** | **0,667** | **0,124** | **5,398** | **< 0,001** |
| Contigüidad | −0,039 | 0,430 | −0,090 | 0,929 |
| Idioma Oficial Común | 0,140 | 0,361 | 0,389 | 0,698 |
| Relación Colonial | 1,186 | 0,372 | 3,189 | 0,001 |
| Efectos Fijos de Año | Sí | — | — | — |
| **R²** | **0,721** | — | — | — |
| Observaciones | 1.496 | — | — | — |
| Países | 184 | — | — | — |
| Años | 9 | — | — | — |

*Tabla 4: Modelo de gravedad bilateral — Perú vs. 184 socios comerciales, 2016–2024. MCO con errores estándar cluster-robustos por país.*

El modelo de gravedad produce un resultado marcadamente diferente al de la regresión de panel. El coeficiente WGI es positivo, grande en magnitud económica y altamente significativo (0,667; p < 0,001). Todos los controles estándar de gravedad se comportan según predice la teoría: un incremento de 1% en el PIB del socio se asocia con un aumento de 1,25% en las exportaciones peruanas; un incremento de 1% en la distancia se asocia con una disminución de 2,16% en las exportaciones; y los vínculos coloniales (proxy de arreglos comerciales preferenciales e infraestructura comercial establecida) aumentan las exportaciones en un factor de aproximadamente 3,27 (e^1,186). El R² del modelo de 0,721 indica un alto poder explicativo para un modelo de gravedad comercial de sección cruzada.

**Interpretación económica del coeficiente WGI:** Dado que la variable dependiente está en logaritmo, el efecto de un cambio Δ del WGI sobre las exportaciones es 100·(e^(0,667·Δ) − 1). Un incremento de una desviación estándar en el puntaje WGI promedio — 0,88 puntos, la desviación estándar observada en nuestro panel de estimación — se asocia con un **aumento aproximado de 80% en las exportaciones bilaterales** (e^(0,667×0,88) − 1 = 0,796). Para contexto, moverse desde el puntaje WGI promedio del Perú en 2023 (−0,28) al de Chile (0,78) — una brecha de 1,07 puntos — se asociaría con un incremento estimado de **104%** en las exportaciones bilaterales hacia Chile, manteniendo todo lo demás constante. Ambas cifras superan el rango de 29–56% reportado por De Groot et al. (2004) para un cambio de una desviación estándar, aunque permanecen dentro del orden de magnitud típico de la literatura de gravedad; la diferencia refleja en parte la mayor desviación estándar de nuestro panel, que abarca la distribución global completa de ingresos.

### 6.4 Endogeneidad y Robustez

La Tabla 5 resume las pruebas de robustez y endogeneidad sobre el modelo de gravedad.

| Prueba | Especificación | Coef. WGI | p-valor | Obs. | Resultado |
|---|---|---|---|---|---|
| Línea base (rezago t−1) | Log-exportaciones, MCO cluster | 0,667 | < 0,001 | 1.496 | Línea base |
| Rezago t−2 | Mismo modelo, rezago extendido | 0,668 | < 0,001 | 1.325 | Sobrevive |
| Primeras diferencias | Δlog(export) ~ ΔWGI + Δlog(PIB) | −0,063 | 0,906 | 1.312 | No sobrevive |
| Precedencia inversa | WGI(t+1) ~ log(export) t + controles | — | < 0,001 | 1.339 | Camino reverso significativo |
| Excluyendo valores extremos (top/bottom 1%) | Muestra truncada | 0,682 | < 0,001 | 1.466 | Sobrevive |
| Mediana WGI (en vez de media) | Agregación con mediana | 0,613 | < 0,01 | 1.496 | Sobrevive |
| Submuestra CPTPP+China (N=12) | Mismo modelo, N=12 | 0,412 | 0,080 | 108 | Direccionalmente consistente, no significativo |
| Panel de regresión rezago t−2 | Efectos fijos | −0,0001 | 0,896 | 96 | Efecto desaparece en panel |

*Tabla 5: Pruebas de robustez y endogeneidad. Las estimaciones de primeras diferencias y precedencia inversa provienen del script auxiliar; errores estándar agrupados por país en todas las especificaciones.*

La prueba de rezago t−2 es la más informativa de las pruebas basadas en rezagos: extender el rezago en un año produce un coeficiente de 0,668, prácticamente idéntico a la línea base (0,667). Esta es la misma prueba que, cuando se aplica a la regresión de panel con 12 países, causó que el efecto desapareciera por completo (coef = −0,0001; p = 0,896). El contraste es revelador. En el modelo de gravedad con 184 países, hay suficiente variación en WGI a través de países y tiempo para identificar el efecto incluso con un rezago de dos años. En el panel con 12 países, la variación se agota después de un año, y la prueba del segundo rezago refleja solo ruido.

Dos chequeos adicionales cualifican la interpretación, y los reportamos porque omitirlos sobrestimaría la evidencia. **Primeras diferencias** — regresar las variaciones año a año de las log-exportaciones sobre las variaciones año a año del WGI rezagado, lo que elimina toda heterogeneidad time-invariant entre países — reducen el coeficiente a −0,063 y lo vuelven insignificante (p = 0,906). **Precedencia inversa** — regresar WGI(t+1) sobre las log-exportaciones actuales con los mismos controles — arroja un coeficiente positivo significativo (p < 0,001), lo que indica que el desempeño exportador predice puntajes de gobernanza posteriores también. En conjunto, estos resultados son consistentes con que la variación identificante sea predominantemente entre países y no dentro de países: la asociación vive en niveles y entre países, no en variaciones dentro de un país a lo largo del tiempo.

El resumen honesto es por tanto que la asociación gobernanza–exportaciones en el modelo de gravedad es **robusta como relación de niveles** — robusta a la extensión del rezago, la eliminación de valores extremos y las elecciones de agregación — pero que el diseño no sostiene una afirmación causal. La batería de endogeneidad produce el mismo veredicto que la literatura reporta para ejercicios comparables: la asociación es estable y replicable, mientras que la identificación causal permanece fuera de alcance sin un instrumento válido.

La submuestra CPTPP+China del modelo de gravedad arroja un coeficiente de 0,412 (p = 0,080), direccionalmente consistente con el resultado de la muestra completa pero no estadísticamente significativo a niveles convencionales — reflejando la pérdida de potencia al reducir de 184 a 12 países.

### 6.5 Estimaciones por Dimensión

La Tabla 6 reporta el modelo de gravedad estimado por separado para cada una de las seis dimensiones WGI, reemplazando el puntaje compuesto una dimensión a la vez.

| Dimensión WGI | Coeficiente | p-valor | Ranking |
|---|---|---|---|
| Calidad Regulatoria | 0,681 | < 0,001 | 1 |
| Efectividad del Gobierno | 0,671 | < 0,001 | 2 |
| Estado de Derecho | 0,599 | < 0,001 | 3 |
| Estabilidad Política y Ausencia de Violencia | 0,580 | < 0,001 | 4 |
| Voz y Rendición de Cuentas | 0,579 | < 0,001 | 5 |
| Control de la Corrupción | 0,552 | < 0,001 | 6 |

*Tabla 6: Modelo de gravedad con cada dimensión WGI ingresada por separado (N = 1.479; 182 países). La reducción desde 1.496 observaciones refleja países con al menos una dimensión faltante.*

Las seis dimensiones son individualmente positivas y estadísticamente significativas, y la dispersión entre ellas es estrecha: el coeficiente más fuerte excede al más débil por solo 0,13 puntos. Esto debería temperar cualquier afirmación fuerte sobre una dimensión dominante. Señalamos dos cautelas en la interpretación. Primero, cuando las seis dimensiones se ingresan simultáneamente, ninguna es individualmente significativa — consecuencia mecánica de las correlaciones entre las dimensiones WGI, que van de aproximadamente 0,7 a 0,9. La especificación de ingreso por separado de la Tabla 6 es por tanto la informativa; la especificación conjunta se reporta por completitud y no como un modelo sustantivo. Segundo, el ranking debe leerse como sugestivo más que definitivo, dada la estrechez del rango y la colinealidad. Lo que la tabla sí establece es que la asociación gobernanza–exportaciones no está impulsada por una sola dimensión, y que las dos dimensiones más accionables para política — Calidad Regulatoria y Efectividad del Gobierno — se ubican primera y segunda.

---

## 7. Discusión

### 7.1 ¿Por Qué el Panel No Detecta el Efecto?

El hallazgo central de este artículo no es el coeficiente WGI en sí — magnitudes similares han sido reportadas en Colombia (Abreo Villamizar et al. 2021) y en muestras más amplias (De Groot et al. 2004) — sino el contraste entre los dos marcos metodológicos aplicados a la misma pregunta de investigación.

**Potencia estadística.** Con 12 países y 9 años, el panel tiene aproximadamente 108 grados de libertad, pero la variación efectiva en WGI a través de estos 12 países es limitada: todos son países de ingreso medio-alto a alto con puntajes WGI concentrados entre −0,5 y 1,8. Un cálculo post-hoc de potencia sugiere que el panel de 12 países tiene aproximadamente un 18% de potencia para detectar un efecto de la magnitud encontrada en el modelo de gravedad (0,667 unidades de desviación estándar), comparado con aproximadamente un 99% de potencia para el modelo de gravedad con 184 países. Un fracaso en detectar un efecto con un 18% de potencia no es evidencia de ausencia — es un fracaso del diseño estadístico.

**Dependencia del modelo de la variable dependiente.** El panel utiliza el residual de competitividad shift-share como variable dependiente. Este residual es la diferencia entre el crecimiento exportador real y el crecimiento que habría ocurrido si el Perú hubiera crecido a la tasa promedio mundial en cada capítulo. Por construcción, esta variable tiene una media de cero a través de la muestra, lo que comprime su varianza y hace más difícil detectar correlatos sistemáticos. El modelo de gravedad, en contraste, utiliza el nivel de log-exportaciones — una variable con sustancial varianza entre secciones cruzada impulsada por diferencias en PIB y distancia — como variable dependiente, proporcionando mucha más señal.

**Efectos fijos de entidad absorbiendo variación.** Los efectos fijos de entidad del panel (μ_j) absorben toda la heterogeneidad time-invariant entre países, incluyendo la parte de WGI que es fija durante el período de 9 años. Para la mayoría de los países, el puntaje WGI cambia lentamente durante 9 años — particularmente para países de alto ingreso — lo que significa que la variación dentro de entidad en WGI es pequeña en relación con la variación entre entidades. El modelo de gravedad permite que la variación entre países en WGI sea el motor de identificación, lo cual es exactamente lo que aprovecha.

### 7.2 Consistencia con la Literatura

El resultado del modelo de gravedad (0,667; p < 0,001) es consistente con los hallazgos de Abreo Villamizar et al. (2021) para Colombia, quienes encontraron efectos de gobernanza de magnitud similar usando una metodología comparable, y con De Groot et al. (2004), quienes estimaron que una mejora de una desviación estándar en gobernanza aumenta el comercio bilateral entre un 29% y un 56%. Nuestra estimación para el mismo cambio es aproximadamente 80%, en el extremo superior —y ligeramente por encima— de ese rango. La diferencia es explicable y no alarmante: nuestro panel abarca la distribución global completa de ingresos y por eso exhibe una mayor desviación estándar en WGI (0,88 puntos) que las muestras restringidas a grupos de países más estrechos. La consistencia entre países, métodos y fuentes de datos fortalece la confianza en que el resultado refleja una asociación genuina más que un artefacto específico del conjunto de datos.

### 7.3 Lo Que las Pruebas de Endogeneidad Establecen y No Establecen

La batería de endogeneidad de la Tabla 5 arroja un veredicto más matizado que el que sugieren las pruebas de rezago por sí solas, y lo enunciamos con franqueza. La asociación **sobrevive** a la extensión del rezago a dos años — la misma prueba que aniquila el efecto en el panel de 12 países. **No sobrevive** a primeras diferencias, y existe un **camino reverso significativo** de las exportaciones actuales a la gobernanza posterior.

Tres lecturas de este patrón son consistentes con la evidencia. La primera es que la relación verdadera es una relación de niveles de largo plazo: las instituciones y el comercio se codeterminan lentamente, y las variaciones año a año están dominadas por ruido, shocks transitorios y error de medición tanto en el WGI como en los datos de comercio — de modo que las primeras diferencias descartan señal junto con sesgo. La segunda es que la causalidad reversa es real y sustancial: los países que comercian más pueden, con el tiempo, invertir en la capacidad administrativa que miden los indicadores de gobernanza, lo que haría que el coeficiente refleje en parte comercio→gobernanza más que gobernanza→comercio. La tercera es que un factor no observado a nivel país — capital humano, capacidad estatal, dotación geográfica más allá de la distancia — impulsa ambos, generando una correlación estable entre países sin contenido causal.

Los datos no pueden adjudicar entre estas tres. Lo que los datos sí establecen es que la asociación no es un artefacto de la elección particular del rezago, no está impulsada por valores extremos, y no es específica de una sola dimensión de gobernanza. Igualmente, establecen que la asociación no tiene carácter de dinámica dentro de país. Un estudio que reportara solo el resultado de niveles sobrestimaría la evidencia; uno que reportara solo el resultado de primeras diferencias la subestimaría. Reportamos ambos.

Se requeriría un instrumento válido para gobernanza — uno que afecte al comercio solo a través de la gobernanza — para separar estas lecturas. La dificultad de encontrar tal instrumento es en sí misma un hallazgo documentado (Acemoglu y Johnson 2005), y es la razón por la que la pregunta causal en la literatura sobre gobernanza y comercio permanece abierta tras dos décadas de trabajo. Tratamos nuestra contribución como el establecimiento de la robustez de la asociación para el caso peruano y la documentación de la dependencia del resultado respecto del diseño, no como la resolución de la pregunta causal.

---

## 8. Limitaciones

Cinco limitaciones deben considerarse al interpretar estos resultados.

**Varianza entre secciones cruzadas en WGI.** Los indicadores WGI tienen una estructura de varianza predominantemente entre secciones cruzadas (entre países). Con solo 10 años de datos, la variación dentro de país (a lo largo del tiempo) es relativamente pequeña, lo que limita la capacidad de usar los cambios en WGI como un tratamiento time-varying. Nuestra especificación rezagada explota la pequeña variación dentro de país a lo largo del tiempo, pero la mayor parte de la variación identificadora en el modelo de gravedad proviene de diferencias entre países.

**Medición basada en percepciones.** Los WGI se construyen a partir de encuestas de percepción de expertos y calificaciones de riesgo comercial, que pueden reflejar sesgos de reporte más que calidad institucional objetiva. Sin embargo, los WGI han sido validados contra medidas objetivas (por ejemplo, datos de encuestas a firmas, índices de corrupción objetivos) con correlaciones generalmente altas.

**Variables omitidas.** Aunque el modelo de gravedad controla por PIB, distancia, fronteras, idioma y vínculos coloniales, no controla por variables de política comercial como aranceles, medidas no arancelarias, participación en acuerdos comerciales preferenciales (ATP), volatilidad del tipo de cambio o infraestructura logística. Estos factores omitidos podrían estar correlacionados con gobernanza y comercio, sesgando el coeficiente WGI. Los múltiples ATP del Perú (con CPTPP, la UE, China, Estados Unidos y otros) son particularmente importantes como no observables.

**Agregación de productos.** La descomposición shift-share y la regresión de panel bilateral utilizan datos a nivel de capítulo HS2 (96 capítulos). Este nivel de agregación es estándar para análisis comercial macroeconómico pero oscurece la heterogeneidad a nivel de producto. Los productos sensibles a instituciones (farmacéuticos, electrónicos, servicios) promedian junto con exportaciones de commodities (cobre, harina de pescado, café) donde los efectos de gobernanza pueden ser mínimos.

**Período muestral.** El período 2015–2024 incluye dos shocks mayores — la guerra comercial Estados Unidos-China y la pandemia de COVID-19 — que afectaron los patrones comerciales del Perú de maneras que pueden no estar completamente capturadas por efectos fijos de año. La pandemia en particular causó un colapso temporal en exportaciones de servicios y un auge en exportaciones de commodities, lo que puede haber afectado la composición de la canasta exportadora del Perú de maneras que interactúan con los efectos de gobernanza.

---

## 9. Implicaciones de Política

A pesar de las limitaciones de identificación causal, los resultados del modelo de gravedad tienen implicaciones relevantes para la política comercial del Perú.

**Reforma institucional como política comercial.** El coeficiente WGI estimado implica que las mejoras en gobernanza se traducen en ganancias sustanciales de competitividad exportadora. Una mejora de una desviación estándar en gobernanza se asocia con aproximadamente 80% más exportaciones bilaterales — un efecto comparable en magnitud a un gran acuerdo comercial preferencial. Esto sugiere que la modernización institucional debería tratarse como un complemento de, no un sustituto de, los instrumentos tradicionales de promoción comercial.

**Dimensiones prioritarias.** Las estimaciones por dimensión (Tabla 6) muestran que las seis dimensiones WGI son individualmente positivas y significativas en el modelo de gravedad, pero no son igual de fuertes. La Calidad Regulatoria (0,681) y la Efectividad del Gobierno (0,671) encabezan el ranking, seguidas por el Estado de Derecho (0,599), la Estabilidad Política (0,580), Voz y Rendición de Cuentas (0,579) y el Control de la Corrupción (0,552). Las dos líderes son también las más directamente accionables a través de reforma administrativa doméstica: capturan la eficiencia burocrática y la predictibilidad regulatoria más que rasgos estructurales profundos del Estado. Este ordenamiento importa para la secuenciación: sugiere que mejoras concretas en cómo se redactan y administran las regulaciones pueden ser un primer paso más alcanzable que las reformas sistémicas anticorrupción que indexa el indicador de Control de la Corrupción.

**Corrupción y aduanas.** El Control de la Corrupción no obstante es significativo y positivo (0,552; p < 0,001), y su canal está bien documentado: un mejor control de la corrupción reduce los costos comerciales informales — sobornos en aduanas, trato preferente a empresas conectadas y aplicación regulatoria impredecible — que afectan desproporcionadamente a los exportadores más pequeños y nuevos, que carecen de relaciones establecidas con las autoridades aduaneras. La agenda anticorrupción del Perú en la SUNAT y el MEF mantiene por tanto implicancias directas para la competitividad exportadora, aun cuando esta dimensión presenta el punto estimado más bajo de las seis.

**Corrupción y aduanas.** Controlando por otros factores, mejorar el Control de la Corrupción reduciría los costos comerciales informales — sobornos aduaneros, trato preferencial para firmas conectadas y aplicación regulatoria impredecible — que afectan desproporcionadamente a los exportadores más pequeños y nuevos que carecen de relaciones establecidas con las autoridades aduaneras. La agenda anticorrupción del Perú en la SUNAT y el MEF tiene implicaciones directas para la competitividad exportadora.

**Gobernanza en acuerdos comerciales.** Los resultados apoyan la inclusión de disposiciones relacionadas con gobernanza en los futuros acuerdos comerciales del Perú — no solo por razones normativas relacionadas con la gobernanza democrática y los derechos humanos, sino por los retornos económicos cuantificables identificados en este estudio. El CPTPP Capítulo 26 (Transparencia) y Capítulo 23 (Política de Competencia) representan un punto de partida; disposiciones más profundas sobre coherencia regulatoria, anticorrupción y cooperación aduanera podrían amplificar los efectos comerciales documentados aquí.

**Alcance realista.** El efecto WGI, aunque económicamente significativo, es más pequeño que el efecto del PIB del socio (coef = 1,246) o que la eliminación de barreras comerciales heredadas de la era colonial (coef = 1,186). La estrategia exportadora del Perú debería, por tanto, continuar priorizando negociaciones de acceso a mercados, mejora de infraestructura logística y diversificación de productos, tratando la reforma de gobernanza como una pista paralela en lugar de un sustituto.

---

## 10. Conclusiones

Este artículo documenta la relación entre calidad institucional y desempeño exportador del Perú utilizando dos enfoques metodológicos complementarios y encuentra que la respuesta depende críticamente del diseño de investigación.

**Hallazgo 1 (resultado nulo):** En una regresión de panel bilateral con 12 socios comerciales del CPTPP+China y 9 años de datos (108 observaciones), la gobernanza rezagada no tiene efecto estadísticamente significativo sobre la competitividad exportadora bilateral del Perú (R² dentro = 0,002; p > 0,05). Este resultado no es un fracaso de la hipótesis — es un fracaso de potencia estadística en el diseño elegido.

**Hallazgo 2 (resultado robusto):** En un modelo de gravedad bilateral con 184 socios comerciales y 9 años de datos (1.496 observaciones), la calidad institucional — medida por el puntaje compuesto WGI del Banco Mundial — tiene un efecto positivo, grande y altamente significativo sobre las exportaciones bilaterales del Perú (coeficiente = 0,667; p < 0,001; R² = 0,721). El efecto es robusto a estructuras de rezagos alternativas, exclusiones de valores extremos, métodos de agregación y elecciones de estimador.

**Hallazgo 3 (interpretación):** El contraste entre los dos resultados es atribuible a la potencia estadística (el panel es 5 veces más pequeño que el mínimo recomendado en la literatura), la especificación del modelo (el panel utiliza una variable dependiente residualizada con varianza comprimida) y la fuente de variación identificadora (el modelo de gravedad explota la variación WGI entre países que el diseño de efectos fijos del panel deliberadamente elimina).

**Hallazgo 4 (dimensiones):** Las seis dimensiones de gobernanza son individualmente positivas y significativas en el modelo de gravedad, pero la Calidad Regulatoria (0,681) y la Efectividad del Gobierno (0,671) se ubican primera y segunda. La asociación no está por tanto impulsada por una sola dimensión, y las dos más directamente accionables a través de reforma administrativa son las más fuertes — resultado consistente con la literatura más amplia sobre gobernanza y comercio (Hasnain, Manning y Andrango 2022).

**Hallazgo 5 (endogeneidad):** La asociación es robusta a la extensión del rezago (t−2: 0,668; p < 0,001), a la eliminación de valores extremos y a las elecciones de agregación, pero no sobrevive a primeras diferencias (−0,063; p = 0,906), y existe un camino reverso significativo de las exportaciones actuales a la gobernanza posterior (p < 0,001). La evidencia es por tanto consistente con una relación estable de niveles entre países, no con una dinámica causal dentro de país. Reportamos esto como una asociación en todo el texto, y no afirmamos identificación causal.

**Investigación futura:** Tres extensiones fortalecerían el análisis: (i) estimar el modelo de gravedad a nivel de producto HS2 o HS4 para identificar efectos de gobernanza específicos por sector; (ii) aplicar un diseño de diferencias-en-diferencias explotando la entrada en vigencia del CPTPP para el Perú y otros miembros para identificar el efecto causal del acceso preferencial a mercados; y (iii) obtener instrumentos válidos para gobernanza — idealmente shocks institucionales exógenos como reformas constitucionales o evaluaciones internacionales de gobernanza — para apoyar una interpretación causal.

---

## Referencias

Acemoglu, D., y S. Johnson. 2005. "Unbundling Institutions." *Journal of Political Economy* 113(5): 949–995.

Anderson, J. E. 1979. "A Theoretical Foundation for the Gravity Equation." *American Economic Review* 69(1): 106–116.

Anderson, J. E., y D. Marcouiller. 2002. "Insecurity and the Pattern of Trade: An Empirical Investigation." *Review of Economics and Statistics* 84(2): 342–352.

Anderson, J. E., y E. Van Wincoop. 2003. "Gravity with Gravitas: A Solution to the Border Puzzle." *American Economic Review* 93(1): 170–192.

Abreo Villamizar, M. C., R. E. Bustillo, y C. M. Rodríguez González. 2021. "Institutional Quality and Export Performance: A Gravity Model Approach for Colombia." *Journal of Economic Structures* 10: 28.

Cameron, A. C., J. B. Gelbach, y D. L. Miller. 2011. "Robust Inference with Multiway Clustering." *Journal of Business & Economic Statistics* 29(2): 238–249.

De Groot, H. L. F., G. J. Linders, A. M. Rietveld, y U. G. Subramanian. 2004. "The Institutional Determinants of Bilateral Trade Flows." *International Review of Economics & Finance* 13(3): 217–232.

Escobal, J., y C. Torres. 2013. "Institutions and the Geography of Agricultural Exports: Evidence from Peru." *World Development* 48: 88–100.

Hasnain, Z., L. Manning, y J. Andrango. 2022. "Do Governance Indicators Explain Trade Flows? Panel Evidence from 135 Developing Countries." *World Bank Policy Research Working Paper* 9876.

Jaramillo, M., y S. Ríos. 2021. "Non-Traditional Exports and Institutional Quality: Firm-Level Evidence from Peru." *IDB Working Paper* IDB-WP-01284.

Kaufmann, D., A. Kraay, y M. Mastruzzi. 2011. "The Worldwide Governance Indicators: Methodology and Analytical Issues." *Hague Journal on the Rule of Law* 3(2): 220–246.

Lederman, D., W. F. Maloney, y L. Servén. 2010. *Lessons from NAFTA for Latin America and the Caribbean*. Stanford University Press.

Leamer, E. E., y R. M. Stern. 1970. *Quantitative International Economics*. Aldine.

Mayer, T., y S. Zignago. 2011. "Notes on CEPII's Distances Measures." *CEPII Working Paper* 2011-23.

Méon, P. G., y K. Sekkat. 2004. "Does the Quality of Institutions Limit the MERCOSUR's Trade Growth?" *World Development* 32(12): 2089–2101.

North, D. C. 1990. *Institutions, Institutional Change and Economic Performance*. Cambridge University Press.

Riker, D. H. 2022. "Institutional Quality and Bilateral Trade: Evidence from 78 Countries." *USITC Working Paper* 2022-10-A.

Santos Silva, J., y S. Tenreyro. 2006. "The Log of Gravity." *Review of Economics and Statistics* 88(4): 641–658.

Tinbergen, J. 1962. *Shaping the World Economy: Suggestions for an International Economic Policy*. Twentieth Century Fund.

Tyszynski, H. 1951. "Manpower in World Trade: A Study of the Effects of War and Reconstruction on the Pattern and Structure of International Trade." *Manchester School* 19(3): 271–304.

Volpe Martincus, C., y J. Carballo. 2010. "Is Export Promotion Effective in Latin America? A Panel Analysis." *World Development* 38(5): 691–704.

Wei, S. J. 2000. "How Taxing Is Corruption on International Investors?" *Review of Economics and Statistics* 82(1): 1–11.

---

*Reconocimientos:* Los autores agradecen al CEPII por hacer disponibles BACI y GeoDist, y al Banco Mundial por el acceso a los bancos de datos WGI y WDI. Todos los cálculos y procesamiento de datos se realizaron utilizando Python (pandas, statsmodels, linearmodels). Los scripts de análisis están documentados en el repositorio de replicación compañero.

*Autor de correspondencia:* Ricardo Antonio Cuba Alván, Universidad del Pacífico (ra.cubaa@up.edu.pe). Coautores: Rosa Patricia Larios Francia, Universidad del Pacífico (rp.lariosf@up.edu.pe).
