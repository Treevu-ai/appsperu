# PRD — Inteligencia legislativa: Proyectos de Ley del Congreso de la República

**Estado:** Propuesto — verificación en vivo del endpoint y de un scraper de terceros ya realizada; ningún conector construido todavía.
**Fecha:** 2026-09-21
**Ámbito:** app nueva `legislativo-congreso`, `mcp-server/src/catalog.ts`, `mcp-server/src/apps.ts`, `docs/conectores.md`, `docs/data-contracts/`
**Horizonte:** Fase 1 (ingesta + API) es el único compromiso de este PRD. Fases 2-3 quedan como visión, no como tickets comprometidos — ver §9.
**Origen:** Informe de investigación competitiva "Inteligencia Legislativa Peruana" (Parlamento.ai, Legislat.ai) del 2026-09-21, y la verificación en vivo previa del endpoint `spley-portal-service` durante la misma sesión (ver `docs/PRD_Organismos_Adscritos_Consolidado_v1.md`, ticket ADS-15). Este PRD **depende de ADS-15** y no repite su trabajo — ver §1.

## 1. Decisión de producto

Esta sesión ya confirmó en vivo (`curl` + errores de validación reales de un backend Spring) que `api.congreso.gob.pe/spley-portal-service/proyecto-ley/lista-con-filtro` es un endpoint real y vivo del Congreso de la República — registrado como ADS-15 en el backlog consolidado de organismos adscritos. Al leer el informe de investigación competitiva sobre Parlamento.ai y Legislat.ai, y verificar en vivo el repo de terceros `unimauro/congreso-abierto-peru` (GitHub, AGPL-3.0, con scheduler diario activo — commits automáticos casi todos los días desde 2026-09-14 hasta 2026-09-20), se confirmó independientemente que:

- Su scraper apunta exactamente a la misma ruta que ya verificamos nosotros (`POST /spley-portal-service/proyecto-ley/lista-con-filtro`, body `{"perParId": <periodo>, ...resto null}`), lo que cruza-valida nuestro propio hallazgo.
- Reporta 14,704 proyectos de ley del periodo 2021-2026 obtenidos en vivo — cercano a los 14,864 citados en el informe de investigación (probable diferencia de fecha de snapshot).
- Es AGPL-3.0: si Rastro reutilizara su código (no solo su hallazgo del endpoint), cualquier despliegue como servicio quedaría obligado a liberar el código fuente de Rastro bajo la misma licencia. **Decisión explícita: no se adapta ni se depende de ese repo — se construye un conector propio contra el endpoint directamente**, igual que el resto del catálogo (31 apps existentes en `mcp-server/src/apps.ts` al momento de escribir este PRD — no fijar este número en criterios de aceptación, verificar contra `APP_KEYS` en el momento de implementar). Solo se usa como fuente de verificación cruzada, no como dependencia de código ni de datos.

**Decisión de alcance**: este PRD compromete únicamente la Fase 1 — ingesta de proyectos de ley con API REST y búsqueda simple, mismo patrón que cualquier otro conector del catálogo (`apps/<nombre>/api`, Postgres propio, sin scheduler, sin UI). Las capacidades de enriquecimiento con IA (clasificación temática, resúmenes, embeddings semánticos), MCP tool conversacional adicional al catálogo estándar, y cruce automático con INFOBRAS/SEACE/Radar Inversiones **no se comprometen en este documento** — son abstracción y complejidad prematura sin que la Fase 1 exista primero y se demuestre útil. Se documentan en §9 como visión futura, no como tickets.

## 2. Problema y oportunidad

El Congreso genera miles de proyectos de ley por año que pueden modificar directamente las reglas bajo las que operan los datos que Rastro ya sigue — contrataciones públicas (SEACE), plazos de supervisión de obras (INFOBRAS), criterios de Canon o presupuesto regional. Hoy Rastro no tiene ninguna capa que conecte "qué se está legislando" con "qué se está ejecutando" en La Libertad. Dos startups privadas (Parlamento.ai, Legislat.ai) están construyendo esta categoría para Latinoamérica con planes desde USD $350/mes; ninguna tiene aún cobertura peruana completa y ambas son productos comerciales cerrados, no infraestructura pública reutilizable.

