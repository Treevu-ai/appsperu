# PRD — Detección de cambios y alertas

**Estado:** Propuesto; pendiente de owner y fecha comprometida
**Fecha:** 2026-09-27
**Ámbito:** `apps/*/api/src/ingest` (raw batches con checksum, 56/62 conectores), `packages/` (paquetes compartidos del workspace), `mcp-server/`, y del lado cli-market: `collect_prices.py`, `price_snapshots_schema.py`, `stock_history_schema.py`, `routers/alerts.py`
**Horizonte:** tres sprints cortos; sin fecha comprometida ni owner asignado
**Origen:** revisión de portafolio de infraestructura de datos (2026-09-27). Evidencia: las descripciones de los tools MCP advierten estáticamente que "ninguna app tiene scheduler, así que los datos pueden no reflejar el estado más reciente" (`mcp-server/README.md`); 56 de 62 conectores ya guardan lotes crudos con checksum pero no se explotan como historia; `cli-market-backend` ya tiene snapshots de precio/stock y alertas por umbral (email/webhook) pero no eventos de cambio.

## 1. Decisión de producto

La plataforma hoy responde "¿cuál es el estado actual?" y nada más. Este PRD agrega la segunda mitad: **"¿qué cambió, desde cuándo y qué significa para mí?"**. Convierte los raw batches ya existentes en historia auditable (SCD2), publica una API de cambios con cobertura declarada, y permite suscribirse a cambios —por webhook/email para humanos y por tool MCP para agentes— de datasets públicos y de precios.

Dos reglas gobiernan todo el PRD: (a) un cambio solo se declara **entre corridas del mismo conector**, nunca como vigilancia continua — la plataforma no monitorea 24/7 a las fuentes; (b) "sin corrida nueva" se distingue de "sin cambios". Ambas reglas evitan que el producto mienta por diseño.

## 2. Problema y oportunidad

1. **No hay historia: lo que cambia, se sobrescribe.** Un upsert de `budget_execution` o `awards` destruye el valor anterior. Imposible responder "¿qué cambió desde mi última visita?", auditar "cuándo se corrigió esta cifra", o construir series temporales limpias sin re-hacer ingesta desde cero.
2. **Las alertas existen solo para precios y solo por umbral.** `cli-market-backend/routers/alerts.py` notifica email/webhook cuando un precio cruza un umbral; no hay alerta cuando un producto cambia de precio, desaparece de un retailer, o cuando una fuente pública publica una nueva sanción, contratación o emergencia.
3. **El consumidor MCP recibe una advertencia, no un dato.** El agente lee "los datos pueden no reflejar el estado más reciente" como texto fijo; no puede preguntar "¿qué cambió en ejecución presupuestaria desde ayer?".
4. **La evidencia ya se guarda y no se usa.** 56/62 conectores escriben `raw_*_batches` con checksum (deduplicación de corridas). Es el insumo natural de un diff y nadie lo lee.

**Oportunidad:** es el salto de "repositorio de datos abiertos" a "plataforma de monitoreo", que es el modelo de negocio natural de Rastro —y el mismo diferencial aplica a cli-market (competitive intelligence de precios).

## 3. Objetivo, no objetivos y métricas de éxito

### Objetivo

Detectar y publicar cambios entre corridas de ingesta en al menos 3 apps piloto (`radar-ejecucion`, `compras-publicas`, `proveedores-sancionados`) con historia SCD2 de `budget_execution`, API de cambios con cobertura declarada, suscripciones con una alerta end-to-end demostrada, exposición MCP de cambios, y eventos `price.changed`/`stock.out` en cli-market sobre su infraestructura de alertas existente.

### No objetivos

- No introduce streaming continuo ni infraestructura tipo Kafka: el disparador sigue siendo la corrida de ingesta.
- No reemplaza ni modifica la lógica de los conectores (solo leen sus lotes crudos).
- No garantiza vigilancia de fuentes oficiales en tiempo real — la cobertura empieza en la primera corrida registrada y se declara explícitamente.
- No expande las fuentes ni los datasets monitoreados más allá de los pilotos y su criterio de salida.
- No toca billing/suscripciones de cli-market: alertas de cambio son parte del plan existente de alertas, decisión comercial aparte.

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Historia real | `budget_execution` con secuencia SCD2 completa desde el primer backfill; una baja y una modificación se detectan en fixture y quedan registradas en `dataset_changes`. |
| API de cambios | `GET /api/changes?since=` responde por dataset con campos `cobertura_desde`, `corrida_origen` y `tipo` (`alta|baja|modificacion`); contrato testeado. |
| Alerta end-to-end | ≥1 suscripción (webhook de prueba) recibe notificación de un cambio real de una corrida, con contexto (qué fila cambió y de qué valor a qué valor). |
| Exposición MCP | El catálogo MCP permite consultar cambios (herramienta nueva o extensión de los meta-tools) sin registrar 209 tools adicionales. |
| Eventos de precio | En cli-market, un cambio de precio entre dos corridas de `collect_prices.py` emite `price.changed` con historial SCD2 y queda visible en el feed de cambios. |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Periodista / ONG de transparencia | Detectar el día en que cambió una cifra de ejecución o apareció una contratación. | `GET /api/changes` con historial y alertas por dataset. |
| GORE / equipo de seguimiento territorial | Saber qué se actualizó desde la última revisión, no re-leer todo. | Feed de cambios por territorio/entidad con cobertura declarada. |
| Observador de mercado (cli-market) | Detectar cambios de precio/ruptura de stock de competidores entre corridas. | Eventos `price.changed`/`stock.out` con historial SCD2 y notificación. |
| Agente IA vía MCP | Preguntar "¿qué cambió desde ayer?" y recibir hechos con fecha, no una advertencia genérica. | Tool/consulta de cambios dentro del catálogo meta existente. |
| Auditor interno | Responder "¿cuándo se modificó este registro y en qué corrida?". | `dataset_changes` con corrida origen, hash anterior y hash nuevo. |

