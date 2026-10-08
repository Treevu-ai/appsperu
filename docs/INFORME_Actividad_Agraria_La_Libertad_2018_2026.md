# Análisis Histórico — Actividad Agraria en La Libertad

**Fuente:** MIDAGRI / SIEA vía Plataforma Nacional de Datos Abiertos (datasets MIDAGRI-03.03, 03.04, 03.05). Datos ingestados el 6 de octubre de 2026. 25 departamentos. Período 2018–2026.  
**Cruce presupuestal:** radar-ejecucion / MEF, solo año 2026 (la base solo contiene ese año).

---

## 1. El jornal agrícola: de S/34 a S/48 en siete años

La Libertad arranca 2018 con el jornal más barato de la costa norte: S/34 al mes, plano los doce meses, sin variación. En ocho años llega a S/48, un alza nominal del 40 por ciento. La serie mensual revela más de lo que el promedio muestra.

### Serie mensual completa — La Libertad

| Año | Ene | Feb | Mar | Abr | May | Jun | Jul | Ago | Set | Oct | Nov | Dic | Promedio |
|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|---------|
| 2018 | 34 | 35 | 34 | 34 | 34 | 34 | 34 | 34 | 34 | 34 | 34 | 34 | **34.08** |
| 2019 | 35 | 35 | 35 | 35 | 35 | 35 | 35 | 36 | **40** | 38 | 35 | 38 | **36.00** |
| 2020 | 38 | — | — | — | — | — | 35 | 30 | 38 | 38 | 40 | 40 | **37.00** ⚠️ |
| 2021 | 45 | 43 | 42.5 | 42.5 | 42.5 | 42.5 | 42.5 | 42.5 | 42.5 | 42.5 | 42.5 | 42.5 | **42.75** |
| 2022 | 42.5 | 42.5 | 45 | 45 | 45 | 45 | 45 | 45 | 45 | **47.5** | 45 | **47.5** | **45.00** |
| 2023 | **47.5** | **50** | **50** | **50** | **50** | **50** | 48 | 48 | 48 | 45 | **50** | **50** | **48.88** |
| 2024 | 51 | **59** | 50 | 45 | 45 | 45 | 45 | 50 | 49 | 48.5 | 47 | 45.5 | **48.33** |
| 2025 | 48 | 49 | 47 | 48 | 48 | 48 | 48 | 49 | 49 | **43** | 49 | 49 | **47.92** |
| 2026 | 48 | 48.76 | — | — | — | — | — | — | — | — | — | — | 48.38 (2/12) |

*— = sin reporte en la fuente.*

### Qué dice la serie

**El pico de febrero 2024** (S/59) es el número más alto de toda la serie y no se repite en ningún otro mes. Eso distorsiona el promedio anual y merece verificarse contra el CSV original: si es un error de tipeo en el fuente (59 en vez de 49, por ejemplo), distorsiona toda la lectura de ese año.

**La pandemia dejó un hueco real** en 2020: marzo a julio sin reporte. El promedio reportado (37.00) usa solo 7 meses, lo que lo subestima ligeramente. El jornal volvió a niveles previos en setiembre.

**El estancamiento 2023–2026** es el hallazgo más relevante: después de subir de S/34 a S/48 entre 2018 y 2023, el jornal se estabiliza. En 2025 incluso baja ligeramente (47.92 vs. 48.88 de 2023). No crece más.

---

## 2. Dónde está La Libertad respecto al país

El jornal más caro del país es consistently del sur andino: Moquegua (S/97 en 2026), Arequipa (S/89), Tacna (S/84), Madre de Dios (S/83). La Libertad está en la franja media-alta en 2025, lejos de Cajamarca y Loreto (los más baratos), pero también lejos de Arequipa.

| Ranking | Departamento | Mejor año | Promedio anual |
|---------|------------|---------|--------------|
| 1 | Moquegua | 2026 | S/97.75 |
| 2 | Moquegua | 2025 | S/92.64 |
| 3 | Arequipa | 2024 | S/89.84 |
| … | … | … | … |
| **8** | **La Libertad** | **2023** | **S/48.88** |
| 12 | La Libertad | 2024 | S/48.33 |
| 13 | La Libertad | 2025 | S/47.92 |
| … | … | … | … |
| 23 | Cajamarca | 2018 | S/32.13 |