La oportunidad inmediata y de bajo riesgo es mucho más acotada que "competir con esas plataformas": ingerir el catálogo de proyectos de ley (dato público, endpoint ya verificado, sin PII de terceros más allá de nombres de congresistas — que son funcionarios públicos) y exponerlo con el mismo patrón API/MCP que el resto de Rastro. Eso por sí solo ya es información que hoy nadie más ofrece de forma abierta y gratuita en Perú, y sienta la base para cualquier cruce posterior sin comprometerse a construirlo ya.

## 3. Objetivo, no objetivos y métricas de éxito

### Objetivo

Ingerir el histórico completo de proyectos de ley del Congreso de la República (todos los periodos parlamentarios disponibles vía `perParId`) y exponerlo por API REST y tool MCP, con el mismo estándar de verificación en vivo, ausencia-de-dato-≠-cero y sin scheduler que el resto del catálogo.

### No objetivos

- No se construye clasificación temática, resumen ejecutivo ni búsqueda semántica con IA (Ollama u otro) en este PRD — ver §9.
- No se construye transcripción de sesiones del pleno/comisiones — dato distinto, no verificado, fuera de alcance.
- No se cruza automáticamente contra INFOBRAS/SEACE/Radar Inversiones en este PRD — requiere que la ingesta base exista primero.
- No se construye un MCP "Sentinel Agent" conversacional adicional — la tool MCP de este PRD sigue el patrón estándar (`SIN_SCHEDULER`, consulta directa), no un agente propio.
- No se reutiliza código del repo `unimauro/congreso-abierto-peru` (AGPL-3.0) — solo se usa como referencia de verificación cruzada del endpoint, ya documentada en §1.
- No se construyen vistas nuevas en `rastro.fyi`/`rastro-web`.

### Métricas de éxito

| Métrica | Meta de aceptación |
|---|---|
| Contrato completo confirmado | Depende de que ADS-15 concluya con el contrato real de `FiltroProyecLeyDto` documentado — este PRD no repite esa verificación, la consume. |
| Ingesta completa | Todos los periodos parlamentarios conocidos (2021, 2016, 2011, 2006 — a confirmar cuáles responden `200` real) ingeridos, con conteo total documentado en el PR (referencia: ~14,700 para el periodo 2021-2026 solamente). |
| API funcional | `GET /api/proyectos` con filtros reales (periodo, estado, autor, texto libre simple) responde contra Postgres real, verificado en vivo. |
| Tool MCP registrada | `legislativo_congreso_proyectos` (o nombre equivalente) registrada en `mcp-server/src/catalog.ts` y probada con una invocación real. |

## 4. Usuarios y casos de uso

| Usuario | Necesidad | Resultado esperado |
|---|---|---|
| Periodista / analista | "¿Qué proyectos de ley menciona tal congresista o tal tema?" | Endpoint de consulta por autor/periodo/texto. |
| Gestor público | "¿Hay algún proyecto de ley activo que afecte contrataciones/obras?" | Búsqueda de texto libre simple sobre título/sumilla (sin semántica IA en esta fase). |
| Agente de IA (MCP) | Responder preguntas sobre proyectos de ley sin salir del catálogo Rastro. | Tool MCP nueva, mismo patrón que el resto de apps existentes (ver nota de §1 sobre no fijar el conteo). |

## 5. Alcance funcional

### Épica A — Ingesta base (condicional al cierre de ADS-15)

#### LEG-01 — Conector `legislativo-congreso`: ingesta de proyectos de ley

**Prioridad:** P0 · **Esfuerzo:** M · **Dependencias:** ADS-15 (contrato completo de `spley-portal-service` confirmado)

