# Tickets — Calidad de Datos: Auditoría La Libertad v1

**Producto:** AppsPerú (backend/ingesta/API)
**PRD:** [`docs/PRD_Calidad_Datos_Auditoria_La_Libertad_v1.md`](PRD_Calidad_Datos_Auditoria_La_Libertad_v1.md)
**Backlog secuenciado:** [`docs/BACKLOG_Calidad_Datos_Auditoria_La_Libertad_v1.md`](BACKLOG_Calidad_Datos_Auditoria_La_Libertad_v1.md)
**Serie de tickets:** **DQ-** (Data Quality — nueva serie, no colisiona con CX-/AL2-/AL3-/CG-/CT-/IF-/SC- ya usadas en otros backlogs)
**Regla transversal:** todo campo territorial nuevo distingue explícitamente "sin match" de un valor real; ningún endpoint existente cambia de forma incompatible sin verificar consumidores; `docs/conectores.md`/`docs/data-contracts` se actualiza en el mismo PR.
**Estimación:** XS ≤ medio día · S ≤ 1 día · M 2–3 días · L 4–6 días (esfuerzo relativo, no calendario).

> **Nota de origen:** cada "contexto verificado" de este documento sale de una consulta HTTP real hecha durante la auditoría (2026-09-06/07), no de lectura de código salvo donde se indica explícitamente. Al implementar, verificar el path exacto del archivo contra el estado actual del repo — puede haber cambiado desde la auditoría.

---

## ÉPICA 1 — Bugs críticos de ingesta/API (Sprint 1)

### DQ-01 · Paginación real en `radar-ejecucion` `/api/execution` ✅ Hecho (2026-09-07)

- **Historia:** Como cualquier consumidor de la API de ejecución de gasto, quiero que una consulta sin límite explícito me devuelva el universo real de filas (o un error claro si excede un máximo razonable), para no construir un análisis sobre una muestra sesgada sin saberlo.
- **Contexto verificado:** `GET /api/execution?departamento=LA%20LIBERTAD` devuelve exactamente 1,000 filas sin campo `hasMore` ni soporte de `offset` — confirmado que el universo real es 2,594 filas para La Libertad (verificado sumando sub-consultas por `nivel`+`generica`, que sí filtran antes de tocar el límite: GN 44 + GR 234 + GL por genérica 1-9 = 2,316 → total 2,594). El límite está codificado en el endpoint, no es un parámetro.
- **Criterios de aceptación:**
  - `GET /api/execution` acepta `limit`/`offset` reales y devuelve `total`/`hasMore` en la respuesta, con un `limit` máximo razonable (ej. 5,000, igual que `radar-inversiones`).
  - Una consulta paginada completa para `departamento=LA%20LIBERTAD` recupera las 2,594 filas (verificar contra este número al momento de implementar — el dataset puede haber cambiado desde la auditoría, en cuyo caso el criterio es "la suma de páginas coincide con el `total` devuelto", no el número fijo 2,594).
  - Ningún consumidor existente que asumía max. 1,000 filas se rompe silenciosamente — verificar `rastro-web` y el servidor MCP antes de mergear.
  - Tests cubren: consulta sin filtro (recupera todo vía paginación), consulta con `limit` menor al total (`hasMore: true`), última página (`hasMore: false`).
  - `docs/conectores.md` (ficha de `mef-connector.ts` o el archivo de rutas correspondiente) refleja que el endpoint ahora pagina.
- **Dependencias:** ninguna. DQ-02 puede depender de este ticket si decide agregar el campo de provincia en el mismo endpoint.
- **Prioridad:** P0 · **Esfuerzo:** M
- **Verificado:** patrón replicado exacto de `apps/radar-inversiones/api/src/routes/investments.ts` (`MAX_LIMIT=5000`, `DEFAULT_LIMIT=1000`, `COUNT(*)` separado, `hasMore = offset + rows.length < total`). Suite de `radar-ejecucion/api` en verde (83/83, incluye 4 tests nuevos de paginación). Verificado en vivo: `total: 2594` exacto. Ningún consumidor real (`mcp-server` hace passthrough sin schema de salida; `rastro-web` no consume este endpoint) se vio afectado.

### DQ-02 · Atribución territorial server-side en `radar-ejecucion` ✅ Hecho (2026-09-07)

- **Historia:** Como analista, quiero que el gasto con sede en La Libertad venga con su provincia ya resuelta, para no tener que descargar el dataset completo y hacer matching de texto contra un padrón de distritos cada vez que necesito un desglose provincial.
- **Contexto verificado (auditoría original):** `/api/execution` no exponía `ubigeo` ni `provincia` en ninguna fila. La atribución manual hecha en la auditoría cruzó el campo `nombre` (ej. "MUNICIPALIDAD DISTRITAL DE HUANCHACO") contra el padrón de 84 distritos de La Libertad expuesto por `renamu`, dejando 176 de 2,594 filas (33.9% del PIM) sin provincia identificable.
- **Hallazgo real al implementar (más simple de lo estimado):** no hizo falta ningún crosswalk nuevo. `entities.ubigeo REFERENCES territories(ubigeo)` ya era una FK poblada al 100% (212/212 entidades en desarrollo), y `territories` ya tiene columnas `provincia`/`distrito` pobladas. La query de `execution.ts` **ya hacía** `LEFT JOIN territories t ON t.ubigeo = e.ubigeo` — solo nunca seleccionaba `t.provincia`/`t.distrito`. El fix fue agregar esas 2 columnas al SELECT y al mapeo de la respuesta.
- **Criterios de aceptación (verificados):**
  - `GET /api/execution` expone `provincia` y `distrito` por fila, derivados del JOIN ya existente a `territories` (sin heurística de texto ni crosswalk nuevo).
  - Filas sin atribución posible devuelven `provincia: null`/`distrito: null` explícito (cubierto por test con `provincia: null` simulando una entidad sin match).
  - `docs/conectores.md` (ficha de `radar-ejecucion`) documenta el fix y la tasa de cobertura observada.
  - Test de regresión: verificado en vivo contra el servidor local — **0 de 2,594 filas sin provincia** (100% de cobertura en desarrollo), muy por encima del 66.1% que exigía el criterio original. Pendiente verificar la misma tasa en producción antes de asumir 0% ahí también (la población de `ubigeo` podría diferir si producción ingiere más entidades o de otras fuentes).
- **Dependencias:** DQ-01 (implementado en el mismo cambio, mismo archivo y PR).
- **Prioridad:** P0 · **Esfuerzo real:** S (estimado como M; bajó de esfuerzo al confirmarse que la columna ya existía)

