# Calidad Institucional y Desempeño Exportador del Perú: Un Análisis Comparativo de Modelos de Panel y de Gravedad

**Documento de trabajo, octubre de 2026.** Ricardo Antonio Cuba Alván y Rosa Patricia Larios Francia, Universidad del Pacífico.

---

## Resumen

Este estudio investiga la asociación entre la calidad institucional — medida con los Indicadores de Gobernanza Mundial (WGI) del Banco Mundial — y el desempeño exportador del Perú en 2015–2024. El análisis aplica dos marcos a los mismos datos de comercio: (i) una regresión de panel bilateral con 12 socios (los otros diez miembros originales del CPTPP, el Reino Unido y China) y (ii) un modelo de gravedad estimado por MCO (Tinbergen 1962) de las exportaciones del Perú hacia 184 socios. Una descomposición shift-share (Tyszynski 1951; Leamer y Stern 1970) separa el crecimiento exportador, de US$37.400 millones (2015) a US$76.800 millones (2024), en demanda mundial (40,1%), composición estructural (19,0%) y un residuo de competitividad (40,9%). El panel no encuentra asociación estadísticamente significativa entre la gobernanza rezagada del socio y ese residuo (R² dentro = 0,002; p > 0,05). El modelo de gravedad, con 1.496 observaciones, estima un coeficiente de 0,667 (p < 0,001, errores estándar agrupados por socio) sobre el WGI rezagado del **destino**. El Perú es el único exportador: su propio WGI no varía entre socios dentro de un año y queda absorbido por los efectos fijos de año. El coeficiente asocia la gobernanza del destino con las exportaciones peruanas hacia ese destino. No estima el efecto de las instituciones peruanas. La asociación sobrevive a un rezago de dos años (coeficiente 0,668; p < 0,001) y a las exclusiones de valores extremos y a la agregación que sí se estimaron. No sobrevive a primeras diferencias (p = 0,906). Hay un camino significativo de las exportaciones corrientes hacia la gobernanza posterior (p < 0,001). No se estimó pseudo-máxima verosimilitud de Poisson, así que el texto no afirma robustez entre estimadores. Las seis dimensiones de gobernanza del destino son individualmente significativas en regresiones separadas. No se hace una afirmación causal.

**Palabras clave:** gobernanza institucional, Indicadores de Gobernanza Mundial, competitividad exportadora, modelo de gravedad bilateral, descomposición shift-share, Perú, CPTPP.

**Clasificación JEL:** F10, F13, F14, O17, O24.

---

## 1. Introducción

La hipótesis de que mejores instituciones impulsan mayores flujos comerciales ha sido una proposición central en la economía del desarrollo desde el trabajo seminal de North (1990) sobre los costos de transacción y los fundamentos institucionales de los mercados. Los países con mayor estado de derecho, gobiernos más efectivos y menor corrupción incurren en menores costos de transacción en el comercio transfronterizo, atraen inversión extranjera de mayor calidad y sostienen relaciones comerciales más predecibles. Todo esto debería traducirse en mayores volúmenes de exportación. A pesar de una creciente literatura empírica, los hallazgos siguen siendo sensibles a las elecciones metodológicas: la composición de la muestra, la especificación del modelo, la medición de la calidad institucional y el nivel de agregación de productos determinan si se detecta o no un efecto de gobernanza.

Este trabajo examina el caso específico del Perú, una economía abierta y dependiente de productos primarios en América Latina que ha firmado múltiples acuerdos comerciales, incluido el Tratado Integral y Progresista de Asociación Transpacífico (CPTPP). La experiencia del Perú combina un movimiento moderado en algunas dimensiones de gobernanza durante 2015–2024 con una casi duplicación de su base exportadora. La contribución principal es metodológica: los dos marcos responden preguntas distintas. El panel pregunta si los cambios de un año a otro en la gobernanza del socio se alinean con el residuo de competitividad del Perú en ese mercado. La gravedad pregunta si el Perú exporta más hacia destinos con mayor puntaje de gobernanza. Ninguno de los dos diseños identifica el efecto de las instituciones del Perú sobre sus exportaciones. Un resultado nulo en el panel de 12 socios no refuta una hipótesis de gobernanza, y un coeficiente de gravedad significativo no la establece para el Perú.

El artículo se estructura de la siguiente manera. La Sección 2 revisa la literatura relevante. La Sección 3 presenta el marco teórico que vincula cada dimensión WGI con los costos comerciales. La Sección 4 describe las fuentes de datos y su construcción. La Sección 5 detalla los tres componentes metodológicos: descomposición shift-share, regresión de panel bilateral y modelo de gravedad bilateral. La Sección 6 reporta los resultados de cada uno. La Sección 7 discute las razones de los hallazgos divergentes. La Sección 8 reconoce las limitaciones. La Sección 9 precisa qué pueden y qué no pueden informar las estimaciones. La Sección 10 concluye.

---

## 2. Revisión de la Literatura

### 2.1 Gobernanza y Comercio Internacional