Lo notable es el movimiento: La Libertad pasó de ser el jornal barato de la costa a estar consistentemente encima de LIMA METROPOLITANA (S/65 en 2025) desde 2021. Eso tiene implicaciones competitivas.

---

## 3. El alquiler de tractor: cuando mecanizar sale caro

El tractor es un mercado estrecho. Los datos muestran saltos enormes intramensuales y años con valores en cero que indican huecos de reporte, no costos reales de cero.

### Tractor — La Libertad

| Año | Promedio (S/) | Mín | Máx | Rango |
|-----|-------------|-----|-----|-------|
| 2018 | 98.50 | 94 | 100.50 | 6.50 |
| 2019 | 102.11 | 94 | 115 | 21.00 |
| 2020 | 63.75 ⚠️ | 0 | 115 | 115 |
| 2021 | 115.63 | 110 | 130 | 20.00 |
| 2022 | 133.29 | 120 | 147.50 | 27.50 |
| **2023** | **149.58** | **140** | **160** | **20.00** |
| 2024 | 140.63 | 110 | 175 | **65.00** |
| 2025 | 127.50 | 100 | 147 | 47.00 |
| 2026 | 127.00 | 121 | 133 | 12.00 |

*⚠️ El promedio 2020 está distorsionado por meses sin dato = 0 en el CSV.*

**El tractor llegó a costar casi tres veces el jornal** en 2023 (149.58 / 48.88 = 3.06x). Y la mecanización no es uniforme: en 2024 el rango intramensual fue de S/110 a S/175, una variación del 59 por ciento dentro del mismo año en el mismo departamento. Eso sugiere que el mercado de alquiler de tractor es ilíquido: los precios dependen de la campaña, la disponibilidad de maquinaria y la urgencia del sembrío.

**Tractor vs. jornal — ratio de largo plazo:**

| Año | Tractor/Jornal |
|-----|---------------|
| 2018 | 2.89x |
| 2019 | 2.84x |
| 2021 | 2.70x |
| 2022 | 2.96x |
| 2023 | 3.06x |
| 2024 | 2.91x |
| 2025 | 2.66x |
| 2026 | 2.63x |

El ratio se ha压缩ido ligeramente desde 2023: el tractor baja más rápido que el jornal, lo que sugiere que la oferta de maquinaria ha crecido o la demanda de alquiler se ha debilitado.

---

## 4. La yunta: el costo de la agricultura tradicional

La yunta (pareja de bueyes para tracción animal) es lo que usa el pequeño productor que no puede pagar tractor. Y se encarece más rápido que el jornal.

### Yunta — La Libertad

| Año | Promedio (S/) | Mín | Máx |
|-----|------------|---|-----|
| 2018 | 75.88 | 73.40 | 78.30 |
| 2019 | 81.07 | 72.90 | 95 |
| 2020 | 60.42 ⚠️ | 0 | 110 |
| 2021 | 96.67 | 92.50 | 100 |
| 2022 | 110.83 | 110 | 115 |
| 2023 | 131.08 | 115 | 140 |
| **2024** | **136.32** | **120** | **165** |
| 2025 | 117.08 ⚠️ | 0 | 133 |
| 2026 | 123.50 | 108 | 139 |

De S/75.88 (2018) a S/136.32 (2024): un alza del 79.6 por ciento, casi el doble del alza del jornal (+40 por ciento). La agricultura sin mecanización se encarece casi al doble de velocidad.

**Ratio yunta/jornal:** 136.32 / 48.33 = 2.82x en 2024. Sorprendentemente cercano al ratio del tractor (2.91x). Eso sugiere que el mercado de yunta y tractor convergen en costo relativo, lo cual es contraintuitivo: si el tractor es más productivo, debería ser relativamente más barato por unidad de trabajo realizado, no al mismo múltiplo que la yunta.