## 5. Alcance funcional: siete issues

### EV-01 · ADR del modelo de cambios

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** ninguna

**Criterios de aceptación**

- ADR mergeado que define: qué cuenta como cambio (alta/baja/modificación por hash de fila estable); granularidad (fila vs. dataset); dónde vive la historia (tabla `dataset_changes` por app vs. store derivado — coherente con DBs en loopback, ADR-0016); retención de raw batches y qué pasa cuando un lote se sobrescribe.
- Fija las dos reglas de honestidad del PRD como contrato: (a) los cambios se detectan **entre corridas del mismo conector**, nunca como vigilancia continua; (b) "sin corrida nueva" ≠ "sin cambios" — se reporta `sin_dato`, no `sin_cambios`.
- Define que el mismo modelo aplica a precios de cli-market (EV-07), sin mezclar repos en la implementación.

### EV-02 · Motor de diff genérico sobre raw batches

**Prioridad:** P0 · **Esfuerzo:** L · **Dependencias:** EV-01

**Criterios de aceptación**

- Librería en `packages/` (workspace acotado según ADR-0019) que compara el lote crudo actual vs. el anterior por tabla canónica, reusando los checksums existentes (56/62 conectores ya los escriben).
- Escribe `dataset_changes`: dataset, clave, tipo (`alta|baja|modificacion|schema_change`), `hash_prev`, `hash_actual`, corrida origen, timestamp.
- Piloto en `radar-ejecucion`, `compras-publicas` y `proveedores-sancionados`.
- Fixtures demuestran alta, baja y modificación; si el schema cambió incompatiblemente, registra `schema_change` y **no** fuerza un diff.
- No modifica la lógica de descarga de ningún conector.

### EV-03 · Historia SCD2 de hechos clave con backfill

**Prioridad:** P1 · **Esfuerzo:** L · **Dependencias:** EV-01, EV-02

**Criterios de aceptación**

- `budget_execution`, `awards` y `minor_contracts` con `valid_from`/`valid_to`; nunca dos versiones activas para la misma clave (test de solapamiento).
- Backfill desde los raw batches disponibles, con `cobertura_desde` declarado en los datos (si no hay lote anterior, la historia empieza donde empieza — no se inventa).
- La variación de upsert en los conectores afectados cierra la versión anterior en vez de sobrescribirla, sin tocar su lógica de descarga.
- Preserva las claves temporales ya defendidas en el repo (`anio_fiscal` en `budget_execution` — ver advertencia multi-año de `radar-ejecucion`).

### EV-04 · API de cambios con cobertura declarada

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** EV-02

**Criterios de aceptación**

- `GET /api/changes?since=&dataset=&entidad=&tipo=` por app, más una vista agregada multi-app.
- La respuesta incluye `cobertura_desde`, `corrida_origen`, `total` y un aviso explícito cuando `since` es anterior a la cobertura disponible.
- Contrato de respuesta con pruebas; aditivo a las rutas existentes (ningún consumidor actual se rompe).

### EV-05 · Suscripciones y alertas de cambio

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** EV-04

**Criterios de aceptación**

- `POST /api/subscriptions`: dataset + filtro (entidad/territorio) + umbral de variación opcional + destino (webhook o email).
- La notificación trae contexto: fila afectada, valor anterior, valor nuevo, corrida origen y enlace a la API de cambios.
- Prueba end-to-end con un webhook receptor real en CI.
- Límite de suscripciones por app documentado; diseño toma como referencia `cli-market-backend/routers/alerts.py` (notificaciones ya probadas con tests de email/webhook) sin importar código entre repos.

### EV-06 · Exposición MCP de cambios

**Prioridad:** P2 · **Esfuerzo:** M · **Dependencias:** EV-04 (y sincronía con OR-03 del PRD de Orquestación)

**Criterios de aceptación**