### DQ-03 · Filtro de corte vigente por defecto en `infraestructura-mtc`

- **Historia:** Como consumidor de los catálogos de aeródromos/terminales portuarios/peajes, quiero que una consulta sin parámetros me devuelva solo los activos vigentes hoy, para no mezclar por accidente un terminal ya dado de baja con los operativos actuales.
- **Contexto verificado:** los 3 endpoints (`/api/aerodromos`, `/api/terminales-portuarios`, `/api/peajes`) traen una serie histórica multi-corte (`fechaCorte` 2022 a 2025) sin filtrar por defecto. Confirmado: el terminal "Chicama/Malabrigo" (Ascope) aparece en el corte 2023-12-31 pero no en 2024/2025 (probablemente dado de baja); una consulta sin filtro de fecha lo mezcla con los 2 terminales vigentes, dando 3 en vez de 2. Mismo patrón en aeródromos (11 códigos históricos acumulados 2022-2025 vs. 9 vigentes en el corte más reciente).
- **Criterios de aceptación:**
  - Los 3 endpoints, sin parámetro de fecha, devuelven solo el `fechaCorte` más reciente disponible por defecto.
  - Un parámetro explícito (ej. `fechaCorte=2023-12-31` o `historico=true`) permite recuperar el comportamiento multi-corte para quien lo necesite.
  - Test de regresión: sin parámetros, terminales portuarios de La Libertad = 2 (o el número vigente al momento de implementar, verificado contra el corte más reciente real); aeródromos = 9 (o el vigente real).
  - `docs/conectores.md` documenta que este dataset es multi-corte y cuál es el comportamiento por defecto.
- **Dependencias:** ninguna.
- **Prioridad:** P0 · **Esfuerzo:** S
- **Hecho (2026-09-08):** los 3 endpoints filtran por defecto a `fecha_corte = MAX(fecha_corte)`; `historico=true` o `fechaCorte=YYYY-MM-DD` recuperan el comportamiento multi-corte. Verificado en vivo para La Libertad tras el fix: terminales portuarios = **2** (antes 9, sumando 4 cortes), aeródromos = **9** (antes 595 filas nacionales de 4 cortes), coincide exactamente con lo esperado. Tests de regresión agregados en `apps/infraestructura-mtc/api/src/__tests__/api.test.ts`, suite completa 28/28 en verde.

### DQ-04 · Filtro de año vigente por defecto en `residuos-solidos`

- **Historia:** Como consumidor de generación de residuos sólidos municipales, quiero que una consulta sin filtro de año me devuelva el corte más reciente, para no sumar por accidente varios años de la misma municipalidad y obtener una cifra inflada.
- **Contexto verificado:** el dataset SIGERSOL es un panel 2019-2024 (~83-84 municipalidades × 6 años, 500 filas). Confirmado en esta auditoría: sumar las 500 filas sin filtrar por año da una "generación total" de Trujillo de 1,995,594.5 t/año, mientras que el valor real de 2024 (único año, filtrado) es 387,612 t/año — una sobreestimación de ~5.1x. Mismo patrón para el campo de población (12,356,908 sumando 6 años vs. 2,130,145 reales en 2024).
- **Criterios de aceptación:**
  - `GET /api/residuos` sin parámetro `anio` devuelve solo el año más reciente disponible por defecto (o exige el parámetro explícitamente, respondiendo 400 con mensaje claro si no se provee — cualquiera de las dos soluciones es aceptable, lo que no es aceptable es sumar todos los años por defecto sin advertencia).
  - Documentación de la respuesta (o `docs/conectores.md`) indica explícitamente que el dataset es panel multi-año y qué comportamiento tiene por defecto.
  - Test de regresión: sin parámetro `anio` (o con el año más reciente explícito), la generación de Trujillo no debe exceder por un orden de magnitud el valor de un solo año típico (umbral de sanity check, ej. no más de 2x un promedio histórico razonable).
- **Dependencias:** ninguna.
- **Prioridad:** P0 · **Esfuerzo:** S
- **Hecho (2026-09-08):** `GET /api/residuos` filtra por defecto a `anio = MAX(anio)`; `historico=true` o `anio=YYYY` recuperan la serie completa. Verificado en vivo para La Libertad: 84 filas (12 provincias, año 2024 único) en vez de las 500 de los 6 años mezclados. Tests de regresión en `apps/residuos-solidos/api/src/__tests__/api.test.ts`, suite completa 19/19 en verde.

### DQ-05 · Investigar y resolver el crossref infobras↔ejecución vacío ✅ Hecho (2026-09-07)

- **Historia:** Como equipo de datos, quiero saber por qué el cruce que alimenta `obrasNoParalizadas` en el score institucional está vacío en la base viva, para decidir si se arregla o se documenta como limitación aceptada.
- **Contexto verificado:** `GET /api/crossref/ejecucion` (infobras) devolvía `{"resultados":[]}` para el país completo, no solo para La Libertad. Igual `comprasNoConcentradas` y `saludTributariaProveedores` en 0/130 entidades en La Libertad y 0/78 en Lima (grupo de control).
- **Causa raíz encontrada (no era un bug de código):** ambas apps (`infobras`, `compras-publicas`) tienen un script `npm run crossref:build` (`tsx src/crossref/build-crosswalk.ts`) que puebla `entity_crosswalk` — es un job manual, on-demand, y **nunca se había corrido en este entorno de desarrollo**. Las tablas estaban en 0 filas no por un bug sino por falta de ejecución inicial.
- **Resuelto:** se corrieron ambos scripts.
  - `infobras`: `ejecucionEntities: 130, infobrasEntities: 164, confirmadas: 75, candidatas: 17, sinMatch: 72`.
  - `compras-publicas`: `mefEntities: 130, oeceEntities: 85, confirmadas: 56, candidatas: 15, sinMatch: 14`.
  - Score institucional de La Libertad verificado post-fix: distribución de `componentesUsados` pasó de `{0:1, 1:30, 2:99, 3+:0}` a **`{0:1, 1:28, 2:8, 3:35, 4:9, 5:49}`** — 93 de 130 entidades (71.5%) ahora tienen 3 o más de 5 componentes, 49 tienen los 5 completos.
