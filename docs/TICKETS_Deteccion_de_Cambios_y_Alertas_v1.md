# Tickets — Detección de Cambios y Alertas v1

**Producto:** AppsPerú (backend/ingesta) + CLI Market (eventos de precio)
**PRD:** [`docs/PRD_Deteccion_de_Cambios_y_Alertas_v1.md`](PRD_Deteccion_de_Cambios_y_Alertas_v1.md)
**Backlog secuenciado:** [`docs/BACKLOG_Deteccion_de_Cambios_y_Alertas_v1.md`](BACKLOG_Deteccion_de_Cambios_y_Alertas_v1.md)
**Serie de tickets:** **EV-** (Eventos/Cambios — nueva serie, no colisiona con AE-/AL2-/AL3-/CG-/CT-/CX-/DQ-/GORE-/GOV-/IF-/IR-/OE-/PN-/PS-/PV-/RF-/RUC-/SC-/SGR-/SI-/SS- ya usadas en otros backlogs)
**Regla transversal:** `sin_dato` ≠ `sin_cambios`; los cambios se detectan solo entre corridas del mismo conector, nunca como vigilancia continua; los endpoints nuevos son aditivos; `docs/conectores.md` y `mcp-server/README.md` se actualizan en el mismo PR.
**Estimación:** XS ≤ medio día · S ≤ 1 día · M 2–3 días · L 4–6 días (esfuerzo relativo, no calendario).

---

## ÉPICA 1 — Modelo de cambios y detección

### EV-01 · ADR del modelo de cambios

- **Historia:** Como equipo, quiero definir por escrito qué cuenta como cambio, dónde vive la historia y qué prometemos (y qué no) sobre la cobertura, para que el producto no mienta por diseño desde su primera versión.
- **Contexto verificado en código:** 56 de 62 conectores escriben raw batches con checksum, pero los upserts posteriores sobrescriben el valor anterior (no hay `valid_from`/`valid_to` en las tablas canónicas); `mcp-server/README.md` muestra que hoy la única comunicación de staleness es texto estático en las descripciones de los tools; ADR-0016 confirmó que las DBs viven en loopback, lo que condiciona dónde puede vivir el store de historia.
- **Criterios de aceptación:**
  - ADR mergeado que define: qué es un cambio (alta/baja/modificación por hash de fila estable); granularidad (fila vs. dataset); dónde vive la historia (tabla `dataset_changes` por app vs. store derivado, coherente con DBs en loopback); retención de raw batches y qué pasa cuando un lote se sobrescribe.
  - Fija como contrato las dos reglas de honestidad: (a) detección solo entre corridas del mismo conector; (b) "sin corrida nueva" se reporta `sin_dato`, jamás `sin_cambios`.
  - Declara que el mismo modelo aplica a precios de cli-market (EV-07), con implementación independiente por repo.
- **Dependencias:** ninguna.
- **Prioridad:** P0 · **Esfuerzo:** M

### EV-02 · Motor de diff genérico sobre raw batches

- **Historia:** Como equipo, quiero un comparador genérico entre la corrida anterior y la actual por tabla canónica, para convertir los lotes crudos que ya se guardan en evidencia de cambios sin tocar los conectores.
- **Contexto verificado en código:** el patrón `raw_*_batches` con `ON CONFLICT (resource_id, checksum)` ya existe en múltiples conectores (p. ej. `mincetur-hospedaje-connector.ts` en `radar-ejecucion`) y por construcción evita duplicados de corrida — pero nadie compara un lote contra el anterior; `packages/` ya agrupa librerías compartidas con workspace acotado (ADR-0019: `entity-matcher`, `shared-queries`, entre otras).
- **Criterios de aceptación:**
  - Librería en `packages/` que compara el lote crudo actual vs. el anterior por tabla canónica usando los checksums existentes.
  - Escribe `dataset_changes`: dataset, clave, tipo (`alta|baja|modificacion|schema_change`), `hash_prev`, `hash_actual`, corrida origen, timestamp.
  - Piloto en `radar-ejecucion`, `compras-publicas` y `proveedores-sancionados`.
  - Fixtures demuestran alta, baja y modificación; si el schema cambió incompatiblemente, registra `schema_change` y no fuerza un diff.
  - No modifica la lógica de descarga de ningún conector.
- **Dependencias:** EV-01.
- **Prioridad:** P0 · **Esfuerzo:** L

## ÉPICA 2 — Historia auditable y API de cambios

### EV-03 · Historia SCD2 de hechos clave con backfill

- **Historia:** Como auditor, quiero que las versiones anteriores de `budget_execution`, `awards` y `minor_contracts` se conserven con validez temporal, para poder reconstruir qué decía la fuente en una fecha dada.
- **Contexto verificado en código:** los conectores hacen upsert que sobrescribe (ficha de `mef-connector.ts` en `docs/conectores.md`: upsert sobre `budget_execution` con clave incluyendo `ANO_EJE`); `radar-ejecucion` ya defiende el rigor temporal de `anio_fiscal` (`coberturaTemporal.aniosFiscalesUsados`, `advertenciaMultiAnio`) — la historia debe preservar esa distinción; los raw batches con checksum son el material del backfill.
- **Criterios de aceptación:**
  - `budget_execution`, `awards` y `minor_contracts` con `valid_from`/`valid_to`; test que impide dos versiones activas por clave.
  - Backfill desde los raw batches disponibles con `cobertura_desde` declarado en los datos; si no hay lote anterior, la historia empieza donde empieza — no se inventa.
  - La variación de upsert en los conectores afectados cierra la versión anterior en vez de sobrescribirla, sin tocar su lógica de descarga.
  - `anio_fiscal` y el resto de claves temporales preservados (sin regresión de la advertencia multi-año).
