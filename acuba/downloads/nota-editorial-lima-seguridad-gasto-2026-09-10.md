# Lima: inseguridad, gasto y control — lo que dice el dato

*Una nota de Rastro sobre extorsión, ejecución presupuestal en seguridad ciudadana y control interno en Lima, construida en vivo el 10 de septiembre de 2026 cruzando tres fuentes oficiales. Sin acusaciones: solo evidencia, con sus límites explícitos, para que cada lector saque su propia conclusión.*

---

## Por qué este ángulo

Después de cruzar contrataciones, sanciones y candidatos en La Libertad y en Lima, cambiamos de pregunta. Esta vez no partimos de "¿quién contrató con quién?", sino de algo que cualquier limeño discute todos los días: la sensación —y la realidad— de inseguridad, y si el dinero público que debería responder a eso se está gastando bien.

Buscamos también un ángulo de "defensa" en el sentido de brechas de capacidad —militar, territorial—, pero esa información no existe hoy en ninguna fuente abierta que pudiéramos verificar: lo que el Ministerio de Defensa publica son convenios de compensación industrial, misiones de paz y entrenamiento en el extranjero, no brechas de equipamiento ni cobertura. Lo decimos así de claro en vez de forzar un hallazgo donde no lo hay. En su lugar, usamos los informes de control de la Contraloría General como el proxy más cercano a "¿el Estado ya se dio cuenta de sus propios problemas de gestión?" — y resultó ser más revelador de lo esperado.

Esta es la tercera nota que publicamos esta semana sobre datos abiertos de gestión pública. Las dos anteriores —sobre La Libertad y sobre Lima— cruzaron contrataciones, sanciones del Tribunal de Contrataciones y candidatos electorales. Esta cambia de terreno: no mira quién contrata con quién, sino qué tan bien se ejecuta el dinero destinado a un problema que millones de personas viven todos los días, y qué encontró ya el propio Estado al respecto sin que nadie tuviera que pedírselo.

## El método

Tres fuentes oficiales, cruzadas donde el dato lo permite:

1. **SIDPOL (Policía Nacional del Perú)**, denuncias policiales agregadas por departamento/provincia/distrito/año/mes/modalidad, 2018–2026.
2. **MEF — ejecución presupuestal**, PIM (presupuesto modificado) vs. devengado (gasto real), por entidad y función presupuestal, corte al 9 de septiembre de 2026.
3. **Contraloría General de la República**, informes de control posterior, con la bandera `es_con_responsabilidad` que marca cuando el propio informe encontró responsabilidad administrativa, civil o penal.

---

## Ejercicio 1: la extorsión se multiplicó por 17 en siete años

### La tendencia

Sumando Lima Metropolitana y la Región Lima (sin Callao, que es un departamento aparte), las denuncias por extorsión pasaron de **730 en 2018 a 12,581 en 2025** — una multiplicación por 17. El quiebre real ocurre en 2022: de 1,592 denuncias en 2021 a 8,511 en 2022, un salto de 435% en un solo año.

| Año | Denuncias por extorsión |
|---|---|
| 2018 | 730 |
| 2019 | 940 |
| 2020 | 859 |
| 2021 | 1,592 |
| 2022 | 8,511 |
| 2023 | 11,382 |
| 2024 | 9,185 |
| 2025 | 12,581 |
| 2026 (parcial, a la fecha) | 5,917 |

Por contraste, el secuestro —un delito que exige mucha más logística y riesgo para el perpetrador— se mantuvo prácticamente plano en el mismo periodo: entre 359 y 547 denuncias por año, sin ninguna tendencia clara al alza. La lectura más simple: la extorsión moderna en Lima no depende de secuestrar a nadie — funciona por amenaza telefónica o por mensaje, a bajo costo y bajo riesgo para quien la ejecuta, lo cual explica por qué escaló tan rápido mientras el secuestro no lo hizo.