- **Pendiente de seguimiento (no bloqueante, ver DQ-04 de `docs/BACKLOG_Confiabilidad_Conectores_y_Cruces_v1.md`, evaluado y diferido en ADR-0016):** este hallazgo es evidencia fuerte de que vale la pena reabrir esa evaluación — un job manual que nadie corrió durante meses dejó al score institucional completo (nacional, no solo La Libertad) mostrando datos parciales sin que nadie lo notara. Recomendación: automatizar `crossref:build` de ambas apps con un mínimo de frecuencia (ej. semanal) o, si no se automatiza, documentar explícitamente en el runbook de despliegue que es un paso obligatorio post-deploy.
- **Dependencias:** ninguna. DQ-11 se reevalúa a la luz de este resultado (el score ya no está estructuralmente topado en 2/5).
- **Prioridad:** P0 · **Esfuerzo real:** XS (dos comandos) — estimado como M/L; el esfuerzo real fue mínimo porque el mecanismo ya existía, solo faltaba ejecutarlo.

---

## ÉPICA 2 — Endpoints de agregación y exposición de campos existentes (Sprint 2)

### DQ-06 · Endpoint de agregación por categoría en INFOBRAS + fix de `groupBy`

- **Historia:** Como analista, quiero poder pedir un desglose de obras por sector, nivel de gobierno, naturaleza o causal de paralización sin tener que descargar las 10,134 filas del departamento y agregarlas yo mismo.
- **Contexto verificado:** `GET /api/public-works/resumen?departamento=LA%20LIBERTAD&groupBy=X` ignora el parámetro `groupBy` sin importar el valor (`nivelGobierno`, `sectorEntidad`, `naturalezaObra`, `modalidadEjecucion` probados, los 4 devuelven la misma respuesta agregada nacional/departamental sin desglose). Estas 4 categorías sí existen en cada registro de `/api/public-works` (confirmado en el esquema de un registro de muestra) — el trabajo de esta auditoría fue paginar las 10,134 filas y agregar client-side con `node`.
- **Criterios de aceptación:**
  - `groupBy` en `/api/public-works/resumen` funciona para al menos `sectorEntidad`, `nivelGobierno`, `naturalezaObra`, `modalidadEjecucion`, `causalParalizacion` — o el endpoint responde 400 explícito para un valor de `groupBy` no soportado (nunca lo ignora en silencio).
  - Test de regresión: `groupBy=nivelGobierno` para La Libertad devuelve al menos 3 grupos (Gobierno Local, Nacional, Regional) con conteos que suman el total departamental.
  - `docs/conectores.md` documenta los valores de `groupBy` soportados.
- **Dependencias:** ninguna.
- **Prioridad:** P1 · **Esfuerzo:** M
- **Hecho (2026-09-08):** `groupBy` acepta `sectorEntidad`, `nivelGobierno`, `naturalezaObra`, `modalidadEjecucion` y `causalParalizacion`; cualquier otro valor responde 400. Verificado en vivo: `groupBy=nivelGobierno` para La Libertad devuelve 3 grupos (Gobierno Local 9033, Nacional 765, Regional 336) que suman exactamente el total departamental (10,134). Tests de regresión agregados, suite completa 98/98 en verde.

### DQ-07 · Exponer `area_censo` (urbano/rural) en `instituciones-educativas`

- **Historia:** Como analista, quiero poder desagregar instituciones educativas por área urbana/rural, un dato que ya existe en la fuente.
- **Contexto verificado:** la tabla de base de datos de `instituciones-educativas` tiene una columna `area_censo` (confirmado en `apps/instituciones-educativas/api/src/db/migrations/001_init.sql`, verificar línea exacta al implementar), pero `GET /api/instituciones` no la selecciona ni la expone en el JSON de respuesta.
- **Criterios de aceptación:**
  - `GET /api/instituciones` incluye el campo (ej. `areaCenso: "URBANA" | "RURAL"` o el valor real que traiga la fuente) en cada resultado.
  - Se puede filtrar por este campo vía query param.
  - Test de regresión: el desglose urbano/rural de La Libertad suma el total ya conocido (9,391).
  - `docs/conectores.md` deja de listar este campo como "no expuesto" si existía esa nota, o se agrega la ficha correspondiente.
- **Dependencias:** ninguna.
- **Prioridad:** P1 · **Esfuerzo:** S
- **Hecho (2026-09-08):** `areaCenso` expuesto en cada resultado y filtrable (`Urbana`/`Rural`). Verificado en vivo: La Libertad = 4,800 Urbana + 4,591 Rural = 9,391, coincide exacto con el total conocido. Tests de regresión agregados, suite completa 23/23 en verde.

### DQ-08 · Endpoint de agregación funcional/genérica en `radar-ejecucion`

- **Historia:** Como analista, quiero un desglose de ejecución por función y por genérica de gasto sin tener que paginar todo el dataset y agregar client-side.
- **Contexto verificado:** en esta auditoría, el desglose por función (Educación, Salud, Planeamiento, Transporte...) y por genérica (Personal, Bienes y Servicios, Adquisición de Activos No Financieros...) para el universo completo (2,594 filas) se calculó descargando todas las filas paginadas (post DQ-01) y agregando con un script — no existe un endpoint de agregación para esto.
- **Criterios de aceptación:**
  - Nuevo endpoint o parámetro de agregación (ej. `GET /api/execution/resumen?groupBy=funcion|generica`) que devuelve PIA/PIM/devengado agregados por la categoría pedida.
  - Test de regresión: la suma de los grupos coincide con el total departamental (post DQ-01).
  - `docs/conectores.md` documenta el nuevo endpoint.
- **Dependencias:** DQ-01 (necesita el universo completo de filas para que la agregación sea correcta).
- **Prioridad:** P1 · **Esfuerzo:** M
- **Hecho (2026-09-08):** `GET /api/execution/resumen?groupBy=funcion|generica` (requerido; 400 para cualquier otro valor), respeta los mismos filtros que `GET /api/execution`. Verificado en vivo: `groupBy=funcion` para La Libertad da 22 grupos cuya suma de filas es exactamente 2,594, el total departamental. Tests de regresión agregados, suite completa 87/87 en verde.

---

## ÉPICA 3 — Prevención de recurrencia (Sprint 2)

### DQ-09 · Documentar fuentes panel multi-año/multi-corte en `docs/data-contracts`

- **Historia:** Como futuro consumidor de cualquier API de este monorepo, quiero saber de antemano si una fuente es un panel multi-año (requiere filtrar) antes de sumar sus filas y obtener una cifra inflada.
- **Contexto verificado:** esta auditoría encontró el mismo patrón (panel sin filtro por defecto) en al menos 4 fuentes: `residuos-solidos` (6 años), `infraestructura-mtc` (4 cortes), `informes-control` (4 años, aunque en este caso el propio conteo total ya está acumulado y documentado como tal), `mimp`/CEM (14 años, panel legítimo con `UNIQUE(anio,centro)`, no un bug pero sí algo que un consumidor nuevo debe saber).
- **Criterios de aceptación:**
  - Nueva sección o archivo en `docs/data-contracts` que liste, para cada API del monorepo, si es snapshot único o panel multi-año/multi-corte, y cuál es (o debería ser, post DQ-03/DQ-04) el comportamiento por defecto sin filtro.
  - Incluye al menos las 4 fuentes identificadas arriba más cualquier otra que el equipo confirme al revisar el resto de conectores.
  - Enlazado desde `docs/conectores.md` para que sea descubrible.
