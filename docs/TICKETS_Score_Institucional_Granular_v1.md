# Tickets — Score Institucional Granular v1

**Producto:** AppsPerú (`salud-institucional`/API de score compuesto)
**PRD:** [`docs/PRD_Score_Institucional_Granular_v1.md`](PRD_Score_Institucional_Granular_v1.md)
**Backlog secuenciado:** [`docs/BACKLOG_Score_Institucional_Granular_v1.md`](BACKLOG_Score_Institucional_Granular_v1.md)
**Serie de tickets:** **SI-** (Score Institucional — nueva serie, no colisiona con DQ-/CX-/otras)
**Regla transversal:** ningún campo nuevo reemplaza uno existente en `/api/score`; `provincia`/`distrito`/`nivelGobierno` nulos son explícitos, nunca supuestos; SI-04 y SI-05 no se implementan sin confirmación explícita del usuario sobre umbrales/pesos.
**Estimación:** XS ≤ medio día · S ≤ 1 día · M 2–3 días · L 4–6 días.

---

## ÉPICA 1 — Granularidad de nivel (Sprint 1)

### SI-01 · Exponer `nivelGobierno`, `provincia`, `distrito` en `GET /api/score` ✅ Hecho (2026-09-07)

- **Historia:** Como analista, quiero ver de qué nivel de gobierno y provincia/distrito es cada entidad sin tener que cruzarlo yo mismo contra otra fuente.
- **Contexto verificado:** `apps/salud-institucional/api/src/routes/score.ts` (línea ~39-48) ya hace `JOIN territories t ON t.ubigeo = e.ubigeo` y filtra `WHERE t.departamento = $1`, pero el `SELECT` solo trae `e.entity_code, e.nombre, SUM(b.pim)..., SUM(b.devengado)...` — nunca selecciona `e.nivel_gobierno`, `t.provincia`, `t.distrito`. Mismo patrón exacto que se corrigió en DQ-02 de `radar-ejecucion`.
- **Criterios de aceptación:**
  - El `SELECT`/`GROUP BY` de la query de entidades en `score.ts` agrega `e.nivel_gobierno, t.provincia, t.distrito`.
  - `EntityScoreInputs` (en `score/compute.ts`) y `EntityScore` de salida incluyen `nivelGobierno`, `provincia`, `distrito` — aditivos, no reemplazan `componentesUsados`/`componentes`.
  - `null` explícito si `ubigeo` no resuelve en `territories` (no debería pasar dado que DQ-02 confirmó 100% de cobertura en desarrollo, pero el código no debe asumirlo).
  - Test: entidad con territorio resuelto expone los 3 campos; test de regresión confirma que la lista de 130 entidades sigue completa.
- **Dependencias:** ninguna.
- **Prioridad:** P0 · **Esfuerzo:** S

### SI-02 · Ranking dentro de la cohorte de nivel de gobierno ✅ Hecho (2026-09-07)

- **Historia:** Como analista, quiero saber la posición de una entidad dentro de su propio nivel de gobierno (ej. "3° de 85 Gobiernos Locales"), no solo su posición en el ranking mezclado de las 130.
- **Contexto verificado:** hoy `score.ts` ordena `resultados` una sola vez por `scoreCompuesto` de mayor a menor (línea 163), sin distinguir nivel de gobierno. Con SI-01 ya expuesto, se puede calcular el ranking por cohorte en memoria (130 filas, sin costo real).
- **Criterios de aceptación:**
  - Cada entidad en `resultados` incluye `rankingEnNivelGobierno: { posicion: number, total: number }` (ej. `{ posicion: 3, total: 85 }`), calculado solo sobre las entidades de su mismo `nivelGobierno` con `scoreCompuesto` no nulo.
  - Entidades con `scoreCompuesto: null` no reciben ranking (`null` explícito), no una posición inventada.
  - Test: 3 entidades del mismo nivel con scores conocidos producen el orden esperado; una entidad de nivel distinto no contamina el conteo.
- **Dependencias:** SI-01.
- **Prioridad:** P0 · **Esfuerzo:** M

### SI-07 · Chequeo de salud del crossref (infobras/compras-publicas) ✅ Hecho (2026-09-07)