La literatura empírica sobre calidad institucional y flujos comerciales abarca múltiples décadas y metodologías. Wei (2000) estudia la inversión extranjera directa, no el comercio de mercancías. En una muestra de doce países de origen y 45 países de destino, un mayor nivel de corrupción en el país receptor se asocia con menor IED entrante; en su estimación de referencia, pasar del nivel de corrupción de Singapur al de México tiene una asociación negativa comparable a un aumento grande de la tasa del impuesto a las empresas. Anderson y Marcouiller (2002) estiman un modelo estructural de demanda de importaciones en el que la inseguridad actúa como un impuesto oculto al comercio. Su resumen publicado indica que las instituciones inadecuadas restringen el comercio aproximadamente tanto como los aranceles.

Álvarez, Barbero, Rodríguez-Pose y Zofío (2018) estiman una gravedad sectorial para 186 países entre 1996 y 2012. Las condiciones institucionales en el destino y la distancia institucional entre socios se asocian con el comercio bilateral; la asociación del destino es mayor en agricultura y materias primas que en manufacturas y servicios, y aumenta de forma moderada en el tiempo. El resumen publicado de de Groot, Linders, Rietveld y Subramanian (2004) reporta que un marco institucional similar se asocia con cerca de 13% más de comercio bilateral, y que un aumento de una desviación estándar en la calidad institucional se asocia con cerca de 30–44% más de comercio bilateral, según el cambio corresponda al importador o al exportador. Esos porcentajes no son el rango de 29–56% que citaba un borrador anterior de este texto. Méon y Sekkat (2004) encuentran que la calidad institucional se asocia con las exportaciones manufactureras y con la atracción de IED en países de Oriente Medio y el Norte de África durante los años noventa. No separa un canal de corrupción informal de un equivalente arancelario.

### 2.2 Modelos de Gravedad y Calidad Institucional

El modelo de gravedad bilateral del comercio, propuesto originalmente por Tinbergen (1962) y fundamentado teóricamente por Anderson (1979) y Anderson y van Wincoop (2003), es el marco usual para estimar la asociación entre calidad institucional y comercio. La ecuación de gravedad relaciona el comercio bilateral con las masas económicas de los socios (en general el PIB) y con factores de resistencia bilateral (distancia, frontera, idioma). La calidad institucional entra como un correlato adicional de los costos de comercio, junto con la geografía y la política comercial.

Abreo, Bustillo y Rodriguez (2021) estiman un modelo de gravedad de las exportaciones colombianas hacia 136 socios entre 2005 y 2018. La calidad institucional de Colombia y la distancia institucional respecto de los socios se asocian con el desempeño exportador, y los autores destacan la calidad regulatoria y el estado de derecho. Su especificación incluye las instituciones del exportador, de modo que no es el mismo objeto que el coeficiente solo del destino estimado más abajo. Riker (2022) estima la asociación entre la calidad regulatoria WGI de un país y su PIB y su comercio de manufacturas con Estados Unidos. Las asociaciones comerciales son mayores, en términos porcentuales, para los países en desarrollo. El documento de trabajo no reporta la muestra bilateral ni el tamaño mínimo de panel que un borrador anterior le atribuía. Esas afirmaciones quedan retiradas.

### 2.3 El Contexto Latinoamericano

Para América Latina, la evidencia directamente pertinente es más delgada de lo que afirmaba un borrador anterior. Volpe Martincus y Carballo (2008) usan datos de firmas del Perú en 2001–2005 y encuentran que las actividades de promoción de exportaciones se asocian con mayores exportaciones, sobre todo en el margen extensivo de productos y destinos. El artículo estudia la promoción de PROMPEX. No mide eficiencia aduanera y no es un panel de varios países con puntajes WGI. Tres citas de ese borrador no existen en la forma en que se dieron y se retiran. Una cuarta atribución, que ligaba las instituciones con la sofisticación exportadora, también se retira: el libro citado no reporta ese resultado y no se usa aquí. Los títulos retirados están en la bitácora de verificación, no en la bibliografía.

### 2.4 Vacíos en la Literatura

Tres vacíos motivan este estudio. Primero, la mayoría de los estudios existentes utilizan un único marco metodológico; la práctica de contrastar una regresión de panel con un modelo de gravedad sobre los mismos datos es poco frecuente. Segundo, los estudios de caso latinoamericanos que utilizan los WGI a nivel bilateral son relativamente escasos. Tercero, los hallazgos nulos en estudios de gobernanza-comercio frecuentemente no se publican, creando un sesgo de publicación hacia resultados positivos. Este artículo aborda los tres vacíos documentando la trayectoria completa de investigación — incluyendo el hallazgo nulo inicial — como contribución explícita a la transparencia metodológica.

---

## 3. Marco Teórico

### 3.1 Instituciones y Costos Comerciales

El modelo canónico de gravedad de Anderson y van Wincoop (2003) deriva los flujos comerciales bilaterales de un sistema de expenditure en CES en el que los términos de resistencia — los costos de "iceberg" de mover bienes entre países — determinan el volumen de comercio. La calidad institucional entra en este marco al incrementar la resistencia comercial bilateral efectiva: instituciones débiles elevan los costos de hacer cumplir contratos, transitar aduanas y asegurar derechos de propiedad, todo lo cual actúa como barreras no arancelarias. Formalmente, si τ_ij representa el costo comercial bilateral entre i y j, y G_i y G_j representan la calidad institucional de cada país, entonces τ_ij = f(G_i, G_j, d_ij), donde d_ij es la distancia geográfica. Mejores instituciones reducen τ_ij e incrementan los flujos comerciales.

