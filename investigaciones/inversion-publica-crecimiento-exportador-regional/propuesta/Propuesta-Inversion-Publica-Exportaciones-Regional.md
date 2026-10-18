# Inversión pública en infraestructura y crecimiento exportador regional en el Perú

## Proyecto de investigación — propuesta inicial

### Precedencia temporal entre inversión pública productiva (Invierte.pe) y actividad exportadora regional: un diseño de panel distrital, 2001–2026

---

**Estado:** Propuesta en diseño (sin resultados preliminares todavía)
**Versión:** 1.0 — octubre 2026
**Investigador principal:** Mg. Ricardo Antonio Cuba Alván
**Línea de investigación:** Economía del desarrollo regional, inversión pública, comercio internacional

---

## 1. Datos del proyecto

| Campo | Detalle |
|---|---|
| **Título provisional** | Inversión pública en infraestructura productiva y crecimiento exportador regional en el Perú: evidencia del Sistema Nacional de Programación Multianual (Invierte.pe), 2001–2026 |
| **Área temática** | Economía del desarrollo / Economía regional / Comercio internacional |
| **Palabras clave** | Inversión pública, Invierte.pe, infraestructura productiva, exportaciones regionales, Perú, precedencia temporal |
| **Clasificación JEL** | H54, O18, R11, F14 |
| **Duración estimada** | 8 meses |

---

## 2. Planteamiento del problema

Entre 2001 y 2026, el sistema peruano de inversión pública (SNIP, luego Invierte.pe) registró **150.042 proyectos** a nivel distrital, con montos de viabilidad, fechas de registro y de fin de ejecución, y clasificación sectorial. Una fracción de estos proyectos corresponde directamente a infraestructura productiva —transporte y comunicaciones, riego, energía— con potencial de reducir costos de producción y de acceso a mercados externos para las firmas de la región.

La pregunta de economía del desarrollo es si esta inversión **antecede** el crecimiento de la actividad exportadora regional (consistente con un canal de causalidad infraestructura→comercio) o si, por el contrario, la inversión llega **después** de que una región ya mostró dinamismo exportador (inversión como respuesta a demanda, no como causa).

> **¿La finalización de proyectos de inversión pública en infraestructura productiva antecede temporalmente al crecimiento de la actividad exportadora en la región donde se ejecutan, o la relación va en sentido inverso?**

---

## 3. Justificación

### 3.1 Relevancia académica

La literatura sobre infraestructura y desarrollo regional (Banerjee, Duflo y Qian 2020 para China; Donaldson 2018 para la India colonial; Faber 2014 para carreteras chinas) usa generalmente inversión en transporte como tratamiento y crecimiento económico/comercial como resultado, con estrategias de identificación basadas en el momento de finalización de la obra. El Perú no tiene, hasta donde se ha revisado, un estudio equivalente que use el registro administrativo completo de Invierte.pe (a diferencia de estudios que usan solo una muestra de grandes proyectos) para esta pregunta.

### 3.2 Relevancia de política

El MEF y los gobiernos regionales priorizan carteras de inversión con criterios que no siempre incorporan el retorno exportador esperado. Un hallazgo robusto —en cualquier dirección— es útil: si la inversión antecede al comercio, justifica priorizar infraestructura productiva en regiones con potencial exportador no explotado; si no hay precedencia, sugiere que el canal de impacto es otro (empleo local, servicios) y no debe venderse como política de competitividad exportadora.

### 3.3 Estado real de los datos (verificado 17-10-2026)

| Fuente | Tabla | Cobertura verificada |
|---|---|---|
| MEF — Invierte.pe | `radar_inversiones.investments` | **150.042 proyectos**, panel 2001-05-24 a 2026-10-12, con `departamento/provincia/distrito`, `sector`, `monto_viable`, `costo_actualizado`, `fecha_registro`, `fecha_viabilidad`, `fecha_fin_ejecucion`, `avance_ejecucion` |
| MEF — Invierte.pe (sector transporte) | mismo | 1.227 proyectos en sector "TRANSPORTES Y COMUNICACIONES" |
| VERTIX / PROINVERSIÓN | `inversion_privada.oxi_investment_promotions` | 572 proyectos Obras por Impuestos |
| VERTIX / PROINVERSIÓN | `inversion_privada.private_investment_projects` | 331 proyectos APP/PA |

