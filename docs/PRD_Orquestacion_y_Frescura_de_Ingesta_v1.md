# PRD — Orquestación y frescura de ingesta

**Estado:** Propuesto; pendiente de owner y fecha comprometida
**Fecha:** 2026-09-27
**Ámbito:** `apps/*/api/src/ingest` (62 conectores), `apps/*/api/src/routes/meta*.ts`, `docs/conectores.md`, `docs/data-contracts/`, `scripts/check-connectors-documented.sh`, nuevo paquete de orquestación (ubicación a definir en OR-01)
**Horizonte:** tres sprints cortos; sin fecha comprometida ni owner asignado
**Origen:** revisión de portafolio de infraestructura de datos (2026-09-27). Dolores ya documentados en el repo: ausencia total de scheduler (sección "Frecuencia" de [`docs/conectores.md`](conectores.md) y [ADR-0016](adr/0016-automatizacion-conectores-nucleo-evaluacion.md)), data contracts que son documentación y no chequeo ejecutable (`docs/data-contracts/`), y contratos de frescura implementados solo en 8 de las apps del catálogo (archivos `routes/meta*.ts`).

## 1. Decisión de producto

AppsPerú ingiere 62 conectores sin scheduler — por decisión de diseño, no por olvido (ADR-0016) — y la consecuencia operativa es que nadie (ni el equipo, ni un agente MCP, ni un usuario del Estado) puede saber sin leer código qué tan fresco y qué tan confiable es un dato. Este PRD convierte la frescura en producto: un catálogo de SLAs por dataset, un contrato común de frescura expuesto por todas las apps con ingesta, cheques de calidad ejecutables derivados de los data contracts existentes, y un piloto de corridas programadas sujeto a un ADR que resuelva el bloqueo de red identificado en ADR-0016.

No amplía el catálogo de fuentes ni toca la lógica de negocio de los conectores. No promete tiempo real: promete que cada dato publicado declare su edad real, que los chequeos fallen antes de que un dato malo se lea como bueno, y que las corridas queden auditables.

## 2. Problema y oportunidad

1. **La frescura es invisible.** Solo 8 apps exponen alguna forma de `routes/meta*.ts` (`bcrp-comercio-exterior`, `bcrp-la-libertad`, `ceplan-estrategico`, `infobras`, `inversion-privada`, `proveedores-sancionados` — `meta-freshness.ts` —, `radar-ejecucion`, `sunat-aduanas`) de las ~38 apps del catálogo MCP. El resto no puede responder "¿cuándo se actualizó por última vez?". La advertencia de staleness hoy vive en las descripciones de los tools MCP (texto estático, ver `mcp-server/README.md`) en vez de en un dato.
2. **La automatización se postergó con evidencia que ya cambió.** ADR-0016 evaluó 21 conectores y diferió la automatización porque las bases solo escuchan en `127.0.0.1` (ningún runner cloud tiene ruta de red). Desde entonces el monorepo creció a 62 conectores y **56 de 62 ya escriben lotes crudos con checksum** (`raw_*_batches`) — la materia prima para observabilidad existe, pero no se explota.
3. **Los data contracts no se ejecutan.** Hay más de 50 archivos en `docs/data-contracts/` que documentan anomalías confirmadas en vivo (p. ej. `paneles-multi-corte.md`, origen de los bugs DQ-03/DQ-04) como texto, no como chequeo. Nada impide que el mismo bug vuelva en la próxima corrida.
4. **La calidad se audita a mano.** `scripts/check-connectors-documented.sh` (CX-06) verifica que los conectores estén *documentados*, no que los datos estén bien; `scripts/health-check-apis.sh` verifica que las APIs *respondan*, no que estén al día; el cuadre de cifras se hizo con SQL ad hoc en sesiones puntuales.

**Oportunidad:** resolver esto (a) da confianza auditable para que el Estado use la plataforma como referencia, (b) hace segura la automatización futura, y (c) entrega el contrato de frescura que la capa de detección de cambios (PRD de Detección de Cambios y Alertas, serie EV-) reutiliza tal cual.

## 3. Objetivo, no objetivos y métricas de éxito

### Objetivo

Que cada dataset canónico declare su SLA de frescura, exponga su edad real bajo un contrato común, esté validado por contratos ejecutables para las 5 fuentes más cruzadas, y que las corridas de los 3 conectores núcleo queden programadas con registro auditable — o, si ADR concluye que no conviene, con la decisión documentada que cierre el tema (mismo patrón que CX-04/ADR-0016).

### No objetivos

