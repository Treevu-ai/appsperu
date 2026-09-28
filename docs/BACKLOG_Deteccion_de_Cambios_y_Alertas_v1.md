# Backlog ejecutable — Detección de Cambios y Alertas v1

**Producto:** AppsPerú (backend/ingesta) + CLI Market (eventos de precio)
**PRD:** [`docs/PRD_Deteccion_de_Cambios_y_Alertas_v1.md`](PRD_Deteccion_de_Cambios_y_Alertas_v1.md)
**Tickets:** [`docs/TICKETS_Deteccion_de_Cambios_y_Alertas_v1.md`](TICKETS_Deteccion_de_Cambios_y_Alertas_v1.md)
**Alcance:** raw batches con checksum (56/62 conectores) en `radar-ejecucion`, `compras-publicas` y `proveedores-sancionados` como piloto; `packages/` para la librería compartida; `mcp-server/` para la exposición; `cli-market-backend` para EV-07.
**Reglas transversales (del PRD §7):**
- `sin_dato` ≠ `sin_cambios`: la vigilancia es entre corridas del mismo conector, nunca continua; toda respuesta declara `cobertura_desde`.
- Los endpoints nuevos son aditivos; ningún contrato existente cambia de forma incompatible.
- El diff corre después de la ingesta, nunca dentro de la descarga; hash incremental, sin full-scan.
- `docs/conectores.md` y `mcp-server/README.md` se actualizan en el mismo PR (incluidas las advertencias que dejen de aplicar).
**Estimación:** XS ≤ medio día · S ≤ 1 día · M 2–3 días · L 4–6 días (esfuerzo relativo, no calendario).

---

## Resumen de sprints

| Sprint | Objetivo | Tickets | Puerta de salida |
|---|---|---|---|
| **1** | Decidir el modelo de cambios y detectar los primeros cambios reales | EV-01, EV-02 | ADR mergeado con las reglas de honestidad; `dataset_changes` con registros reales en 3 apps piloto; fixtures de alta/baja/modificación en verde |
| **2** | Historia auditable y API de cambios | EV-03, EV-04 | `budget_execution` (y contratos) con SCD2 sin solapamientos y backfill con `cobertura_desde`; `GET /api/changes` con contrato testeado y aviso cuando `since` excede la cobertura |
| **3** | Alertas, MCP y eventos de precio | EV-05, EV-06, EV-07 | Alerta end-to-end (suscripción → corrida → webhook) demostrada; consulta de cambios desde un cliente MCP real; `price.changed`/`stock.out` con historial en cli-market |

---

## Secuencia estratégica

```text
Sprint 1: EV-01 (ADR del modelo) → EV-02 (motor de diff en 3 apps piloto)
            ↓
Sprint 2: EV-03 (SCD2 + backfill) ⟷ EV-04 (API de cambios, depende de EV-02)
            ↓
Sprint 3: EV-05 (suscripciones) ⟷ EV-06 (MCP, sincronía con OR-03) ⟷ EV-07 (cli-market, depende de EV-01)
```

Cada sprint deja una **puerta de salida verificable**: si la puerta no se cumple, no se abre el siguiente sprint. EV-03 y EV-04 pueden trabajarse en paralelo dentro del Sprint 2.

> **Relación con los otros PRDs del portafolio:** EV-06 espera el dato de frescura de OR-03 (PRD de Orquestación) antes de sustituir la advertencia estática del MCP, y comparte canal de notificación con OR-07; no depende de WH- (el warehouse es histórico analítico, EV- es historia operativa entre corridas — coexisten sin duplicarse).

---

## Sprint 1 — Modelo de cambios y detección

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| EV-01 | ADR del modelo de cambios | ADR mergeado: qué es un cambio, granularidad, store de historia, retención de raw batches, las 2 reglas de honestidad, alcance cli-market | — | P0 | M | ⬜ Pendiente |
| EV-02 | Motor de diff genérico sobre raw batches | Librería en `packages/`; escribe `dataset_changes` con hash y corrida; piloto en 3 apps; fixtures de alta/baja/modificación; `schema_change` no fuerza diff | EV-01 | P0 | L | ⬜ Pendiente |

**Puerta de salida del Sprint 1**: el ADR está mergeado; una corrida real en cada app piloto produce registros en `dataset_changes`; y una baja + una modificación introducidas en fixture se detectan correctamente.

---

## Sprint 2 — Historia auditable y API de cambios

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| EV-03 | Historia SCD2 de hechos clave con backfill | `budget_execution`, `awards`, `minor_contracts` con `valid_from`/`valid_to` y test anti-solapamiento; backfill desde raw batches con `cobertura_desde`; cierre de versión en upserts sin tocar descargas; `anio_fiscal` preservado | EV-01, EV-02 | P1 | L | ⬜ Pendiente |
| EV-04 | API de cambios con cobertura declarada | `GET /api/changes?since=&dataset=&entidad=&tipo=` + vista agregada; `cobertura_desde`, `corrida_origen`, `total` y aviso si `since` excede la cobertura; contrato con pruebas; aditivo | EV-02 | P1 | M | ⬜ Pendiente |

**Puerta de salida del Sprint 2**: la historia de `budget_execution` permite reconstruir el valor en una fecha pasada con backfill real; `GET /api/changes` responde con su aviso de cobertura y sus pruebas del contrato están en verde.

---

## Sprint 3 — Alertas, MCP y eventos de precio

| ID | Objetivo | Criterios de aceptación (resumen) | Dep. | P | Esf. | Estado |
|---|---|---|---|---|---|---|
| EV-05 | Suscripciones y alertas de cambio | `POST /api/subscriptions` con dataset, filtro, umbral y destino (webhook/email); notificación con valor anterior/nuevo y corrida; prueba e2e con webhook receptor en CI; límite por app documentado | EV-04 | P1 | M | ⬜ Pendiente |
| EV-06 | Exposición MCP de cambios | Consulta vía catálogo meta sin un tool por dataset; descripción con cobertura y reglas de honestidad; prueba con cliente MCP real; sustitución de advertencia estática solo donde OR-03 ya publica el dato | EV-04 (sincronía OR-03) | P2 | M | ⬜ Pendiente |
| EV-07 | Eventos de precio y stock en cli-market | `price.changed`/`stock.out` entre corridas de `collect_prices.py` con historial SCD2 sobre `price_snapshots`; feed de cambios; `/alerts` activable por evento; pruebas de ambos eventos; billing intacto | EV-01 | P1 | M | ⬜ Pendiente |

**Puerta de salida del Sprint 3**: una suscripción recibe una alerta end-to-end de un cambio real; un agente MCP consulta cambios desde un cliente real y la respuesta declara su cobertura; y un cambio de precio entre dos corridas de cli-market emite `price.changed` visible en el feed.

---

## Fuera de alcance de este backlog

Ver PRD §9. En particular: streaming continuo ni Kafka (el disparador es la corrida de ingesta); vigilancia 24/7 de fuentes oficiales; reescribir la lógica de descarga de conectores; nuevas fuentes o datasets fuera de los pilotos (ampliar = ticket nuevo); billing/suscripciones de cli-market; la capa de frescura y orquestación (PRD serie OR-), de la que EV-06 depende parcialmente.

