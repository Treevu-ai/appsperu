# Tickets — Orquestación y Frescura de Ingesta v1

**Producto:** AppsPerú (backend/ingesta)
**PRD:** [`docs/PRD_Orquestacion_y_Frescura_de_Ingesta_v1.md`](PRD_Orquestacion_y_Frescura_de_Ingesta_v1.md)
**Backlog secuenciado:** [`docs/BACKLOG_Orquestacion_y_Frescura_de_Ingesta_v1.md`](BACKLOG_Orquestacion_y_Frescura_de_Ingesta_v1.md)
**Serie de tickets:** **OR-** (Orquestación — nueva serie, no colisiona con AE-/AL2-/AL3-/CG-/CT-/CX-/DQ-/GORE-/GOV-/IF-/IR-/OE-/PN-/PS-/PV-/RF-/RUC-/SC-/SGR-/SI-/SS- ya usadas en otros backlogs)
**Regla transversal:** la frescura nunca se presenta mejor de lo que es; los scripts `npm run ingest:*` manuales nunca se rompen; los endpoints meta existentes cambian solo de forma aditiva; `docs/conectores.md` y `freshness.yaml` se actualizan en el mismo PR.
**Estimación:** XS ≤ medio día · S ≤ 1 día · M 2–3 días · L 4–6 días (esfuerzo relativo, no calendario).

---

## ÉPICA 1 — Verdad de frescura (sin automatizar aún)

### OR-01 · ADR: dónde corre la capa de orquestación (revisión de ADR-0016)

- **Historia:** Como equipo de datos, quiero una decisión trazable sobre dónde ejecutar corridas programadas dado que las bases solo escuchan en loopback, para no repetir el ciclo "evaluar y diferir" sin resolver el bloqueo de red que ADR-0016 ya identificó.
- **Contexto verificado en código:** ADR-0016 evaluó 21 conectores y concluyó que ningún runner cloud tiene ruta hacia las DBs (`127.0.0.1:5432` en cada `docker-compose.yml`), y descartó el cron local por depender de la máquina encendida. Desde entonces el monorepo creció a 62 conectores `src/ingest/*-connector.ts` (56 con raw batches checksum), y `docs/arquitectura/scraping-arquitectura.md` §3.7 propone Cloudflare Workers Cron Triggers solo para `tools/scrapers/`, no para `apps/*/api`.
- **Criterios de aceptación:**
  - ADR mergeado que registra el bloqueo de red vigente y compara ≥3 rutas reales (daemon local en la red `appsperu_shared` · self-hosted runner contenedorizado · frescura 100% manual y automatizar solo lo que no requiera DB), con costo y mantenedor de cada una.
  - Define la arquitectura **frescura-first**: la observabilidad (OR-02, OR-03, OR-06) no depende de la decisión de automatización.
  - Fija el piloto mínimo (los 3 conectores núcleo de CX-04) y el criterio de reversión; decisión e implementación separadas (mismo patrón que CX-02/CX-04).
  - Referencia `scraping-arquitectura.md` §3.7 sin mezclar el alcance de `tools/scrapers/`. No implementa scheduling.
- **Dependencias:** ninguna.
- **Prioridad:** P0 · **Esfuerzo:** M

### OR-02 · Catálogo de frescura como código (SLA por dataset)

- **Historia:** Como mantenedor, quiero un SLA explícito por dataset —qué tan viejo puede estar un dato antes de ser engañoso— para poder clasificar "al día" vs. "stale" con un criterio y no con impresión.
- **Contexto verificado en código:** la columna "Frecuencia" de `docs/conectores.md` distingue ya la frecuencia de publicación de la fuente vs. la corrida manual (que es siempre "bajo demanda"), pero no define un SLA ni qué datasets son críticos; el mapa de cruces del mismo documento identifica los que más apps alimentan (`budget_execution`, `awards`, `minor_contracts`), y ADR-0015 dejó documentado el riesgo concreto de staleness en `mef-connector.ts`.
- **Criterios de aceptación:**
  - Archivo único `docs/data-contracts/freshness.yaml` con fila por dataset canónico: fuente, frecuencia real de publicación, SLA aceptable, criticidad (apps que lo cruzan, según el mapa de cruces) y responsable.
  - Cubre todos los datasets del mapa de cruces: `budget_execution`, `awards`, `minor_contracts`, obras INFOBRAS, proyectos Invierte, padrón RUC, entre otros.
  - Esquema documentado en la cabecera del propio archivo; formato legible por código y por humanos.
  - Chequeo mínimo incluido: falla si una app con `src/ingest/` no tiene fila en el catálogo.
