# Backlog ejecutable — Calidad de Datos: Auditoría La Libertad v1

**Producto:** AppsPerú (backend/ingesta/API)
**PRD:** [`docs/PRD_Calidad_Datos_Auditoria_La_Libertad_v1.md`](PRD_Calidad_Datos_Auditoria_La_Libertad_v1.md)
**Tickets:** [`docs/TICKETS_Calidad_Datos_Auditoria_La_Libertad_v1.md`](TICKETS_Calidad_Datos_Auditoria_La_Libertad_v1.md)
**Apps en alcance:** `radar-ejecucion`, `infraestructura-mtc`, `residuos-solidos`, `salud-institucional`, `infobras`, `instituciones-educativas` (más `docs/conectores.md`/`docs/data-contracts` como entregable transversal en cada ticket).
**Reglas transversales (del PRD §7):**
- Un dato sin match o sin atribución territorial se marca explícitamente (`null` o equivalente) — nunca se rellena con un valor supuesto.
- Ningún endpoint existente cambia de forma incompatible sin verificar consumidores primero (`rastro-web`, servidor MCP).
- `docs/conectores.md`/`docs/data-contracts` se actualiza en el mismo PR que el cambio, no después.
- Ningún fix de este backlog reintroduce el mismo patrón de bug que corrige (LIMIT fijo nuevo, panel sin filtro nuevo, parámetro sin efecto nuevo).

**Estimación:** XS ≤ medio día · S ≤ 1 día · M 2–3 días · L 4–6 días (esfuerzo relativo, no calendario).

**Regla de "terminado" para este backlog (Definition of Done, aplicada ticket por ticket):** PR + revisión + tests automatizados en verde (suite completa de la app, no solo el archivo tocado) + la app levanta en local sin errores tras el cambio + documentación (`docs/conectores.md`/`docs/data-contracts`) actualizada en el mismo PR + si el ticket es una evaluación, el entregable es un documento de decisión explícito (ADR o equivalente), nunca una decisión implícita.

---

## Resumen de sprints

| Sprint | Objetivo | Tickets | Puerta de salida |
|---|---|---|---|
| **1** | Cerrar los 5 bugs de comportamiento confirmados con evidencia HTTP | DQ-01, DQ-02, DQ-03, DQ-04, DQ-05 | `/api/execution` pagina el universo real y expone provincia; los catálogos de MTC y residuos filtran por corte/año vigente por defecto; el crossref de score institucional está diagnosticado (y resuelto o formalmente documentado como limitación aceptada) |
| **2** | Exponer categorías ya ingeridas y blindar contra el próximo bug del mismo tipo | DQ-06, DQ-07, DQ-08, DQ-09, DQ-10 | Endpoints de agregación disponibles para INFOBRAS y ejecución de gasto; `area_censo` expuesto en instituciones educativas; `docs/data-contracts` documenta qué fuentes son panel multi-año; smoke test genérico detecta discrepancias total-vs-suma-de-filas |
| **3** | Decisiones explícitas sobre gaps de cobertura sin solución de una línea | DQ-11, DQ-12, DQ-13 | ADR/documento de decisión para cada uno — implementación solo si la evaluación la justifica |

---

## Secuencia estratégica

```text
Sprint 1: DQ-01 (paginación) → DQ-02 (atribución territorial, depende de DQ-01)
            ↓                        ↕
          DQ-03 (corte MTC) ⟷ DQ-04 (año residuos) — independientes, en paralelo
            ↓
          DQ-05 (diagnóstico crossref score) — independiente, puede correr en paralelo desde el día 1
            ↓
Sprint 2: DQ-06 (agregación INFOBRAS) ⟷ DQ-07 (area_censo) — independientes
            ↓
          DQ-08 (agregación ejecución, depende de DQ-01)
            ↓
          DQ-09 (documentar panels) → idealmente después de DQ-03/DQ-04
            ↓
          DQ-10 (smoke test genérico, depende de DQ-01 y DQ-06 para tener algo correcto que verificar)
            ↓
Sprint 3: DQ-11 (ADR score parcial, depende del diagnóstico de DQ-05)
          DQ-12 (evaluación CEPLAN Geo) — independiente, sin fecha comprometida
          DQ-13 (evaluación autoridades electas) — independiente, sin fecha comprometida
```

Cada sprint deja una **puerta de salida verificable**: si la puerta no se cumple, no se abre el siguiente sprint. Dentro del Sprint 1, DQ-03/DQ-04/DQ-05 son independientes de DQ-01/DQ-02 y pueden trabajarse en paralelo.

---

## Sprint 1 — Cerrar los bugs críticos confirmados

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| DQ-01 | Paginación real en `radar-ejecucion` `/api/execution` | `limit`/`offset`/`hasMore` reales; universo completo recuperable vía paginación (2,594 filas verificadas para La Libertad al momento de la auditoría); consumidores existentes verificados antes de mergear | — | P0 | M | ✅ Hecho (2026-09-07) |
| DQ-02 | Atribución territorial server-side en `radar-ejecucion` | Campo `provincia`/`distrito` expuesto desde el JOIN a `territories` que la query ya hacía; `null` explícito si no hay match; cobertura verificada en 100% (0 de 2,594 sin provincia en desarrollo) | DQ-01 | P0 | S (menor al estimado — no requirió crosswalk nuevo) | ✅ Hecho (2026-09-07) |
| DQ-03 | Filtro de corte vigente por defecto en `infraestructura-mtc` | Sin parámetro, devuelve solo el corte más reciente; parámetro explícito habilita histórico; test de regresión (terminales=2, aeródromos=9 al momento de la auditoría) | — | P0 | S | ⬜ Pendiente |
| DQ-04 | Filtro de año vigente por defecto en `residuos-solidos` | Sin parámetro `anio`, devuelve solo el año más reciente o exige el parámetro con error 400 claro; sanity check contra sobreestimación por suma multi-año | — | P0 | S | ⬜ Pendiente |
| DQ-05 | Diagnosticar y resolver (o documentar) el crossref infobras↔ejecución vacío | Causa raíz documentada; si es corregible en ≤M, el crossref se repuebla; si no, ticket de seguimiento fuera de este backlog | — | P0 | XS real (estimado M-L) | ✅ Hecho (2026-09-07) |