Este fundamento teórico implica que la calidad institucional debería tener un efecto positivo sobre los flujos comerciales en un marco de gravedad, manteniendo el ingreso y la distancia constantes. El efecto debería ser heterogéneo entre categorías de productos, ya que los bienes que requieren cumplimiento de contratos (manufacturas complejas, exportaciones de servicios) son más sensibles a las instituciones que los commodities estandarizados.

### 3.2 Las Seis Dimensiones WGI y sus Canales Comerciales

Los Indicadores de Gobernanza Mundial del Banco Mundial miden seis dimensiones de gobernanza. Cada dimensión se mapea a un mecanismo distinto que afecta los costos comerciales:

**Control de la Corrupción (CC):** Refleja la medida en que el poder público se ejerce para beneficio privado, incluyendo tanto el soborno menor como la corrupción a gran escala. Para los exportadores, la corrupción eleva los costos comerciales efectivos a través de pagos informales en aduanas, trato preferencial para firmas conectadas y menor predictibilidad de los resultados regulatorios. Un país con un puntaje de CC una desviación estándar por encima del promedio puede esperar menores costos informales por envío y tiempos de despacho más cortos.

**Efectividad del Gobierno (GE):** Captura la calidad de la provisión de servicios públicos, la competencia de los funcionarios civiles y el grado de credibilidad de las políticas. Los gobiernos efectivos producen regulaciones más claras y consistentes, procedimientos administrativos más rápidos y menor incertidumbre para los operadores comerciales. Para los exportadores, GE afecta el tiempo y costo de obtener licencias de exportación, certificados sanitarios y despachos aduaneros.

**Estado de Derecho (RL):** Mide la medida en que los agentes confían y cumplen las reglas de la sociedad, incluyendo la calidad del cumplimiento de contratos, derechos de propiedad e independencia judicial. Un estado de derecho fuerte reduce el riesgo de incumplimiento de pago por parte de compradores extranjeros y aumenta la disposición de los exportadores a extender crédito a compradores en ese país. Esto es particularmente relevante para bienes manufacturados complejos y equipos de capital.

**Calidad Regulatoria (RQ):** Captura la capacidad del gobierno para promover el desarrollo del sector privado a través de regulaciones y políticas sólidas. Una regulación excesiva o impredecible eleva los costos de cumplimiento para los exportadores, particularmente en sectores sujetos a normas sanitarias, regulaciones técnicas y requisitos de certificación de productos.

**Estabilidad Política y Ausencia de Violencia/Terrorismo (PS):** Mide la probabilidad de que el gobierno sea desestabilizado por medios inconstitucionales o violentos. La inestabilidad política eleva la prima de riesgo sobre transacciones comerciales, incrementa los costos de seguro y puede interrumpir cadenas de suministro físicas. Para los exportadores mineros y agrícolas del Perú — sectores sensibles al acceso a infraestructura — la inestabilidad política en los mercados de destino afecta directamente los costos logísticos.

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

Para el modelo de gravedad, el panel bilateral utiliza las exportaciones totales del Perú a cada país socio por año, lo que da 1.837 observaciones a nivel crudo, reducidas a 1.496 después de cruzar con WGI, PIB y controles geográficos.

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

La descomposición shift-share se aplica a las exportaciones totales del Perú (2015–2024) a nivel de capítulo HS2, con el mundo como mercado de referencia. Para cada capítulo c se calcula la tasa de crecimiento de las exportaciones mundiales de ese capítulo (g_mundo,c) entre 2015 y 2024. La tasa agregada (g_mundo) es el crecimiento de las exportaciones mundiales totales, equivalente a un promedio de las tasas por capítulo ponderado por las exportaciones, no por la producción. Los tres componentes se suman sobre los 96 capítulos presentes en la base del Perú. La identidad contable exige que esos tres componentes sumen el cambio observado. No exige que el residuo de competitividad tenga media cero. En las estimaciones de más abajo ese residuo es US$16.100 millones, el 40,9% del cambio. El residuo de la identidad, en la Tabla 2, es 0,02 miles de dólares (unos US$20), dentro de una tolerancia de US$1.000.

### 5.2 Regresión de Panel Bilateral (CPTPP+China)

La regresión de panel bilateral usa 12 países socios en 2016–2024. El Perú es el exportador y no es uno de los 12. Los socios, tomados de los scripts de replicación, son Australia, Brunéi Darussalam, Canadá, Chile, China, Japón, Malasia, México, Nueva Zelanda, Singapur, Vietnam y el Reino Unido. Esa lista son los otros diez miembros originales del CPTPP, más el Reino Unido, más China. No es "los 11 miembros originales del CPTPP más China": los signatarios originales incluyen al Perú, y el Reino Unido no fue signatario original. Para cada socio-año, el componente de competitividad bilateral del shift-share se calcula con el mercado de importaciones del socio como referencia, en lugar del mercado mundial. La variable dependiente es ese componente para las exportaciones del Perú hacia el socio en ese año, en miles de dólares.