- No migrar bases de datos a hosting alcanzable desde internet: es una decisión de seguridad explícita que este PRD no está autorizado a tomar (ADR-0016).
- No agregar fuentes de datos ni conectores nuevos.
- No reemplazar los scripts `npm run ingest:*` manuales: siguen siendo el camino de ejecución y de fallback.
- No tocar `tools/scrapers/` ni su ruta de scheduling propuesta (Cloudflare Workers Cron Triggers, `docs/arquitectura/scraping-arquitectura.md` §3.7) — solo referenciarla en el ADR de OR-01.
- No cambiar modelos canónicos ni contratos de respuesta existentes de forma incompatible.
- No prometer tiempo real ni vigilancia continua: la frescura declara la última corrida, no el estado del mundo.

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Cobertura de frescura | Todas las apps con `src/ingest/` exponen `/api/meta/freshness` bajo el contrato común (hoy: 8 apps con alguna forma de meta). |
| SLA catalogado | `freshness.yaml` (o equivalente) con fila por dataset de los cruces del mapa de `conectores.md` (`budget_execution`, `awards`, `minor_contracts`, obras INFOBRAS, inversiones Invierte, padrón RUC). |
| Contratos ejecutables | Los 5 data contracts de las fuentes más cruzados corren como chequeo tras cada ingesta y marcan `estado=fallo` en el endpoint de frescura cuando fallan. |
| Corridas auditables | Los 3 conectores núcleo de CX-04 (`mef-connector.ts`, `oece-connector.ts`, `oece-records-connector.ts`) corren programados con registro de corrida, o existe ADR que documenta por qué no. |
| Documentación viva | `docs/conectores.md` y el catálogo de frescura reflejan el estado real en el mismo PR de cada cambio. |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Equipo de datos (appsperu) | Saber, sin abrir 40 bases, qué dataset lleva días sin correr y cuál acaba de fallar. | Status de frescura agregado por dataset con SLA y estado. |
| Agente MCP (Claude/Cursor) | Responder "¿este dato está al día?" sin confiar en una advertencia estática. | `GET /api/meta/freshness` con última corrida real; descripciones de tools que citan el dato, no texto fijo. |
| Usuario del Estado (Contraloría, GORE, OECE) | Confiar en que un dato presentado corresponde a la última publicación de la fuente. | Edad del dato visible y contratos de calidad ejecutados; cobertura y staleness declarados. |
| Futuro mantenedor | Agregar un conector sin inventar cada vez cómo se documenta y audita su frescura. | Plantilla + chequeo de CI que guían el camino correcto desde el primer PR. |

## 5. Alcance funcional: ocho issues

### OR-01 · ADR: dónde corre la capa de orquestación (revisión de ADR-0016)

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** ninguna

Revisitar la decisión de automatización con la evidencia nueva: ADR-0016 evaluó 21 conectores; hoy hay 62, 56 con raw batches checksum y 8 apps con algún meta de frescura. El ADR original se bloqueó en que las DBs solo escuchan en loopback; este ticket exige resolver esa restricción explícitamente antes de escribir código de scheduling.

**Criterios de aceptación**

- ADR mergeado que: registra el bloqueo de red vigente; compara ≥3 rutas reales (daemon local en la red `appsperu_shared` · self-hosted runner contenedorizado · mantener frescura 100% manual y automatizar solo lo que no requiera DB), con costo y mantenedor de cada una; define la arquitectura **frescura-first** (la observabilidad no depende de la automatización); fija el piloto mínimo (los 3 conectores núcleo de CX-04) y el criterio de reversión.
- No implementa código de scheduling: decisión e implementación quedan separadas (mismo patrón que CX-02/CX-04).
- Referencia `docs/arquitectura/scraping-arquitectura.md` §3.7 sin mezclar el alcance de `tools/scrapers/`.

### OR-02 · Catálogo de frescura como código (SLA por dataset)

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** ninguna

Hoy la columna "Frecuencia" de `docs/conectores.md` distingue frecuencia de la fuente vs. corrida manual, pero no dice qué tan viejo puede estar un dato antes de ser engañoso — la pregunta clave de ADR-0016.

**Criterios de aceptación**

- Archivo único (ej. `docs/data-contracts/freshness.yaml`) con una fila por dataset canónico: fuente, frecuencia real de publicación, SLA aceptable, criticidad (qué apps lo cruzan, según el mapa de cruces de `conectores.md`) y responsable.
- Cubre todos los datasets del mapa de cruces (`budget_execution`, `awards`, `minor_contracts`, obras INFOBRAS, Invierte, padrón RUC, entre otros).
- Esquema documentado en la cabecera del propio archivo; formato pensado para leerse desde código y desde humanos.
- Incluye el chequeo mínimo: falla si una app con `src/ingest/` no tiene fila en el catálogo.