<div class="callout">Esto es lo que SIDPOL registra como denuncia — no mide directamente cuántas extorsiones ocurrieron, sino cuántas se reportaron. El aumento puede reflejar más delito, más disposición a denunciar, o ambas cosas — la fuente no permite separar esos dos factores.</div>

### Dónde se concentra

Los distritos con más denuncias por extorsión en 2025:

| Distrito | Denuncias 2025 |
|---|---|
| Lima (Cercado) | 1,626 |
| San Juan de Lurigancho | 1,413 |
| Ate | 830 |
| Comas | 727 |
| Puente Piedra | 628 |
| Villa El Salvador | 578 |
| San Martín de Porres | 474 |
| Chorrillos | 462 |
| Los Olivos | 458 |
| Carabayllo | 448 |

Son, casi todos, distritos populosos del este y del norte de Lima — zonas de alta densidad comercial y transporte informal, coherente con el patrón de extorsión a transportistas y pequeños comerciantes que se ha reportado extensamente en otras fuentes.

Vale notar que San Juan de Lurigancho es, con más de un millón de habitantes, el distrito más poblado del Perú — su segundo lugar en denuncias absolutas no necesariamente implica la tasa más alta por habitante; medir la incidencia relativa (denuncias por cada 10 mil habitantes) requeriría cruzar esto con datos de población que no incorporamos en este ejercicio. Lo dejamos como límite, no como corrección al dato ya presentado.

---

## Ejercicio 2: la ejecución del gasto en seguridad no acompaña el ritmo del problema

### El panorama general

Al 9 de septiembre de 2026 —con aproximadamente el 69% del año fiscal transcurrido— la ejecución del presupuesto de Lima en la función **"Orden Público y Seguridad"** llega a **61.3%** (PIM S/ 10,467 millones, devengado S/ 6,413 millones, 200 entidades). En **"Defensa y Seguridad Nacional"**, el avance es de **66.6%** (PIM S/ 5,164 millones, devengado S/ 3,438 millones, 12 entidades). Ambas funciones están, en este corte, por debajo del ritmo que correspondería a un gasto uniforme durante el año.

### Cruzando ejecución contra los distritos más golpeados

Cuando se aísla el gasto municipal específico en "Orden Público y Seguridad" —que en la práctica es, sobre todo, el gasto en serenazgo— para los diez distritos con más extorsión, aparece una variación amplia que no siempre corresponde a la gravedad del problema:

| Municipio | Denuncias extorsión 2025 | PIM seguridad 2026 | Devengado | Avance |
|---|---|---|---|---|
| Comas | 727 | S/ 31.9M | S/ 16.3M | **50.9%** |
| San Martín de Porres | 474 | S/ 31.3M | S/ 16.8M | 53.7% |
| Los Olivos | 458 | S/ 16.9M | S/ 9.3M | 55.2% |
| Villa El Salvador | 578 | S/ 20.4M | S/ 11.5M | 56.3% |
| Ate | 830 | S/ 38.5M | S/ 22.6M | 58.6% |
| Lima (Municipalidad Metropolitana) | 1,626 | S/ 125.6M | S/ 77.5M | 61.7% |
| San Juan de Lurigancho | 1,413 | S/ 61.7M | S/ 39.0M | 63.2% |
| Chorrillos | 462 | S/ 14.9M | S/ 9.5M | 63.6% |
| Carabayllo | 448 | S/ 14.1M | S/ 9.6M | 67.9% |
| Puente Piedra | 628 | S/ 24.1M | S/ 20.3M | **84.5%** |

**Comas** combina la peor ejecución de la lista (50.9%) con el cuarto lugar en extorsión — tiene S/ 15.6 millones de su presupuesto de seguridad sin gastar a esta fecha del año, en el mismo distrito donde las denuncias por extorsión no bajan. **San Martín de Porres** está en una situación parecida. En el otro extremo, **Puente Piedra** ejecuta 84.5% de su presupuesto de seguridad —el mejor de los diez— con un nivel de extorsión intermedio.