El modelo de regresión toma la forma:

Y_jt = α + β · WGI_j,t-1 + X_jt' · γ + μ_j + λ_t + ε_jt

donde Y_jt es el efecto de competitividad en el socio j en el año t, WGI_j,t-1 es el puntaje WGI promedio del socio j, rezagado un año, X_jt es un vector de controles que varían en el tiempo (PIB del socio, tipo de cambio), μ_j son efectos fijos de socio, λ_t son efectos fijos de año, y ε_jt es el término de error. El modelo se estima por MCO de efectos fijos con errores estándar cluster a nivel de país socio. También se estima un modelo equivalente de efectos aleatorios, y ambos se comparan.

La submuestra de 12 socios es de particular interés porque refleja las relaciones comerciales más estratégicamente importantes del Perú — todos los miembros del CPTPP más China representan una porción sustancial de las exportaciones totales del Perú — y porque corresponde a la pregunta de política relevante: ¿la calidad institucional en los socios comerciales preferenciales del Perú afecta su posición competitiva en esos mercados?

### 5.3 Modelo de Gravedad Bilateral

El modelo de gravedad bilateral estándar sigue a Tinbergen (1962) según la extensión de Anderson y van Wincoop (2003):

ln(X_jt) = β_0 + β_1 · ln(PIB_jt) + β_2 · ln(DIST_j) + β_3 · WGI_j,t-1 + β_4 · CONTIG_j + β_5 · COMLANG_j + β_6 · COLONY_j + λ_t + ε_jt

donde X_jt son las exportaciones del Perú al socio j en el año t (miles de dólares), PIB_jt es el PIB del socio j en el año t (dólares corrientes), DIST_j es la distancia bilateral, WGI_j,t-1 es el puntaje WGI promedio rezagado del destino, CONTIG_j, COMLANG_j y COLONY_j son controles geográficos invariantes en el tiempo, y λ_t son efectos fijos de año. El modelo se estima por MCO con errores estándar agrupados por socio. El agrupamiento admite correlación arbitraria dentro de cada socio a lo largo del tiempo. Cameron, Gelbach y Miller (2011) estudian la extensión de este estimador a varios sentidos de agrupamiento; las estimaciones de este texto usan un solo sentido. Los efectos fijos de año absorben los choques comunes a todos los socios, incluido el WGI del Perú, que no varía entre destinos en un año dado. El coeficiente de WGI_j,t-1 no es, por tanto, el efecto de las instituciones peruanas.

El modelo de gravedad se estima sobre 184 países socios (representando el conjunto completo de relaciones comerciales bilaterales del Perú con flujos no nulos) y 9 años (2016–2024), lo que da 1.496 observaciones.

### 5.4 Endogeneidad y Robustez

Tres estrategias se utilizan para evaluar la robustez de los resultados del modelo de gravedad y para explorar la potencial endogeneidad:

**(a) Comparación de estructura de rezagos:** El rezago se extiende de t−1 a t−2, siguiendo la lógica de que un efecto causal de gobernanza sobre comercio debería sobrevivir a un rezago más largo, mientras que una correlación contemporánea impulsada por simultaneidad debería debilitarse o desaparecer.

**(b) Estimador no reportado.** Santos Silva y Tenreyro (2006) muestran que los MCO sobre el logaritmo de las exportaciones descartan los flujos cero y pueden estar sesgados bajo heterocedasticidad, y proponen la pseudo-máxima verosimilitud de Poisson. Esta versión no estima ese estimador. La sección 4.2 registra 212 socios en el extracto BACI y 1.837 observaciones crudas de socio-año, frente a 184 socios y 1.496 observaciones en la muestra de MCO. El texto no separa esa pérdida entre flujos cero y datos faltantes de WGI, PIB o geografía. La robustez al estimador no es un resultado de este trabajo.

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

Los tres componentes suman el crecimiento observado salvo el residuo de la Tabla 2, que es 0,02 miles de dólares (unos US$20). La tolerancia de menos de US$1.000 de la sección 5.1 se refiere a ese mismo residuo. El componente de competitividad es US$16.100 millones. No es un residuo de media cero.

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

El modelo de gravedad produce un resultado distinto al del panel. El coeficiente del WGI del destino es positivo y estadísticamente significativo (0,667; p < 0,001). Un PIB del socio 1% mayor se asocia con exportaciones peruanas 1,25% mayores. Una distancia 1% mayor se asocia con exportaciones 2,16% menores. El coeficiente de vínculo colonial, 1,186, corresponde a un factor de alrededor de 3,27 (la exponencial de 1,186). El R² de 0,721 es alto para esta regresión entre destinos. Son asociaciones. La especificación no tiene términos de resistencia multilateral importador-año, no controla acuerdos comerciales ni aranceles, y no reporta estimaciones de pseudo-máxima verosimilitud de Poisson.