**Puerta de salida del Sprint 1**: una consulta a `/api/execution` para cualquier departamento recupera su universo completo de filas (no un LIMIT fijo), con provincia resuelta cuando es posible; los catálogos de MTC y residuos no mezclan cortes/años por defecto; existe un diagnóstico escrito (resuelto o no) sobre por qué el crossref de score institucional está vacío. **DQ-01, DQ-02 y DQ-05 cumplidos — quedan DQ-03 y DQ-04 pendientes del sprint.**

> **DQ-05 cerrado (2026-09-07):** causa raíz no era un bug — `apps/infobras/api` y `apps/compras-publicas/api` tienen un script `npm run crossref:build` que nunca se había corrido en este entorno. Se corrió en ambos (infobras: 75 confirmadas + 17 candidatas de 130; compras-publicas: 56 confirmadas + 15 candidatas de 130). Score institucional de La Libertad pasó de 0/130 con 3+ componentes a 93/130 (49 con 5/5). DQ-11 se redefinió: ya no es "aceptar score parcial" sino "decidir si automatizar `crossref:build` o agregar un chequeo de salud", dado que un job manual sin correr durante meses pasó desapercibido.

> **DQ-01/DQ-02 cerrados (2026-09-07):** `apps/radar-ejecucion/api/src/routes/execution.ts` replicó el patrón de paginación de `radar-inversiones` (`limit`/`offset`/`total`/`hasMore`, `COUNT(*)` separado) y agregó `t.provincia`/`t.distrito` al SELECT que ya hacía el JOIN a `territories`. Suite completa de `radar-ejecucion/api` en verde (83/83). Verificado en vivo contra el servidor local: `total: 2594` (coincide exacto con la auditoría), y **0 de 2,594 filas sin provincia** — mucho mejor que el 33.9% estimado en el ticket original, porque `entities.ubigeo` ya estaba 100% poblado y solo faltaba exponer las columnas. `docs/conectores.md` actualizado en el mismo cambio.

---

## Sprint 2 — Exponer categorías existentes y blindar contra recurrencia

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| DQ-06 | Endpoint de agregación por categoría en INFOBRAS + fix de `groupBy` ignorado | `groupBy` funciona para sector/nivel/naturaleza/modalidad/causal o responde 400 explícito para valores no soportados; nunca lo ignora en silencio | — | P1 | M | ⬜ Pendiente |
| DQ-07 | Exponer `area_censo` en `instituciones-educativas` | Campo expuesto y filtrable en `/api/instituciones`; suma del desglose coincide con el total conocido | — | P1 | S | ⬜ Pendiente |
| DQ-08 | Endpoint de agregación funcional/genérica en `radar-ejecucion` | Nuevo endpoint/parámetro de agregación por función y genérica de gasto; suma de grupos coincide con el total | DQ-01 | P1 | M | ⬜ Pendiente |
| DQ-09 | Documentar fuentes panel multi-año/multi-corte en `docs/data-contracts` | Lista explícita de fuentes panel (mínimo las 4 identificadas) con su comportamiento por defecto documentado | Idealmente después de DQ-03/DQ-04 | P1 | S | ⬜ Pendiente |
| DQ-10 | Smoke test genérico: total de resumen vs. suma de filas paginadas | Script/suite que detecta discrepancias total-vs-paginación en cualquier app con endpoint de resumen; corre en CI | DQ-01, DQ-06 | P1 | M | ⬜ Pendiente |

**Puerta de salida del Sprint 2**: las categorías confirmadas como ya ingeridas (sector, causal, naturaleza, área urbano/rural, función, genérica) están disponibles vía API sin requerir descarga manual y agregación client-side; existe un mecanismo automatizado que habría detectado el bug de DQ-01 antes de que una auditoría manual tuviera que encontrarlo.

---

## Sprint 3 — Decisiones de alcance pendientes

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| DQ-11 | ADR: aceptar score institucional parcial o priorizar DQ-05 | ADR con decisión explícita sobre cómo comunicar (o no) un score de máximo 2/5 componentes | DQ-05 | P2 | S | ⬜ Pendiente |
| DQ-12 | Evaluar inversión en CEPLAN Geo | Documento de evaluación costo/beneficio de ingerir infraestructura y población para las 11 provincias restantes | — | P2 | S | ⬜ Pendiente |
| DQ-13 | Evaluar fuente adicional de autoridades subnacionales electas | Documento de evaluación de disponibilidad y costo de un conector ONPE/JNE de autoridades municipales/regionales | — | P2 | S | ⬜ Pendiente |

**Puerta de salida del Sprint 3**: decisión documentada (con o sin implementación de seguimiento) para cada uno de los 3 gaps de cobertura — ninguno queda como limitación implícita sin registrar.

---

## Fuera de alcance de este backlog

Ver PRD §9. En particular: construir un conector nuevo de autoridades subnacionales electas o ampliar CEPLAN Geo (solo evaluación en DQ-12/DQ-13); cambios en `apps/rastro-web`; y volver a tocar el informe territorial ad-hoc que originó esta auditoría (ya corregido manualmente durante la sesión de auditoría misma — este backlog corrige la causa raíz en el código, no el documento derivado).
