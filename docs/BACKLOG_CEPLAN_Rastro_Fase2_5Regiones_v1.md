# Backlog ejecutable — CEPLAN × Rastro Fase 2 (5 regiones)

**Producto:** Rastro / Follow the Sol  
**PRD:** [`docs/PRD_CEPLAN_Rastro_Fase2_5Regiones_v1.md`](PRD_CEPLAN_Rastro_Fase2_5Regiones_v1.md)  
**Regiones en alcance:** LA LIBERTAD, LAMBAYEQUE, PIURA, CAJAMARCA, CUSCO — **solo estas cinco**  
**Regla transversal:** API/CLI/MCP. Sin web nueva. Sin coordenadas inventadas. Sin cobertura nacional simulada.  
**Estimación:** S ≤ 1 día, M 2–3 días, L 4–6 días (esfuerzo relativo, no calendario).

## Resumen de sprints

| Sprint | Objetivo | Tickets | Puerta de salida |
|---|---|---|---|
| **6** | Spike geo, preflight territorial 5 deptos, diseño puente CEPLAN | AL2-01 a AL2-08 | Matriz cobertura 5×apps; spike hidráulica/proyectos cerrado |
| **7** | Cruce ceplan-estrategico ↔ ceplan-geo | AL2-09 a AL2-14 | `/api/crossref/territorial` para 5 departamentos |
| **8** | Indicadores SEG, Efficiency, PBA | AL2-15 a AL2-21 | Endpoints derivados con proxies y tests |
| **9** | Memos Lambayeque + Piura | AL2-22 a AL2-28 | 6 memos + corridas documentadas |
| **10** | Memos Cajamarca + Cusco + cierre | AL2-29 a AL2-35 | 6 memos + índice comparativo 5 regiones |

## Secuencia estratégica

```text
Sprint 6:  spike CG-25 → matriz cobertura 5 deptos → diseño API territorial → ingestas faltantes
Sprint 7:  crossref territorial → agregados ceplan-geo → MCP → validación 5 deptos
Sprint 8:  mapeo PBA → SEG nacional formalizado → SEG proxy dept → CLI indicadores → MCP
Sprint 9:  plantilla memo → ingestas LL+LAM+PIU → memos brechas + productivo + sector
Sprint 10: ingestas CAJ+CUS → memos → índice comparativo → docs ESTADO/conectores
```

---

## Sprint 6 — Spike, cobertura y diseño

| ID | Épica | Objetivo | Criterios de aceptación | Dep. | P | Esf. | Sprint |
|---|---|---|---|---|---|---|---|
| AL2-01 | Spike geo | Cerrar CG-25: `cb_redhidrica` y `cb_proyectos`. | Doc `docs/spike-ceplan-geo-capas-hidrica-proyectos-2026-08.md` con conteo WFS, tamaño paginado, % geometrías válidas, decisión `AUTOMATIZABLE`/`POSPONER`/`MVP_ACOTADO`; tiempos medidos. | CG-05 | P0 | M | 6 |
| AL2-02 | Cobertura | Matriz de preflight territorial 5 departamentos. | Tabla `app × departamento × completitud` para MEF, Invierte, INFOBRAS, OECE, ceplan-geo; gaps explícitos; comando reproducible documentado. | — | P0 | M | 6 |
| AL2-03 | Ingesta | Corridas terminales faltantes por departamento. | Lambayeque, Piura, Cajamarca, Cusco: MEF (`ingestMefFullYearForDepartamento` o equivalente), INFOBRAS, Invierte según RUNBOOK; La Libertad como baseline sin regresión. | AL2-02 | P0 | L | 6 |
| AL2-04 | Diseño | Contrato API `GET /api/crossref/territorial`. | JSON schema en data contract; campos `matcher`, `cobertura`, `restriccion`, `marcoEstrategicoNacional`, `contextoTerritorial`; revisión de ADR-0005 con nota de corrección (no entity→ubigeo). | AL2-01 | P0 | S | 6 |
| AL2-05 | Diseño | Tabla de mapeo Plan–Budget Alignment v1. | `docs/data-contracts/ceplan-plan-budget-alignment-v1.md` con ≥ 10 mapeos dimensión CEPLAN → función MEF, fuentes y limitaciones. | — | P1 | M | 6 |
| AL2-06 | Geo | Ingesta condicional post-spike (si AUTOMATIZABLE). | Script `ingest:hydro` y/o `ingest:projects`; migración si aplica; si POSPONER, ticket cerrado con razón en spike. | AL2-01 | P1 | M | 6 |
| AL2-07 | Calidad | Tests de cobertura departamental en ceplan-geo. | Assert conteos distritos por los 5 departamentos (13, 14, 20, 06, 08) contra fixtures o DB de integración. | AL2-03 | P1 | S | 6 |
| AL2-08 | Docs | Actualizar `ESTADO.md` y `ceplan-geo.md` con Fase 2. | Sección "Fase 2 en curso"; referencia a PRD/backlog; estado spike. | AL2-01 | P1 | S | 6 |