**Qué mide el coeficiente WGI.** La variable dependiente está en logaritmos, de modo que un cambio Δ en el WGI del destino se asocia con un cambio porcentual de 100·(exp(0,667·Δ) − 1) en las exportaciones del Perú hacia ese destino. Un puntaje de destino una desviación estándar más alto — 0,88 puntos en esta muestra — se asocia con cerca de 80% más de exportaciones peruanas hacia ese destino (exp(0,667×0,88) − 1 = 0,796). Esto no es el efecto de elevar el WGI del Perú. Un borrador anterior ilustraba el coeficiente pasando del puntaje del Perú en 2023 (−0,28) al de Chile (0,78) y reportando un aumento de 104% en las exportaciones hacia Chile. Esa comparación aplica un coeficiente de destino al puntaje del exportador. Se retira. El resumen publicado de de Groot et al. (2004) reporta 30–44% para un cambio de una desviación estándar en un modelo donde las instituciones varían en los dos lados del par. Ese objeto no es el coeficiente de la Tabla 4, así que los dos porcentajes no se verifican entre sí.

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

Las seis dimensiones son individualmente positivas y estadísticamente significativas, y la dispersión entre ellas es estrecha: el coeficiente más fuerte excede al más débil por solo 0,13 puntos. Esto debería temperar cualquier afirmación fuerte sobre una dimensión dominante. Señalamos dos cautelas en la interpretación. Primero, cuando las seis dimensiones se ingresan simultáneamente, ninguna es individualmente significativa — consecuencia mecánica de las correlaciones entre las dimensiones WGI, que van de aproximadamente 0,7 a 0,9. La especificación de ingreso por separado de la Tabla 6 es por tanto la informativa; la especificación conjunta se reporta por completitud y no como un modelo sustantivo. Segundo, el ranking debe leerse como sugestivo más que definitivo, dada la estrechez del rango y la colinealidad. Lo que la tabla establece es que la asociación entre la gobernanza del destino y las exportaciones peruanas no está impulsada por una sola dimensión WGI. Calidad Regulatoria y Efectividad del Gobierno tienen las estimaciones puntuales más altas. Ese ranking describe destinos. No es una secuencia para reformar las instituciones peruanas.

---

## 7. Discusión

### 7.1 ¿Por Qué el Panel No Detecta el Efecto?

El contraste útil es entre dos diseños, no entre dos estimaciones del mismo efecto. Abreo, Bustillo y Rodriguez (2021) y de Groot et al. (2004) incluyen la calidad institucional del lado exportador, o de los dos lados. La Tabla 4 no.

**Potencia estadística.** El panel tiene 12 conglomerados y 9 años. Los efectos fijos de socio y de año consumen grados de libertad, de modo que «108 grados de libertad» exagera lo que queda para la pendiente del WGI. Errores estándar agrupados con 12 conglomerados son una base débil para la inferencia. Un borrador anterior reportaba una potencia post hoc de 18% para un efecto de «0,667 unidades de desviación estándar», frente a 99% en la muestra de gravedad. Ese cálculo compara una semielasticidad en puntos logarítmicos de una variable dependiente con un residuo medido en miles de dólares en otra. Se retira. Un resultado nulo en este panel no es evidencia de que la gobernanza del destino sea irrelevante, y no es evidencia sobre las instituciones del Perú.

**El residuo de competitividad no tiene media cero.** La variable dependiente del panel es el componente de competitividad del shift-share: el crecimiento exportador observado menos el crecimiento implicado por las tasas de crecimiento por capítulo del mercado de referencia. La identidad contable exige que los componentes de demanda, composición y competitividad sumen el cambio total. En la descomposición agregada suman US$39.400 millones, de los cuales la competitividad es US$16.100 millones. Nada en esa identidad obliga a que el término de competitividad tenga media cero, y la Tabla 2 muestra que no la tiene. El modelo de gravedad usa el nivel logarítmico de las exportaciones, que varía con fuerza entre destinos según el PIB y la distancia. Las dos variables dependientes no son reescalamientos una de la otra.

**Efectos fijos de entidad que absorben variación.** Los efectos fijos de entidad del panel (μ_j) absorben toda la heterogeneidad entre países que no cambia en el tiempo, incluida la parte del WGI que es fija en los 9 años. Para la mayoría de los países el puntaje WGI cambia lento en 9 años — en particular en los de ingreso alto —, de modo que la variación dentro de la entidad es pequeña frente a la variación entre entidades. El WGI del modelo de gravedad es sobre todo variación entre países, que es la que el modelo aprovecha.

### 7.2 Consistencia con la Literatura

El resultado de gravedad (0,667; p < 0,001) tiene el mismo signo que las asociaciones de instituciones del destino en Álvarez et al. (2018) y que las asociaciones de calidad institucional en Abreo, Bustillo y Rodriguez (2021) y de Groot et al. (2004). No coincide con su magnitud, porque esos trabajos no estiman un coeficiente de MCO de un solo exportador sobre el WGI del destino solamente. El resumen publicado de de Groot et al. (2004) reporta 30–44% para un cambio de una desviación estándar, no 29–56%. La cifra de cerca de 80% en este texto es la exponencial de 0,667×0,88, menos uno, para un puntaje de destino. No es una réplica de de Groot et al.

### 7.3 Lo Que las Pruebas de Endogeneidad Establecen y No Establecen

