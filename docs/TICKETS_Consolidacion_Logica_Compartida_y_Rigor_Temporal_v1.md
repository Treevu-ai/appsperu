# Tickets — Consolidación de Lógica Compartida y Rigor Temporal v1

**Producto:** AppsPerú (backend/ingesta/mcp-server)
**PRD:** [`docs/PRD_Consolidacion_Logica_Compartida_y_Rigor_Temporal_v1.md`](PRD_Consolidacion_Logica_Compartida_y_Rigor_Temporal_v1.md)
**Serie de tickets:** **CX-** (continúa la serie CX-01..CX-06 de [`docs/TICKETS_Confiabilidad_Conectores_y_Cruces_v1.md`](TICKETS_Confiabilidad_Conectores_y_Cruces_v1.md), cerrada; arranca en CX-07 para no colisionar)
**Regla transversal:** todo campo nuevo es aditivo; ningún endpoint existente cambia de forma incompatible; "sin dato" nunca se convierte en un valor que parezca una conclusión verificada; toda ampliación de `workspaces` pasa primero por el ADR de CX-07.
**Estimación:** XS ≤ medio día · S ≤ 1 día · M 2–3 días · L 4–6 días (esfuerzo relativo, no calendario).

> **Estado (2026-09-05):** CX-07, CX-08, CX-09, CX-10, CX-11, CX-12 y CX-13 **cerrados**.
> CX-14 (nuevo, hallazgo de CX-10) sin iniciar — requiere acceso a datos en vivo, no
> ejecutable en esta sesión. CX-07 resuelto en
> [ADR-0019](adr/0019-alcance-workspace-utilidades-compartidas.md) — decisión: ampliar
> `workspaces` incrementalmente. CX-08 consolidó `LATEST_BUDGET_CTE` — la investigación
> encontró **11 copias reales, no 5** — y sumó `radar-ejecucion`, `salud-institucional`,
> `radar-inversiones`, `ceplan-estrategico`, `actividad-agraria` y `seguridad-ciudadana` al
> workspace (6 apps, no 4), además de corregir el mecanismo de build de paquetes en CI para
> que no falle cuando un paquete (como `entity-matcher`, que esta rama no tiene) no existe.
> CX-09 consolidó `extractRuc()`/`temporal-status` en `packages/shared-identity` y sumó
> `proveedores-sancionados` al workspace; el nuevo campo temporal de `identidad-fiscal` es hoy
> siempre `"NO_VERIFICABLE"` porque `contribuyentes` no versiona su estado (honesto, no un
> defecto). CX-13 conectó `packages/http-client`, migrando `compras-publicas`; `ceplan-geo`
> queda pendiente (no está en `workspaces`). CX-11 extendió `catalog.test.ts` de 1 a las 14
> apps (17 tests, verificado que detecta drift real). CX-10 encontró que la premisa original
> (3 implementaciones de sobrecosto) era incorrecta — son 2, no 3 — y resolvió en
> [ADR-0020](adr/0020-umbral-sobrecosto-unificado.md): `costDriftPct` consolidada en
> `packages/shared-signals` con un umbral nombrado (`SOBRECOSTO_UMBRAL_PCT = 0`, sin evidencia
> para otro valor), sin forzar un refactor de performance riesgoso en `salud-institucional`.
> CX-12 aplicado directo.

---

## ÉPICA 1 — Decidir dónde vive la lógica compartida

### CX-07 · ADR de alcance del workspace compartido para utilidades cross-app — ✅ CERRADO

