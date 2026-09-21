# PRD — Deuda Pública (MEF, nacional y subnacional)

**Estado:** Propuesto — investigación inicial completa, verificación en vivo parcial (bloqueada por WAF, ver §2).
**Fecha:** 2026-09-21
**Ámbito:** app nueva por definir (ver §5), `mcp-server/src/catalog.ts`, `docs/conectores.md`, `docs/data-contracts/`
**Horizonte:** sin fecha comprometida — depende de resolver el acceso real a la fuente (§2, §8) antes de comprometer esfuerzo de ingesta.
**Origen:** pregunta explícita del usuario sobre qué expone el MEF fuera de `datosabiertos.gob.pe` y sus adscritos (2026-09-21), en la misma sesión que `PRD_Energia_Ambiente_Financiero_Nuevos_Conectores_v1.md`.

## 1. Decisión de producto

Rastro tiene hoy visibilidad de **presupuesto y ejecución de gasto** (`radar-ejecucion`), **inversión pública** (`radar-inversiones`) y **pasivos contingentes explícitos por ISDS/APP** (`riesgo-fiscal-isds`) — pero **ningún dato de deuda pública real**, ni del stock de deuda nacional (interna/externa) ni de la deuda de gobiernos regionales/locales. Es la pieza que falta para completar el cuadro fiscal: cuánto se presupuesta, cuánto se ejecuta, cuánto se debe.

El MEF publica esto en el **Portal de Transparencia Económica** (`mef.gob.pe/es/portal-de-transparencia-economica`), un dominio distinto de `datosabiertos.mef.gob.pe` (el portal de archivos descargables que ya usan `radar-ejecucion`/`radar-inversiones`/AIRHSP/bienes muebles). Este PRD investiga esa fuente separada y, a diferencia del resto del catálogo, **encuentra una barrera técnica real todavía sin resolver** (§2) — se documenta explícitamente en vez de comprometer un ticket de ingesta sobre una fuente que hoy no se puede alcanzar por `fetch()` simple.

## 2. Hallazgo crítico — WAF Incapsula bloquea acceso directo

**Verificado en vivo 2026-09-21**: `curl` (con y sin `User-Agent` de navegador) contra `mef.gob.pe/es/consulta-de-deuda-publica` no llega a la página real — devuelve un shell HTML de **Incapsula** (`/_Incapsula_Resource?...`, "Request unsuccessful. Incapsula incident ID: ..."). Esto es una protección anti-bot distinta y más agresiva que el CloudWAF de `datosabiertos.gob.pe` (que sí se resuelve con un `User-Agent` de navegador simple) — Incapsula típicamente exige ejecución de JavaScript/fingerprinting de navegador real, no un header estático.

**Esto ya tiene precedente exacto en el monorepo**: `riesgo-fiscal-isds` (`pdf-connector.ts`) documenta el mismo bloqueo contra el mismo dominio (`mef.gob.pe`) para el PDF del Marco Macroeconómico Multianual — la solución ahí fue **descarga manual con navegador real** (`claude-in-chrome` confirmó que un navegador real sí pasa el bloqueo), no un conector `fetch()` automático. La extracción posterior del archivo ya descargado sí es 100% automática.

**Implicación para este PRD**: cualquier ticket de ingesta de deuda pública debe asumir, por defecto, el mismo patrón manual-asistido (descarga con navegador real → archivo en disco → parseo automático), no un conector HTTP directo — hasta que DEU-01 confirme lo contrario.

## 3. Objetivo, no objetivos y métricas de éxito

### Objetivo

Determinar si la Consulta de Deuda Pública del MEF es una fuente viable para Rastro (formato real, forma de descarga real, frecuencia real) y, si lo es, ingerir stock de deuda del sector público (nacional) y deuda de gobiernos regionales/locales (subnacional, con foco en La Libertad).

### No objetivos