La batería de endogeneidad de la Tabla 5 arroja un veredicto más matizado que el que sugieren las pruebas de rezago por sí solas, y lo enunciamos con franqueza. La asociación **sobrevive** a la extensión del rezago a dos años — la misma prueba que aniquila el efecto en el panel de 12 países. **No sobrevive** a primeras diferencias, y existe un **camino reverso significativo** de las exportaciones actuales a la gobernanza posterior.

Tres lecturas de este patrón son consistentes con la evidencia. La primera es que la relación verdadera es una relación de niveles de largo plazo: las instituciones y el comercio se codeterminan lentamente, y las variaciones año a año están dominadas por ruido, shocks transitorios y error de medición tanto en el WGI como en los datos de comercio — de modo que las primeras diferencias descartan señal junto con sesgo. La segunda es que la causalidad reversa es real y sustancial: los países que comercian más pueden, con el tiempo, invertir en la capacidad administrativa que miden los indicadores de gobernanza, lo que haría que el coeficiente refleje en parte comercio→gobernanza más que gobernanza→comercio. La tercera es que un factor no observado a nivel país — capital humano, capacidad estatal, dotación geográfica más allá de la distancia — impulsa ambos, generando una correlación estable entre países sin contenido causal.

Los datos no pueden adjudicar entre estas tres. Lo que los datos sí establecen es que la asociación no es un artefacto de la elección particular del rezago, no está impulsada por valores extremos, y no es específica de una sola dimensión de gobernanza. Igualmente, establecen que la asociación no tiene carácter de dinámica dentro de país. Un estudio que reportara solo el resultado de niveles sobrestimaría la evidencia; uno que reportara solo el resultado de primeras diferencias la subestimaría. Reportamos ambos.

Separar estas lecturas exigiría una variable que desplace la gobernanza y afecte al comercio solo por ese canal. Acemoglu y Johnson (2005) separan las instituciones de derechos de propiedad de las instituciones contractuales y muestran que los instrumentos históricos usados para «instituciones» no aíslan un solo canal. No documentan que no exista ningún instrumento para el vínculo gobernanza–comercio. Este texto no ofrece uno. La contribución es la asociación entre el WGI del destino y las exportaciones peruanas, y el registro de qué pruebas sobrevive esa asociación.

---

## 8. Limitaciones

Seis limitaciones deben considerarse al interpretar estos resultados.

**El coeficiente de gravedad no son las instituciones del Perú.** WGI_{j,t-1} es el puntaje del destino. Con un solo exportador, el puntaje del Perú es colineal con los efectos fijos de año. La regresión no responde si una reforma institucional en el Perú eleva las exportaciones peruanas. Describe hacia qué destinos van más exportaciones peruanas.

**Varianza entre secciones cruzadas en WGI.** Los indicadores WGI tienen una estructura de varianza predominantemente entre secciones cruzadas (entre países). Con solo 10 años de datos, la variación dentro de país (a lo largo del tiempo) es relativamente pequeña, lo que limita la capacidad de usar los cambios en WGI como un tratamiento time-varying. Nuestra especificación rezagada explota la pequeña variación dentro de país a lo largo del tiempo, pero la mayor parte de la variación identificadora en el modelo de gravedad proviene de diferencias entre países.

**Medición basada en percepciones.** Los WGI se construyen a partir de encuestas de percepción de expertos y calificaciones de riesgo comercial, que pueden reflejar sesgos de reporte más que calidad institucional objetiva. Sin embargo, los WGI han sido validados contra medidas objetivas (por ejemplo, datos de encuestas a firmas, índices de corrupción objetivos) con correlaciones generalmente altas.

**Variables omitidas.** Aunque el modelo de gravedad controla por PIB, distancia, fronteras, idioma y vínculos coloniales, no controla por variables de política comercial como aranceles, medidas no arancelarias, participación en acuerdos comerciales preferenciales (ATP), volatilidad del tipo de cambio o infraestructura logística. Estos factores omitidos podrían estar correlacionados con gobernanza y comercio, sesgando el coeficiente WGI. Los múltiples ATP del Perú (con CPTPP, la UE, China, Estados Unidos y otros) son particularmente importantes como no observables.

**Agregación de productos.** La descomposición shift-share y la regresión de panel bilateral utilizan datos a nivel de capítulo HS2 (96 capítulos). Este nivel de agregación es estándar para análisis comercial macroeconómico pero oscurece la heterogeneidad a nivel de producto. Los productos sensibles a instituciones (farmacéuticos, electrónicos, servicios) promedian junto con exportaciones de commodities (cobre, harina de pescado, café) donde los efectos de gobernanza pueden ser mínimos.

**Período muestral.** El período 2015–2024 incluye dos shocks mayores — la guerra comercial Estados Unidos-China y la pandemia de COVID-19 — que afectaron los patrones comerciales del Perú de maneras que pueden no estar completamente capturadas por efectos fijos de año. La pandemia en particular causó un colapso temporal en exportaciones de servicios y un auge en exportaciones de commodities, lo que puede haber afectado la composición de la canasta exportadora del Perú de maneras que interactúan con los efectos de gobernanza.

---

## 9. Qué pueden y qué no pueden informar las estimaciones