**Puerta Sprint 6:** Spike cerrado; matriz 5×apps publicada; al menos 2 departamentos nuevos con corrida MEF+INFOBRAS verificable.

---

## Sprint 7 — Puente ceplan-estrategico ↔ ceplan-geo

| ID | Épica | Objetivo | Criterios de aceptación | Dep. | P | Esf. | Sprint |
|---|---|---|---|---|---|---|---|
| AL2-09 | API | `GET /api/crossref/territorial?departamento=` en ceplan-estrategico. | Valida departamento ∈ {5 piloto}; llama ceplan-geo HTTP; adjunta CUMP02/CUMP03 GN/GR; metadata de cruce completa. | AL2-04, AL2-03 | P0 | L | 7 |
| AL2-10 | Cliente | Cliente HTTP ceplan-geo en ceplan-estrategico. | `CEPLAN_GEO_API_URL`; timeout; error graceful si geo caída (`cobertura: BLOQUEADA`). | AL2-09 | P0 | S | 7 |
| AL2-11 | API | Agregados territoriales en ceplan-geo (si faltan). | `GET /api/territories/summary?departamento=` con conteo distritos + resumen infra; o documentar uso de SQL interno sin nuevo endpoint si se elige solo HTTP cross-app. | AL2-09 | P1 | M | 7 |
| AL2-12 | MCP | Registrar tools territoriales y crossref en mcp-server. | `ceplan_estrategico_crossref_territorial` + tools geo summary si hay endpoint nuevo; test catálogo. | AL2-09 | P1 | S | 7 |
| AL2-13 | Validación | Corrida manual 5 departamentos. | Doc `docs/validacion-crossref-territorial-5-regiones-2026-08.md` con curl por dept y conteos. | AL2-09 | P0 | S | 7 |
| AL2-14 | ADR | Actualizar ADR-0005 sección ceplan-estrategico ↔ ceplan-geo. | Método corregido a `departamento_prefijo_ubigeo`; ejemplo JSON real. | AL2-09 | P1 | S | 7 |

**Puerta Sprint 7:** Crossref territorial responde para LAS 5 regiones con restricciones visibles.

---

## Sprint 8 — Indicadores derivados (SEG, Efficiency, PBA)

