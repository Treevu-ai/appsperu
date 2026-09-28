# Backlog ejecutable — Orquestación y Frescura de Ingesta v1

**Producto:** AppsPerú (backend/ingesta)
**PRD:** [`docs/PRD_Orquestacion_y_Frescura_de_Ingesta_v1.md`](PRD_Orquestacion_y_Frescura_de_Ingesta_v1.md)
**Tickets:** [`docs/TICKETS_Orquestacion_y_Frescura_de_Ingesta_v1.md`](TICKETS_Orquestacion_y_Frescura_de_Ingesta_v1.md)
**Apps en alcance:** todas las apps con `src/ingest/` (62 conectores; prioridad: las del mapa de cruces y las 13 del workspace), `docs/conectores.md`, `docs/data-contracts/`, con `scripts/check-connectors-documented.sh` como plantilla de los chequeos nuevos.
**Reglas transversales (del PRD §7):**
- Toda corrida (manual o programada) deja el mismo registro auditable: cuándo, qué conector, cuántas filas, checksum y resultado.
- Un dataset sin corrida reciente se muestra `stale`/`sin_dato`, nunca "actualizado"; ninguna descripción MCP pierde su advertencia antes de que exista el dato que la reemplace.
- Los scripts `npm run ingest:*` manuales nunca se rompen; los endpoints meta existentes cambian solo de forma aditiva.
- `docs/conectores.md` y `freshness.yaml` se actualizan en el mismo PR del cambio.
**Estimación:** XS ≤ medio día · S ≤ 1 día · M 2–3 días · L 4–6 días (esfuerzo relativo, no calendario).

---

## Resumen de sprints

| Sprint | Objetivo | Tickets | Puerta de salida |
|---|---|---|---|
| **1** | Verdad de frescura sin automatizar: decisión de arquitectura, SLA por dataset y CI que lo blinda | OR-01, OR-02, OR-08 | ADR de orquestación mergeado; `freshness.yaml` cubre los datasets del mapa de cruces; un PR con un conector nuevo sin fila falla en CI |
| **2** | Contrato común de frescura en todas las apps + vista agregada | OR-03, OR-06 | Toda app con ingesta responde `/api/meta/freshness` con el contrato común; la vista de status muestra el estado real de las apps levantadas |
| **3** | Calidad ejecutable, piloto de corridas programadas y alertas | OR-04, OR-05, OR-07 | Los 5 contratos corren post-ingesta con estado visible; piloto de 3 conectores con corridas auditables (o cierre documentado en ADR); alerta de SLA demostrada end-to-end |

---

## Secuencia estratégica

```text
Sprint 1: OR-01 (ADR de orquestación, no bloquea el resto) ⟷ OR-02 (SLA por dataset) ⟷ OR-08 (CI, depende de OR-02)
            ↓
Sprint 2: OR-03 (contrato /api/meta/freshness en tandas) → OR-06 (status agregado)
            ↓
Sprint 3: OR-04 (contratos ejecutables) ⟷ OR-05 (piloto de corridas, depende de OR-01/OR-02) ⟷ OR-07 (alertas, depende de OR-02/OR-06)
```

Cada sprint deja una **puerta de salida verificable**: si la puerta no se cumple, no se abre el siguiente sprint. OR-01 y OR-02 son independientes y pueden trabajarse en paralelo.

> **Relación con los otros PRDs del portafolio:** este backlog no bloquea a los otros dos — solo hay una sincronía puntual: EV-06 (Detección de Cambios) espera el dato de frescura de OR-03 para sustituir la advertencia estática del MCP, y WH-07 (Warehouse) hereda la misma honestidad de frescura en sus dashboards.

---

## Sprint 1 — Verdad de frescura (sin automatizar aún)

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| OR-01 | ADR de dónde corre la capa de orquestación | ADR mergeado con ≥3 rutas comparadas, arquitectura frescura-first, piloto de 3 conectores y criterio de reversión; sin código de scheduling | — | P0 | M | ⬜ Pendiente |
| OR-02 | Catálogo `freshness.yaml` con SLA por dataset | Fila por dataset del mapa de cruces (fuente, frecuencia real, SLA, criticidad); esquema documentado; chequeo mínimo incluido | — | P0 | M | ⬜ Pendiente |
| OR-08 | CI: conector nuevo sin fila de frescura falla | Script hermano de `check-connectors-documented.sh`; corre en PR sobre `src/ingest/` o docs; mensaje con el archivo faltante; nota al pie en `conectores.md` | OR-02 | P1 | S | ⬜ Pendiente |

**Puerta de salida del Sprint 1**: existe un ADR mergeado sobre dónde corre la automatización; `freshness.yaml` cubre todos los datasets del mapa de cruces; y un PR que agregue un `*-connector.ts` sin fila de frescura falla en CI.

---

## Sprint 2 — Contrato común y status de frescura

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| OR-03 | Contrato común `/api/meta/freshness` en todas las apps con ingesta | Paquete `@appsperu/shared-freshness` con campos mínimos; 8 apps existentes adaptadas sin romper rutas; resto en tandas; pruebas de shape; descripciones MCP pasan al dato donde exista | OR-02 | P0 | L | ⬜ Pendiente |
| OR-06 | Status de frescura agregado multi-app | Vista sin infra nueva que agrega los meta de las apps levantadas; verde/ámbar/rojo contra SLA; app caída = "sin respuesta"; timestamp de evaluación visible | OR-03 | P1 | M | ⬜ Pendiente |

**Puerta de salida del Sprint 2**: toda app con `src/ingest/` (prioridad: mapa de cruces + workspace) responde el contrato común de frescura, y la vista agregada muestra el estado real — incluida al menos una app en estado `stale` o `fallo` demostrado en el entorno de desarrollo.

---

## Sprint 3 — Calidad ejecutable, corridas programadas y alertas

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| OR-04 | Contratos ejecutables para las 5 fuentes más cruzadas | Cheques post-corrida (schema, rangos, unicidad, anti multi-corte); fallo → `estado=fallo_contrato` sin tumbar la API; ≥1 bug histórico (DQ-03/DQ-04) reproducido como test; excepciones nombradas, nunca silenciadas | OR-03 | P1 | L | ⬜ Pendiente |
| OR-05 | Piloto de corridas programadas (3 conectores núcleo) | Según ADR de OR-01: corridas sin intervención con registro auditable, reintentos con backoff, scripts npm intactos, estado en `/api/meta/freshness`; o cierre documentado si se decide no automatizar | OR-01, OR-02 | P1 | L | ⬜ Pendiente |
| OR-07 | Alertas de ruptura de frescura | Webhook/email al exceder SLA N corridas consecutivas (umbral por dataset); plantilla honesta; prueba end-to-end; canal coordinado con EV-05 | OR-02, OR-06 | P2 | M | ⬜ Pendiente |

**Puerta de salida del Sprint 3**: los 5 contratos ejecutan tras cada ingesta de sus apps y su estado es visible en el endpoint de frescura; el piloto de corridas deja ≥1 corrida programada auditable en el registro (o el ADR de cierre está mergeado); y una alerta de SLA llega a su destino en la prueba end-to-end.

---

## Fuera de alcance de este backlog

Ver PRD §9. En particular: nuevas fuentes de datos ni conectores nuevos; migración de bases a hosting expuesto al internet (decisión de seguridad, fuera de alcance por ADR-0016); detección de cambios y alertas de contenido (PRD serie EV-); warehouse y métricas (PRD serie WH-); automatización de `tools/scrapers/` (scraping-arquitectura §3.7); interfaz web completa del status de frescura (la vista mínima de OR-06 basta; diseño = ticket aparte).