- **Historia:** Como equipo de datos, quiero decidir explícitamente qué apps pueden compartir código no relacionado a entity-matching, para no repetir la duplicación de `LATEST_BUDGET_CTE` y `extractRuc()` la próxima vez que aparezca una utilidad cross-app, y sin reabrir el alcance ya cerrado de ADR-0017.
- **Contexto verificado en código:** el `package.json` raíz declara `workspaces: ["packages/*", "apps/compras-publicas/api", "apps/infobras/api", "apps/identidad-fiscal/api"]` — su propia `description` dice explícitamente *"ninguna otra se agregó a workspaces a propósito, para no ampliar el alcance de este cambio"* (ADR-0017). Las utilidades identificadas en CX-08/CX-09 son necesarias en `radar-ejecucion`, `salud-institucional`, `radar-inversiones`, `ceplan-estrategico` y `proveedores-sancionados` — ninguna de las 5 está en el workspace actual. `.github/workflows/ci.yml` (versión real en `origin/master`, no la de esta rama) ya documenta con un comentario extenso el costo real de que una app entre al workspace: pierde su `package-lock.json` propio, y el paso "Install dependencies" corre desde la raíz cuando no hay lockfile local — con un bug ya visto en CI real (`npm ci` enlaza el paquete pero no corre su `build`; hubo que compilar `packages/entity-matcher` explícitamente después del `npm ci` del workspace).
- **Resolución:** [ADR-0019](adr/0019-alcance-workspace-utilidades-compartidas.md). Decisión: ampliar `workspaces` **incrementalmente** (una app entra solo cuando CX-08 o CX-09 la toquen), reutilizando el mecanismo de CI de ADR-0017 en vez de una alternativa nueva (`file:` dependency u otra), porque ese mecanismo ya está pagado y probado. Un paquete por dominio de utilidad (`packages/shared-queries` para CX-08, `packages/shared-identity` para CX-09), sin reabrir el alcance de `entity-matcher`.
- **Hallazgo no previsto en el PRD original**: `packages/http-client/src/index.ts` ya existe, comiteado, con `fetchJson()`/`HttpRequestError` tipado — pero sin `package.json`, sin estar en ningún workspace, y sin ningún consumidor. El mismo patrón está reimplementado suelto en `apps/ceplan-geo/api/src/lib/api-clients.ts` y en dos conectores de `apps/compras-publicas/api/src/ingest/` (`perfilprov-conformacion-connector.ts`, `seace-public-minor-contracts-connector.ts`). Se abrió como **CX-13**.
- **Dependencias:** ninguna. Desbloqueó CX-08 y CX-09.
- **Prioridad:** P0 · **Esfuerzo:** S

---

## ÉPICA 2 — Eliminar duplicación de mayor riesgo

### CX-08 · Extraer `LATEST_BUDGET_CTE` a un módulo compartido — ✅ CERRADO