- No se construye un conector `fetch()` automático sin antes confirmar que existe una vía que lo permita — si la única vía real es manual-asistida (como `riesgo-fiscal-isds`), este PRD lo acepta explícitamente en vez de forzar automatización donde no la hay.
- No se cruza deuda pública contra `riesgo-fiscal-isds`/`radar-ejecucion` en este PRD — eso es un PRD de cruces posterior, una vez el conector base exista.
- No se investigan en este PRD los hallazgos de órganos adscritos (SERFOR, ONPE, SENACE, OSITRAN, etc.) encontrados en paralelo esta misma sesión — su consolidación ya está completa en `docs/PRD_Organismos_Adscritos_Consolidado_v1.md` / `docs/BACKLOG_Organismos_Adscritos_Consolidado_v1.md`, que son los documentos activos para darles seguimiento (ver también `docs/BACKLOG_Deuda_Publica_MEF_v1.md`, nota de remisión).
- No se construyen vistas nuevas en `rastro.fyi`/`rastro-web`.
- No se implementa scheduler.

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Viabilidad de fuente confirmada | DEU-01 determina, con evidencia real (no snippet de búsqueda), si la fuente es descargable automáticamente, manual-asistida, o no automatizable — y lo documenta en un ADR o en `docs/data-contracts/mef-deuda-publica-viabilidad.md`, mismo criterio que `docs/adr/0015-mef-connector-offsets-manuales-decision.md`. |
| Deuda nacional ingerida (si DEU-01 lo habilita) | Stock de deuda interna/externa consultable, con clasificador (moneda, plazo, tipo de acreedor si la fuente lo trae) y fecha de corte real. |
| Deuda subnacional ingerida (si DEU-01 lo habilita) | Deuda de gobiernos regionales/locales consultable por UBIGEO/entidad, con cobertura de La Libertad verificada explícitamente. |
| Documentación honesta | Si la fuente resulta no viable o solo parcialmente viable, `docs/data-contracts/mef-deuda-publica-viabilidad.md` (el contrato de fuente de DEU-01, distinto de los contratos nacional/subnacional de DEU-02/DEU-03) lo documenta como tal — no se cierra el PRD fingiendo cobertura que no existe. |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Periodista / analista fiscal | "¿Cuánto debe mi gobierno regional/local, y a quién?" | Endpoint de consulta por UBIGEO/entidad, con fecha de corte real. |
| Gestor público | "¿Cómo se compara la deuda de mi región con su ejecución presupuestal?" | Cruce futuro (fuera de alcance de este PRD) entre este dato y `radar-ejecucion`. |
| Agente de IA (MCP) | Responder preguntas sobre deuda pública sin salir del catálogo Rastro. | Tool MCP nueva, con la limitación de cobertura/frecuencia declarada honestamente si la ingesta terminó siendo manual-asistida. |

## 5. Alcance funcional

### Épica A — Viabilidad de fuente (bloqueante, no saltar)

#### DEU-01 — Confirmar vía de acceso real a la Consulta de Deuda Pública

**Prioridad:** P0 · **Esfuerzo:** S (investigación) · **Dependencias:** ninguna

Repetir la verificación de `curl` de este PRD (§2) con las variantes que ya funcionaron para otras fuentes del catálogo bloqueadas por WAF (ver si un `User-Agent` distinto o cabeceras adicionales bastan, antes de asumir que hace falta navegador real). Si `curl` sigue bloqueado, usar `claude-in-chrome` (mismo procedimiento que `riesgo-fiscal-isds`) para: (a) confirmar que un navegador real sí pasa el bloqueo, (b) identificar si la página, una vez cargada, hace llamadas AJAX/fetch a un endpoint JSON propio (inspeccionar la pestaña Network) — si existe un endpoint JSON detrás del formulario, documentar su URL y parámetros exactos, porque cambiaría el PRD de "manual-asistido" a "automatizable con las cabeceras/cookies correctas".

**Criterios de aceptación**