- El catálogo meta (`rastro_buscar_tools` / `rastro_llamar`) permite consultar la API de cambios sin registrar un tool por dataset (se respeta el diseño de 2 meta-tools).
- La descripción resultante declara cobertura y las reglas de honestidad del ADR de EV-01.
- Prueba desde un cliente MCP real (stdio local).
- La advertencia estática de staleness se sustituye por el dato de frescura solo donde OR-03 ya lo publica — nunca antes.

### EV-07 · Eventos de precio y stock en cli-market

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** EV-01 (modelo aplicado a precios)

**Criterios de aceptación**

- Entre corridas de `collect_prices.py`, las filas cuyo precio o stock cambió generan `price.changed` / `stock.out` con historial SCD2 sobre `price_snapshots`.
- Feed de cambios consultable (historial de precio por producto con validez temporal).
- Las alertas existentes (`/alerts`) pueden activarse por evento de cambio, no solo por umbral de precio; notificación email/webhook reutilizando la infraestructura probada.
- Pruebas de ambos eventos; billing/suscripciones de cli-market intactos.

## 6. Priorización y secuencia

| Fase | Entregables | Resultado que desbloquea |
|---|---|---|
| **Ahora** | EV-01, EV-02 | Modelo de cambios decidido y diff corriendo sobre 3 apps con fixtures: la evidencia de cambios existe y es auditable. |
| **Siguiente** | EV-03, EV-04 | Historia SCD2 de hechos clave y API de cambios con cobertura declarada. |
| **Después** | EV-05, EV-06, EV-07 | Producto de alertas para humanos (webhook/email) y agentes (MCP), más eventos de precio en cli-market. |

## 7. Requisitos no funcionales

- **Honestidad semántica:** `sin_dato` ≠ `sin_cambios`; cobertura declarada en toda respuesta; la vigilancia es "entre corridas", nunca continua — en la API, en las alertas y en las descripciones MCP.
- **Aditividad:** la API de cambios y las suscripciones son aditivas; ningún contrato de respuesta existente cambia de forma incompatible.
- **Rendimiento:** comparación incremental por hash (aprovechando los raw batches), sin full-scan de tablas multi-GB en cada corrida; el diff corre después de la ingesta, nunca dentro de la descarga.
- **Retención:** los raw batches necesarios para el diff se preservan; si la retención los elimina, la cobertura resultante se declara en vez de simular historia.
- **Documentación como entregable:** `docs/conectores.md` y `mcp-server/README.md` se actualizan en el mismo PR que el cambio (incluidas las advertencias de staleness que dejen de aplicar).
- **Coordinación cross-repo:** cli-market (EV-07) y appsperu comparten nombres de evento y modelo, pero se despliegan de forma independiente.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Diff caro en tablas grandes | Hash por fila incremental sobre raw batches + piloto acotado a 3 apps; medir antes de ampliar. |
| Cambio de schema de la fuente rompe el diff y genera miles de "cambios" falsos | Tipo `schema_change` que detiene el diff y pide revisión; los contratos ejecutables del PRD OR- (OR-04) son la primera línea de defensa. |
| Raw batches se sobrescriben y se pierde la historia | Retención definida en EV-01; `cobertura_desde` en toda respuesta; backfill solo con lotes reales. |
| "Sin corrida nueva" se interpreta como "estable" | Regla de honestidad en el contrato de respuesta, en alertas y en descripciones MCP (EV-01). |
| Fatiga de alertas | Umbral conservador por defecto, límite de suscripciones y resumen diario como opción. |
| Dos mecanismos de alerta distintos (OR-07 frescura vs EV-05 cambios) | Coordinación explícita entre PRDs: OR- alerta que el dataset está viejo; EV- alerta que el dato cambió; mismo canal de notificación si comparten infraestructura. |

## 9. Fuera de este PRD

- Streaming continuo ni infraestructura de eventos tipo Kafka (el disparador es la corrida de ingesta).
- Vigilancia 24/7 de fuentes oficiales — no se promete ni se implícitamente se sugiere.
- Reemplazar o reescribir la lógica de descarga de los conectores.
- Nuevas fuentes o datasets monitoreados fuera de los pilotos (ampliar = ticket nuevo).
- Billing/suscripciones de cli-market y monetización de alertas.
- La capa de frescura y orquestación (PRD OR-), de la que EV-06 depende parcialmente.

## 10. Definition of Done

- Cada ticket tiene PR, revisión y pruebas automatizadas asociadas.
- Fixtures de alta/baja/modificación pasan en las 3 apps piloto; `dataset_changes` contiene registros reales de una corrida.
- `/api/changes` responde con `cobertura_desde` y aviso cuando `since` excede la cobertura; pruebas del contrato en verde.
- Una alerta end-to-end (suscripción → corrida → webhook) está demostrada.
- Las descripciones MCP citan datos de cobertura/frescura en vez de texto fijo, sin dejar ninguna advertencia de la que aún se dependa.