### OR-03 · Contrato común `/api/meta/freshness` en todas las apps con ingesta

**Prioridad:** P0 · **Esfuerzo:** L · **Dependencias:** OR-02

Estandarizar lo que hoy son 8 implementaciones dispares (`meta.ts` vs `meta-freshness.ts`) en un contrato único expuesto por todas las apps con ingesta.

**Criterios de aceptación**

- Paquete compartido `@appsperu/shared-freshness` (workspace acotado según ADR-0019) que define `GET /api/meta/freshness` con campos mínimos: `dataset`, `ultima_corrida_exitosa`, `duracion_ms`, `filas_escritas`, `checksum_lote`, `estado` (`ok|stale|fallo|fallo_contrato`), `fuente`.
- Las 8 apps con meta existente se adaptan al contrato sin romper sus rutas actuales (aditivo); el resto de apps con `src/ingest/` lo implementan.
- Pruebas por app que verifican el shape; ninguna app fuera del workspace queda con el endpoint a medias.
- Las descripciones de tools MCP que hoy advierten staleness de forma estática pasan a citar este dato donde exista (el texto no se elimina antes de que el dato exista).

### OR-04 · Runner de contratos ejecutables para las 5 fuentes más cruzadas

**Prioridad:** P1 · **Esfuerzo:** L · **Dependencias:** OR-03 (para publicar el estado; puede adelantarse)

Convertir de documentación a chequeo los data contracts de `mef-presupuesto-ejecucion`, `oece-contrataciones-abiertas`, `infobras-obras-publicas`, `invierte-inversiones` y `proveedores-sancionados`.

**Criterios de aceptación**

- Cheques ejecutables tras cada corrida: schema, rangos, unicidad de claves y la regla anti `paneles-multi-corte` (DQ-09).
- Un fallo marca `estado=fallo_contrato` en el endpoint de frescura sin tumbar la API ni borrar datos.
- ≥1 prueba reproduce el bug histórico DQ-03/DQ-04 (inflación por multi-corte) y lo atrapa.
- Falsos positivos se documentan como excepción nombrada en el contrato; jamás silenciando el chequeo.

### OR-05 · Motor de corridas programadas (piloto de los 3 conectores núcleo)

**Prioridad:** P1 · **Esfuerzo:** L · **Dependencias:** OR-01, OR-02

Implementar lo decidido en OR-01, acotado al piloto de CX-04 (`mef-connector.ts`, `oece-connector.ts`, `oece-records-connector.ts`).

**Criterios de aceptación**

- Las 3 corridas se ejecutan programadas sin intervención manual y quedan registradas de forma auditable (tabla `ingest_runs` o reuso de raw batches con checksum).
- Reintentos con backoff ante fallo de red; el fallo queda visible en el registro, no silenciado.
- Los scripts `npm run ingest:*` manuales siguen funcionando intactos (fallback y camino de debugging).
- El resultado se refleja en `/api/meta/freshness`. Si OR-01 concluye "no automatizar", el ticket se cierra con la razón documentada (mismo patrón que CX-04/ADR-0016).

### OR-06 · Status de frescura agregado multi-app

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** OR-03

**Criterios de aceptación**

- Una vista responde "¿qué está al día y qué no?" agregando los `/api/meta/freshness` de las apps levantadas (patrón de conexión de `scripts/health-check-apis.sh`).
- Clasifica cada dataset contra su SLA (verde/ámbar/rojo) y muestra la última corrida real.
- Sin infraestructura nueva: script o página estática servida desde el repo.
- Una app caída aparece como "sin respuesta"; no desaparece de la lista.

### OR-07 · Alertas de ruptura de frescura

**Prioridad:** P2 · **Esfuerzo:** M · **Dependencias:** OR-02, OR-06

**Criterios de aceptación**

- Webhook/email cuando un dataset excede su SLA N corridas consecutivas (umbral configurable por dataset).
- Plantilla honesta: dataset, última corrida exitosa, fuente, impacto en cruces y cómo re-ejecutar.
- Prueba end-to-end con un dataset en modo simulado; sin alertas duplicadas.
- Coordinación explícita con el PRD de Detección de Cambios (EV-05) para no duplicar canales de notificación.

### OR-08 · CI: conector nuevo sin fila de frescura

**Prioridad:** P1 · **Esfuerzo:** S · **Dependencias:** OR-02

**Criterios de aceptación**

