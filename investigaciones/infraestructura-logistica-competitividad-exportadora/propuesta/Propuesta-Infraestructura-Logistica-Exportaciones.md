# Infraestructura de transporte y competitividad exportadora regional en el Perú

## Proyecto de investigación — propuesta inicial

### Infraestructura portuaria, aérea y vial subnacional como determinante de la competitividad exportadora: evidencia a nivel de aduana en el Perú

---

**Estado:** Propuesta en diseño (sin resultados preliminares todavía)
**Versión:** 1.0 — octubre 2026
**Investigador principal:** Mg. Ricardo Antonio Cuba Alván
**Línea de investigación:** Comercio internacional, economía de transporte, economía regional

---

## 1. Datos del proyecto

| Campo | Detalle |
|---|---|
| **Título provisional** | Infraestructura de transporte y competitividad exportadora regional en el Perú: evidencia a nivel de aduana, 2019–2026 |
| **Área temática** | Economía internacional / Economía del transporte / Economía regional |
| **Palabras clave** | Infraestructura logística, puertos, competitividad exportadora, aduanas, economía regional, Perú |
| **Clasificación JEL** | F14, R40, L92, O18 |
| **Duración estimada** | 6 meses (incluye una fase de datos pendiente de cobertura completa) |

---

## 2. Planteamiento del problema

El Perú tiene una geografía exportadora muy concentrada: la mayor parte del valor FOB sale por un número reducido de puntos de salida (Callao marítimo y aéreo, y un puñado de puertos y pasos de frontera secundarios como Paita, Desaguadero, Tacna o Tumbes). Esta concentración no es solo un reflejo de dónde se produce, sino también de dónde existe infraestructura logística con la capacidad y el estado de conservación suficientes para sostener el comercio exterior.

La pregunta que no está respondida con datos administrativos peruanos es si la **calidad y capacidad de la infraestructura de salida** (estado de conservación portuario, existencia de concesión, disponibilidad de vías de acceso subnacionales) explica parte de la variación en el valor exportado por cada aduana, más allá de lo que explica la ubicación de la producción misma.

> **¿La calidad de la infraestructura portuaria, aérea y vial de acceso explica diferencias en el valor y la composición de las exportaciones que salen por cada aduana peruana?**

---

## 3. Justificación

### 3.1 Relevancia académica

La literatura internacional (Volpe Martincus y Carballo 2010; Limão y Venables 2001; Clark, Dollar y Micco 2004) encuentra que los costos de transporte y la eficiencia portuaria explican una fracción sustancial de la varianza en comercio bilateral, comparable en magnitud al efecto de los aranceles. Para América Latina, Volpe Martincus y Carballo documentan que la eficiencia aduanera aumenta la probabilidad de que una firma exporte y el valor que exporta. Sin embargo, no existe —hasta donde se ha revisado— un estudio que use el **registro administrativo de infraestructura del MTC** (estado de conservación, concesión, vulnerabilidad portuaria) cruzado con el registro aduanero real de exportaciones a nivel de punto de salida para el caso peruano.

### 3.2 Relevancia de política

El Perú invierte en concesiones portuarias (Chancay, ampliación del Callao) y en corredores logísticos (Provías). Este proyecto puede informar dónde la inversión en infraestructura logística tiene mayor retorno exportador marginal — información directamente relevante para la priorización de cartera de MTC/Provías y para ProInversión.

### 3.3 Viabilidad y estado real de los datos

El proyecto usa exclusivamente datos ya integrados en Rastro (Neon/Postgres), verificados el 17-10-2026:

| Fuente | Tabla | Cobertura verificada |
|---|---|---|
| MTC — infraestructura | `infraestructura_mtc.terminales_portuarios` | 507 registros |
| MTC — infraestructura | `infraestructura_mtc.aerodromos` | 595 registros |
| MTC — infraestructura | `infraestructura_mtc.peajes` | 233 registros |
| MTC — infraestructura | `infraestructura_mtc.indice_vulnerabilidad_portuaria` | Índice propio ya calculado (score_vulnerabilidad, componentes, estado de conservación, concesión), corte único |
| MTC — infraestructura | `infraestructura_mtc.cargas_portuarias_historico` | 741 registros |
| SUNAT — aduanas | `identidad_fiscal.ruc_exportaciones_fob` | 13.574 filas, **339 RUC únicos**, panel 2019–2026, por aduana de salida (15 aduanas representadas) |

**Limitación central que debe declararse con transparencia:** `ruc_exportaciones_fob` cubre actualmente 339 de una meta de ingesta de ~13.366 RUC — es decir, es una **muestra parcial no aleatoria** del universo real de exportadores (el orden de ingesta de Aduanet avanza secuencialmente, no por muestreo representativo). Los niveles de FOB por aduana en esta tabla **no son representativos del comercio total real** por ese punto de salida; solo capturan lo que ya se ingirió. La distribución actual ya cubre 15 de las aduanas operativas del país, con fuerte concentración en Callao (82% de las filas), lo que sí permite un diseño piloto, pero los resultados de niveles deben leerse como asociación dentro de la muestra, no como medida del comercio total por aduana.

---

## 4. Preguntas de investigación

**Pregunta principal:** ¿La calidad de la infraestructura de salida (portuaria, aérea, vial) explica diferencias en el valor exportado observado por aduana, controlando por la composición de productos y destinos?

**Preguntas específicas:**

1. ¿Las aduanas con terminales en mejor estado de conservación o bajo régimen de concesión muestran mayor valor FOB exportado por RUC activo?
2. ¿La disponibilidad de peajes/vías de acceso cercanas (proxy de conectividad terrestre hacia el puerto/aeropuerto) está asociada con el número de exportadores activos por región de origen de la carga?
3. ¿El índice de vulnerabilidad portuaria del MTC predice la concentración de destinos (menor diversificación de países) de las exportaciones que salen por ese puerto?

---

## 5. Objetivos

**Objetivo general:** Determinar si la capacidad y calidad de la infraestructura de transporte explican diferencias observadas en el valor y la diversificación de las exportaciones peruanas por punto de salida.

**Objetivos específicos:**

1. Construir un panel aduana-mes cruzando `ruc_exportaciones_fob` (agregado por aduana) con los atributos de infraestructura de la aduana correspondiente (terminal portuario, aeródromo o paso de frontera).
2. Estimar el valor FOB y el número de RUC activos por aduana-mes en función de los atributos de infraestructura (estado de conservación, concesión, score de vulnerabilidad), controlando por efectos fijos de aduana y de tiempo.
3. Documentar explícitamente el sesgo de cobertura de la muestra actual y diseñar el análisis para que sea re-ejecutable sin cambios cuando la ingesta de Aduanet alcance una cobertura representativa.

---

## 6. Marco teórico y antecedentes

El canal teórico es directo: la infraestructura de transporte reduce el costo efectivo de llegar al mercado internacional, lo que en un modelo de comercio con costos de "iceberg" (Samuelson 1954; aplicado a infraestructura por Limão y Venables 2001) se traduce en mayor volumen exportado y mayor probabilidad de exportar hacia destinos más lejanos. Clark, Dollar y Micco (2004) muestran, con datos de 1980 puertos en 59 países, que reducir la ineficiencia portuaria de la mediana al percentil 25 reduce los costos de transporte en un 12%. Para América Latina, Volpe Martincus y Carballo (2010) encuentran que mejoras en tiempos aduaneros aumentan tanto el número de exportadores como el valor exportado por firma — el mismo tipo de variable (número de RUC activos, valor por RUC) que este proyecto puede construir con datos peruanos reales.

**Vacío identificado:** no existe, hasta donde se ha revisado la literatura, un estudio que vincule el registro oficial de infraestructura del MTC con el registro aduanero real a nivel de punto de salida para el Perú.

---

## 7. Metodología

### 7.1 Unidad de análisis y variable dependiente