- **Dependencias:** EV-01, EV-02.
- **Prioridad:** P1 · **Esfuerzo:** L

### EV-04 · API de cambios con cobertura declarada

- **Historia:** Como consumidor, quiero preguntar "¿qué cambió desde el lunes por entidad?", para revisar solo lo nuevo en vez de releer datasets completos.
- **Contexto verificado en código:** las apps Express exponen rutas `GET` de solo lectura bajo `/api/*` con pass-through de `{ status, body }` en el MCP (ver `mcp-server/README.md`); no existe hoy ninguna ruta de cambios ni histórico consultable; los contratos de respuesta actuales son aditivos por convención (regla de CX-01).
- **Criterios de aceptación:**
  - `GET /api/changes?since=&dataset=&entidad=&tipo=` por app, más una vista agregada multi-app.
  - La respuesta incluye `cobertura_desde`, `corrida_origen`, `total` y aviso explícito cuando `since` es anterior a la cobertura disponible.
  - Contrato de respuesta con pruebas; aditivo a las rutas existentes (ningún consumidor actual se rompe).
  - Documentado en `docs/conectores.md` (o ficha equivalente) junto al endpoint.
- **Dependencias:** EV-02.
- **Prioridad:** P1 · **Esfuerzo:** M

## ÉPICA 3 — Alertas, exposición MCP y eventos de precio

### EV-05 · Suscripciones y alertas de cambio

- **Historia:** Como usuario, quiero suscribirme a un dataset con filtro (entidad o territorio) y recibir un aviso cuando algo cambie, para enterarme sin volver a consultar.
- **Contexto verificado en código:** no existe suscripción ni webhook en appsperu; `cli-market-backend` ya implementa `/alerts` con CRUD y notificación email y webhook, con tests (`test_alerts_notify_email.py`, `test_alerts_notify_webhook.py`) — referencia de diseño, sin importar código entre repos.
- **Criterios de aceptación:**
  - `POST /api/subscriptions`: dataset + filtro (entidad/territorio) + umbral de variación opcional + destino (webhook o email).
  - La notificación trae contexto: fila afectada, valor anterior, valor nuevo, corrida origen y enlace a la API de cambios.
  - Prueba end-to-end con un webhook receptor real en CI.
  - Límite de suscripciones por app documentado (anti-abuso); plantilla honesta que incluye `cobertura_desde`.
- **Dependencias:** EV-04.
- **Prioridad:** P1 · **Esfuerzo:** M

### EV-06 · Exposición MCP de cambios

- **Historia:** Como agente IA, quiero poder preguntar "¿qué cambió en ejecución presupuestaria desde mi última consulta?", para trabajar con hechos datados en vez de un snapshot sin historia.
- **Contexto verificado en código:** el MCP expone 209 entradas de catálogo vía 2 meta-tools (`rastro_buscar_tools`, `rastro_llamar`) sobre las 38 apps (ver `mcp-server/README.md`); las descripciones incluyen hoy la advertencia estática de "ninguna app tiene scheduler"; registrar un tool por dataset rompería deliberado el diseño de 2 meta-tools.
- **Criterios de aceptación:**
  - El catálogo meta permite consultar la API de cambios sin registrar un tool por dataset (respetando el diseño de 2 meta-tools).
  - La descripción resultante declara cobertura y las reglas de honestidad del ADR de EV-01.
  - Prueba desde un cliente MCP real (stdio local).
  - La advertencia estática de staleness se sustituye por el dato de frescura solo donde OR-03 ya lo publica — nunca antes (coordinación explícita con el PRD de Orquestación).
- **Dependencias:** EV-04; sincronía con OR-03.
- **Prioridad:** P2 · **Esfuerzo:** M

### EV-07 · Eventos de precio y stock en cli-market

- **Historia:** Como observador de mercado, quiero recibir un evento cuando un precio cambia o un producto se agota, en vez de comparar yo mismo dos lecturas.
- **Contexto verificado en código:** `cli-market-backend` ya guarda `price_snapshots_schema.py` y `stock_history_schema.py`, colecciona precios con `collect_prices.py` y tiene alertas por umbral en `routers/alerts.py` — la infraestructura de notificación existe, lo que falta es el evento de cambio y el historial versionado consultable.
- **Criterios de aceptación:**
  - Entre corridas de `collect_prices.py`, las filas cuyo precio o stock cambió generan `price.changed` / `stock.out` con historial SCD2 sobre `price_snapshots`.
  - Feed de cambios consultable (historial de precio por producto con validez temporal).
  - `/alerts` puede activarse por evento de cambio, no solo por umbral; notificación email/webhook reutilizando la infraestructura probada.
  - Pruebas de ambos eventos; billing/suscripciones intactos.
- **Dependencias:** EV-01 (modelo); repo `cli-market-backend`/`cli-market-world`.
- **Prioridad:** P1 · **Esfuerzo:** M