- **Dependencias:** idealmente después de DQ-03/DQ-04 para documentar el comportamiento ya corregido, no el bug.
- **Prioridad:** P1 · **Esfuerzo:** S
- **Hecho (2026-09-08):** creado `docs/data-contracts/paneles-multi-corte.md`, enlazado desde `docs/conectores.md`. Cubre las 4 fuentes identificadas en el ticket original más `radar-ejecucion` (riesgo latente encontrado al auditar `LATEST_BUDGET_CTE`: `anio_fiscal` no se colapsa en el dedupe, así que ingerir un segundo año fiscal reproduciría el mismo bug de DQ-03/DQ-04 — no verificable hoy porque el entorno de desarrollo solo tiene 2026 ingerido) y `renamu`/`municipalidades` (inconsistencia entre `GET /api/municipalidades`, que no filtra por año, y `GET /api/equipamiento`, que sí — candidato a ticket de seguimiento, fuera de alcance de este ticket).

### DQ-10 · Chequeo genérico: total de resumen vs. suma de filas paginadas

- **Historia:** Como mantenedor, quiero un smoke test que detecte automáticamente si un endpoint de resumen/total deja de coincidir con la suma real de filas paginadas, para no descubrir el próximo LIMIT oculto meses después vía una auditoría manual.
- **Contexto verificado:** el bug de DQ-01 (LIMIT 1000 en radar-ejecucion) y el `groupBy` ignorado de DQ-06 solo se detectaron paginando manualmente y comparando contra el total declarado — no había ningún test que lo hiciera automáticamente.
- **Criterios de aceptación:**
  - Script o suite de smoke tests que, para cada app con un endpoint de `/resumen` o campo `total`, pagina el endpoint de listado correspondiente y compara la suma de filas contra el `total` declarado.
  - Corre en CI (schedule periódico o on-demand, dado que pagina datasets completos y puede ser costoso correrlo en cada PR — decisión de frecuencia queda documentada en el propio ticket al implementar).
  - Falla con un mensaje claro indicando qué app/endpoint tiene la discrepancia.
- **Dependencias:** DQ-01, DQ-06 (para tener algo que verificar correctamente antes de escribir el chequeo).
- **Prioridad:** P1 · **Esfuerzo:** M
- **Hecho (2026-09-08):** `scripts/smoke-check-pagination.mjs` — para cada endpoint con `{total, limit, offset, hasMore}` (5 cubiertos: `radar-ejecucion` `/api/execution`, `infraestructura-mtc` `/api/aerodromos` y `/api/terminales-portuarios`, `residuos-solidos` `/api/residuos`, `instituciones-educativas` `/api/instituciones`), pagina el universo completo y compara la suma de filas contra `total`; falla con un mensaje explícito (`FAIL <app> <path> — total declarado (X) no coincide con la suma de filas paginadas (Y)...`) si no coincide. Verificado en vivo contra los 5 servidores locales: 5/5 en verde (2,594 / 152 / 151 / 1,891 / 9,391 filas respectivamente).
  - **Decisión de frecuencia (criterio de aceptación explícito):** este script corre **solo on-demand** (`node scripts/smoke-check-pagination.mjs`, opcionalmente `API_BASE=https://api.rastro.pe` contra producción), no está cableado a un workflow de CI programado. `.github/workflows/ci.yml` corre los tests de cada app con el pool de Postgres mockeado (sin datos reales) — habilitar este chequeo en un schedule de CI requeriría levantar Postgres + ingerir datos reales dentro del workflow, una pieza de infraestructura nueva y más cara que el script en sí. Se documenta como decisión deliberada, no como trabajo pendiente oculto: si se prioriza automatizarlo, es un ticket de infraestructura de CI aparte.

---

## ÉPICA 4 — Decisiones de alcance pendientes (Sprint 3, evaluación)

### DQ-11 · ADR: aceptar el score institucional parcial o priorizar DQ-05 — ⚠️ Premisa resuelta por DQ-05, redefinido

- **Historia original:** decisión explícita sobre si el score institucional (tope de 2/5 componentes) era aceptable o bloqueaba la utilidad del score.
- **Estado:** DQ-05 se resolvió corriendo `crossref:build` en ambas apps — el score ya no está topado en 2/5 (93/130 entidades de La Libertad tienen 3+, 49 tienen 5/5). La pregunta original ya no aplica tal cual.
- **Redefinido como:** ADR sobre **operación continua del crossref**, no sobre aceptar un score roto. Documentar: (a) que el score depende de 2 jobs manuales (`crossref:build` de infobras y compras-publicas) que deben re-correrse periódicamente a medida que entran nuevas entidades/proyectos/adjudicaciones, (b) qué pasa si alguno vuelve a vaciarse o desactualizarse sin que nadie lo note (mismo riesgo que ya se vivió), (c) decisión sobre automatizar ambos jobs (reabrir ADR-0016, que evaluó esto para otros conectores y lo difirió) o, como mínimo, agregar un chequeo de salud (ej. alertar si `entity_crosswalk` tiene 0 filas o no se ha recalculado en N días).
- **Criterios de aceptación:**
  - ADR (siguiente número libre en `docs/adr/` al implementar) con la decisión sobre automatización o chequeo de salud del crossref.
  - Si se decide un chequeo de salud: se implementa (puede ser tan simple como un endpoint `/health/crossref` que reporte `rowCount` y `lastBuiltAt`).
- **Dependencias:** ninguna (DQ-05 ya resuelto).
- **Prioridad:** P2 · **Esfuerzo:** S (documento de decisión + chequeo simple si aplica)
- **Hecho (2026-09-08):** [ADR-0022](adr/0022-crossref-build-operacion-continua.md). Decisión: no automatizar `crossref:build` (mismo bloqueador de infraestructura que ADR-0016 — Postgres solo en loopback, no alcanzable desde runners cloud). El chequeo de salud del criterio de aceptación ya existía (`GET /api/crossref/salud`, implementado en SI-07 el 2026-09-07) — este ADR documenta que es la mitigación real para este ciclo y por qué, en vez de dejarlo como una decisión implícita.

### DQ-12 · Evaluar inversión en CEPLAN Geo