| ID | Épica | Objetivo | Criterios de aceptación | Dep. | P | Esf. | Sprint |
|---|---|---|---|---|---|---|---|
| AL2-15 | API | Formalizar SEG nacional en endpoint dedicado. | `GET /api/indicators/seg` — GN/GR, años explícitos, `segPp`, `fuente: ceplan+radar-ejecucion`. | AL2-09 | P0 | M | 8 |
| AL2-16 | API | SEG proxy departamental. | `GET /api/indicators/seg?departamento=` — usa MEF+INFOBRAS; flag `variante: PROXY_DEPARTAMENTAL`; null si falta PIM o avance. | AL2-03, AL2-15 | P0 | L | 8 |
| AL2-17 | API | Execution Efficiency nacional y proxy dept. | `GET /api/indicators/execution-efficiency` — misma semántica que SEG. | AL2-15 | P0 | M | 8 |
| AL2-18 | API | Plan–Budget Alignment departamental. | `GET /api/indicators/plan-budget-alignment?departamento=&anio=` — usa tabla mapeo AL2-05; participación % por dimensión; restricción heurística. | AL2-05, AL2-03 | P0 | L | 8 |
| AL2-19 | CLI | `npm run indicators:regional -- --departamento=` | Imprime JSON SEG+Efficiency+PBA para un departamento; usable en corrida de memos. | AL2-16–AL2-18 | P1 | M | 8 |
| AL2-20 | MCP | Tools MCP para indicadores nuevos. | 3 tools mínimo; descripciones con `PROXY` y cobertura parcial. | AL2-15–AL2-18 | P1 | S | 8 |
| AL2-21 | Calidad | Tests unitarios e integración indicadores. | Fixtures por departamento; casos `null` cuando PIM=0; ≥ 80% cobertura módulos tocados. | AL2-15–AL2-18 | P0 | M | 8 |

**Puerta Sprint 8:** SEG proxy calculable para ≥ 3 de 5 departamentos con datos; PBA responde con mapeo v1 documentado.

---

## Sprint 9 — Memos Lambayeque y Piura

| ID | Épica | Objetivo | Criterios de aceptación | Dep. | P | Esf. | Sprint |
|---|---|---|---|---|---|---|---|
| AL2-22 | Plantilla | `docs/plantilla-memo-regional-rastro-v1.md`. | Secciones fijas: preflight, ejecución, obras, inversiones, compras, CEPLAN marco, geo contexto, SEG proxy, caveats. | AL2-13, AL2-19 | P0 | S | 9 |
| AL2-23 | Memo | Lambayeque — brechas y competitividad. | `docs/analisis-lambayeque-2026-08.md`; cifras con fuente y corte; comparación opcional vs La Libertad. | AL2-03, AL2-22 | P0 | M | 9 |
| AL2-24 | Memo | Lambayeque — desarrollo económico productivo. | `docs/analisis-lambayeque-desarrollo-economico-2026-08.md`. | AL2-23 | P1 | M | 9 |
| AL2-25 | Memo | Lambayeque — sector focal (agro/riego). | `docs/analisis-agro-lambayeque-2026-08.md` o equivalente. | AL2-23 | P1 | M | 9 |
| AL2-26 | Memo | Piura — brechas y competitividad. | `docs/analisis-piura-2026-08.md`. | AL2-03, AL2-22 | P0 | M | 9 |
| AL2-27 | Memo | Piura — desarrollo económico productivo. | `docs/analisis-piura-desarrollo-economico-2026-08.md`. | AL2-26 | P1 | M | 9 |
| AL2-28 | Memo | Piura — sector focal (agro/hidráulica). | `docs/analisis-agro-piura-2026-08.md` o equivalente. | AL2-26 | P1 | M | 9 |

**Puerta Sprint 9:** 6 memos publicados; preflight `COMPLETA_VERIFICADA` o `PARCIAL` documentado por departamento.

---

## Sprint 10 — Memos Cajamarca y Cusco + cierre Fase 2