- **Dependencias:** ninguna.
- **Prioridad:** P0 · **Esfuerzo:** M

## ÉPICA 2 — Contrato común de frescura y visibilidad

### OR-03 · Contrato común `/api/meta/freshness` en todas las apps con ingesta

- **Historia:** Como consumidor de datos (humano o agente), quiero un mismo shape de frescura en todas las apps, para poder saber la edad del dato sin leer el código de cada una.
- **Contexto verificado en código:** hoy solo 8 apps tienen algún meta de frescura — `bcrp-comercio-exterior`, `bcrp-la-libertad`, `ceplan-estrategico`, `infobras`, `inversion-privada`, `radar-ejecucion`, `sunat-aduanas` (`src/routes/meta.ts`) y `proveedores-sancionados` (`src/routes/meta-freshness.ts`) — con formas distintas; el resto de las ~38 apps del catálogo no expone edad de dato. El workspace npm está acotado por ADR-0019 (13 apps), lo que condiciona cómo se comparte el contrato.
- **Criterios de aceptación:**
  - Paquete `@appsperu/shared-freshness` (workspace acotado según ADR-0019) que define `GET /api/meta/freshness` con campos mínimos: `dataset`, `ultima_corrida_exitosa`, `duracion_ms`, `filas_escritas`, `checksum_lote`, `estado` (`ok|stale|fallo|fallo_contrato`), `fuente`.
  - Las 8 apps con meta existente se adaptan sin romper sus rutas actuales (aditivo); el resto de apps con `src/ingest/` lo implementan — primero las del mapa de cruces, luego el resto por tandas.
  - Pruebas por app que verifican el shape; ninguna app fuera del workspace queda con el endpoint a medias.
  - Las descripciones de tools MCP que hoy advierten staleness de forma estática pasan a citar este dato donde exista; el texto no se elimina antes de que el dato exista.
- **Dependencias:** OR-02.
- **Prioridad:** P0 · **Esfuerzo:** L

### OR-06 · Status de frescura agregado multi-app

- **Historia:** Como mantenedor, quiero una sola vista de "¿qué está al día y qué no?", para no abrir 40 bases ni levantar cada API para contestar esa pregunta.
- **Contexto verificado en código:** `scripts/health-check-apis.sh` ya sabe recorrer las apps y verificar que respondan; `scripts/dev-local.sh`/`dev-local.ps1` asumen las APIs corriendo localmente; ninguna de las dos verifica que los datos estén al día.
- **Criterios de aceptación:**
  - Vista (script o página estática servida desde el repo) que agrega los `/api/meta/freshness` de las apps levantadas, sin infraestructura nueva.
  - Clasifica cada dataset contra su SLA (verde/ámbar/rojo) y muestra la última corrida real.
  - Una app caída aparece como "sin respuesta"; no desaparece de la lista.
  - La vista indica cuándo se evaluó por última vez (no puede quedar "congelada" mostrando verde eterno).
- **Dependencias:** OR-03.
- **Prioridad:** P1 · **Esfuerzo:** M

### OR-08 · CI: conector nuevo sin fila de frescura

- **Historia:** Como mantenedor del catálogo, quiero que CI falle si alguien agrega un conector sin registrar su dataset en el catálogo de frescura, para que la brecha de documentación detectada en CX-06 no se repita en el nuevo catálogo.
- **Contexto verificado en código:** `scripts/check-connectors-documented.sh` (CX-06) ya implementa exactamente este patrón contra `docs/conectores.md` y falla en CI nombrando el archivo faltante — es plantilla directa de este ticket.
- **Criterios de aceptación:**
  - Script hermano que falle si `apps/*/api/src/ingest/*-connector.ts` no tiene fila en `freshness.yaml` ni mención en `conectores.md`.
  - Corre en `pull_request` que toque `src/ingest/`, `freshness.yaml` o `conectores.md`; el mensaje nombra el archivo faltante.
  - No exige formato de ficha, solo presencia (mismo criterio anti-frágil de CX-06).
  - Nota al pie en `docs/conectores.md` explicando el chequeo.