- **Historia:** Como equipo de datos, quiero poder verificar en cualquier momento si `entity_crosswalk` de infobras o compras-publicas está vacío o desactualizado, para no repetir el episodio de DQ-05 (meses sin que nadie lo notara).
- **Contexto verificado:** ambas tablas no tenían ninguna forma de auditar su estado sin conectarse directamente a la base — se descubrió el vacío por una auditoría externa, no por una alerta del sistema. `build-crosswalk.ts` de ambas apps ya imprime un resumen (`confirmadas`/`candidatas`/`sinMatch`) al correr, pero ese resumen no se persiste en ningún lado consultable después.
- **Criterios de aceptación:**
  - Nuevo endpoint (ej. `GET /api/crossref/salud` o campo agregado a un endpoint de metadata ya existente) en `infobras` y `compras-publicas` que reporte `{ rowCount, ultimaConstruccion }` de `entity_crosswalk` (usando `created_at`/timestamp equivalente de la tabla, o metadata guardada por `build-crosswalk.ts` al correr).
  - Si `rowCount === 0`, el endpoint lo señala explícitamente (ej. `estado: "VACIO"`), no solo un número.
  - `docs/conectores.md` documenta el nuevo endpoint y recomienda revisarlo tras cada despliegue o seed de datos nuevo.
- **Dependencias:** ninguna.
- **Prioridad:** P1 · **Esfuerzo:** S

---

## ÉPICA 2 — Agregación territorial y bandas (Sprint 2)

### SI-03 · Agregación de score por provincia

- **Historia:** Como analista territorial, quiero el score promedio (de las entidades con score disponible) por provincia, sin descargar las 130 filas y agregar yo mismo.
- **Contexto verificado:** con `provincia` expuesto (SI-01), agregar por ella es directo — incluye tanto agregación en memoria sobre la respuesta ya existente como, si el volumen lo justifica, un endpoint dedicado `GET /api/score/por-provincia`.
- **Criterios de aceptación:**
  - Nuevo endpoint o parámetro que devuelve, por cada una de las 12 provincias de La Libertad: promedio de `scoreCompuesto` (solo entidades con score no nulo), cantidad de entidades con score, cantidad sin score.
  - Provincias sin ninguna entidad con score no aparecen con un `0` engañoso — se omiten o se marcan explícitamente `sinDatos: true`.
  - Test: 3 entidades de la misma provincia con scores conocidos producen el promedio esperado.
- **Dependencias:** SI-01.
- **Prioridad:** P1 · **Esfuerzo:** M

### SI-04 · Bandas de score cualitativas — ✅ esquema confirmado (2026-09-07), listo para implementar

- **Historia:** Como lector no técnico, quiero una clasificación cualitativa (ej. "Alto"/"Medio"/"Bajo") además del número 0-100, para interpretar el score sin conocer la distribución completa.
- **Contexto verificado:** distribución real de `scoreCompuesto` en las 129 entidades de La Libertad con score no nulo (calculada en vivo, 2026-09-07): mínimo 27.9, p10 45.9, p25 55.8, mediana 61.3, p75 67.9, p90 72.3, máximo 80.3, promedio 60.7.
- **Esquema confirmado por el usuario: 5 bandas con cola crítica**, basadas en los percentiles reales de arriba:

  | Banda | Umbral | Entidades aprox. |
  |---|---|---|
  | Sobresaliente | `scoreCompuesto >= 72.3` (p90) | ~13 (top 10%) |
  | Alto | `67.9 <= scoreCompuesto < 72.3` (p75–p90) | ~19 |
  | Medio | `55.8 <= scoreCompuesto < 67.9` (p25–p75, mitad central) | ~65 |
  | Bajo | `45.9 <= scoreCompuesto < 55.8` (p10–p25) | ~19 |
  | Crítico | `scoreCompuesto < 45.9` (p10) | ~13 (bottom 10%) |

  Los umbrales son los percentiles de la distribución de La Libertad al 2026-09-07 — no se recalculan automáticamente si la distribución cambia (ver nota de mantenimiento en criterios de aceptación).