**San Juan de Lurigancho**, el distrito con más extorsión después del Cercado, tiene una ejecución media (63.2%) — ni la peor ni la mejor. No hay una correlación perfecta entre "más inseguro" y "peor ejecución", pero sí hay dos casos claros —Comas y San Martín de Porres— donde ambos problemas coinciden.

<div class="callout warn"><span class="tag">Límite del dato</span>El corte es al 9 de septiembre; los últimos meses del año suelen concentrar gasto (es un patrón conocido de la ejecución pública peruana), así que estos porcentajes pueden subir considerablemente para diciembre. Esta cifra describe el ritmo a la fecha, no el resultado final del año.</div>

---

## Ejercicio 3: lo que la propia Contraloría ya encontró

Revisamos los informes de control posterior de la Contraloría para estos mismos diez distritos. De 830 informes en total, **57 fueron emitidos con una marca explícita de responsabilidad** (administrativa, civil o penal) desde 2024 hasta hoy. Dos grupos, dentro de esos 57, son especialmente relevantes para esta nota.

### Seis informes son directamente sobre el aparato de seguridad ciudadana

En cuatro de los diez distritos, la Contraloría encontró responsabilidad en la manera en que se compró o mantuvo la infraestructura de serenazgo — justamente la primera línea de respuesta municipal frente a la extorsión y el delito común:

- **San Juan de Lurigancho** (12-jun-2024): *"Procedimientos de selección y ejecución contractual de la Adquisición de 50 camionetas del proyecto de inversión pública 'Mejoramiento del Servicio de Seguridad Ciudadana del distrito de San Juan de Lurigancho... Componente 2 Etapa II: Suficientes Unidades Móviles y Accesorios'"* (CUI 2465505).
- **San Juan de Lurigancho** (22-nov-2024): *"Otorgamiento de la buena pro... para la adquisición de bienes para el proyecto de Mejoramiento del Servicio de Seguridad Ciudadana del distrito de San Juan de Lurigancho"*.
- **Comas** (1-ago-2024): *"Adquisición de catorce (14) camionetas para el Proyecto de Mejoramiento y Ampliación del Servicio de Seguridad Ciudadana del distrito de Comas"*.
- **Carabayllo** (12-sep-2024): *"Disponibilidad del terreno de la Obra Mejoramiento y Ampliación del Servicio de Seguridad Ciudadana con CUI N° 2237180 - Segunda Etapa"*.
- **Carabayllo** (7-ago-2025): *"Servicio de Mantenimiento Preventivo y Correctivo de los vehículos de Serenazgo de la Municipalidad Distrital de Carabayllo"*.
- **San Martín de Porres** (24-dic-2025): *"Gestión de dotación de uniformes e indumentaria para el personal de la subgerencia de Serenazgo"*.

Es decir: las camionetas, el terreno, el mantenimiento vehicular y los uniformes del serenazgo en cuatro de los distritos más golpeados por la extorsión tienen, cada uno, un informe de Contraloría con responsabilidad encontrada. No sabemos, con lo que tenemos, cuál fue la responsabilidad exacta ni sobre quién cayó — estos son solo los títulos oficiales de los informes; el contenido completo está en los PDF que la propia Contraloría publica.

### Tres informes confirman, por su cuenta, el mismo patrón que veníamos investigando

Esto es lo más importante de esta sección. En nuestras notas anteriores sobre La Libertad y Lima, cruzamos contrataciones contra el registro de inhabilitaciones del Tribunal de Contrataciones y no encontramos ningún caso confirmado de adjudicación mientras el proveedor estaba sancionado en ese momento exacto. Los siguientes tres informes de Contraloría —hechos con su propia metodología, independiente de la nuestra— muestran que el problema sí existe, al menos en estos casos puntuales:

- **San Martín de Porres** (5-dic-2024): *"Contratación de servicios de personal inhabilitado e impedido para contratar con el Estado, bajo la modalidad de Locación de Servicios"*.
- **Carabayllo** (3-abr-2024): *"Contratación de proveedores impedidos de contratar con el Estado"*.
- **Comas** (3-jun-2024): *"Contratación de locadores de servicios inhabilitados"*.