---

## 5. La producción: lo que el SIEA dice de La Libertad (2024)

*(Fuente: SIEA Power BI, modo MANUAL_PILOT. No hay CSV público equivalente para estos datos.)*

| Indicador | Valor | Nota |
|-----------|-------|------|
| VBP Agropecuario — variación interanual | **+6.2%** | El agro total crece |
| VBP Agrícola — variación interanual | **+10.4%** | El sub-sector agrícola crece al doble |
| VBP Pecuario — variación interanual | **0%** | Ganadería estancada |
| Superficie agrícola | **2,524,943 ha** | 25 por ciento del total nacional |
| Productores agropecuarios | **~116,000** | Dato aproximado del SIEA |

**Los principales cultivos por participación en VBP:**

Arándano 15 por ciento, Espárrago 9 por ciento, Palta 7 por ciento, Arroz 7 por ciento, Papa 6 por ciento. Los cuatro primeros son cultivos de exportación o agroindustria, intensivos en mano de obra estacional. La competencia por jornal en esos meses de cosecha es directa con la costa norte (Piura, Lambayeque).

**El problema del dato:** el VBP del SIEA Power BI no tiene CSV equivalente en la Plataforma Nacional de Datos Abiertos. Es una visualización sin extracción. Los +10.4 por ciento de crecimiento agrícola son el único dato de productividad real que existe para el departamento, y no se puede automatizar su recarga.

---

## 6. El gasto público en agropecuaria: lo que dice radar-ejecucion (solo 2026)

**Limitación crítica:** la base de radar-ejecucion solo contiene el año 2026. No hay serie histórica de ejecución presupuestal para cruzar con la serie de jornal 2018–2025. Este análisis queda limitado a un solo año.

### Ejecución de La Libertad en la función AGROPECUARIA — 2026

| Entidad | PIM (S/) | Devengado (S/) | Avance |
|---------|---------|---------------|--------|
| REGIÓN LA LIBERTAD – PROYECTO ESPECIAL CHAVIMOCHIC | 126,710,074 | 63,218,155 | 49.9% |
| REGIÓN LA LIBERTAD – AGRICULTURA | 49,825,833 | 9,339,181 | 18.7% |
| MP SANTIAGO DE CHUCO | 10,261,687 | 2,642,405 | 25.8% |
| MP SÁNCHEZ CARRIÓN – HUAMACHUCO | 9,965,683 | 2,049,731 | 20.6% |
| MD QUIRUVILCA | 4,853,127 | 3,619,183 | 74.6% |
| MD MOLLEPATA | 4,256,804 | 2,149,826 | 50.5% |
| MP GRAN CHIMÚ – CASCAS | 3,231,838 | 1,464,308 | 45.3% |
| Resto de 78 municipalidades | ~32M | ~8M | ~25% |
| **TOTAL LOCAL** | **247,942,654** | **93,197,748** | **37.6%** |

| Concepto | PIM (S/) | Devengado (S/) | Avance |
|---------|---------|---------------|--------|
| Gasto nacional dirigido a La Libertad (varias entidades) | 191,569,319 | 58,886,853 | 30.7% |

**Total ejecutado en agropecuaria para La Libertad en 2026: S/152 millones entre gasto local y nacional.** De cada S/100 presupuestados, se han devengado S/35.

### Los casos que saltan

- **CHAVIMOCHIC (S/126 millones PIM)** es, con distancia, el mayor Presupuesto del departamento en la función. Ejecuta al 49.9 por ciento. El Proyecto Especial de Irrigación CHAVIMOCHIC es la columna vertebral del agro en La Libertad: sin él, el departamento pierde su infraestructura de riego.
- **REGIÓN LA LIBERTAD – AGRICULTURA (S/49 millones PIM)** ejecuta solo al 18.7 por ciento. Es la entidad regional con peor avance relativo en la función.
- **13 municipalidades** tienen PIM = 0 en la función AGROPECUARIA pero registran devengado. Eso indica que有人在做什么 sin presupuesto asignado, probablemente porque el gasto se registró en otra función y se reclasificó después.
- **7 municipalidades** (incluyendo Provincial de Trujillo) tienen PIM = 0 y devengado = 0. No hacen nada en agropecuaria.
- **CHICAMA, CHOCOPE, Taurija, Salpo, Mollebamba** son distritos pequeños con avance arriba del 90 por ciento. Distritos de montaña con poca población rural que ejecutan mejor que la GERESA.