| ID | Épica | Objetivo | Criterios de aceptación | Dep. | P | Esf. | Sprint |
|---|---|---|---|---|---|---|---|
| AL2-29 | Memo | Cajamarca — brechas y competitividad. | `docs/analisis-cajamarca-2026-08.md`. | AL2-03, AL2-22 | P0 | M | 10 |
| AL2-30 | Memo | Cajamarca — desarrollo económico + sector focal. | 2 memos o sección dual documentada. | AL2-29 | P1 | M | 10 |
| AL2-31 | Memo | Cusco — brechas y competitividad. | `docs/analisis-cusco-2026-08.md`. | AL2-03, AL2-22 | P0 | M | 10 |
| AL2-32 | Memo | Cusco — turismo/cultura + desarrollo productivo. | 2 memos alineados a plantilla. | AL2-31 | P1 | M | 10 |
| AL2-33 | Índice | `docs/indice-analisis-5-regiones-2026-08.md`. | Tabla comparativa: ejecución %, paralización %, sobrecosto %, SEG proxy, infra geo; caveats por región. | AL2-23–AL2-32 | P0 | M | 10 |
| AL2-34 | Docs | Actualizar `conectores.md`, `ESTADO.md`, data contracts. | Fase 2 cerrada; nuevos endpoints; conteo MCP actualizado. | AL2-33 | P0 | S | 10 |
| AL2-35 | Calidad | Release checklist Fase 2. | `npm test` + `npm run build` apps tocadas; PR checklist; sin regresión La Libertad. | AL2-33 | P0 | S | 10 |

**Puerta Sprint 10:** Índice comparativo 5 regiones; documentación al día; Fase 2 lista para review.

---

## Definition of Done (por ticket)

- Código mergeado con tests donde aplique.
- Respuestas API con `matcher`, `cobertura`, `restriccion`, `dependencias`, `corte`.
- Memos citan fuente, fecha de corte y completitud territorial.
- Sin afirmar cobertura nacional ni SEG CEPLAN regional sin evidencia.
- README o data contract actualizado si cambia contrato público.

---

## Dependencias entre épicas

```text
AL2-01 → AL2-06
AL2-02 → AL2-03 → AL2-16, AL2-18, AL2-23..32
AL2-04 → AL2-09 → AL2-13, AL2-15
AL2-05 → AL2-18
AL2-15 → AL2-16, AL2-17
AL2-22 → AL2-23..32 → AL2-33 → AL2-34, AL2-35
```

---

## Fuera de alcance (explícito)

| Ítem | Motivo |
|---|---|
| Departamentos 16–25 restantes | Decisión de producto: concentrar en 5 regiones Rastro |
| Frontend mapas / dashboards CEPLAN | Política API-only |
| Pulso SINAPLAN scraping | Volatilidad; no priorizado |
| Cruce ceplan-estrategico per-entidad | Fuente no lo permite |
| Point-in-polygon INFOBRAS | Sin coordenadas en origen |

---

## Comandos de referencia (preflight 5 regiones)

```bash
# ceplan-geo — nacional (verificar dept en reporte)
cd apps/ceplan-geo/api && npm run cobertura:geoserver

# MEF por departamento (ejemplo Lambayeque)
cd apps/radar-ejecucion/api
MEF_DEPARTAMENTO=LAMBAYEQUE npm run ingest:mef

# INFOBRAS
cd apps/infobras/api
INFOBRAS_DEPARTAMENTOS=LAMBAYEQUE,PIURA,CAJAMARCA,CUSCO npm run ingest:infobras

# Invierte — corrida completa 5 rangos por región
cd apps/radar-inversiones/api
INVIERTE_DEPARTAMENTOS=LAMBAYEQUE npm run ingest:invierte:full

# Indicadores Fase 2 (post Sprint 8)
cd apps/ceplan-estrategico/api
npm run indicators:regional -- --departamento=LAMBAYEQUE
```

---

## Referencias

- [`docs/PRD_CEPLAN_Rastro_Fase2_5Regiones_v1.md`](PRD_CEPLAN_Rastro_Fase2_5Regiones_v1.md)
- [`docs/BACKLOG_CEPLAN_Geo_v1.md`](BACKLOG_CEPLAN_Geo_v1.md) (CG-25 continúa como AL2-01)
- [`docs/analisis-la-libertad-2026-08.md`](analisis-la-libertad-2026-08.md) (plantilla de referencia)
- [`docs/PRD_Cobertura_Territorial_Verificable_Rastro_v1.md`](PRD_Cobertura_Territorial_Verificable_Rastro_v1.md)