Unidad: aduana × mes. Variables dependientes candidatas: (a) log(FOB total por aduana-mes), (b) número de RUC distintos activos por aduana-mes, (c) índice de diversificación de destinos (inverso del HHI de países por aduana-mes).

### 7.2 Variables independientes

De `infraestructura_mtc`: estado de conservación del terminal/aeródromo asociado a la aduana, indicador de concesión, `score_vulnerabilidad` del índice portuario (cuando aplica), proximidad a peajes (variable de conectividad terrestre, a construir con las coordenadas de `peajes` y `terminales_portuarios`).

### 7.3 Especificación

```
Y_{a,t} = α + β·Infraestructura_a + γ·X_{a,t} + λ_t + ε_{a,t}
```

donde `a` indexa la aduana, `t` el mes, `λ_t` son efectos fijos de tiempo, y `X_{a,t}` controla por composición (participación de productos tradicionales/no tradicionales si se logra esa variable).

**Advertencia de diseño:** con solo 15 aduanas y una muestra de exportadores parcial, el panel actual tiene poder estadístico limitado — el valor de este diseño en su fase piloto es metodológico (dejar el pipeline listo y documentado), no la obtención de un coeficiente definitivo.

### 7.4 Fases de ejecución

**Fase piloto (ejecutable de inmediato, con los datos de hoy):** correr la especificación completa sobre la muestra de 339 RUC / 15 aduanas, documentar resultados como exploratorios y usarlos para afinar la especificación.

**Fase completa (condicionada a la ingesta Aduanet):** re-ejecutar el mismo pipeline cuando la cobertura de `ruc_exportaciones_fob` se acerque al universo real de exportadores (meta ~13.366 RUC), sin cambios de código — el diseño se escribe para ser agnóstico al tamaño de la muestra subyacente.

---

## 8. Limitaciones

1. **Cobertura parcial y no aleatoria de exportadores** (339/13.366 RUC) — limitación central, ya documentada arriba.
2. **N de aduanas pequeño** (15), lo que limita la potencia estadística incluso con la cobertura completa de exportadores.
3. **El índice de vulnerabilidad portuaria es de corte único** (una fecha de cálculo), no un panel — solo sirve como control cross-sectional, no para identificar cambios en infraestructura en el tiempo.
4. **No hay dato de producto/partida arancelaria** en `ruc_exportaciones_fob`, por lo que no se puede controlar por composición de canasta a nivel de producto, solo por aduana y mes.
5. **Ausencia de variación exógena clara** — sin un evento de inversión/concesión fechado y aislado, el diseño es correlacional, no causal.

---

## 9. Próximos pasos

1. Construir el script de extracción y unión aduana↔infraestructura (mapeo manual necesario: nombre de aduana en SUNAT vs. nombre de terminal/aeródromo en MTC no son idénticos).
2. Correr la fase piloto y documentar resultados exploratorios.
3. Monitorear el avance de la ingesta Aduanet (ver `project_rastro_expansion_panel_exportadores` en memoria del proyecto) para decidir cuándo correr la fase completa.
4. Evaluar journal objetivo según el resultado: *Transportation Research Part A* o *Maritime Economics & Logistics* si el efecto es robusto con la muestra completa; un journal regional (ej. *Revista de la CEPAL*) si la cobertura final sigue siendo parcial.

---

## Referencias principales

Clark, X., D. Dollar, y A. Micco. 2004. "Port Efficiency, Maritime Transport Costs, and Bilateral Trade." *Journal of Development Economics* 75(2): 417–450.

Limão, N., y A. J. Venables. 2001. "Infrastructure, Geographical Disadvantage, Transport Costs, and Trade." *World Bank Economic Review* 15(3): 451–479.

Volpe Martincus, C., y J. Carballo. 2010. "Is Export Promotion Effective in Latin America?" *World Development* 38(5): 691–704.

Samuelson, P. A. 1954. "The Transfer Problem and Transport Costs, II." *Economic Journal* 64(254): 264–289.
