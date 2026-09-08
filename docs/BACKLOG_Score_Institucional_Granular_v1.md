# Backlog ejecutable — Score Institucional Granular v1

**Producto:** AppsPerú (`salud-institucional`/API de score compuesto)
**PRD:** [`docs/PRD_Score_Institucional_Granular_v1.md`](PRD_Score_Institucional_Granular_v1.md)
**Tickets:** [`docs/TICKETS_Score_Institucional_Granular_v1.md`](TICKETS_Score_Institucional_Granular_v1.md)
**Apps en alcance:** `salud-institucional` (score), `infobras`/`compras-publicas` (salud del crossref que lo alimenta).
**Estimación:** XS ≤ medio día · S ≤ 1 día · M 2–3 días · L 4–6 días.
**Regla de "terminado" (Definition of Done):** PR + tests en verde (suite completa de `salud-institucional/api`) + verificado en vivo contra el servidor local (no solo tests unitarios) + documentación actualizada en el mismo PR + SI-04/SI-05 nunca se mergean sin confirmación explícita del usuario.

---

## Resumen de sprints

| Sprint | Objetivo | Tickets | Puerta de salida |
|---|---|---|---|
| **1** | Exponer nivel de gobierno/territorio y blindar el crossref | SI-01, SI-02, SI-07 | `/api/score` expone `nivelGobierno`/`provincia`/`distrito` y ranking por cohorte; existe forma de detectar si el crossref se vacía de nuevo |
| **1.5** | Corregir imputación silenciosa de 0 (hallazgo del 2026-09-08, sin bloqueo de confirmación) | SI-08 | El componente de ejecución nunca vale 0 por un PIM=0 no distinguido de "sin dato" |
| **2** | Agregación provincial y bandas (sujeto a confirmación) | SI-03, SI-04 | Score promedio por provincia disponible; bandas visibles con umbrales confirmados por el usuario y documentados |
| **3 (evaluación, sin fecha)** | Ponderación y sub-métricas nuevas | SI-05, SI-06 | Documentos de evaluación — implementación solo si el usuario confirma tras verlos |

---

## Sprint 1 — Nivel de gobierno, territorio y salud del crossref

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| SI-01 | Exponer `nivelGobierno`/`provincia`/`distrito` en `/api/score` | Campos aditivos en la respuesta; `null` explícito si no hay match; test de regresión sobre las 130 entidades | — | P0 | S | ✅ Hecho (2026-09-07) |
| SI-02 | Ranking dentro de la cohorte de nivel de gobierno | `rankingEnNivelGobierno: {posicion, total}` por entidad con score; entidades sin score sin ranking | SI-01 | P0 | M | ✅ Hecho (2026-09-07) |
| SI-07 | Chequeo de salud del crossref (infobras/compras-publicas) | Endpoint que reporta `rowCount`/última construcción; señala explícitamente si está vacío | — | P1 | S | ✅ Hecho (2026-09-07) |

**Puerta de salida del Sprint 1**: una consulta a `/api/score` para La Libertad trae nivel de gobierno y territorio por entidad, permite saber la posición de una entidad dentro de su propio nivel de gobierno, y existe una forma de verificar si el crossref que alimenta el score sigue poblado sin tener que auditarlo manualmente de nuevo. **Cumplida (2026-09-07)**: verificado en vivo — 130/130 entidades con `nivelGobierno`, 129/130 con `rankingEnNivelGobierno` (la única sin ranking es la única sin score); `GET /api/crossref/salud` de infobras y compras-publicas reportan `estado: "OK"` con las cifras reales (92 y 71 filas respectivamente). Suites completas en verde: `salud-institucional` 15/15, `infobras` 86/86, `compras-publicas` 109/109.

---

## Sprint 1.5 — Corrección de imputación silenciosa (hallazgo 2026-09-08)

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| SI-08 | Corregir `ejecucionScore` para no imputar 0 cuando `pim` es exactamente 0 | `disponible: false, valor: null` cuando `pim <= 0`; test unitario nuevo; verificado en vivo contra Municipalidad Provincial de Trujillo (S/116.3M de devengado real con PIM=0), El Porvenir (S/16.1M) y Florencia de Mora (S/14.9M) | — | P1 | S | ✅ Hecho (2026-09-08) |

**Puerta de salida del Sprint 1.5**: ninguna entidad con PIM=0 registrado (pero con fila de ejecución real) muestra el componente de ejecución en 0 — muestra `disponible: false`. Las 3 entidades cuantificadas en el hallazgo del 2026-09-08 quedan verificadas explícitamente antes/después en el PR. **Cumplida**: Trujillo MPT 64.2→80.2, El Porvenir 54.8→68.5, Florencia de Mora 60.6→75.7. Suite `salud-institucional/api` 17/17.

---

## Sprint 2 — Agregación provincial y bandas (sujeto a confirmación)

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| SI-03 | Agregación de score por provincia | Promedio por provincia (solo entidades con score); provincias sin dato marcadas explícitamente, no en 0 | SI-01 | P1 | M | ⬜ Pendiente |
| SI-04 | Bandas de score cualitativas | Campo `banda` por entidad con score; umbrales confirmados por el usuario y documentados con su base de cálculo (percentiles reales) | — | P0 | S | ⬜ Pendiente — esquema confirmado (5 bandas, ver TICKETS) |

**Puerta de salida del Sprint 2**: existe una vista agregada por provincia; cada entidad con score tiene una banda cualitativa cuyos umbrales fueron confirmados explícitamente por el usuario (no elegidos unilateralmente) y están documentados en `docs/data-contracts`.

---

## Sprint 3 (evaluación, sin fecha comprometida)

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| SI-05 | Evaluar promedio ponderado vs. simple | Documento de evaluación; si se pondera, pesos explícitos en la respuesta | — | P1 | S | ⬜ Pendiente |
| SI-06 | Evaluar sub-métricas nuevas como componentes | Documento de evaluación por categoría candidata (causal de paralización, modalidad de control, tipo de infracción) | — | P2 | M | ⬜ Pendiente |

**Puerta de salida del Sprint 3**: decisión documentada sobre ponderación y sobre cada sub-métrica candidata — implementación solo si el usuario confirma tras ver la evaluación.

---

## Fuera de alcance de este backlog

Ver PRD §9. En particular: automatización de `crossref:build` (vive en DQ-11 del backlog de Calidad de Datos), cambios a la fórmula de los 5 componentes existentes, e implementación de SI-05/SI-06 sin confirmación previa.