- **Historia:** Como equipo de datos, quiero que la lógica de deduplicación de reingestas de presupuesto (`LATEST_BUDGET_CTE`) exista en un solo lugar, para corregir un bug futuro una sola vez y no en varios archivos que pueden divergir sin que nadie lo note.
- **Contexto verificado en código:** el bloque `WITH latest_budget AS (SELECT DISTINCT ON (entity_code, funcion, anio_fiscal, COALESCE(meta_departamento, ''), COALESCE(generica, '')) ... ORDER BY ..., fecha_corte DESC, id DESC)` aparece copiado, carácter por carácter, en: `apps/radar-ejecucion/api/src/db/budget-coverage.ts` (origen), `apps/salud-institucional/api/src/routes/score.ts`, `apps/radar-inversiones/api/src/routes/crossref.ts`, `apps/ceplan-estrategico/api/src/lib/indicators/budget-sql.ts`, `apps/infobras/api/src/routes/crossref.ts`.
- **Corrección sobre la estimación original**: el análisis inicial contó 5 copias; al implementar aparecieron **6 más** que un grep más amplio (`latest_budget` en vez de solo el patrón exacto de columnas) sí detectó: `apps/actividad-agraria/api/src/routes/crossref.ts` (×2, mismo archivo), `apps/seguridad-ciudadana/api/src/routes/crossref.ts` (×2), `apps/compras-publicas/api/src/routes/crossref.ts` (×1), `apps/ceplan-estrategico/api/src/routes/crossref.ts` (×1, distinto del ya contado en `budget-sql.ts`) — **11 copias reales en total**, no 5.
- **Resuelto:**
  - Nuevo paquete `packages/shared-queries` con `LATEST_BUDGET_CTE` como única definición fuente, con 4 tests de regresión sobre el texto SQL.
  - `radar-ejecucion`, `salud-institucional`, `radar-inversiones`, `ceplan-estrategico`, `actividad-agraria` y `seguridad-ciudadana` (6 apps, no 4) se agregaron a `workspaces` del `package.json` raíz; perdieron su `package-lock.json` propio. `infobras` y `compras-publicas` ya estaban en el workspace, solo se les agregó la dependencia.
  - Los 11 sitios (9 archivos) importan `LATEST_BUDGET_CTE` de `@appsperu/shared-queries` en vez de redeclararla — verificado con `grep` del patrón exacto de columnas: cero resultados fuera del paquete. `radar-ejecucion/db/budget-coverage.ts` y `ceplan-estrategico/lib/indicators/budget-sql.ts` la re-exportan (no la redeclaran) para no romper a sus propios consumidores internos (`benchmark.ts`, `tourism.ts`, `sectors.ts`, `execution.ts`, `department-proxy.ts`, `plan-budget-alignment.ts` — todos ya importaban de esos dos archivos locales, así que no necesitaron tocarse).
  - **`.github/workflows/ci.yml` corregido, no solo extendido**: el patrón original de ADR-0017 (`npm run build --workspace=packages/entity-matcher`) hardcodea un nombre — falla con "No workspaces found" en cualquier rama donde ese paquete no exista todavía (como esta). Se reemplazó por un loop sobre `packages/*/` que compila lo que exista, tolerante a paquetes ausentes — no se usó `npm run build --workspaces` (todos) porque eso también intenta compilar las apps del workspace, y una sola con build roto (`compras-publicas`, deuda preexistente no relacionada) tumbaría el step para todo el matrix.
  - Verificado: `tsc --noEmit` limpio en las 8 apps tocadas; tests completos — radar-ejecucion 61/61, salud-institucional 8/8, radar-inversiones 18/18, ceplan-estrategico 24/24, infobras 82/82, actividad-agraria 7/7, seguridad-ciudadana 18/18, compras-publicas 83/83 (mismo fallo preexistente no relacionado que en CX-13).
  - `description` del `package.json` raíz actualizada listando las 6 apps nuevas.
- **Dependencias:** CX-07 (cerrado).
- **Prioridad:** P0 · **Esfuerzo:** M (real: mayor al estimado por el alcance de 11 copias, no 5)

### CX-09 · Extraer `extractRuc()` y aplicar rigor temporal en identidad-fiscal — ✅ CERRADO

- **Historia:** Como analista de riesgo de proveedores, quiero que "proveedor regular" en `identidad-fiscal` distinga si lo era *en el momento del contrato* (no solo hoy), con el mismo rigor que ya existe en `proveedores-sancionados`, para no perder de vista a un proveedor que era irregular cuando ganó una obra pero luego se puso al día.
- **Contexto verificado en código:** `apps/proveedores-sancionados/api/src/lib/temporal-status.ts` exportaba `vigenteEnFecha(fechaAdjudicacion, desde, hasta)` y `consolidarEstadoTemporal`. `apps/identidad-fiscal/api/src/routes/crossref.ts` calculaba `irregular` **sin ningún componente temporal** — `contribuyentes` solo guarda el estado del último batch (`ON CONFLICT (ruc) DO UPDATE`, sobrescribe, no versiona, y no tiene columna de fecha de inicio de estado — confirmado en `apps/identidad-fiscal/api/src/db/migrations/001_init.sql`). `extractRuc()` estaba copiada en 3 archivos: `identidad-fiscal/routes/crossref.ts`, `proveedores-sancionados/routes/crossref.ts`, `salud-institucional/routes/score.ts`.
- **Resuelto:**
  - Nuevo paquete `packages/shared-identity` con `extractRuc()`, `vigenteEnFecha` (parámetro renombrado a `fechaReferencia`, generalizado más allá de solo inhabilitaciones) y `consolidarEstadoTemporal` — 12 tests.
  - `proveedores-sancionados` agregado a `workspaces`; perdió su `package-lock.json`.
  - Los 3 archivos importan `extractRuc()` del paquete; `apps/proveedores-sancionados/api/src/lib/temporal-status.ts` quedó como re-export desde `@appsperu/shared-identity` (mismo patrón que `budget-coverage.ts`/`budget-sql.ts` en CX-08) — su test existente (`__tests__/temporal-status.test.ts`) sigue pasando sin tocarlo, sirviendo como test de regresión real.
  - `GET /api/crossref` de `identidad-fiscal` agrega `estadoTributarioEnFechaAdjudicacion: true | false | "NO_VERIFICABLE"`, aditivo, sin tocar `irregular`. **Como `contribuyentes` no tiene fecha de inicio de estado, el valor es siempre `"NO_VERIFICABLE"` hoy** — comportamiento honesto y explícitamente permitido por este mismo criterio de aceptación, documentado en un comentario en el código explicando por qué (no se inventa una fecha que SUNAT no publica; si el padrón algún día versiona el estado, solo hay que pasarle `desde`/`hasta` reales a la misma llamada).
  - Verificado: `tsc --noEmit` limpio y tests en verde en las 3 apps — identidad-fiscal 9/9, proveedores-sancionados 16/16, salud-institucional 8/8.