- Script hermano de `scripts/check-connectors-documented.sh` que falle si `apps/*/api/src/ingest/*-connector.ts` no tiene fila en `freshness.yaml` ni mención en `conectores.md`.
- Corre en `pull_request` que toque `src/ingest/` o los dos documentos; el mensaje nombra el archivo faltante.
- Nota al pie en `docs/conectores.md` explicando el chequeo (mismo patrón que CX-06).

## 6. Priorización y secuencia

| Fase | Entregables | Resultado que desbloquea |
|---|---|---|
| **Ahora** | OR-01, OR-02, OR-08 | Decisión trazable sobre dónde corre la automatización, SLA por dataset y CI que impide que el catálogo se desactualice otra vez. |
| **Siguiente** | OR-03, OR-06 | Todas las apps responden su frescura real bajo un contrato común, con vista agregada — el "status page" del dato público. |
| **Después** | OR-04, OR-05, OR-07 | Cheques de calidad que fallan antes que el usuario, piloto de corridas programadas auditables y alertas de ruptura de SLA. |

## 7. Requisitos no funcionales

- **Trazabilidad:** toda corrida (manual o programada) deja el mismo registro auditable: cuándo, qué conector, cuántas filas, checksum del lote y resultado.
- **Honestidad de frescura:** un dataset sin corrida reciente se muestra `stale` o `sin_dato`; nunca "actualizado". Ninguna descripción MCP pierde su advertencia antes de que exista el dato que la reemplace.
- **Compatibilidad:** los endpoints meta existentes no cambian de forma incompatible; los scripts `npm run ingest:*` siguen siendo ejecutables sin el orquestador.
- **Alcance del workspace:** el paquete compartido se adhiere a ADR-0019; las apps fuera del workspace se adaptan con su propio `meta.ts` local, sin forzar su alta en el workspace solo para este PRD.
- **Documentación como entregable:** `docs/conectores.md`, `freshness.yaml` y (si aplica) `docs/data-contracts/` se actualizan en el mismo PR del cambio, no después.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| OR-01 concluye que automatizar sigue sin valer la pena y el PRD "no entrega automatización" | El PRD está diseñado frescura-first: OR-02/03/04/06/07 entregan valor sin automatizar; OR-05 se cierra documentado (patrón CX-04), no abierto. |
| El orquestador se convierte en un segundo sistema que nadie mantiene | Piloto acotado a 3 conectores; el orquestador no reimplementa conectores, solo los invoca; si OR-01 opta por daemon local, el costo operativo es el mismo que hoy (`dev-local.sh`). |
| Contratos ejecutables frágiles ante cambios legítimos de la fuente | Excepciones nombradas y versionadas dentro del contrato; un cambio de la fuente actualiza el contrato en el mismo PR (nunca se silencia el chequeo). |
| Roll-out de OR-03 en ~38 apps demasiado grande | Priorizar primero las apps del workspace y las del mapa de cruces; el resto en tandas; el contrato es aditivo. |
| SLA mal estimado genera alertas falsas | Los SLAs nacen del catálogo (OR-02) con la frecuencia real de publicación de la fuente; alertas con umbral de N corridas consecutivas, no de una. |

## 9. Fuera de este PRD

- Nuevas fuentes de datos ni conectores nuevos.
- Migración de bases de datos a hosting expuesto al internet (decisión de seguridad explícita, fuera de alcance por ADR-0016).
- Detección de cambios entre corridas y alertas de contenido → PRD Detección de Cambios y Alertas (serie EV-).
- Warehouse analítico y catálogo de métricas → PRD Warehouse Analítico (serie WH-).
- Automatización de `tools/scrapers/` (tiene su propia ruta propuesta en `scraping-arquitectura.md` §3.7).
- Interfaz web pulida para el status de frescura (la vista mínima de OR-06 basta; diseño completo = ticket aparte).

## 10. Definition of Done

- Cada ticket tiene PR, revisión y pruebas automatizadas asociadas.
- Toda app con `src/ingest/` responde `/api/meta/freshness` con el contrato común y tiene fila en `freshness.yaml`.
- Un PR que agregue un conector sin fila de frescura falla en CI (OR-08), además del chequeo de documentación existente.
- Los 5 contratos ejecutables corren tras cada ingesta de sus apps y su estado es visible en el endpoint de frescura.
- `docs/conectores.md` refleja el estado real (SLAs, cobertura de meta, piloto de corridas) después de cada PR mergeado.
- La decisión sobre automatización está en un ADR mergeado — ya sea implementar o diferir, sin comentarios de código como única fuente.