- **Historia:** Como equipo de datos, quiero saber si vale la pena invertir en ingerir más capas de CEPLAN Geo (infraestructura, denominador poblacional fuera de Trujillo) o aceptar el gap actual.
- **Contexto verificado:** solo 3 capas están ingeridas (límites departamental/provincial/distrital); la tabla de infraestructura tiene 0 filas a nivel nacional (no solo La Libertad); el denominador de población solo cubre los 11 distritos de la provincia de Trujillo, confirmado explícitamente al probar Pataz y Ascope (0 resultados) — el propio código de `denominadores.ts` (línea ~136, verificar al implementar) documenta esto como decisión conocida, no como bug.
- **Criterios de aceptación:**
  - Documento de evaluación que responde: ¿qué costo tiene ingerir infraestructura y población para las 11 provincias restantes?, ¿qué valor de producto desbloquea?, ¿hay una fuente de origen disponible o el gap es de la fuente misma (INEI/CEPLAN no publica ese denominador a ese nivel)?
  - Si se decide invertir: ticket de seguimiento con alcance definido, fuera de este backlog.
  - Si no: la razón queda documentada y el ticket se cierra como "evaluado, diferido".
- **Dependencias:** ninguna. Sin fecha comprometida.
- **Prioridad:** P2 · **Esfuerzo:** S (evaluación)
- **Evaluación (2026-09-08):** el hallazgo de "infraestructura con 0 filas a nivel nacional" del contexto original **no era un gap de cobertura real — era el mismo patrón de DQ-05** (un script de ingesta manual que nunca se había corrido en este entorno). Corriendo `npm run ingest:infrastructure` (ya existente, sin cambios de código) se poblaron **227 filas nacionales** (135 aeropuertos + 92 puertos, capas GeoServer `geoceplan:cn_aeropuertosx`/`geoceplan:cn_puertosx`, sin filtro territorial en el conector) en segundos. Verificado en vivo contra `GET /api/infrastructure?departamento=13`: incluye aeródromos reales de Pataz (ej. "AERODROMO CHAGUAL", administrado por Compañía Minera Poderosa) y puertos de la provincia de Trujillo (Salaverry, Chicama) — cobertura nacional real, no limitada a Trujillo. **No hace falta invertir en nada para esta parte — solo correr el script existente en el entorno donde sirve esta app**, y considerar el mismo tipo de chequeo de salud que SI-07 le dio a `entity_crosswalk` (ej. `GET /api/infrastructure/salud` reportando `filas`/`ultimaConstruccion`) para que no vuelva a pasar desapercibido — recomendación, no implementado en esta evaluación.
  - **El denominador de población sí es un gap real, distinto en naturaleza.** `population_by_ubigeo` es un array TypeScript escrito a mano (`data/inei-poblacion-trujillo-censo2017.ts`, 11 filas, una por distrito de la provincia de Trujillo, tipeado directamente desde tablas del Censo 2017 de INEI) — no un conector de ingesta automatizable como infraestructura. Investigado si existe una fuente descargable en formato abierto (CSV/API) para ampliar a los 83 distritos de La Libertad o a nivel nacional: INEI publica los resultados vía **REDATAM** (`censos2017.inei.gob.pe/redatam/`), un sistema de consulta interactivo por web, no un CSV/API descargable directamente — ampliar la cobertura requeriría scrapear ese sistema (esfuerzo de conector nuevo, no una corrida de script existente) o conseguir el Excel/PDF oficial de resultados definitivos por distrito y tipearlo/parsearlo, igual que se hizo la primera vez para Trujillo.
  - **Decisión:** no se invierte en ampliar población en esta iteración — el costo real (conector REDATAM nuevo o transcripción manual de ~83-1,874 filas) no está justificado sin un caso de uso concreto que lo requiera hoy. Cerrado como "evaluado, diferido" solo para el denominador poblacional. La parte de infraestructura queda resuelta (no diferida) con la corrida del script — no requiere ticket de seguimiento, es un recordatorio operativo.

### DQ-13 · Evaluar fuente adicional para autoridades subnacionales electas

- **Historia:** Como equipo de producto, quiero saber si conviene agregar una fuente que cubra alcaldes/regidores electos, ya que JNE (fuente actual) solo cubre cargos del Congreso.
- **Contexto verificado:** el dataset de `autoridades-electas` (208 filas nacionales) cubre únicamente Diputados (130), Senadores (60), Parlamento Andino (15) y Presidencia/Vicepresidencias (3) de la Elección General 2026 — confirmado que las 208 filas completas tienen `provincia`/`distrito` nulos, no es un recorte de La Libertad. No existe en el conector actual ningún dataset de autoridades municipales/regionales.
- **Criterios de aceptación:**
  - Documento de evaluación que identifica si existe una fuente pública (ONPE/JNE, padrón de autoridades municipales y regionales electas) con datos abiertos accesibles, y el costo estimado de un conector nuevo.
  - Si se decide construir: ticket de seguimiento fuera de este backlog (implica un conector nuevo, fuera del alcance de "corregir lo existente" de este PRD).
  - Si no: razón documentada, ticket cerrado como "evaluado, diferido".
- **Dependencias:** ninguna. Sin fecha comprometida.
- **Prioridad:** P2 · **Esfuerzo:** S (evaluación)
- **Evaluación (2026-09-08):** no hace falta un conector nuevo. El mismo recurso "actual" de JNE (`raw_autoridades_electas_batches` / migración `001_init.sql`) ya modela un esquema genérico de 4 ámbitos (`ambito IN ('NACIONAL','REGIONAL','PROVINCIAL','DISTRITAL')`), y el pipeline de ingesta (`ingest/normalize.ts`, `AMBITOS` set) ya normaliza y persiste cualquiera de los 4 sin filtro hardcodeado a NACIONAL — hoy solo trae Nacional porque es lo único proclamado (Presidencia/Senado/Diputados/Parlamento Andino de la Elección General 2026). Alcaldes, regidores y gobernador regional aparecerán en el mismo recurso automáticamente en cuanto JNE proclame los resultados de las Elecciones Regionales y Municipales de **octubre 2026** — solo requiere volver a correr la ingesta tras esa fecha, no desarrollo nuevo.
  - **Nota aparte (dataset histórico, no ingerido a propósito):** existe un segundo recurso de JNE ("histórico fechado", 39,342 filas 2014-2022) que sí tiene autoridades regionales/municipales (ej. "REGIDOR DISTRITAL") pero con DNI sin enmascarar — se decidió deliberadamente NO ingerirlo en esta primera versión hasta una revisión legal de enmascarado (mismo criterio ya aplicado en `perfilprov-conformacion` y el cruce por DNI de `proveedores-sancionados`). Si en el futuro se quiere cobertura histórica (no solo desde octubre 2026 en adelante), ese es un ticket aparte con su propia revisión de PII — no forma parte de este DQ-13.
  - **Cerrado como "evaluado, sin acción de código requerida — reingesta programada tras octubre 2026".**