- **Dependencias:** CX-07 (cerrado), después de CX-08 (reutilizó su extensión de CI del workspace).
- **Prioridad:** P0 · **Esfuerzo:** M

---

## ÉPICA 3 — Consistencia de criterio y verificación de catálogo

### CX-10 · ADR de umbral unificado de "sobrecosto" — ✅ CERRADO

- **Historia:** Como fiscalizador que compara señales entre INFOBRAS e inversiones, quiero saber si "sobrecosto" significa lo mismo en ambas fuentes, para no comparar un booleano sin umbral contra un porcentaje continuo sin darme cuenta.
- **Contexto verificado en código:** `apps/infobras/api/src/signals/signals.ts` — `costDriftPct` devuelve un porcentaje continuo, sin clasificar. `apps/salud-institucional/api/src/routes/score.ts:75` clasifica `con_sobrecosto = costo_actualizado > monto_viable` en SQL (booleano).
- **Corrección sobre el contexto original**: se asumían 3 implementaciones (agregando `radar-inversiones/routes/crossref.ts`); verificado que **esa ruta no tiene ninguna clasificación de sobrecosto** — solo suma totales sin comparar. Son 2 implementaciones reales, no 3.
- **Resuelto en [ADR-0020](adr/0020-umbral-sobrecosto-unificado.md)**: no se inventa un umbral distinto de 0% sin datos reales de la distribución de `costDriftPct` (esta sesión no tiene acceso a la base de datos en vivo para justificar un número). Se decide: (1) `costDriftPct` consolidada en `packages/shared-signals` (nuevo), con `infobras/signals/signals.ts` re-exportándola; (2) constante nombrada `SOBRECOSTO_UMBRAL_PCT = 0` en el mismo paquete, reemplazando el `0` implícito; (3) `salud-institucional/routes/score.ts` **no se reescribe para calcular fila por fila** (cambiaría un `COUNT(*) FILTER` agregado en SQL por traer todas las inversiones a memoria — riesgo de performance fuera de alcance) — se deja la condición SQL con un comentario explícito que la vincula al umbral compartido y advierte cómo actualizarla si el umbral cambia; (4) se abre **CX-14** para analizar la distribución real y decidir con evidencia si el umbral debería subir de 0%.
- **Verificado**: `packages/shared-signals` con 7 tests (`costDriftPct`, `esSobrecosto`, `SOBRECOSTO_UMBRAL_PCT`); `tsc --noEmit` limpio y tests en verde en `infobras` (82/82) y `salud-institucional` (8/8) después del refactor — mismo comportamiento observable, cero cambios de resultado.
- `docs/conectores.md` actualizado en las fichas de `infobras` y `salud-institucional` con el enlace al ADR.
- **Dependencias:** ninguna.
- **Prioridad:** P1 · **Esfuerzo:** M

### CX-14 · Analizar distribución real de `costDriftPct` y decidir umbral con evidencia (nuevo, hallazgo de CX-10)