- El PR (o el documento de investigación, si el resultado es "no viable") registra evidencia real: captura de la respuesta de `curl`, y si se usó `claude-in-chrome`, qué se encontró en la pestaña Network.
- **Reproducción con cliente no-browser obligatoria antes de clasificar como automatizable (hallazgo real de CodeRabbit)**: si en la pestaña Network se descubre una llamada JSON propia detrás del formulario, esa llamada debe reproducirse con `curl` (no solo observarse en el navegador) antes de concluir "(a) automatizable vía `fetch()`". La reproducción con `curl` debe documentar explícitamente si la respuesta depende de cookies de sesión, tokens generados por JavaScript, fingerprinting del navegador, o cualquier otro estado de sesión del navegador. Si cualquiera de esos elementos es necesario para que `curl` reciba una respuesta válida, la fuente se clasifica como "(b) manual-asistida", no como "(a) automatizable", aunque exista un endpoint JSON identificable.
- Se determina explícitamente una de tres conclusiones, documentada con su evidencia: (a) automatizable vía `fetch()` con las cabeceras correctas (solo si la reproducción con `curl` del punto anterior tuvo éxito sin estado de sesión del navegador), (b) manual-asistida (navegador real para descargar, parseo automático después, como `riesgo-fiscal-isds`), (c) no automatizable de forma responsable en este momento.
- Si la conclusión es (a) o (b), los tickets DEU-02/DEU-03 proceden. Si es (c), el PRD se cierra en esta fase con la razón documentada — no se fuerza un conector sobre una fuente inviable.

### Épica B — Ingesta (condicional a DEU-01)

#### DEU-02 — Stock de deuda del sector público (nacional)

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** DEU-01 (solo si concluye viable)

Ingerir el módulo de "Deuda del Sector Público" — stock de deuda interna/externa, desembolsos, servicio proyectado, por los clasificadores reales que traiga la fuente (verificar en vivo cuáles son antes de fijar el schema — no asumir "moneda"/"plazo"/"acreedor" sin confirmarlo).

**Criterios de aceptación**

- Los tres productos descritos arriba se ingieren de forma explícita — stock de deuda interna/externa, desembolsos, y servicio proyectado. Si alguno de los tres no está disponible en la fuente real, se documenta esa ausencia explícitamente en el contrato (no se asume cobertura completa por analogía con los otros dos).
- Schema de la tabla nueva refleja columnas confirmadas contra una respuesta/descarga real, no contra la descripción de la página de búsqueda.
- Fecha de corte real declarada en la respuesta de la API (no asumida "hoy" ni "el año en curso").
- `docs/data-contracts/mef-deuda-publica-nacional.md` documenta la vía de acceso real determinada por DEU-01 y las columnas confirmadas de los tres productos.

#### DEU-03 — Deuda de gobiernos regionales y locales (subnacional)

**Prioridad:** P1 · **Esfuerzo:** M · **Dependencias:** DEU-01 (solo si concluye viable)

Mismo patrón que DEU-02, para el módulo "Deuda de los Gobiernos Regionales y Locales". Prioriza verificar cobertura real de La Libertad (foco del proyecto) antes de dar el ticket por completo — mismo criterio de honestidad territorial que el resto del catálogo (`radar-inversiones` declarando su alcance real por departamento, por ejemplo).

**Criterios de aceptación**

- Cobertura real de La Libertad verificada y declarada explícitamente (cuántas entidades regionales/locales de La Libertad aparecen con deuda registrada, o si la fuente no las distingue).
- `docs/data-contracts/mef-deuda-publica-subnacional.md` documenta columnas confirmadas y cobertura real.

### Épica C — Capa de lectura

#### DEU-04 — Registro MCP y documentación

**Prioridad:** P2 · **Esfuerzo:** S · **Dependencias:** DEU-02, DEU-03

Registrar tools MCP nuevas siguiendo el patrón `SIN_SCHEDULER` del resto del catálogo. Ficha en `docs/conectores.md`.