**Este es el dataset más sólido de todo el cruce realizado para este proyecto**: panel largo (25 años), geolocalizado a nivel distrital, con fechas de inicio y fin de ejecución reales — no hay cuello de botella de ingesta aquí.

**La limitación real está en la variable dependiente (actividad exportadora regional), no en la de inversión:** no existe en Rastro una serie de exportaciones por región con cobertura completa. La única tabla con desagregación geográfica de exportaciones es `identidad_fiscal.ruc_exportaciones_fob` (339 RUC de una meta de ~13.366, por **aduana de salida**, no por región de origen de la firma). Para obtener la región de origen de cada RUC exportador habría que cruzarlo con `identidad_fiscal.contribuyentes` (padrón SUNAT, domicilio fiscal) — factible, pero la muestra de exportadores sigue siendo parcial y no representativa. `bcrp_comercio_exterior.trade_indicators` (verificado) **no tiene desagregación regional**: es una serie nacional agregada en tradicional/no tradicional, por lo que **no sirve** como variable dependiente regional, a diferencia de lo que se asumió en el cruce inicial de este proyecto — corrección importante respecto a la primera lectura del dataset.

---

## 4. Preguntas de investigación

**Pregunta principal:** ¿La finalización de proyectos de inversión pública en infraestructura productiva antecede al crecimiento del número de exportadores activos y del valor exportado en la región donde se ejecutan?

**Preguntas específicas:**

1. ¿Las regiones con mayor avance de ejecución en proyectos de transporte y comunicaciones muestran, en los años siguientes, mayor número de RUC con actividad exportadora registrada?
2. ¿La inversión en Obras por Impuestos (financiada por empresas privadas, muchas de ellas exportadoras) está asociada a un patrón de inversión distinto al de la inversión pública ordinaria?
3. Dado que la variable dependiente regional es débil hoy, ¿qué proxy alternativo (número de RUC con ficha de exportador activa por región, aun con muestra parcial) permite un primer diseño honesto mientras se completa la ingesta?

---

## 5. Objetivos

**Objetivo general:** Determinar la relación de precedencia temporal entre la ejecución de inversión pública en infraestructura productiva y el crecimiento de la actividad exportadora regional en el Perú.

**Objetivos específicos:**

1. Construir el panel distrital/regional de inversión pública desde `radar_inversiones.investments`, clasificando proyectos por su relevancia para competitividad exportadora (transporte, riego, energía vs. el resto).
2. Construir la mejor variable dependiente regional disponible hoy: número de RUC con registro en `ruc_exportaciones_fob` por región de domicilio fiscal (via cruce con `contribuyentes`), documentando explícitamente el sesgo de cobertura.
3. Estimar un modelo de precedencia temporal (tipo panel evento o Granger a nivel regional) entre la finalización de proyectos de infraestructura productiva y el crecimiento de esta variable, con una lectura honesta de sus límites mientras la muestra de exportadores es parcial.
4. Diseñar el pipeline para ser re-ejecutado sin cambios cuando la cobertura de `ruc_exportaciones_fob` mejore.

---

## 6. Marco teórico y antecedentes

El canal de precedencia temporal es la estrategia de identificación estándar cuando no hay un experimento natural limpio: si la inversión antecede sistemáticamente al cambio en la variable de resultado, y no al revés, eso es evidencia (no prueba) a favor de un canal causal infraestructura→comercio (Faber 2014; Donaldson 2018). Banerjee, Duflo y Qian (2020) muestran para China que la proximidad a la red de transporte explica diferencias de crecimiento del PIB per cápita regional, aunque con efectos menores a lo sugerido por estudios con menor control de la endogeneidad de localización. Esccobal y Torres (2013), con datos peruanos a nivel de firma agrícola, encuentran que gobernanza e infraestructura conjuntamente explican exportaciones agrícolas regionales — el antecedente peruano más cercano a este diseño, aunque con una muestra mucho menor y sin el panel largo de Invierte.pe.

**Vacío identificado:** ningún estudio usa el registro completo de 150 mil proyectos de Invierte.pe (en vez de una muestra de proyectos grandes) para esta pregunta en el Perú.