Construir `apps/legislativo-congreso/api` (puerto 4030, siguiente disponible en `mcp-server/src/apps.ts`) con un conector propio (no derivado del código de `unimauro/congreso-abierto-peru`, solo verificado contra el mismo endpoint real) que ingiere `POST /spley-portal-service/proyecto-ley/lista-con-filtro` por cada `perParId` confirmado como válido en ADS-15. **Clave de upsert: `perParId` + `pleyNum` (el número entero del proyecto, no el código compuesto `proyectoLey`)** — `proyectoLey` (ej. `"14704/2025-CR"`) contiene un `/`, lo que lo hace inadecuado como segmento de ruta sin codificar; se guarda como columna informativa, no como parte de la clave. Confirmar `perParId`+`pleyNum` como clave real contra la respuesta, no asumir.

**Criterios de aceptación**

- Usa el contrato exacto que ADS-15 documentó — si ADS-15 concluye que el endpoint requiere estado de sesión de navegador (cookies, tokens JS), este ticket se reclasifica a "manual-asistida" (mismo criterio que DEU-01), no se fuerza un `fetch()` directo.
- Schema de la tabla refleja columnas confirmadas contra una respuesta real (`estado`, `fecPresentacion`, `titulo`, `desProponente`, `autores`, etc.) — sin inventar columnas del hallazgo de terceros sin verificarlas contra la respuesta propia.
- Ingesta cubre todos los periodos parlamentarios que respondan `200` real; los que no respondan se documentan explícitamente como no disponibles, no se omiten en silencio.
- Verificado en vivo contra Postgres real antes de declarar el ticket cerrado.

#### LEG-02 — API de consulta

**Prioridad:** P0 · **Esfuerzo:** S · **Dependencias:** LEG-01

`GET /api/proyectos` con filtros por periodo, estado, autor (nombre parcial, `ILIKE`), y texto libre simple sobre `titulo` (`ILIKE`, sin ranking semántico). `GET /api/proyectos/:periodo/:numero` para el detalle de un proyecto (`periodo` = `perParId`, `numero` = `pleyNum` — la clave real de LEG-01, sin `/` ni caracteres que requieran codificación de URL; **no** `GET /api/proyectos/:codigo` con el código compuesto `"14704/2025-CR"`, que contiene `/` y rompería el ruteo).

**Criterios de aceptación**

- Paginación obligatoria (mismo patrón `parseQuery(schema, req.query, res)` que el resto del catálogo) — sin límite implícito no documentado.
- Filtro sin match responde lista vacía, no error ni `404` genérico — distinto del caso "periodo no disponible" (ver §7, campo de disponibilidad explícito).
- `GET /api/proyectos/periodos` expone qué periodos están `disponible`/`no_disponible` (según lo que LEG-01 haya logrado ingerir) — necesario para que un filtro sin match sea distinguible de un periodo nunca ingerido (ver §7).
- Tests: filtro por periodo con match, por autor con match parcial, sin match, detalle por `:periodo/:numero` con y sin match, y `GET /api/proyectos/periodos` reflejando un periodo no disponible.

#### LEG-03 — Registro MCP y documentación

**Prioridad:** P0 · **Esfuerzo:** S · **Dependencias:** LEG-02

Registrar la tool en `mcp-server/src/catalog.ts`, `mcp-server/src/apps.ts` (puerto 4030), `mcp-server/src/__tests__/catalog.test.ts`, ficha en `docs/conectores.md` y data contract en `docs/data-contracts/legislativo-congreso-proyectos.md`.

**Criterios de aceptación**

- Tool sigue patrón `SIN_SCHEDULER` del resto del catálogo.
- `scripts/check-connectors-documented.sh` pasa sin cambios de script.
- **`mcp-server/src/__tests__/routes-vs-catalog.test.ts` pasa sin cambios de script (hallazgo real de Copilot)**: este test compara todos los `GET` montados de cada app contra `TOOL_CATALOG` y se activa automáticamente al agregar `legislativo-congreso` a `APP_KEYS` — cada ruta de LEG-02 (`/api/proyectos`, `/api/proyectos/:periodo/:numero`, `/api/proyectos/periodos`) debe tener su tool correspondiente en el catálogo o el CI falla aquí, no solo en `catalog.test.ts`.
- Tool probada con al menos una invocación MCP real documentada en el PR.

