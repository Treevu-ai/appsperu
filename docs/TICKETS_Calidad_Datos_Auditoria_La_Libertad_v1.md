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

### DQ-12 · Evaluar inversión en CEPLAN Geo

- **Historia:** Como equipo de datos, quiero saber si vale la pena invertir en ingerir más capas de CEPLAN Geo (infraestructura, denominador poblacional fuera de Trujillo) o aceptar el gap actual.
- **Contexto verificado:** solo 3 capas están ingeridas (límites departamental/provincial/distrital); la tabla de infraestructura tiene 0 filas a nivel nacional (no solo La Libertad); el denominador de población solo cubre los 11 distritos de la provincia de Trujillo, confirmado explícitamente al probar Pataz y Ascope (0 resultados) — el propio código de `denominadores.ts` (línea ~136, verificar al implementar) documenta esto como decisión conocida, no como bug.
- **Criterios de aceptación:**
  - Documento de evaluación que responde: ¿qué costo tiene ingerir infraestructura y población para las 11 provincias restantes?, ¿qué valor de producto desbloquea?, ¿hay una fuente de origen disponible o el gap es de la fuente misma (INEI/CEPLAN no publica ese denominador a ese nivel)?
  - Si se decide invertir: ticket de seguimiento con alcance definido, fuera de este backlog.
  - Si no: la razón queda documentada y el ticket se cierra como "evaluado, diferido".
- **Dependencias:** ninguna. Sin fecha comprometida.
- **Prioridad:** P2 · **Esfuerzo:** S (evaluación)

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