---

## 7. Metodología

### 7.1 Unidad de análisis

Región (departamento) × año. Ventana temporal a decidir según la cobertura real de la variable dependiente (ver limitaciones).

### 7.2 Variable de tratamiento

Monto acumulado o número de proyectos de infraestructura productiva (`sector` en {TRANSPORTES Y COMUNICACIONES, AGRICULTURA Y RIEGO, ENERGÍA Y MINAS}) con `fecha_fin_ejecucion` en la región-año, desde `radar_inversiones.investments`.

### 7.3 Variable dependiente (provisional)

Número de RUC distintos con al menos un registro en `ruc_exportaciones_fob` cuyo domicilio fiscal (via `contribuyentes.ubigeo`) corresponde a la región, por año. **Se declara explícitamente que esta variable subestima el universo real de exportadores** mientras la ingesta Aduanet esté incompleta.

### 7.4 Especificación

```
ExportadoresActivos_{r,t} = α + Σ_k β_k · Inversión_{r,t-k} + μ_r + λ_t + ε_{r,t}
```

con rezagos `k` = 0 a 3 años, para evaluar si el coeficiente de inversión pasada predice el resultado presente más que el inverso (test de precedencia en ambas direcciones, siguiendo el espíritu de un test de Granger panel).

### 7.5 Fases de ejecución

**Fase piloto:** correr el diseño con la muestra actual de exportadores (339 RUC), documentando los resultados como exploratorios y usando la fase para depurar el cruce `contribuyentes`↔`ruc_exportaciones_fob`↔`radar_inversiones` por ubigeo.

**Fase completa:** repetir cuando la cobertura de exportadores mejore sustancialmente. El dataset de inversión (`radar_inversiones`) no necesita ninguna actualización — ya está completo.

---

## 8. Limitaciones

1. **La variable dependiente regional es la parte débil del diseño**, no la de inversión. Mientras `ruc_exportaciones_fob` cubra solo 339/13.366 RUC, cualquier resultado de nivel o de tendencia regional debe leerse como exploratorio.
2. **Corrección importante:** se descarta usar `bcrp_comercio_exterior` como fuente de exportaciones regionales — verificado que es una serie nacional sin desagregación geográfica. Esto limita las alternativas de variable dependiente a construir el proxy desde el propio panel de RUC.
3. **Clasificación de "infraestructura productiva" por sector es una aproximación** — el campo `sector` en Invierte.pe agrupa por entidad ejecutora/pliego, no estrictamente por tipo de obra; se requerirá revisión manual de una muestra para validar la clasificación.
4. **Es un diseño de precedencia temporal, no de identificación causal fuerte** (no hay variación cuasi-experimental clara, como un cambio de política que afecte solo a algunas regiones).

---

## 9. Próximos pasos

1. Construir el cruce `contribuyentes.ubigeo` → región para los 339 RUC de `ruc_exportaciones_fob` y validar manualmente una muestra.
2. Clasificar manualmente los proyectos "TRANSPORTES Y COMUNICACIONES" por si realmente son de conectividad (carretera, puerto, aeropuerto) o de otro tipo (edificios administrativos del sector).
3. Correr la fase piloto y evaluar si el patrón de precedencia es sugerente antes de invertir más tiempo en la fase completa.
4. Journal objetivo: *World Development* o *Journal of Development Economics* si la fase completa produce un resultado robusto; mientras tanto, un journal regional (*Economía* PUCP, *Apuntes*) para una versión preliminar basada en la fase piloto.

---

## Referencias principales

Banerjee, A., E. Duflo, y N. Qian. 2020. "On the Road: Access to Transportation Infrastructure and Economic Growth in China." *Journal of Development Economics* 145: 102442.

Donaldson, D. 2018. "Railroads of the Raj: Estimating the Impact of Transportation Infrastructure." *American Economic Review* 108(4–5): 899–934.

Faber, B. 2014. "Trade Integration, Market Size, and Industrialization: Evidence from China's National Trunk Highway System." *Review of Economic Studies* 81(3): 1046–1070.

Escobal, J., y C. Torres. 2013. "Gobernanza, infraestructura y exportaciones agrícolas en el Perú." Documento de trabajo, GRADE.