### DQ-14 · Validar `distrito` de INFOBRAS contra un catálogo de territorios en el ingest

- **Historia:** Como equipo de datos, quiero que una obra con un `distrito` incoherente con su propio nombre/entidad quede marcada en el momento de la ingesta, no descubierta manualmente meses después al construir un reporte.
- **Contexto verificado (hallazgo 2026-09-08, durante la construcción del artefacto de la provincia de Pataz):** 7 de las 1,336 obras de Pataz en `infobras.public_works` traen un `distrito` que no pertenece ni a Pataz ni a La Libertad — "ANDAHUAYLILLAS" y "CCARHUAYO" son distritos reales de la provincia de Quispicanchi, Cusco; "TURPAY" no existe como distrito en el Perú (variante mal escrita de "URPAY"). En los 7 casos, tanto el nombre de la obra ("...DISTRITO DE HUAYLILLAS...", "...DISTRITO DE URPAY...", "...DEL DISTRITO DE HUAYO...") como la entidad ejecutora (ej. "MUNICIPALIDAD DISTRITAL DE HUAYLILLAS") identifican sin ambigüedad el distrito real — es un error de tipeo/mapeo en el propio XLSX de Contraloría, no un problema de nuestro conector.
  - **Alcance verificado:** se auditaron las 10,134 obras de todo el departamento de La Libertad contra el universo real de sus 83 distritos (lista estática construida ad-hoc para esta auditoría) — estas mismas 7 filas de Pataz son las **únicas** con esta anomalía en todo el departamento. No se encontró el mismo patrón en ninguna otra provincia de La Libertad en este corte.
  - **Causa raíz de por qué no se detecta solo:** `apps/infobras/api/src/ingest/normalize.ts` ingiere `distrito`/`provincia` como texto libre (`optionalText`) sin ninguna validación contra un catálogo de territorios. La fuente INFOBRAS tampoco publica una columna `ubigeo` que permita una validación determinística — el pipeline confía enteramente en que el XLSX de Contraloría escribió el nombre correctamente.
  - **Riesgo si no se corrige:** el mismo tipo de error puede aparecer sin ser notado en cualquier otro departamento del país (INFOBRAS es un dataset nacional) — hoy no hay ninguna guardia de código que lo detecte; se descubre solo si alguien construye manualmente un reporte a nivel distrital y nota el número no cuadra.
- **Criterios de aceptación:**
  - En el ingest de `infobras`, agregar una validación ligera de `distrito` contra un catálogo estático de distritos por departamento (no bloqueante — no se debe rechazar la fila, la obra es real y sí pertenece al departamento).
  - Filas con `distrito` no reconocido para su `departamento` quedan marcadas (columna booleana o tabla de "territorio sospechoso") en vez de insertarse silenciosamente como si el dato fuera confiable.
  - Exponer esa marca en el endpoint (`GET /api/public-works`) o en `GET /api/public-works/resumen` para que un consumidor pueda filtrarlas o al menos saber que existen, sin tener que auditar la base de datos manualmente.
  - Test de regresión con las 7 filas reales de Pataz como fixture.
- **Dependencias:** ninguna. No requiere ningún otro conector.
- **Prioridad:** P2 · **Esfuerzo:** S
- **Implementado (2026-09-08):** el catálogo se amplió a cobertura **nacional** (no solo La Libertad) — se encontró y reutilizó la tabla `territories` de `ceplan-geo` (1,874 distritos, coincide exactamente con el total oficial INEI), exportada una sola vez a `ingest/distritos-conocidos.ts` (infobras no tiene acceso directo a la base de `ceplan-geo`, son apps independientes). Migración `005_distrito_sospechoso.sql` agrega la columna `distrito_sospechoso` (boolean, default false, no bloqueante). Verificado en vivo tras re-ingerir La Libertad completo: `GET /api/public-works/resumen?departamento=LA%20LIBERTAD` reporta `conDistritoSospechoso: 7` — exactamente las 3 combinaciones provincia/distrito conocidas (ANDAHUAYLILLAS×2, CCARHUAYO×3, TURPAY×2), ninguna falsa alarma sobre las 10,127 filas restantes. Suite completa 96/96 en verde, incluidos tests de regresión con los 3 casos reales como fixture.

### DQ-15 · Cobertura de homicidios ausente en el catálogo de datos de seguridad

- **Historia:** Como equipo de producto, quiero saber si existe una fuente pública reutilizable de homicidios por territorio, dado que `seguridad-ciudadana` (SIDPOL) no los cubre en absoluto.
- **Contexto verificado (2026-09-08):** se auditaron las 369,100 filas completas de `police_reports` (todo el Perú, 2018-2026, no solo La Libertad) — existen exactamente 7 modalidades en el universo completo (Otros, Violencia contra la mujer e integrantes, Hurto, Robo, Estafa, Extorsión, Secuestro). "Homicidio" no aparece en ningún departamento. Es consistente con el diseño del dataset: SIDPOL registra *denuncias*, y un homicidio se investiga de oficio (Policía/Fiscalía), no por denuncia de un particular — no es un defecto de nuestro conector, es el alcance real de la fuente.
  - El INEI publica series de tasa de homicidios por departamento (coordinadas con PNP y Ministerio Público) en reportes periódicos (ej. tasa nacional 2025: 10.7 por 100 mil habitantes) — pero solo a nivel departamental, como estudio PDF, sin dataset abierto descargable a nivel de provincia/distrito identificado en esta investigación.
- **Criterios de aceptación:**
  - Documento de evaluación: ¿existe un dataset abierto de homicidios a nivel provincial/distrital (Ministerio Público, SISCRI, INEI) que se pueda ingerir con el mismo patrón de conector ya usado en el catálogo?
  - Si no existe a ese nivel de detalle: documentar la limitación explícitamente en `docs/conectores.md` (ficha de `seguridad-ciudadana`) para que quede visible sin tener que redescubrirla, y cerrar como "evaluado, fuente no disponible a nivel distrital".
  - Si existe: ticket de seguimiento fuera de este backlog (conector nuevo).