---

## 7. El análisis cruzado: jornal, tractor, gasto

En 2026, con solo dos meses de jornal reportado:

| Indicador | Valor | Fuente |
|-----------|-------|--------|
| Jornal promedio (ene-feb 2026) | S/48.38 | MIDAGRI-03.03 |
| Tractor promedio (2026) | S/127.00 | MIDAGRI-03.04 |
| Yunta promedio (2026) | S/123.50 | MIDAGRI-03.05 |
| Gasto AGROPECUARIA ejecutado (2026) | S/152M | radar-ejecucion |
| PIM total AGROPECUARIA (2026) | S/439M | radar-ejecucion |
| Avance promedio del gasto | 35% | radar-ejecucion |
| VBP agropecuario var. (2024) | +6.2% | SIEA (manual) |

**El gasto en agropecuaria no se correlaciona directamente con el costo del jornal.** CHAVIMOCHIC recibe S/63 millones ejecutados, pero eso es infraestructura de riego, no incentivo al jornal. El jornal lo fija el mercado de trabajo rural, no el presupuesto público.

Lo que sí se puede decir: **el gobierno regional y las municipalidades están invirtiendo S/439 millones en agropecuaria este año** (PIM). De esos, solo se ha ejecutado S/152 millones (35 por ciento, a octubre). Si el jornal sube porque hay escasez de mano de obra rural, la respuesta institucional es limitada: el gasto público va a infraestructura, no a intervenciones directas en el mercado laboral agrícola.

---

## 8. Anomalías y datos que merecen verificación

Antes de usar estos datos en un documento público, conviene verificar:

1. **Jornal febrero 2024 = S/59.** Es el dato más alto de toda la serie y no tiene explicación obvia. Un error de tipeo (59 en vez de 49) es plausible. Si se usa en un informe, hay que citar la fuente y señalar que el mes siguiente volvió a 50.

2. **Tractor 2020 promedia S/63.75.** El CSV trae valores en cero para varios meses, lo que distorsiona el promedio a la baja. No usar ese promedio como representativo.

3. **Yunta 2025 promedia S/117.08.** Hay meses con valor cero en el CSV, lo que sugiere un hueco de reporte, no un precio real de cero.

4. **Tractor Lima Metropolitana 2024 = S/22.50.** Es una fracción del promedio nacional (S/130+). No tiene sentido económico para alquiler de maquinaria en la capital. Probable error del CSV.

5. **Cusco jornal promedio 2020 = S/4.58.** Claramente falso. El CSV reporta un valor anómalo. Descartar para cualquier análisis.

---

## 9. Síntesis

La Libertad tiene una economía agrícola en transición. El jornal se triplicó en términos nominales desde 2018 y dejó de ser la ventaja competitiva que era. Los cultivos de exportación (arándano, espárrago, palta) siguen creciendo en valor (VBP +10.4 por ciento), pero el costo de la mano de obra que los sostiene se estancó. El tractor y la yunta se encarecieron aún más rápido que el jornal, lo que señala que la mecanización no está abaratando el campo sino seguinstalándose a costos crecientes.

El gasto público en agropecuaria es significativo (S/439 millones PIM en 2026) pero concentrado en CHAVIMOCHIC (infraestructura de riego) y con un avance promedio del 35 por ciento. La respuesta institucional al alza del costo laboral rural es estructural (riego), no coyuntural (incentivos al pequeño productor).

El dato que falta para cerrar el análisis es la ejecución presupuestal de años anteriores. Si se ingiere el MEF 2018–2025 a radar-ejecucion, se puede hacer el cruce histórico completo: jornal vs. gastoagro vs. VBP en la misma línea de tiempo.
