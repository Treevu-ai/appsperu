# Análisis — CENARES: estrategia de distribución de medicamentos (2026-09)

Análisis construido sobre el conector real de `servicios-salud/api` (`cenares-connector.ts`),
con datos verificados en vivo contra la tabla `cenares_distribucion` (59,039 filas, dataset
CENARES/MINSA en `datosabiertos.gob.pe`, corte real del dataset: **enero-mayo 2024**). Ver
`docs/data-contracts/cenares-distribucion.md` para la ficha técnica del conector.

**Importante sobre el alcance "presupuestal"**: este dataset **no contiene montos en soles**.
`CANTIDAD` es unidades físicas de producto (tabletas, ampollas, jeringas, etc.), no valorización.
No existe en este dataset un campo de costo unitario ni presupuesto asignado por partida. Por
tanto este análisis es de **estrategia y flujo de distribución en volumen**, no un análisis
presupuestal en soles — evitar ese encuadre en cualquier contenido público derivado de esto.
Si se requiere el componente monetario real, haría falta cruzar contra el SIAF/MEF por la
partida específica de CENARES (no investigado en esta sesión).

## Hallazgo 0 — calidad de dato: 4,596 filas (7.8%) llegan con columnas desalineadas

Antes de cualquier cifra: al explorar la tabla ya ingerida se encontraron **4,596 de 59,039
filas (7.8%) con `CANTIDAD` nulo** porque el parser (`csv-parse`, ya con `relax_column_count`)
desalinea columnas en filas donde el campo `OBSERVACION` trae texto libre con comillas sin
escapar correctamente (ej. `"ATENCIÓN INMEDIATA SOLICITADA POR LA DIRIS)"`, números de teléfono,
notas de vencimiento de lote). En esas filas, el contenido de `OBSERVACION`/`REFERENCIA` se corre
hacia la columna `ESTRATEGIA`, dejando `CANTIDAD` vacío. Confirmado en vivo: `SELECT estrategia
FROM cenares_distribucion WHERE estrategia LIKE ';%'` devuelve 2,623 filas con el resto de la
línea cruda pegado en esa columna.

**Tratamiento en este análisis**: todas las cifras de abajo excluyen las filas con `CANTIDAD`
nulo (quedan 54,443 filas válidas, 535.4M unidades brutas → las 54,443 filas limpias sí suman
correctamente). Esto es un hallazgo de calidad de dato real, no una suposición — no se intentó
"arreglar" el desalineamiento re-parseando (sería adivinar dónde termina cada campo corrido sin
un ejemplo de la estructura original).

**Pendiente si se retoma esto**: escribir un pre-procesamiento que detecte comillas sin cerrar en
`OBSERVACION` antes del parseo CSV, o reportar el problema a CENARES/datosabiertos.gob.pe como
error de exportación del dataset fuente.

## 1. Qué mide realmente el dataset: trámite interno, no entrega confirmada

De las 54,443 filas con cantidad válida (535.4M unidades en total):

| Situación | Filas | % filas | Unidades |
|---|---|---|---|
| ELABORANDO PECOSA | 50,404 | 92.6% | 493,877,432 |
| (vacío) | 3,550 | 6.5% | 34,840,738 |
| ENVIADO A ALMACEN | 335 | 0.6% | 5,592,105 |
| DEVUELTO A MONITOREO | 134 | 0.2% | 1,151,834 |
| ELABORANDO CUADRO | 20 | 0.0% | 12,530 |

**Solo 1.04% de las unidades (5.59M de 535.5M) llegó al estado "ENVIADO A ALMACEN"** — el único
estado que certifica que el producto salió del almacén central hacia el destino. El 92.2% de las
unidades está en "ELABORANDO PECOSA", que es un estado de trámite (preparación del Pedido
Comprobante de Salida), no una entrega. **La estrategia de distribución de CENARES, medida por
este dataset, opera mayormente en fase de preparación documentaria, no de despacho efectivo** —
o el dataset público solo captura ese tramo del proceso y el despacho real se registra en otro
sistema no público (SISMED interno, ver `sismed-observatorio-disponibilidad.md` — fuente
descartada por requerir login).

No se puede distinguir con este dataset si el cuello de botella es operativo (falta de
transporte, personal) o si es un artefacto de cómo CENARES reporta a datosabiertos.gob.pe
(ej. solo exporta el snapshot del día de corte, antes de que la mayoría de PECOSAs se resuelvan).

## 2. Por programa/estrategia sanitaria — SIS concentra el volumen

| Estrategia | Filas | Unidades | % del total |
|---|---|---|---|
| SIS (Seguro Integral de Salud) | 43,525 | 424,196,018 | 79.2% |
| Salud Sexual y Reproductiva | 1,673 | 25,659,394 | 4.8% |
| Nutrición | 193 | 24,051,558 | 4.5% |
| ITS - VIH/SIDA | 997 | 19,172,900 | 3.6% |
| Salud Mental | 613 | 14,895,189 | 2.8% |
| Inmunizaciones | 2,099 | 13,585,609 | 2.5% |
| Tuberculosis | 934 | 7,808,216 | 1.5% |
| Prevención y Control del Cáncer | 2,309 | 2,182,069 | 0.4% |
| Metaxénicas y OTV | 627 | 1,325,753 | 0.2% |
| Zoonosis | 477 | 853,011 | 0.2% |
| Otros (11 programas) | — | 1,744,922 | 0.3% |