## 6. Priorización y secuencia

| Fase | Objetivo | Tickets comprometibles | Criterio de corte |
|---|---|---|---|
| 0 (bloqueante, no este PRD) | Confirmar contrato completo del endpoint. | ADS-15 (en `docs/BACKLOG_Organismos_Adscritos_Consolidado_v1.md`) | Debe cerrar con conclusión Épica A o C antes de que LEG-01 empiece. |
| 1 | Ingesta base + API + registro MCP. | LEG-01, LEG-02, LEG-03 | Verificación en vivo en cada uno, mismo estándar del resto del catálogo. |

## 7. Requisitos no funcionales

- **Sin dependencia de código de terceros AGPL** — solo el endpoint público se reutiliza, no el pipeline de `unimauro/congreso-abierto-peru`.
- **PII**: `autores`/`proponente` son congresistas — funcionarios públicos, nombres ya públicos en el propio expediente legislativo. No se ingiere ningún dato personal de ciudadanos particulares en este PRD.
- **Ausencia de dato ≠ cero, con distinción explícita en la respuesta (hallazgo real de Copilot)**: una lista vacía de `GET /api/proyectos?periodo=X` es ambigua entre "el periodo X existe y no tiene proyectos que matcheen el filtro" y "el periodo X nunca respondió `200` en la ingesta y no está disponible". La API debe exponer un campo/endpoint que declare qué periodos están disponibles (ej. `GET /api/proyectos/periodos` con estado por periodo: `disponible`/`no_disponible`), y la respuesta de `GET /api/proyectos` no debe presentarse como "0 resultados confirmados" para un periodo que nunca se ingirió — debe distinguirse de un filtro real sin match.
- Sin scheduler, sin UI — igual que el resto del catálogo.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El contrato real de `spley-portal-service` requiere autenticación de sesión no evidente en los errores 400/500 ya vistos | ADS-15 debe concluir esto explícitamente antes de que LEG-01 empiece; si aplica, LEG-01 se reclasifica a manual-asistida. |
| El volumen real (14,000+ proyectos, 4 periodos) genera un scraping largo o con rate-limiting no documentado | Verificar en vivo el comportamiento con al menos un periodo completo antes de comprometer los 4; documentar cualquier throttling necesario. |
| Confundir "hallazgo de terceros verificado" con "contrato propio ya confirmado" | LEG-01 exige su propia verificación en vivo del contrato exacto usado, no solo cita al repo de terceros como evidencia. |

## 9. Fuera de este PRD

- **Fase 2 (visión, no comprometida)**: clasificación temática y resumen ejecutivo con IA local (Ollama), búsqueda semántica con embeddings.
- **Fase 3 (visión, no comprometida)**: cruce automático proyecto de ley × INFOBRAS/SEACE/Radar Inversiones/presupuesto regional; dashboard de alertas.
- Transcripción de sesiones del pleno/comisiones (dato no verificado, fuente distinta).
- Cualquier integración o reventa de Parlamento.ai / Legislat.ai como partners — es una decisión de negocio, no de ingeniería, fuera del alcance de este documento.
- Cambios en `apps/rastro-web` o `rastro.fyi`.
- Scheduler/automatización.

## 10. Definition of Done

- LEG-01, LEG-02 y LEG-03 mergeados con PR, revisión y pruebas automatizadas, cada uno con verificación en vivo documentada.
- Ficha en `docs/conectores.md` y data contract en `docs/data-contracts/`.
- Tool MCP registrada en `mcp-server/src/catalog.ts` y probada con una invocación real — ningún ticket de este PRD se declara "completo" sin eso, mismo estándar que el resto del catálogo.
- Ningún periodo parlamentario sin dato se presenta como si tuviera cero proyectos confirmados.
- Despliegue: no aplica desplegar a producción en este PRD salvo que se indique explícitamente después del merge — igual que el resto de conectores recientes de esta sesión, que quedan en local hasta decisión posterior de despliegue.