- **Dependencias:** ninguna. Sin fecha comprometida.
- **Prioridad:** P2 · **Esfuerzo:** S (evaluación)
- **Evaluación (2026-09-08):** no se encontró un dataset abierto de homicidios a nivel de distrito/provincia administrativo (el mismo nivel que usa el resto del catálogo). Sí existe un candidato a investigar con más profundidad antes de descartarlo del todo: el **Ministerio Público** publica `[MPFN] Delitos` en `datosabiertos.gob.pe` — descrito como "cantidad de delitos denunciados ante el Ministerio Público a nivel nacional por tipo de delito según distrito fiscal", que aparentemente incluye "homicidio doloso" como categoría. **No se pudo verificar el schema exacto ni el formato de descarga en esta evaluación** — `datosabiertos.gob.pe` no resolvió por DNS desde este entorno al intentar consultarlo directamente, así que esta evaluación se apoya solo en resultados de búsqueda, no en inspección directa del archivo (mismo estándar de rigor que el resto del catálogo exige antes de construir un conector — no se debe iniciar el conector sin esa verificación).
  - **Limitación de granularidad conocida de antemano, aunque se confirme el dataset:** un "distrito fiscal" del Ministerio Público (~34 en todo el Perú) es una circunscripción judicial, no un distrito administrativo — agrupa varias provincias o incluso departamentos completos bajo una sola fiscalía superior. No sería directamente comparable con el resto del catálogo (que reporta por distrito/provincia INEI), aunque sí bajaría el nivel de detalle de "solo departamento" (INEI/PDF) a "distrito fiscal" (más fino, pero no equivalente a UBIGEO distrital).
  - **El Observatorio de Criminalidad del propio MPFN** (`mpfn.gob.pe/observatorio`) publica mapas de homicidio, pero el más reciente encontrado en esta búsqueda cubre 2013-2017 (desactualizado) y el sitio está detrás de un captcha (Radware) que bloquea acceso automatizado.
- **Cerrado como "evaluado, fuente no disponible al nivel de detalle del catálogo — candidato (`[MPFN] Delitos`) identificado pero no verificado, requiere inspección directa del archivo antes de decidir construir un conector."**

### DQ-16 · Corte vigente por defecto en `renamu`/municipalidades + colapso de `anio_fiscal` en `radar-ejecucion`

- **Historia:** Como consumidor de `renamu` o `radar-ejecucion`, quiero que una consulta sin filtro de año no me duplique/mezcle entidades de años distintos, mismo criterio ya aplicado en DQ-03/DQ-04.
- **Contexto verificado (hallazgo 2026-09-08, durante la evaluación de fuentes panel de DQ-09):** dos casos del mismo patrón, en distinto estado de riesgo:
  1. **`renamu` — `GET /api/municipalidades`** (`apps/renamu/api/src/routes/municipalidades.ts`) acepta `anio` como filtro opcional pero **no filtra al año más reciente por defecto** — confirmado en vivo: sin filtro, Pataz devuelve 26 filas (13 municipalidades × 2 años, 2024 y 2025) en vez de las 13 vigentes. El endpoint hermano `GET /api/equipamiento` de la misma app **sí** filtra (`ORDER BY anio DESC LIMIT 1` por ubigeo) — inconsistencia entre los dos endpoints de una misma app. No infla ningún total numérico (es un registro de identidad, no un conteo agregado), pero un consumidor que haga `.length` para contar municipalidades se equivoca 2x.
  2. **`radar-ejecucion` — `LATEST_BUDGET_CTE`** (`packages/shared-queries/src/index.ts`) hace `DISTINCT ON (b.entity_code, b.funcion, b.anio_fiscal, COALESCE(b.meta_departamento,''), COALESCE(b.generica,''))` — `anio_fiscal` es parte de la clave de dedupe, así que **no colapsa entre años fiscales distintos**. Si se ingiere más de un año fiscal, `GET /api/execution` (y todo lo que se apoye en `LATEST_BUDGET_CTE`: `salud-institucional`, `radar_ejecucion_execution_resumen`, etc.) devolvería todos los años mezclados sin que nada lo detecte, reproduciendo el mismo bug de DQ-03/DQ-04. **No verificable hoy**: el entorno de desarrollo solo tiene el año fiscal 2026 ingerido — no se pudo confirmar el síntoma en vivo, solo la causa estructural leyendo el código.
- **Criterios de aceptación:**
  - `GET /api/municipalidades` de `renamu` filtra por defecto al `anio` más reciente (mismo patrón `MAX(anio)` de DQ-04), con un parámetro explícito (`historico=true` o `anio=YYYY`) para el comportamiento multi-año — consistente con `GET /api/equipamiento` de la misma app.
  - `LATEST_BUDGET_CTE` (o el código que lo consume en `radar-ejecucion`) decide explícitamente qué hacer si se ingiere un segundo año fiscal: filtrar al año vigente por defecto (requiere un parámetro `anio` obligatorio o un default documentado), o mantener el comportamiento actual con una advertencia explícita en la respuesta si `resultados` mezcla más de un `anioFiscal` — cualquiera de las dos es aceptable, lo que no es aceptable es que quede silencioso.
  - Test de regresión para `renamu`: sin parámetros, `GET /api/municipalidades?departamento=LA%20LIBERTAD` devuelve una fila por municipalidad (84), no una por año ingerido.
  - Test de regresión para `radar-ejecucion`: fixture con 2 años fiscales para la misma entidad confirma el comportamiento decidido (filtro o advertencia explícita), no una mezcla silenciosa.
  - `docs/data-contracts/paneles-multi-corte.md` (DQ-09) se actualiza para reflejar el comportamiento corregido de ambos casos.
- **Dependencias:** ninguna técnica. El caso de `radar-ejecucion` es más difícil de verificar en vivo porque requiere ingerir un segundo año fiscal en desarrollo primero.
- **Prioridad:** P2 · **Esfuerzo:** S (renamu) + S (radar-ejecucion, incluye decidir el comportamiento antes de codificarlo)
- **Hecho (2026-09-08):**
  1. **`renamu`**: `GET /api/municipalidades` filtra por defecto a `MAX(anio)`; `historico=true`/`anio=YYYY` para el comportamiento multi-año — mismo patrón que `GET /api/equipamiento`, consistencia restaurada. Verificado en vivo: La Libertad 168 → **84** filas.
  2. **`radar-ejecucion`**: se optó por la advertencia explícita, no por cambiar el filtro por defecto de `LATEST_BUDGET_CTE` (compartido por 5 apps, no se podía verificar el cambio contra datos reales multi-año sin arriesgar romper otros consumidores). `GET /api/execution` expone `coberturaTemporal.aniosFiscalesUsados`/`advertenciaMultiAnio`; `GET /api/execution/resumen` expone el mismo par de campos, calculado con `ARRAY_AGG(DISTINCT b.anio_fiscal)` en la propia query de agregación (ahí el riesgo es mayor porque SUMA, no solo lista). Ambos quedan `null`/vacío cuando no hay mezcla. Verificado con tests que simulan 2 años fiscales (91/91 en verde) — no verificable en vivo hoy porque el entorno de desarrollo solo tiene 2026 ingerido.
  - `docs/conectores.md` y `docs/data-contracts/paneles-multi-corte.md` actualizados en ambos casos.