**El programa SIS por sí solo mueve casi 4 de cada 5 unidades distribuidas por CENARES** — es
más una función de reabastecimiento del régimen de aseguramiento público que un reparto
equilibrado entre programas/estrategias sanitarias específicas (VIH, TBC, salud mental, etc.
juntas suman menos del 15%).

## 3. Qué medicamentos concentran el volumen

Top 5 ítems por unidades:

1. Paracetamol 500 mg tab — 35.97M unidades
2. Ácido fólico + sulfato ferroso — 32.06M unidades
3. Carbonato de calcio 1.25 g — 21.03M unidades
4. Metformina clorhidrato 850 mg — 15.47M unidades
5. Multivitamínicos (polvo) — 15.43M unidades

El dataset no trae costo unitario, así que no se puede afirmar si estos son insumos de bajo o
alto costo, ni caracterizar la estrategia de CENARES como "atención primaria" a partir de solo
5 ítems — son una observación de qué productos concentran más unidades distribuidas, nada más.

## 4. Tendencia mensual — pico en marzo 2024, sin dato posterior a mayo 2024

| Mes | Filas | Unidades |
|---|---|---|
| 2024-01 | 5,782 | 46.2M |
| 2024-02 | 7,263 | 90.1M |
| 2024-03 | 9,845 | 101.7M |
| 2024-04 | 5,674 | 48.2M |
| 2024-05 | 3,881 | 39.2M |

**Caveat de cobertura temporal**: 21,998 de las 54,443 filas limpias (40%) no tienen
`FECHACREACION` — la serie mensual de arriba solo cubre el 60% con fecha. El dataset en sí
declara cubrir "durante el 2024" pero el corte real de la muestra descargada llega hasta
2024-05-20 — **no hay visibilidad de la segunda mitad de 2024 ni de 2025-2026** en esta fuente;
no se confirmó si CENARES publica un dataset más reciente en otro slug del portal (pendiente ya
señalado en la ficha técnica del conector).

## 5. La Libertad — sin evidencia de trato diferenciado, pero con el mismo cuello de botella

| Destino (red/provincia) | Unidades | % "ENVIADO A ALMACEN" |
|---|---|---|
| Trujillo Este | 8.78M | 0.3% |
| Regional (sin desagregar) | 6.39M | 0.0% |
| Trujillo Sur Oeste | 2.40M | 1.0% |
| Sánchez Carrión | 1.60M | 2.5% |
| Pacasmayo | 1.59M | 8.8% |
| Otuzco, Ascope, Gran Chimú, Virú, Chepén, Santiago de Chuco, Julcán, Pataz | 0.5-1.2M c/u | 0-3.1% |

La Libertad en conjunto recibió **28.24M unidades (5.3% del total nacional)**, con una tasa de
"enviado a almacén" de **0.93%** frente al 1.04% nacional — una diferencia de 0.11 puntos
porcentuales, descriptiva, no una brecha significativa. El dataset no trae la composición de
destinos ni un umbral de incertidumbre/comparación, así que **no permite determinar si La
Libertad recibe un nivel de servicio relativo distinto al resto del país** — solo que comparte el
mismo patrón estructural (mayoría en trámite, no en despacho confirmado). Pacasmayo destaca con
8.8% "enviado", muy por encima del resto de provincias de la región — sin dato adicional para
explicar por qué, sería especulación atribuirlo a una causa específica.

## Qué falta para que esto sea accionable

1. **Sin componente monetario** — para un análisis presupuestal real se necesita el gasto en
   soles de CENARES (SIAF/MEF, partida específica), no solo unidades físicas.
2. **Sin fecha posterior a mayo 2024** — la fuente no permite evaluar si el patrón de "92.6% en
   trámite" sigue vigente hoy o si mejoró/empeoró.
3. **Sin definición de qué es "normal"** — no hay un benchmark público de cuánto tiempo debería
   tardar una PECOSA en resolverse; sin eso, "92.6% en trámite" es una señal de posible cuello de
   botella, no una prueba concluyente de mala gestión.
4. **El 7.8% de filas corruptas (hallazgo 0) no es una muestra aleatoria** — verificado en vivo:
   el 100% de las 4,596 filas con `CANTIDAD` nulo tiene `SITUACION` vacío (vs. 0% de nulos en
   cualquier `SITUACION` con valor real), y la mayoría también tiene `DESTINO` vacío o
   contaminado con el propio valor de `SITUACION` desplazado por el corrimiento de columnas. Esto
   significa que las filas excluidas ya eran inclasificables por `SITUACION` *antes* de excluirlas
   — la Sección 1 (distribución por situación) no queda sesgada por la exclusión, porque esas
   filas no aportaban una situación válida de todos modos. Pero como `ESTRATEGIA` y `DESTINO`
   también están corrompidos en estas filas, **no se puede descartar sesgo por programa o destino
   en las Secciones 2 y 5** — no hay forma de saber, con el campo corrupto, a qué estrategia o
   destino real pertenecían esas 4,596 filas.
