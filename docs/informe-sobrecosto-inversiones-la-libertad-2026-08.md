# Informe — Sobrecosto en inversiones públicas de La Libertad

**Fecha de corte:** 27 de agosto de 2026  
**Fuente:** [DETALLE_INVERSIONES.csv](https://fs.datosabiertos.mef.gob.pe/datastorefiles/DETALLE_INVERSIONES.csv) (MEF / Invierte.pe)  
**Alcance territorial:** departamento de La Libertad  
**Metodología ALSOL:** variación de registro, no acusación de irregularidad

---

## Resumen ejecutivo

La cartera de inversiones **activas** de La Libertad en Invierte.pe suma **7,970 proyectos (CUI únicos)** con montos publicados. De ellos, **3,139 (39.4%)** tienen **costo actualizado superior al monto viable** — la señal que el propio diccionario del MEF permite comparar.

En agregado, la cartera pasó de **S/ 45.90 mil millones** (monto viable) a **S/ 56.37 mil millones** (costo actualizado): un **incremento de S/ 10.46 mil millones (+22.8%)** atribuible a la suma de variaciones registradas en el Banco de Inversiones.

Tres lecturas dominan este informe:

1. **El sobrecosto no es marginal:** casi 4 de cada 10 proyectos activos ya registran un costo actualizado mayor que el viable original.
2. **La concentración es extrema en la cola:** solo **452 proyectos** (5.7% del universo) con variación **superior al 100%** explican **el 70.1% del delta monetario total** (S/ 7.33 mil millones).
3. **Transporte, orden público/seguridad y salud arrastran el peso absoluto**, aunque porcentualmente las intervenciones IRI del Ministerio de Educación y los PIP mayores (SNIP) muestran las tasas más altas de proyectos con variación al alza.

> **Nota sobre memos anteriores:** el análisis del 18 de agosto de 2026 (`docs/analisis-la-libertad-2026-08.md`) citaba **1,612 proyectos activos** y **40.8% con sobrecosto**. Esa cifra provenía de una **ingesta parcial** del CSV (~primer rango HTTP). Este informe recorre los **cinco rangos contiguos** del archivo completo (246,344,022 bytes, `Last-Modified` 2026-08-23) y materializa **7,970 CUI** de La Libertad. La tasa porcentual se mantiene similar (~39–40%), pero el **universo y el delta agregado son mucho mayores**.

---

## 1. Definición operativa

| Concepto | Regla ALSOL |
|---|---|
| **Sobrecosto (señal)** | `COSTO_ACTUALIZADO > MONTO_VIABLE`, ambos publicados y `MONTO_VIABLE > 0` |
| **Variación %** | `(costo_actualizado − monto_viable) / monto_viable × 100` |
| **Universo** | `ESTADO = ACTIVO` en el departamento La Libertad |
| **Qué NO es** | No implica mala fe, corrupción ni incumplimiento. Es una **variación de registro** en Invierte.pe |
| **Qué NO infiere** | No conecta sobrecosto con avance físico, paralización de obra ni ejecución presupuestal sin CUI exacto |

Implementación reproducible: `scripts/analisis-sobrecosto-la-libertad.mjs`  
Salida JSON: `artifacts/sobrecosto-la-libertad-analysis.json`

---

## 2. Panorama regional

| Métrica | Valor |
|---|---:|
| CUI únicos (La Libertad, ACTIVO) | 7,970 |
| Proyectos con ambos montos | 7,961 |
| Proyectos con sobrecosto | **3,139** |
| **% con sobrecosto** | **39.4%** |
| Proyectos con subcosto (actualizado < viable) | 1,943 |
| Proyectos sin variación (igual) | 2,879 |
| Monto viable total | S/ 45,902,034,461 |
| Costo actualizado total | S/ 56,365,987,201 |
| **Delta agregado** | **S/ 10,463,952,740 (+22.8%)** |

### Distribución de la variación

La mayor parte del impacto monetario no está en variaciones moderadas, sino en la cola extrema:

| Rango de variación | Proyectos | % del delta total |
|---|---:|---:|
| 0% (sin variación) | 2,976 | −0.0% |
| 0.1% – 10% | 897 | 1.7% |
| 10.1% – 25% | 634 | 4.6% |
| 25.1% – 50% | 571 | 11.4% |
| 50.1% – 100% | 502 | 24.6% |
| **> 100%** | **452** | **70.1%** |

**Lectura:** menos del 6% de los proyectos concentran más de dos tercios del sobrecosto monetario agregado. Cualquier política de control de costos que no priorice la cola extrema dejaría fuera la mayor parte del problema en soles.

---

## 3. Por función de inversión

### 3.1 Mayor % de proyectos con sobrecosto (mínimo 10 proyectos)

| Función | Proyectos | % con sobrecosto | Delta (S/ millones) | Variación agregada |
|---|---:|---:|---:|---:|
| AGRARIA | 10 | 50.0% | 2,243.6 | +118.6% |
| ENERGÍA | 246 | 48.8% | 152.9 | +18.0% |
| SALUD Y SANEAMIENTO | 25 | 48.0% | 106.0 | — |
| COMERCIO | 51 | 47.1% | 18.6 | — |
| EDUCACIÓN | 1,217 | 45.8% | 1,216.1 | +19.7% |
| CULTURA Y DEPORTE | 700 | 44.7% | 128.3 | +10.5% |
| SANEAMIENTO | 1,107 | 43.5% | 836.4 | +11.3% |
| TRANSPORTE | 2,057 | 39.9% | 1,620.8 | +13.4% |

### 3.2 Mayor delta absoluto (donde más cuesta la variación en soles)

| Función | Proyectos | % con sobrecosto | Delta (S/ millones) |
|---|---:|---:|---:|
| **TRANSPORTE** | 2,057 | 39.9% | **1,620.8** |
| ORDEN PÚBLICO Y SEGURIDAD | 134 | 38.8% | **1,835.8** |
| SALUD | 739 | 21.5% | **1,396.4** |
| EDUCACIÓN | 1,217 | 45.8% | 1,216.1 |
| SANEAMIENTO | 1,107 | 43.5% | 836.4 |

**Lectura:** saneamiento y transporte — las mismas funciones con peor ejecución presupuestal en el memo de agosto — también arrastran carteras de inversión con variación al alza. Pero el mayor shock absoluto viene de **proyectos de protección contra inundaciones** (función Orden Público y Seguridad) y de **megaproyectos de transporte y riego** (ver sección 6).

---

## 4. Por provincia

| Provincia | Proyectos | % con sobrecosto | Delta (S/ M) | Variación agregada |
|---|---:|---:|---:|---:|
| Julcán | 365 | **45.5%** | 188.0 | +14.8% |
| Virú | 454 | 44.1% | 314.0 | +13.0% |
| Trujillo | 1,742 | 41.8% | **6,021.7** | +28.8% |
| Sánchez Carrión | 991 | 41.7% | 611.0 | +15.9% |
| Santiago de Chuco | 728 | 39.7% | 414.0 | +17.7% |
| **Bolívar** | 190 | 39.5% | 268.3 | **+17.4%** |
| Pataz | 924 | 39.5% | 227.8 | +7.3% |
| Otuzco | 936 | 32.3% | 563.6 | +19.0% |

**Lectura:**

- **Trujillo** concentra el **57.5% del delta regional** (S/ 6.02 mil millones) por volumen de cartera y megaproyectos, no por tener la tasa porcentual más alta.
- **Julcán** lidera el % de proyectos con sobrecosto (45.5%), coherente con el memo previo (50.7% en muestra parcial).
- **Bolívar** mantiene variación agregada elevada (+17.4%) y su municipalidad provincial tiene **67.9%** de proyectos con sobrecosto (ver sección 5), aunque su tasa provincial (39.5%) está en la media regional.

---

## 5. Por nivel de gobierno y entidad ejecutora

### Nivel de gobierno

| Nivel | Proyectos | % con sobrecosto | Delta (S/ millones) |
|---|---:|---:|---:|
| **GN** (Gobierno Nacional) | 630 | **55.4%** | 3,017.1 |
| **GL** (Gobiernos Locales) | 6,366 | 39.9% | 2,230.3 |
| **GR** (Gobierno Regional) | 965 | **26.0%** | **5,216.5** |

**Paradoja aparente:** el Gobierno Regional tiene la **menor tasa** de proyectos con sobrecosto (26%), pero el **mayor delta absoluto** (S/ 5.22 mil millones). Esto se explica por pocos megaproyectos de alto impacto — Chavimochic III, protección contra inundaciones en Trujillo — que elevan el costo agregado sin aumentar proporcionalmente el conteo de proyectos afectados.

### Entidades con mayor delta absoluto (mínimo 3 proyectos)

| Entidad | Provincia (ref.) | Proyectos | % sobrecosto | Delta (S/ M) | Var. agregada |
|---|---|---:|---:|---:|---:|
| Gobierno Regional La Libertad | Sánchez Carrión | 965 | 26.0% | **5,216.5** | +35.4% |
| MTC | Otuzco | 92 | 57.6% | 936.9 | +26.3% |
| Ministerio de Salud | Pacasmayo | 14 | 50.0% | 362.4 | +18.8% |
| Municipalidad Provincial de Trujillo | Trujillo | 314 | 38.2% | 299.8 | +20.2% |
| **Ministerio de Educación** | Trujillo | 79 | **84.8%** | 288.2 | **+70.7%** |
| Municipalidad Provincial de Sánchez Carrión | Sánchez Carrión | 230 | 55.7% | 241.0 | +28.5% |
| **Municipalidad Provincial de Bolívar** | Bolívar | 28 | **67.9%** | 139.3 | **+74.2%** |

---

## 6. Por tipo de inversión

| Tipo | Proyectos | % con sobrecosto | Delta (S/ millones) |
|---|---:|---:|---:|
| **PIP MAYOR (SNIP)** | 612 | **58.0%** | **4,171.4** |
| INTERVENCIONES IRI | 675 | 49.0% | 854.0 |
| PROYECTO DE INVERSIÓN | 3,858 | 37.2% | 5,128.6 |
| INVERSIONES IOARR | 2,524 | 35.7% | 289.0 |
| PIP MENOR (SNIP) | 284 | 41.9% | 20.9 |

**Hallazgo crítico — Intervenciones IRI (MINEDU):**

Las intervenciones de infraestructura educativa rápida (IRI) del Ministerio de Educación muestran variaciones porcentuales extremas en proyectos individuales (hasta +16,202% en un caso con monto viable de S/ 13,595), pero montos viables muy bajos en el registro. La entidad MINEDU concentra **84.8%** de sus 79 proyectos regionales con sobrecosto y una variación agregada de **+70.7%**.

Esto sugiere un posible **artefacto de registro** (montos viables residuales o actualizaciones masivas del costo en intervenciones menores) más que megaproyectos mal gestionados. Debe leerse con cautela: la señal es real en Invierte.pe, pero el denominador es tan pequeño que la variación % pierde comparabilidad con proyectos de cientos de millones.

---

## 7. Casos extremos

### 7.1 Mayor variación porcentual (top 5, excluyendo montos viables < S/ 50,000)

| CUI | Proyecto (recortado) | Entidad | Provincia | Viable | Actualizado | Variación |
|---|---|---|---|---:|---:|---:|
| 2555354 | Creación servicio transitabilidad vial carretera Sundia–Pulamuy | Mun. Prov. Bolívar | Bolívar | S/ 284K | S/ 18.1M | **+6,269%** |
| 2340470 | Mejoramiento I.E. José Faustino Sánchez Carrión, Charat | Mun. Dist. Charat | Otuzco | S/ 2.8M | S/ 10.1M | +259% |
| 2428652 | IRI local educativo 257528 | MINEDU | Ascope | S/ 15.9M | S/ 94.0M | +492% |
| 2433708 | IRI local educativo 253460 | MINEDU | Trujillo | S/ 13.6K | S/ 2.2M | +16,202%* |
| 2433737 | IRI local educativo 261629 | MINEDU | Otuzco | S/ 14.9K | S/ 2.0M | +13,499%* |

\* Variaciones extremas en IRI con monto viable residual — ver sección 6.

### 7.2 Mayor impacto absoluto en soles (top 10)

| CUI | Proyecto (recortado) | Entidad | Función | Viable | Actualizado | Delta |
|---|---|---|---|---:|---:|---:|
| **2077997** | **Proyecto Chavimochic Tercera Etapa** | GORE La Libertad | Agraria | S/ 1,847M | S/ 4,067M | **+S/ 2,219M** |
| 2446345 | Protección contra inundaciones quebrada San Idelfonso | GORE La Libertad | Orden Público | S/ 222M | S/ 1,362M | +S/ 1,140M |
| 2512142 | Recuperación Hospital Provincial Cascas II-1 | ARCC | Salud | S/ 86M | S/ 508M | +S/ 422M |
| 2508148 | Protección contra inundaciones aguas pluviales | GORE La Libertad | Orden Público | S/ 510M | S/ 906M | +S/ 397M |
| 2022937 | Rehabilitación carretera Trujillo–Shiran–Huamachuco | MTC | Transporte | S/ 168M | S/ 402M | +S/ 233M |
| 2427376 | Mejoramiento Hospital de Apoyo Tomás Alva Edison | MINSA | Salud | S/ 163M | S/ 395M | +S/ 232M |
| 2300496 | Mejoramiento borde costero balnearios | MTC | Transporte | S/ 312M | S/ 495M | +S/ 184M |
| 2597478 | Transitabilidad vial interurbana Otuzco | GORE La Libertad | Transporte | S/ 169M | S/ 348M | +S/ 179M |
| 2503297 | Protección contra inundaciones captación/drenaje | GORE La Libertad | Orden Público | S/ 221M | S/ 372M | +S/ 151M |
| 2258772 | Mejoramiento Hospital I Florencia de Mora | ESSALUD | Salud | S/ 231M | S/ 368M | +S/ 137M |

**Lectura integrada:**

- **Chavimochic III** solo explica **S/ 2.22 mil millones** del delta regional — más del 21% del sobrecosto total de La Libertad en un solo CUI.
- Los **tres proyectos de protección contra inundaciones del GORE** en Trujillo suman más de **S/ 1.7 mil millones** de delta adicional.
- El caso histórico de **saneamiento en Bolívar** (Municipalidad Provincial, +405% en memo parcial) sigue siendo relevante a escala municipal, pero el ranking nacional de delta absoluto lo superan los megaproyectos metropolitanos y regionales.

---

## 8. Cruce con otras fuentes ALSOL

### 8.1 INFOBRAS (obras por CUI)

ALSOL cruza inversiones y obras por **CUI exacto** (`infobras ↔ radar-inversiones`). En el memo de agosto, el cruce de las 9 obras de Bolívar con CUI contra la muestra parcial de inversiones devolvió **0 matches** — limitación de cobertura simultánea, no ausencia de proyectos.

**Implicación para sobrecosto:** un proyecto puede registrar variación de costo en Invierte.pe mientras su obra asociada en INFOBRAS muestra avance físico bajo o paralización. Bolívar es el ejemplo documentado en tres fuentes (ejecución 21.5%, avance físico 86.9%, variación de cartera +117% en memo parcial). Este informe confirma que Bolívar mantiene **+17.4% de variación agregada** en la cartera completa, con la **Municipalidad Provincial al 67.9%** de proyectos con sobrecosto.

### 8.2 Ejecución presupuestal (MEF)

Transporte (30.8% de avance) y Saneamiento (30.5%) son las funciones con peor ejecución presupuestal en La Libertad. Coinciden con funciones de inversión que acumulan **S/ 1,620M** y **S/ 836M** de delta por sobrecosto, respectivamente. La correlación es **descriptiva**, no causal: no hay llave oficial que una variación de costo en Invierte.pe con devengado mensual sin CUI.

### 8.3 Salud institucional (score compuesto)

El score de `salud-institucional` usa `1 − conSobrecosto/total` por `SEC_EJEC` exacto. Con 39.4% de proyectos con sobrecosto a nivel departamental, las entidades con carteras peor calificadas (MINEDU, Mun. Prov. Bolívar, Mun. Prov. Sánchez Carrión) penalizan su dimensión de inversiones.

---

## 9. Implicaciones para vigilancia pública

| Pregunta ciudadana | Qué dice este informe | Qué NO puede decir |
|---|---|---|
| ¿Cuánto más caro es invertir hoy que al aprobar? | +22.8% agregado; 39.4% de proyectos con variación al alza | No cuánto se pagó de más en contratos |
| ¿Dónde mirar primero? | 452 proyectos con variación >100%; Chavimochic III; inundaciones GORE | No quién es responsable sin expediente |
| ¿Bolívar es un caso aparte? | Sí en ejecución y gestión; en sobrecosto % está en media regional pero Mun. Prov. al 67.9% | No prueba corrupción |
| ¿La educación es el sector más caro? | MINEDU tiene 84.8% de proyectos con variación, muchos IRI con montos residuales | No que los colegios cuesten más sin revisar cada CUI |

---

## 10. Limitaciones

1. **Corte de fuente:** refleja Invierte.pe al 23 de agosto de 2026, no el estado en vivo del día de lectura.
2. **Sin scheduler:** ALSOL no actualiza automáticamente; ver `docs/conectores.md`.
3. **Montos viables históricos:** proyectos antiguos pueden tener viables de otra coyuntura de precios; la variación mide actualización de registro, no inflación ajustada.
4. **IRI/MINEDU:** variaciones % extremas en montos pequeños distorsionan rankings porcentuales.
5. **Sin cruce obra en este informe:** el cruce INFOBRAS requiere base local (`docker compose`); no se ejecutó en este entorno cloud.
6. **No es auditoría:** sobrecosto en Invierte.pe puede reflejar ampliaciones de alcance, estudios adicionales, contingencias o errores de registro.

---

## 11. Reproducibilidad

```bash
# Descarga completa (5 rangos HTTP) y análisis
node scripts/analisis-sobrecosto-la-libertad.mjs

# Salida
# artifacts/sobrecosto-la-libertad-analysis.json
```

Consulta vía API local (cuando `radar-inversiones` está levantado):

```bash
curl "http://localhost:4002/api/investments?departamento=LA%20LIBERTAD"
```

---

## Referencias

- [Análisis general La Libertad (2026-08)](analisis-la-libertad-2026-08.md)
- [Desarrollo económico La Libertad (2026-08)](analisis-la-libertad-desarrollo-economico-2026-08.md)
- [Contrato de datos Invierte.pe](data-contracts/invierte-detalle-inversiones.md)
- [Sesión de actualización de datos (2026-08-24)](SESION_ACTUALIZACION_DATOS_Y_RUNTIME_2026-08-24.md)