- **Criterios de aceptación:**
  - Cada entidad con `scoreCompuesto` no nulo recibe `banda: "Sobresaliente" | "Alto" | "Medio" | "Bajo" | "Crítico"` según la tabla de arriba.
  - Entidad con `scoreCompuesto: null` recibe `banda: null`, nunca una banda por defecto.
  - Los umbrales quedan hardcodeados como constantes documentadas en `score/compute.ts` (mismo archivo que ya calcula `scoreCompuesto`), citando esta fecha y esta base de cálculo en el comentario — no en un archivo de configuración separado, para que quien lea el cálculo del score vea también cómo se clasifica.
  - `docs/data-contracts` (nuevo archivo o sección para `salud-institucional`) documenta el esquema completo con su fecha y método de cálculo (percentiles), y una nota explícita: **estos umbrales fueron calculados sobre la distribución de 2026-09-07 y no se recalculan automáticamente** — si la distribución cambia sustancialmente (ej. tras automatizar el crossref o agregar más departamentos), hay que decidir explícitamente si conviene recalcularlos, no asumir que siguen siendo representativos para siempre.
  - Test: valores en cada frontera exacta (45.9, 55.8, 67.9, 72.3) caen en la banda correcta (verificar `>=` vs `>` en cada límite).
- **Dependencias:** ninguna técnica.
- **Prioridad:** P0 · **Esfuerzo:** S

---

## ÉPICA 3 — Evaluaciones (sin fecha comprometida)

### SI-05 · Evaluar promedio ponderado vs. simple

- **Historia:** Como equipo de producto, quiero saber si algunos de los 5 componentes deberían pesar más que otros (ej. ejecución presupuestal vs. salud tributaria de proveedores) en vez de un promedio simple entre los disponibles.
- **Contexto verificado:** `score/compute.ts` (línea 113-116) usa promedio simple de los componentes disponibles, sin ponderar — decisión de diseño explícita y documentada en el comentario del archivo ("Promedio simple entre componentes disponibles, no ponderado").
- **Criterios de aceptación:**
  - Documento de evaluación que compara: ¿cambiaría significativamente el ranking de las 130 entidades si se pondera?, ¿hay una justificación de negocio para que un componente pese más (ej. ejecución presupuestal como componente "ancla" con más peso)?
  - Si se decide ponderar: los pesos se muestran explícitamente en la respuesta (`pesos: {...}`), nunca ocultos; comentario de `compute.ts` se actualiza para reflejar la nueva decisión de diseño (reemplazando el que dice "no ponderado").
  - Si no: la razón queda documentada y el ticket se cierra como "evaluado, diferido".
- **Dependencias:** ninguna. Sin fecha comprometida.
- **Prioridad:** P1 · **Esfuerzo:** S (evaluación)

### SI-06 · Evaluar sub-métricas nuevas como componentes adicionales

- **Historia:** Como equipo de producto, quiero saber si alguna de las categorías nuevas encontradas en la auditoría de La Libertad (causal de paralización de obra, modalidad de control de Contraloría, tipo de infracción ambiental) debería ser un 6º/7º componente del score.
- **Contexto verificado:** la auditoría de datos de La Libertad (`docs/PRD_Calidad_Datos_Auditoria_La_Libertad_v1.md`) encontró categorías no usadas en ningún score/reporte: `causalParalizacion` (INFOBRAS), modalidad de control completa (Contraloría, 11 valores), `tipoInfraccion` (OEFA). Ninguna está evaluada todavía como señal de desempeño institucional.
- **Criterios de aceptación:**
  - Documento de evaluación que para cada categoría candidata responde: ¿mide desempeño de la entidad o es una característica externa (ej. tipo de obra no depende de la gestión)?, ¿qué tan disponible está para las entidades de La Libertad (cobertura real, no solo si el campo existe)?
  - Si se decide agregar un componente nuevo: se implementa siguiendo el mismo patrón de `ComponentScore` (`valor`/`disponible`, nunca imputado) y se documenta en el PRD/data-contract del score.
  - Si no: razón documentada, ticket cerrado como "evaluado, diferido".
- **Dependencias:** ninguna. Sin fecha comprometida.
- **Prioridad:** P2 · **Esfuerzo:** M (evaluación, más si se implementa)