Las estimaciones no identifican un retorno a la reforma institucional en el Perú, y no ordenan reformas domésticas. La sección 9 de un borrador anterior extraía recomendaciones para la administración aduanera, el Ministerio de Economía y Finanzas y capítulos de gobernanza de acuerdos comerciales a partir del coeficiente 0,667. Esas recomendaciones se retiran. En el CPTPP, el Capítulo 16 es Política de Competencia, el 23 es Desarrollo, el 25 es Coherencia Regulatoria y el 26 es Transparencia y Anticorrupción. Citar los capítulos 26 y 23 como «Transparencia» y «Política de Competencia» era incorrecto, y el párrafo de política que usaba esas citas se elimina en lugar de repararse.

Lo que la Tabla 4 sostiene es más estrecho. Las exportaciones del Perú son mayores, en esta muestra de MCO, hacia destinos con un WGI rezagado más alto, condicional al PIB del destino, la distancia, la contigüidad, el idioma común, los vínculos coloniales y los efectos de año. Una diferencia de una desviación estándar en el WGI del destino (0,88 puntos) se alinea con cerca de 80% más exportaciones hacia ese destino. El PIB del socio (coeficiente 1,246) y el coeficiente de vínculo colonial (1,186) son mayores en la misma regresión. El patrón es consistente con selección de mercados: los envíos son mayores donde la gobernanza medida del destino es más alta. También es consistente con características omitidas del destino que se mueven con el WGI, incluido el ingreso por habitante, que no se controla por separado del PIB total, y el acceso preferencial, que no se controla en absoluto. La cifra de 80% no es una comparación con un acuerdo comercial preferencial.

La Tabla 6 dice que la misma asociación aparece para cada dimensión del destino ingresada sola. Calidad Regulatoria (0,681) y Efectividad del Gobierno (0,671) tienen los coeficientes más altos, luego Estado de Derecho (0,599), Estabilidad Política (0,580), Voz y Rendición de Cuentas (0,579) y Control de la Corrupción (0,552). La dispersión es 0,13. Las dimensiones son colineales. El orden no es un mandato sobre qué agencia peruana reformar primero. Control de la Corrupción es el menor de los seis coeficientes de destino. Por sí solo no implica una recomendación aduanera o fiscal.

---

## 10. Conclusiones

Este artículo documenta la relación entre calidad institucional y desempeño exportador del Perú utilizando dos enfoques metodológicos complementarios y encuentra que la respuesta depende críticamente del diseño de investigación.

**Hallazgo 1 (panel):** En un panel bilateral con 12 socios y 9 años (108 observaciones), el WGI rezagado del socio no tiene asociación estadísticamente significativa con el componente de competitividad bilateral del Perú (R² dentro = 0,002; p > 0,05). Con 12 conglomerados, efectos fijos de socio y de año, y una variable dependiente que no es el logaritmo de las exportaciones, este nulo no mide la potencia del modelo de gravedad y no dice nada sobre el WGI del Perú.

**Hallazgo 2 (gravedad, WGI del destino):** En un modelo de gravedad por MCO con 184 socios y 9 años (1.496 observaciones), el WGI compuesto rezagado del destino tiene una asociación positiva con las exportaciones del Perú hacia ese destino (coeficiente 0,667; p < 0,001; R² = 0,721). La asociación sobrevive al rezago de dos años, al recorte de valores extremos y a la agregación por mediana que sí se estimaron. No sobrevive a primeras diferencias. No se estimó la pseudo-máxima verosimilitud de Poisson. El coeficiente no es un efecto de la gobernanza peruana.

**Hallazgo 3 (por qué difieren los diseños):** El panel y el modelo de gravedad no estiman el mismo objeto. El panel usa un componente de competitividad en miles de dólares y absorbe las diferencias entre socios con efectos fijos. El modelo de gravedad usa niveles logarítmicos de exportaciones y obtiene la pendiente del WGI de las diferencias entre destinos. Un borrador anterior decía que el panel es cinco veces más pequeño que un mínimo de la literatura y se lo atribuía a Riker (2022). Riker (2022) no fija un tamaño mínimo de panel. La oración se retira.

**Hallazgo 4 (dimensiones):** Cada una de las seis dimensiones del destino es positiva y significativa cuando se ingresa sola. Calidad Regulatoria (0,681) y Efectividad del Gobierno (0,671) tienen los coeficientes más altos. El ranking describe destinos. No es evidencia sobre qué reforma peruana elevaría las exportaciones. Un borrador anterior atribuía el ranking a un documento de trabajo que no existe. Esa atribución se retira.

**Hallazgo 5 (endogeneidad):** La asociación es robusta a la extensión del rezago (t−2: 0,668; p < 0,001), a la eliminación de valores extremos y a las elecciones de agregación, pero no sobrevive a primeras diferencias (−0,063; p = 0,906), y existe un camino reverso significativo de las exportaciones actuales a la gobernanza posterior (p < 0,001). La evidencia es por tanto consistente con una relación estable de niveles entre países, no con una dinámica causal dentro de país. Reportamos esto como una asociación en todo el texto, y no afirmamos identificación causal.