- **Dependencias:** OR-02.
- **Prioridad:** P1 · **Esfuerzo:** S

## ÉPICA 3 — Calidad ejecutable, corridas programadas y alertas

### OR-04 · Runner de contratos ejecutables para las 5 fuentes más cruzadas

- **Historia:** Como equipo de datos, quiero que los data contracts se ejecuten tras cada corrida, para que las anomalías ya confirmadas en vivo (multi-corte, schema drift, rangos imposibles) las atrape el chequeo y no un usuario del Estado.
- **Contexto verificado en código:** `docs/data-contracts/` tiene >50 archivos de texto; `paneles-multi-corte.md` (DQ-09) describe el bug real de inflación confirmado en `infraestructura-mtc` y `residuos-solidos` (DQ-03/DQ-04); hoy nada ejecuta esos documentos — `check-connectors-documented.sh` solo verifica menciones de nombres de archivo.
- **Criterios de aceptación:**
  - Cheques ejecutables tras cada corrida para `mef-presupuesto-ejecucion`, `oece-contrataciones-abiertas`, `infobras-obras-publicas`, `invierte-inversiones` y `proveedores-sancionados`: schema, rangos, unicidad de claves y regla anti `paneles-multi-corte`.
  - Un fallo marca `estado=fallo_contrato` en el endpoint de frescura sin tumbar la API ni borrar datos.
  - ≥1 prueba reproduce el bug histórico DQ-03/DQ-04 y lo atrapa.
  - Falsos positivos se documentan como excepción nombrada en el contrato; jamás silenciando el chequeo.
- **Dependencias:** OR-03 (para publicar el estado; puede adelantarse como chequeo aislado).
- **Prioridad:** P1 · **Esfuerzo:** L

### OR-05 · Motor de corridas programadas (piloto de los 3 conectores núcleo)

- **Historia:** Como equipo, quiero que los tres conectores más cruzados corran programados con registro auditable, para cerrar el tema que CX-04 dejó "evaluado, diferido" (ADR-0016) con una implementación acotada o con un cierre definitivo.
- **Contexto verificado en código:** ADR-0016 postergó la automatización por el bloqueo de red; ADR-0015 ya implementó para `mef-connector.ts` el monitoreo de deriva de tamaño de archivo como mitigación de frescura sin cron; los scripts `npm run ingest:*` son el mecanismo vigente y deben seguir siéndolo como fallback.
- **Criterios de aceptación:**
  - Según lo decidido en OR-01: las corridas de `mef-connector.ts`, `oece-connector.ts` y `oece-records-connector.ts` se ejecutan programadas sin intervención manual, con registro auditable (tabla `ingest_runs` o reuso de raw batches con checksum).
  - Reintentos con backoff; el fallo queda visible en el registro, no silenciado.
  - Los scripts npm manuales siguen funcionando intactos (fallback y debugging).
  - El resultado se refleja en `/api/meta/freshness`. Si OR-01 concluye "no automatizar", el ticket se cierra con la razón documentada (patrón CX-04), no queda abierto.
- **Dependencias:** OR-01, OR-02.
- **Prioridad:** P1 · **Esfuerzo:** L

### OR-07 · Alertas de ruptura de frescura

- **Historia:** Como responsable de producto, quiero que el equipo se entere cuando un dataset crítico excede su SLA, para re-ejecutar la ingesta antes de que alguien cite un dato viejo.
- **Contexto verificado en código:** no existe hoy ningún mecanismo de alerta por staleness en appsperu; el ecosistema cli-market ya probó notificaciones email/webhook con tests (`cli-market-backend/routers/alerts.py`, `test_alerts_notify_email.py`, `test_alerts_notify_webhook.py`) — patrón de diseño referente, sin importar código.
- **Criterios de aceptación:**
  - Webhook/email cuando un dataset excede su SLA N corridas consecutivas (umbral configurable por dataset en `freshness.yaml`).
  - Plantilla honesta: dataset, última corrida exitosa, fuente, impacto en cruces y cómo re-ejecutar.
  - Prueba end-to-end con un dataset en modo simulado; sin alertas duplicadas.
  - Coordinación explícita con EV-05 (PRD de Cambios) para compartir canal de notificación y no duplicar suscripciones.
- **Dependencias:** OR-02, OR-06.
- **Prioridad:** P2 · **Esfuerzo:** M