- **Historia:** Como equipo de datos, quiero saber si "cualquier desvío positivo cuenta como sobrecosto" (0%) es demasiado sensible en la práctica, antes de decidir si vale la pena subir el umbral.
- **Contexto:** ADR-0020 decidió explícitamente no inventar un valor sin datos. `packages/shared-signals` ya expone `costDriftPct`/`esSobrecosto`/`SOBRECOSTO_UMBRAL_PCT` — este ticket es sobre generar la evidencia, no sobre construir el mecanismo (ya existe).
- **Criterios de aceptación:**
  - Consulta (CLI o notebook, no un endpoint nuevo) que calcule la distribución de `costDriftPct` sobre las obras/inversiones ya ingeridas de La Libertad — percentiles, no solo promedio (un promedio se distorsiona fácil con outliers, ej. el caso de `porcentajeAcciones` corrupto que ya se vio en `perfilprov-conformacion-connector.ts`).
  - Decisión documentada (actualización de ADR-0020 o uno nuevo) sobre si `SOBRECOSTO_UMBRAL_PCT` debería cambiar de 0, con la distribución real como evidencia.
  - Si el umbral cambia: actualizar `packages/shared-signals` y la condición SQL de `salud-institucional/routes/score.ts` en el mismo PR (el comentario ya dejado en CX-10 indica exactamente qué cambiar).
  - Si el umbral se mantiene en 0: cerrar el ticket documentando por qué la evidencia no justificó un cambio — no queda abierto indefinidamente sin resolución.
- **Dependencias:** CX-10 (cerrado) — requiere acceso a datos en vivo, no ejecutable en una sesión sin conexión a las bases de producción.
- **Prioridad:** P2 · **Esfuerzo:** S (una vez con acceso a datos)

### CX-11 · Extender `catalog.test.ts` del mcp-server a las 14 apps — ✅ CERRADO

- **Historia:** Como mantenedor del `mcp-server`, quiero que un tool agregado, renombrado o borrado por error en cualquiera de las 14 apps se detecte en CI, no solo si ocurre en `ceplan-geo`.
- **Contexto verificado en código:** `mcp-server/src/__tests__/catalog.test.ts` solo tenía un `describe("MCP catalog")` con dos `it()` que verificaban `ceplan-geo`. `mcp-server/src/apps.ts` exporta `APP_KEYS` con las 14 apps; `mcp-server/src/catalog.ts` tiene `TOOL_CATALOG` con 82 `ToolSpec` reales, cada uno con `app: AppKey`.
- **Resuelto:**
  - Nueva constante `EXPECTED_TOOLS_BY_APP: Record<AppKey, string[]>` generada del catálogo real (82 tools, 14 apps) y versionada en el propio archivo de test.
  - Un `it()` por app (generado con un loop sobre `Object.keys(EXPECTED_TOOLS_BY_APP)`) compara `TOOL_CATALOG.filter(t => t.app === app)` contra la lista esperada.
  - Un `it()` adicional verifica que `APP_KEYS` no tenga ninguna app sin entrada en `EXPECTED_TOOLS_BY_APP` (falla si se agrega una app nueva sin actualizar la lista).
  - Un `it()` de sanidad extra: ningún nombre de tool duplicado en todo el catálogo.
  - **Verificado que la garantía realmente detecta drift**, no solo que el test pasa: renombré temporalmente `salud_institucional_score` en `catalog.ts`, corrí la suite, confirmé que falla exactamente en `"registers exactly the expected tools for salud-institucional"` con el nombre en conflicto en el mensaje, y revertí. 17/17 tests en verde con el catálogo real; `tsc --noEmit` limpio.
  - No reemplaza a CX-06 (chequeo de `docs/conectores.md`) — garantía distinta y complementaria.
- **Dependencias:** ninguna.
- **Prioridad:** P1 · **Esfuerzo:** S

---

## ÉPICA 4 — Housekeeping

### CX-12 · `.gitignore` de `.worktrees/` — ✅ CERRADO

- **Historia:** Como cualquier persona que use `git worktree` en este repo, quiero que la carpeta de worktrees no aparezca como untracked en `git status`, para no confundirla con cambios reales pendientes de revisar.
- **Contexto verificado en sesión:** `.worktrees/` (usada por al menos 3 worktrees activos registrados con `git worktree list` al momento de esta revisión) no está listada en el `.gitignore` raíz del repo.
- **Resolución:** agregada la entrada `.worktrees/` a `.gitignore` raíz (sección "OS / editor"). Verificado con `git check-ignore -v .worktrees/feature-api-access-protection` — confirma el match; `git status` ya no las lista.
- **Dependencias:** ninguna.
- **Prioridad:** P2 · **Esfuerzo:** XS