Dos análisis independientes —el nuestro, por cruce de datos abiertos, y el de la Contraloría, por auditoría directa— llegan al mismo tipo de hallazgo: hay casos reales de contratación de proveedores o personas inhabilitadas por el Estado peruano. La diferencia es que nuestro cruce, a la escala que pudimos verificar, no encontró un caso confirmado con fecha exacta; la Contraloría, con acceso a expedientes completos que nosotros no tenemos, sí los encontró en al menos tres distritos.

<div class="callout warn"><span class="tag">Límite del dato</span>El campo <code>total_recomendaciones</code> viene en 0 en los 57 informes revisados — no interpretamos esto como que no hubo recomendaciones reales, sino como un campo probablemente no poblado para este tipo específico de informe (control posterior). Lo señalamos en vez de omitirlo.</div>

---

## Lo que estos datos no prueban

Esta nota no prueba que la extorsión en Lima sea causada por mala ejecución presupuestal — ambos fenómenos pueden coexistir sin que uno cause al otro, y la correlación que encontramos (Comas y San Martín de Porres) es parcial, no generalizada a los diez distritos. No prueba que las seis compras de serenazgo señaladas por Contraloría hayan sido fraudulentas — un informe "con responsabilidad" puede referirse a un error administrativo, un incumplimiento de plazo, o un problema de expediente técnico, no necesariamente corrupción; no tuvimos acceso al contenido completo de esos informes, solo a sus títulos y metadatos oficiales. Y no prueba que los tres casos de "personal inhabilitado contratado" sean equivalentes entre sí en gravedad — son títulos de informes reales, verificables en la base pública de la Contraloría, pero el detalle de cada caso requiere leer el informe completo.

## Preguntas abiertas

Si la Contraloría ya encontró, por su cuenta, contrataciones de proveedores inhabilitados en tres distritos de Lima, ¿por qué esa información no llega de forma automática a los sistemas de adjudicación de otras municipalidades, para que no se repita? Si Comas y San Martín de Porres combinan alta extorsión con la ejecución de gasto en seguridad más lenta de su grupo, ¿qué explica ese rezago —capacidad técnica, trabas administrativas, o simplemente que el año fiscal todavía tiene tres meses por delante? Y si un ejercicio como este, hecho en un día con datos públicos, puede encontrar seis informes de responsabilidad específicamente sobre patrulleros y uniformes de serenazgo, ¿cuánto de esto ya lo sabían los propios vecinos de esos distritos, sin necesitar una base de datos para confirmarlo?

---

## Nota metodológica y fuentes

**Fecha del ejercicio**: 10 de septiembre de 2026, en vivo, sobre bases propias actualizadas.

**Fuentes primarias**:
- SIDPOL (Policía Nacional del Perú), denuncias agregadas por departamento/provincia/distrito/año/mes/modalidad, 2018–2026.
- MEF, ejecución presupuestal (PIM/devengado) por entidad y función, corte 2026-09-09.
- Contraloría General de la República, informes de control posterior con bandera de responsabilidad, todos los periodos disponibles hasta 2026.

**Límites declarados**:
- SIDPOL mide denuncias, no delitos confirmados ni ocurrencia real — y no incluye homicidios como modalidad (se investigan de oficio, no por denuncia).
- El corte de ejecución presupuestal es al 9 de septiembre; los porcentajes de avance pueden subir considerablemente hacia fin de año.
- Los títulos de los informes de Contraloría son metadatos oficiales, no el contenido completo de cada informe — no evaluamos la gravedad ni el resultado final de cada hallazgo.
- El campo de recomendaciones totales no está poblado en los informes revisados; no se puede usar como indicador de severidad.
- No existe hoy una fuente abierta verificable de brechas de capacidad de defensa (militar/territorial) — se usó control interno como proxy institucional, no como equivalente.

*— Rastro, datos abiertos de gestión pública.*