**Criterios de aceptación**

- Si la ingesta terminó siendo manual-asistida (DEU-01 concluyó (b)), la descripción de la tool MCP lo declara explícitamente — mismo principio que `riesgo-fiscal-isds` ("Ingesta manual como `bcrp-la-libertad`").
- `scripts/check-connectors-documented.sh` pasa sin cambios de script.

## 6. Priorización y secuencia

| Fase | Entregables | Resultado que desbloquea |
|---|---|---|
| **Ahora** | DEU-01 | Determina si el resto del PRD procede o se cierra aquí — bloqueante real, no ceremonial. |
| **Si DEU-01 concluye viable** | DEU-02, DEU-03 | Deuda nacional y subnacional ingeridas. |
| **Después** | DEU-04 | Capa de lectura para agentes de IA. |

## 7. Requisitos no funcionales

- **No se asume automatización posible sin evidencia** — este PRD parte de un hallazgo real de bloqueo (Incapsula), a diferencia del resto del catálogo donde el WAF confirmado (CloudWAF de `datosabiertos.gob.pe`) ya tiene una solución conocida (User-Agent de navegador). Incapsula es una barrera distinta y potencialmente no resoluble con un header estático.
- **Documentación honesta de vía de acceso** — cada ficha declara si la ingesta es automática, manual-asistida, o no viable, sin ambigüedad.
- **Verificación de cobertura territorial real** antes de declarar el ticket completo, mismo estándar que el resto del catálogo.
- **Sin scheduler.**

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Incapsula bloquea también la descarga manual con navegador real (a diferencia de lo que pasó con el PDF de `riesgo-fiscal-isds`) | DEU-01 lo verifica explícitamente con `claude-in-chrome` antes de comprometer DEU-02/DEU-03 — si incluso el navegador real falla, el PRD se cierra en fase 0. |
| La fuente resulta ser solo un formulario HTML sin descarga estructurada (ej. solo tablas renderizadas en la página, sin CSV/JSON exportable) | DEU-01 debe confirmar explícitamente si existe una forma de exportar datos estructurados (botón de descarga, endpoint JSON) antes de proceder — si no existe, se documenta como fuente "solo consulta visual", no automatizable de forma responsable (scraping de tabla HTML renderizada es más frágil y de menor prioridad que el resto del catálogo). |
| El esfuerzo de DEU-01 se subestima porque Incapsula es más difícil de sortear que el WAF ya conocido | Esfuerzo declarado como S pero es investigación pura — si toma más de una sesión, se reporta como bloqueado explícitamente, no se fuerza una solución frágil solo por cerrar el ticket. |

## 9. Fuera de este PRD

- Cruce entre deuda pública y `riesgo-fiscal-isds`/`radar-ejecucion` — PRD de cruces futuro, una vez el conector base exista.
- Los hallazgos de órganos adscritos de esta misma sesión (SERFOR/GEOSERFOR, ONPE, SENACE, OSITRAN, SUNAFIL, SUNEDU, RENIEC, INS, INABIF) — ya consolidados en `docs/PRD_Organismos_Adscritos_Consolidado_v1.md` / `docs/BACKLOG_Organismos_Adscritos_Consolidado_v1.md`, documentos activos, no pendientes.
- Cambios en `apps/rastro-web` o `rastro.fyi`.
- Scheduler/automatización.

## 10. Definition of Done

- DEU-01 completado con conclusión explícita y evidencia real, documentada en un ADR o en `docs/data-contracts/mef-deuda-publica-viabilidad.md`.
- Si DEU-01 concluye viable: DEU-02 y DEU-03 mergeados con PR, revisión, pruebas automatizadas, y cobertura territorial real declarada.
- Si DEU-01 concluye no viable: el PRD se cierra formalmente con la razón documentada — no queda "en pausa" sin resolución.
- Ninguna ficha de `docs/conectores.md` declara automatización donde la ingesta real fue manual-asistida.