---

## ÉPICA 5 — Hallazgo de CX-07: terminar `packages/http-client`

### CX-13 · Conectar `packages/http-client` y reemplazar sus copias locales — ✅ CERRADO

- **Historia:** Como equipo de datos, quiero que el paquete `http-client` ya empezado se termine de conectar, para no tener más de una implementación de la misma lógica de `fetch` + timeout reimplementada por separado.
- **Contexto verificado en código (hallazgo de CX-07, no estaba en el PRD original):** `packages/http-client/src/index.ts` existía, comiteado, sin `package.json`, sin `workspaces`, sin un solo `import` real en el repo. **Corrección encontrada durante la implementación** (el análisis original de CX-07 no lo distinguió bien): la duplicación real y byte-idéntica no era con el `fetchJson(baseUrl, path, options)` que ya traía el archivo (ese usa `NEXT_PUBLIC_HTTP_TIMEOUT_MS` — resto de un scaffold Next.js abandonado, sin relación con el resto del proyecto) — era con `apps/ceplan-geo/api/src/lib/fetch-with-timeout.ts` y `apps/compras-publicas/api/src/lib/fetch-with-timeout.ts`, dos copias **idénticas carácter por carácter** (`fetchWithTimeout(url, init, timeout)`, env var `HTTP_TIMEOUT_MS`, límites [1s, 300s]).
- **Resuelto:**
  - `packages/http-client` recibió `package.json`, `tsconfig.json`, `vitest.config.ts` (mismo shape que `entity-matcher`) y una nueva función `fetchWithTimeout` (el primitivo real duplicado) junto al `fetchJson` preexistente, que se dejó intacto por no tener consumidores ni riesgo.
  - `apps/compras-publicas/api/src/lib/fetch-with-timeout.ts` eliminado; sus 5 consumidores (`legacy-seace-orders-connector.ts`, `oece-connector.ts`, `oece-records-connector.ts`, `seace-public-minor-contracts-connector.ts`, `__tests__/oece-range-url.test.ts`) importan `fetchWithTimeout` de `@appsperu/http-client`.
  - `apps/compras-publicas/api/package.json` agrega `"@appsperu/http-client": "*"` (mismo patrón que ya usaba `"@appsperu/entity-matcher": "*"` en `master`).
  - `.github/workflows/ci.yml` compila `packages/http-client` en el mismo paso que ya compila `packages/entity-matcher`.
  - Tests: `packages/http-client` con 5 tests nuevos (`fetchWithTimeout` — éxito, headers pasados, timeout por abort, error de red propagado sin envolver; `HttpRequestError` — `kind`/`status`). Suite de `compras-publicas` corrida completa: 83/83 tests pasando (1 suite falla por `oece-minor-contracts-connector.js` no encontrado — deuda preexistente de un rename ya cerrado en `master` como CX-03, que esta rama todavía no tiene; no relacionada a este ticket).
  - **`ceplan-geo` quedó explícitamente fuera de este ticket**: su `fetchWithTimeout` local es la tercera copia idéntica, pero migrarla requeriría sumar `ceplan-geo` a `workspaces` (no está hoy) — un costo mayor (quitarle su `package-lock.json`, extenderle a `.github/workflows/ci.yml`, que hoy ni siquiera incluye `ceplan-geo` en su matrix) que no se justificaba dentro del alcance de "conectar un paquete ya empezado". Queda como duplicación conocida, documentada, para un ticket futuro que sí amplíe el workspace a `ceplan-geo` (mismo criterio incremental de ADR-0019).
  - `perfilprov-conformacion-connector.ts` también quedó fuera: su `fetchJson` local usa `fetch()` directo con `User-Agent` propio, sin timeout/AbortController — no es la misma duplicación, es un patrón más simple y distinto.
- **Dependencias:** CX-07 (cerrado).
- **Prioridad:** P2 · **Esfuerzo:** S