**Investigación futura:** Tres extensiones fortalecerían el análisis: (i) estimar el modelo de gravedad a nivel de producto HS2 o HS4 para identificar efectos de gobernanza específicos por sector; (ii) aplicar un diseño de diferencias-en-diferencias explotando la entrada en vigencia del CPTPP para el Perú y otros miembros para identificar el efecto causal del acceso preferencial a mercados; y (iii) obtener instrumentos válidos para gobernanza — idealmente shocks institucionales exógenos como reformas constitucionales o evaluaciones internacionales de gobernanza — para apoyar una interpretación causal.

---

## Referencias

Abreo, C., R. Bustillo y C. Rodriguez. 2021. "The Role of Institutional Quality in the International Trade of a Latin American Country: Evidence from Colombian Export Performance." *Journal of Economic Structures* 10: 24. https://doi.org/10.1186/s40008-021-00253-5

Acemoglu, D., y S. Johnson. 2005. "Unbundling Institutions." *Journal of Political Economy* 113(5): 949–995. https://doi.org/10.1086/432166

Álvarez, I. C., J. Barbero, A. Rodríguez-Pose y J. L. Zofío. 2018. "Does Institutional Quality Matter for Trade? Institutional Conditions in a Sectoral Trade Framework." *World Development* 103: 72–87. https://doi.org/10.1016/j.worlddev.2017.10.010

Anderson, J. E. 1979. "A Theoretical Foundation for the Gravity Equation." *American Economic Review* 69(1): 106–116.

Anderson, J. E., y D. Marcouiller. 2002. "Insecurity and the Pattern of Trade: An Empirical Investigation." *Review of Economics and Statistics* 84(2): 342–352. https://doi.org/10.1162/003465302317411587

Anderson, J. E., y E. van Wincoop. 2003. "Gravity with Gravitas: A Solution to the Border Puzzle." *American Economic Review* 93(1): 170–192. https://doi.org/10.1257/000282803321455214

Cameron, A. C., J. B. Gelbach y D. L. Miller. 2011. "Robust Inference with Multiway Clustering." *Journal of Business & Economic Statistics* 29(2): 238–249. https://doi.org/10.1198/jbes.2010.07136

de Groot, H. L. F., G.-J. Linders, P. Rietveld y U. Subramanian. 2004. "The Institutional Determinants of Bilateral Trade Patterns." *Kyklos* 57(1): 103–123. https://doi.org/10.1111/j.0023-5962.2004.00245.x

Kaufmann, D., A. Kraay y M. Mastruzzi. 2011. "The Worldwide Governance Indicators: Methodology and Analytical Issues." *Hague Journal on the Rule of Law* 3(2): 220–246. https://doi.org/10.1017/S1876404511200046

Leamer, E. E., y R. M. Stern. 1970. *Quantitative International Economics*. Boston: Allyn and Bacon.

Mayer, T., y S. Zignago. 2011. "Notes on CEPII's Distances Measures: The GeoDist Database." CEPII Working Paper 2011-25. http://www.cepii.fr/PDF_PUB/wp/2011/wp2011-25.pdf

Méon, P.-G., y K. Sekkat. 2004. "Does the Quality of Institutions Limit the MENA's Integration in the World Economy?" *The World Economy* 27(9): 1475–1498. https://doi.org/10.1111/j.0378-5920.2004.00661.x

North, D. C. 1990. *Institutions, Institutional Change and Economic Performance*. Cambridge: Cambridge University Press.

Riker, D. 2022. "Regulatory Quality and Trade Performance: An Econometric Analysis." USITC Economics Working Paper 2022-10-A. https://www.usitc.gov/publications/332/working_papers/ecwp_2022-10-a_regulatory_quality.pdf

Santos Silva, J. M. C., y S. Tenreyro. 2006. "The Log of Gravity." *Review of Economics and Statistics* 88(4): 641–658. https://doi.org/10.1162/rest.88.4.641

Tinbergen, J. 1962. *Shaping the World Economy: Suggestions for an International Economic Policy*. New York: Twentieth Century Fund.

Tyszynski, H. 1951. "World Trade in Manufactured Commodities, 1899–1950." *The Manchester School* 19(3): 272–304. https://doi.org/10.1111/j.1467-9957.1951.tb00012.x

Volpe Martincus, C., y J. Carballo. 2008. "Is Export Promotion Effective in Developing Countries? Firm-Level Evidence on the Intensive and the Extensive Margins of Exports." *Journal of International Economics* 76(1): 89–106. https://doi.org/10.1016/j.jinteco.2008.05.002

Wei, S.-J. 2000. "How Taxing Is Corruption on International Investors?" *Review of Economics and Statistics* 82(1): 1–11. https://doi.org/10.1162/003465300558533

---

*Reconocimientos:* Los autores agradecen al CEPII por hacer disponibles BACI y GeoDist, y al Banco Mundial por el acceso a los bancos de datos WGI y WDI. Todos los cálculos y procesamiento de datos se realizaron utilizando Python (pandas, statsmodels, linearmodels). Los scripts de análisis están documentados en el repositorio de replicación compañero.

*Autor de correspondencia:* Ricardo Antonio Cuba Alván, Universidad del Pacífico (ra.cubaa@up.edu.pe). Coautores: Rosa Patricia Larios Francia, Universidad del Pacífico (rp.lariosf@up.edu.pe).