### DQ-17 · Crosswalk infobras cruza departamentos; `distrito_sospechoso` fuera de Pataz tras la ingesta nacional de CT-06

- **Historia:** Como consumidor de `salud-institucional` o de `infobras`, quiero que el crosswalk `entity_crosswalk` (ejecucion ↔ infobras) nunca vincule una entidad de un departamento con obras de otro, y que la validación de `distrito_sospechoso` (DQ-14) se audite sobre el universo nacional real, no solo sobre los departamentos que estaban ingeridos cuando se verificó por primera vez.
- **Contexto verificado (hallazgo 2026-09-09, al exponer `advertencias.obrasConDistritoSospechoso` en el score institucional — SI-09):** CT-06 (2026-09-08) ingirió por primera vez las 25 regiones de INFOBRAS en el entorno de desarrollo (antes solo había 5: LA LIBERTAD, LAMBAYEQUE, PIURA, CAJAMARCA, CUSCO). Esa ingesta trajo filas nuevas que expusieron dos problemas que DQ-14 no pudo ver porque esos datos no existían localmente todavía:
  1. **Crosswalk fuzzy-match cruzando departamentos:** `entity_crosswalk` vincula la entidad `1134 — REGION LA LIBERTAD-PROYECTO ESPECIAL CHAVIMOCHIC` (ejecución, La Libertad) con la obra `codigo_infobras 31872 — PROYECTO ESPECIAL CHINECAS` (Áncash, provincia Santa) — dos proyectos regionales de irrigación reales, sin relación entre sí, unidos solo por el patrón textual "PROYECTO ESPECIAL ___". Contamina el componente `obrasNoParalizadas` de esa entidad en `salud-institucional` con obras que no le pertenecen.
  2. **Fila de INFOBRAS con `departamento` completamente errado, no solo `distrito` (a diferencia de los 7 casos de Pataz de DQ-14):** `codigo_infobras 516316`, `entidad_nombre = "MUNICIPALIDAD DISTRITAL DE SARIN"` (Sánchez Carrión, La Libertad), pero sus columnas `departamento/provincia/distrito` dicen `AYACUCHO/HUANTA/CHAVIN DE HUANTAR` — una combinación real de lugares (por eso `distritoEsSospechoso()` no la marca como distrito ajeno a su propio departamento declarado), pero el propio `nombre_obra` dice explícitamente "...DISTRITO DE SARIN SANCHEZ CARRION LA LIBERTAD...". El crosswalk sí encontró la entidad correcta por nombre; la fuente tiene el departamento de esa fila mal cargado.
  - Verificado en vivo: consulta directa a `public_works` confirma exactamente 7 filas `distrito_sospechoso=true` en La Libertad (coincide con DQ-14); el join vía `entity_crosswalk` usado por `salud-institucional` suma 9 repartidas en 6 entidades, con las 2 filas de arriba como origen de la diferencia.
- **Criterios de aceptación:**
  - Auditar (o re-generar) `entity_crosswalk` para excluir/corregir vínculos entre entidades y obras de departamentos distintos — mínimo, resolver el caso Chavimochic↔Chinecas documentado arriba.
  - Correr una auditoría de `distrito_sospechoso` sobre las 25 regiones ahora disponibles (no solo La Libertad, como hizo DQ-14 originalmente) y documentar cuántos casos reales aparecen a nivel nacional.
  - Decidir y documentar qué hacer con filas como la de Sarín (departamento completo errado, no solo distrito) — probablemente requiere una segunda validación en el ingest de INFOBRAS, distinta de `distritoEsSospechoso()` (que solo valida distrito-dentro-de-departamento-declarado).
- **Dependencias:** CT-06 (ya cerrado — es la causa de que este hallazgo sea visible ahora).
- **Prioridad:** P1 · **Esfuerzo:** M
- **Estado:** Pendiente — documentado 2026-09-09, no resuelto esta sesión (se priorizó no expandir el alcance de SI-09 en la misma sesión que lo descubrió).

### SI-09 · Advertencias de calidad de dato en el score institucional (sin pesar en el score)

- **Historia:** Como consumidor del score institucional, quiero ver si los componentes que lo alimentan tienen advertencias de calidad de dato conocidas (ej. obras con distrito dudoso), sin que esas advertencias cambien el cálculo del score — la fórmula debe seguir siendo comparable en el tiempo.
- **Contexto:** el score se calculó al principio del proyecto y no había absorbido señales de calidad de dato descubiertas después (DQ-14, DQ-16). Se evaluó agregar variables nuevas al score compuesto y se descartó: cada variable nueva recalibra las bandas de SI-04 y rompe la comparabilidad histórica. En su lugar, se exponen como campo `advertencias` separado, mismo patrón que ya usa `distrito_sospechoso` en INFOBRAS (marca, nunca pesa).
- **Hecho (2026-09-09):** `GET /api/score` y `GET /api/score/por-provincia` de `salud-institucional` exponen `advertencias.obrasConDistritoSospechoso` por entidad — cuenta de obras (vía el mismo crosswalk que ya usa el componente `obrasNoParalizadas`) marcadas `distrito_sospechoso: true` en INFOBRAS (DQ-14). `null` cuando la entidad no tiene obras cruzadas, nunca `0` falso. No afecta `scoreCompuesto` ni ningún componente — verificado con test dedicado (`obrasNoParalizadas.valor` sigue en 100 con la advertencia en 3). Se evaluó también portar `aniosFiscalesUsados`/`advertenciaMultiAnio` (DQ-16) al componente de ejecución, pero no aplica: la query de `salud-institucional` ya filtra `b.anio_fiscal = $2` explícito (año fijo, default 2026), a diferencia de `radar-ejecucion` — no hay riesgo de mezcla de años que advertir ahí.
- **Efecto colateral:** exponer esta advertencia con datos reales (no solo el fixture de test) encontró el hallazgo de DQ-17 arriba — la propia advertencia funcionó como se diseñó, revelando un problema más profundo en el crosswalk que no era su objetivo original resolver.
- **Verificación:** `apps/salud-institucional/api` — 34/34 tests en verde (`compute.test.ts` + `score-api.test.ts`, 3 casos nuevos). Verificado en vivo contra el servidor local: 6 entidades de La Libertad con `obrasConDistritoSospechoso > 0` (incluye las 2 relacionadas al hallazgo DQ-17).
