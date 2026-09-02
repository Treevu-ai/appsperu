# Tickets — Rastro Capa de Lectura para No-Técnicos v1

**Producto:** Rastro / Follow the Sol
**PRD:** [`docs/PRD_Rastro_Capa_Lectura_No_Tecnicos_v1.md`](PRD_Rastro_Capa_Lectura_No_Tecnicos_v1.md)
**Backlog secuenciado:** [`docs/BACKLOG_Rastro_Capa_Lectura_No_Tecnicos_v1.md`](BACKLOG_Rastro_Capa_Lectura_No_Tecnicos_v1.md)
**Serie de tickets:** **AL3-** (continúa AL2- de Fase 2 CEPLAN)
**Regla transversal:** API-only por debajo (la UI no accede a BD). Vacío de evidencia, no conclusión. Cobertura parcial explícita en pantalla.
**Estimación:** S ≤ 1 día · M 2–3 días · L 4–6 días (esfuerzo relativo, no calendario).

---

## Estado real (auditoría de código, 2026-09-02)

Este documento describía un plan (Sprints 11-14) escrito **antes** de que `apps/rastro-web` se construyera. La app ya existe, está en `master` y desplegada en Cloudflare Pages (`rastro.fyi`). La auditoría anterior (2026-08-31) encontró 6 hechos, 9 parciales, 5 pendientes; los PR #54 (rastro-web: catálogo, ranking, búsqueda, E2E) y el trabajo posterior de AL3-02/03/07/09/12/15 cerraron todos los huecos restantes. Tabla de contraste contra el código en `apps/rastro-web/src` (no contra intención, contra lo que corre):

| ID | Estado | Nota |
|---|---|---|
| AL3-01 | ✅ Hecho | Vite + React Router + Tailwind, layout con nav, `.env.example` con las 14 vars. |
| AL3-02 | ✅ Hecho | Las 14 apps tienen función de consulta tipada en `api-client.ts` (radar-inversiones, ceplan-estrategico, ceplan-geo, salud-institucional, actividad-agraria, seguridad-ciudadana, bcrp-comercio-exterior, inversion-privada y bcrp-la-libertad se agregaron 2026-09-02, además de las 5 ya existentes + health genérico). |
| AL3-03 | ✅ Hecho | `<DataFreshnessBar>` con colores ámbar/rojo y mensaje "API no disponible". El texto/badge es clicable y abre un modal (`components/Modal.tsx`, sobre `<dialog>` nativo) con la lista completa de `meta_sources` — cada lote con registros, cobertura, fuente y checksum. |
| AL3-13 | ✅ Hecho | Linter real (`scripts/lint-meta.mjs`) — usa el patrón `<NumberWithMetadata>`/`WithMetadata<T>` en vez del comentario `@alsol-meta` original, pero cumple el objetivo. Documentado en `apps/rastro-web/docs/linter-meta.md`. |
| AL3-04 | ✅ Hecho | `/gore/la-libertad/ficha`. |
| AL3-05 | ✅ Hecho | `/gore/la-libertad/comparativo`. |
| AL3-06 | ✅ Hecho | `/gore/la-libertad/benchmark`. |
| AL3-07 | ✅ Hecho | `/proveedor/:ruc` con identidad + sanciones + contrataciones reales (match exacto `PE-RUC-<ruc>` contra `compras_publicas_suppliers`, corregido 2026-09-02 vía la suite E2E). Botón "Citar Rastro" con modal in-page (texto de citación con fuente/corte/cobertura + link a la guía completa). |
| AL3-08 | ✅ Hecho | `/prensa/proveedores` — ranking con CR3/CR5/HHI por departamento. |
| AL3-09 | ✅ Hecho | `/distrito/:ubigeo` consume, en paralelo, `infobras_public_works` + `radar_ejecucion_infrastructure_assets` (ambos filtrados por departamento en el backend) y resuelve el distrito exacto vía `ceplan_geo_territories` (UBIGEO completo) para filtrar ambos datasets en el cliente — con fallback honesto a la vista departamental si el territorio no se puede resolver. Verificado en E2E: el fixture 130101 trae 2 obras en distritos distintos y el test confirma que la que no matchea queda excluida. |
| AL3-10 | ✅ Hecho | `/distrito/:ubigeo/integridad` + `/docs/integridad`. |
| AL3-11 | ✅ Hecho | `/buscar` llama a `GET /api/search` (Cloudflare Pages Function) que agrega `radar_inversiones_investments` + `identidad_fiscal_contribuyentes` + `infobras_public_works` con timeout individual de 4s y disponibilidad honesta por fuente. Rate limit 30 req/min por IP vía KV. |
| AL3-12 | ✅ Hecho | `/estado` consulta las 14 apps en paralelo, refresh automático cada 60s (`setInterval`, limpiado al desmontar) y muestra la hora de la última actualización. |
| AL3-14 | ✅ Hecho | Suite Playwright (10 specs) contra fixtures fijas: 5 fichas de sector, 3 perfiles de proveedor, 2 distritos. Job `e2e` en `.github/workflows/rastro-web-ci.yml`. |
| AL3-15 | ✅ Hecho | `/docs/api` generada en build-time: `scripts/generate-mcp-catalog.mjs` parsea `mcp-server/src/catalog.ts` y escribe `src/data/mcp-tools-catalog.json` (corre antes de `dev`/`build`/`typecheck`/`test`, no es una copia manual). Buscador por nombre/descripción y tooltip con el texto completo de `SIN_SCHEDULER` por fila. Reemplaza a `check-mcp-tools-sync.mjs` (eliminado — ya no puede haber desincronía si la fuente es siempre `catalog.ts`). |
| AL3-16 | ✅ Hecho | `public/citar-rastro.md` con las 4 secciones + link en el footer de cada página. |
| AL3-17 | ✅ Hecho | Rate limit vía Cloudflare KV (`functions/lib/rate-limit.ts`), 30 req/min en `/api/search`. Métrica pública `429Count24h` en `/estado` vía `/api/rate-limit-stats`. |
| AL3-18 | 🟡 Parcial | Deploy real en Cloudflare Pages (proyecto `rastro`, alias `rastro-5zm.pages.dev`) + custom domain `rastro.fyi` (ver `DEPLOY.md`). El gate de E2E preview→producción sigue sin existir (la suite E2E corre en CI, pero no está enlazada al pipeline de promoción de Cloudflare Pages) — único punto real pendiente de este ticket. |
| AL3-19 | ✅ Hecho | `.github/workflows/rastro-web-ci.yml` con jobs `ci` (`typecheck` + `lint:meta` + `test` + `build`) y `e2e` (Playwright). |
| AL3-20 | ✅ Hecho | `docs/validacion-smoke-rastro-web-v1.md` con capturas + JSON + texto renderizado de los 3 lectores + `/estado` + `/buscar`. |

**Resumen:** 19 hechos, 1 parcial (de 20). Único pendiente real: el gate de E2E preview→producción en el pipeline de Cloudflare Pages (parte de AL3-18) — la suite E2E existe y corre en CI, pero no bloquea la promoción a producción todavía.

---

## ÉPICA 1 — Fundación de la UI

### AL3-01 · Fundación Vite + React Router
- **Historia:** Como visitante, quiero entrar a un sitio web de Rastro y ver una página de inicio con el lenguaje visual de `rastro-landing.html`.
- **Criterios de aceptación:**
  - Proyecto **Vite 5 + React Router 6** (SPA) con TypeScript estricto + Tailwind v4.
  - Layout raíz con header (logo "Rastro" + tagline + nav: GORE / Proveedor / Distrito / Estado / Docs).
  - Página `/` que renderiza el hero actual de `rastro-landing.html` con un párrafo de "estado del dato" traído de `radar_ejecucion_meta_sources` (fetch client-side con `cache: 'no-store'`).
  - Variables de entorno: `VITE_API_BASE_URL_{APP}` para los 14 puertos; validada en build con `vite-plugin-validate-env` (falla si falta).
  - README en `apps/rastro-web/README.md` con `npm install && npm run dev` → http://localhost:5173.
  - `.env.example` versionado; `.env` en `.gitignore`.
- **Dependencias:** —
- **Prioridad:** P0 · **Esfuerzo:** M

### AL3-02 · Cliente HTTP tipado a las 14 APIs
- **Historia:** Como desarrolladora de UI, quiero un único cliente que abstrae las 14 APIs, con timeout, error handling y tipos por tool.
- **Criterios de aceptación:**
  - Módulo `apps/rastro-web/lib/api-client.ts` con 14 funciones tipadas (una por app), basadas en el shape de `mcp-server/src/catalog.ts`.
  - Timeout configurable por env (default 8000 ms). Distingue `timeout` / `network` / `http_5xx` / `http_4xx` en errores.
  - Sin retry silencioso. Si el endpoint devuelve 503, la UI recibe `AppUnavailableError` y lo muestra explícito.
  - Tests unitarios con MSW (mock server) que cubren: éxito, 404, 422, 500, timeout, JSON inválido.
- **Dependencias:** AL3-01
- **Prioridad:** P0 · **Esfuerzo:** M

### AL3-03 · Header global con frescura honesta
- **Historia:** Como visitante, quiero ver en cada página cuándo se ingirió el último lote de cada fuente.
- **Criterios de aceptación:**
  - Componente `<DataFreshnessBar app="radar-ejecucion" />` que consulta `radar_ejecucion_meta_sources` en SSR.
  - Muestra: `Última corrida: 2026-08-26 14:32 (manual) · Cobertura: PARCIAL · 1.2M registros`.
  - Color ámbar si `> 7 días`, rojo si `> 30 días`, verde en otro caso.
  - Aparece en el header global; clic abre modal con la lista completa de `meta_sources` por app.
  - Si la API está caída: muestra "API no disponible" sin spinner eterno.
- **Dependencias:** AL3-02
- **Prioridad:** P0 · **Esfuerzo:** S

### AL3-13 · Linter de UI "no número sin metadata"
- **Historia:** Como mantenedor, quiero que CI rompa si alguna vista renderiza un número sin `matcher`/`cobertura`/`corte`.
- **Criterios de aceptación:**
  - Linter AST que recorre `apps/rastro-web/app/**/*.tsx` y `lib/**/*.tsx`.
  - Detecta nodos que renderizan números (`toLocaleString`, `Intl.NumberFormat`, `${number}`) sin un comentario `@alsol-meta` adyacente.
  - Regla: si el número viene de props, las props deben tener tipo `WithMetadata<T>` que incluye `matcher`, `cobertura`, `corte`, `fuente`.
  - `npm run lint:meta` falla el build si encuentra infracciones.
  - Documentado en `apps/rastro-web/docs/linter-meta.md` con ejemplos válidos e inválidos.
- **Dependencias:** AL3-02
- **Prioridad:** P0 · **Esfuerzo:** M

---

## ÉPICA 2 — Lector GORE La Libertad

### AL3-04 · Ficha de sector por departamento
- **Historia:** Como especialista de planeamiento del GORE, quiero ver la ficha de un sector (PIA/PIM/devengado, regla territorial, cortes) en una página web.
- **Criterios de aceptación:**
  - Ruta `/gore/la-libertad` con selector de sector (dropdown) y año.
  - Consume `radar_ejecucion_sector_ficha` (puerto 4000).
  - Renderiza tabla con `PIA`, `PIM`, `devengado`, `corte`, `cobertura`, `matcher` visibles.
  - Si la API responde 422 (sin regla de cohorte), la UI muestra el mensaje del tool literalmente (sin reescribirlo).
  - Si la cobertura es `PARCIAL`, badge visible con texto del tool.
  - Test E2E con `playwright` que navega `/gore/la-libertad?sector=TRANSPORTE&anio=2026` y compara JSON de la API con texto renderizado.
- **Dependencias:** AL3-02, AL3-03
- **Prioridad:** P0 · **Esfuerzo:** M

### AL3-05 · Comparativo de sectores verificados
- **Historia:** Como GORE, quiero comparar 2-3 sectores lado a lado con la misma regla territorial.
- **Criterios de aceptación:**
  - Ruta `/gore/la-libertad/comparativo?sectores=SALUD,TRANSPORTE&anio=2026`.
  - Consume `radar_ejecucion_sector_comparativo` (puerto 4000).
  - Tabla con columnas: sector, PIA, PIM, devengado, % avance, regla territorial usada.
  - Texto explícito: *"Comparativo descriptivo. Mantiene separadas la responsabilidad nacional dirigida al departamento y la ejecución regional por sede."* (copy del tool).
  - Sin generación de score, sin suma de ambos universos.
- **Dependencias:** AL3-04
- **Prioridad:** P0 · **Esfuerzo:** S

### AL3-06 · Benchmark de entidad vs cohorte
- **Historia:** Como GORE, quiero ver en qué percentil de ejecución está una entidad de mi región comparada con su cohorte.
- **Criterios de aceptación:**
  - Ruta `/gore/la-libertad/benchmark?entityCode=831&anio=2026` (entidad = UE La Libertad ejemplo).
  - Consume `radar_ejecucion_benchmark` (puerto 4000).
  - Renderiza: `status`, `n`, `percentil`, `medianaAvancePct`, `criterios` (literal del tool).
  - Si la respuesta es `datos_insuficientes`, badge explícito + texto del tool; **no** oculta el caso.
  - Tooltip en `criterios` explica: qué cohorte, por qué `minN=5`, qué se excluyó.
- **Dependencias:** AL3-04
- **Prioridad:** P1 · **Esfuerzo:** S

---

## ÉPICA 3 — Lector Prensa de Datos

### AL3-07 · Perfil de proveedor por RUC
- **Historia:** Como periodista, quiero pegar un RUC y ver identidad, contrataciones, sanciones y observaciones.
- **Criterios de aceptación:**
  - Ruta `/proveedor/{ruc}` (validación regex `/^\d{11}$/`).
  - Consume, en paralelo: `identidad_fiscal_contribuyente_by_ruc` (puerto 4006), `compras_publicas_supplier_by_id` (puerto 4001, vía RUC↔supplierId), `proveedores_sancionados_sanciones` (puerto 4008).
  - Renderiza 3 secciones: **Identidad** (RUC, razón social, estado SUNAT), **Contrataciones** (concentración CR3/CR5/HHI), **Sanciones** (vigentes, archivadas, en proceso).
  - Si alguna sección no tiene datos: muestra el vacío con la nota del tool (`"404 = no vínculo materializado, no conclusión"`).
  - Botón "Citar Rastro" → modal con el texto de citación sugerido (con corte y cobertura).
- **Dependencias:** AL3-02, AL3-13
- **Prioridad:** P0 · **Esfuerzo:** M

### AL3-08 · Ranking de proveedores con concentración
- **Historia:** Como periodista, quiero ver los proveedores con más adjudicaciones en un departamento y su concentración de mercado.
- **Criterios de aceptación:**
  - Ruta `/prensa/proveedores?departamento=LA%20LIBERTAD`.
  - Consume `compras_publicas_suppliers` (puerto 4001).
  - Tabla con: proveedor, RUC, valor total, % participación, HHI del subconjunto.
  - Si el filtro no devuelve datos: muestra "No hay proveedores con adjudicaciones registradas para este departamento" + enlace a la documentación del conector.
  - Sin score de "riesgo", sin color rojo por umbral. Solo números.
- **Dependencias:** AL3-07
- **Prioridad:** P1 · **Esfuerzo:** S

---

## ÉPICA 4 — Lector Auditoría / OCI

### AL3-09 · Activos de infraestructura por distrito
- **Historia:** Como auditor OCI, quiero ver qué obras y activos de infraestructura existen en un distrito, y si tienen cierre, operador, mantenimiento.
- **Criterios de aceptación:**
  - Ruta `/distrito/{ubigeo}` (validación regex `/^\d{6}$/`).
  - Consume, en paralelo: `infobras_public_works` (puerto 4003, filtrado por departamento) + `radar_ejecucion_infrastructure_assets` (puerto 4000, filtrado por departamento).
  - Renderiza tabla con: CUI/obra (cuando existe), código INFOBRAS, sector, estado, evidencia de cierre/operador/mantenimiento.
  - Para obras paralizadas: chip explícito "PARALIZADA" con tooltip del campo de INFOBRAS.
  - Sin "score de calidad". Solo presencia/ausencia de evidencia.
- **Dependencias:** AL3-02, AL3-13
- **Prioridad:** P0 · **Esfuerzo:** M

### AL3-10 · Integridad de infraestructura con `estricto=true`
- **Historia:** Como auditor, quiero ver el reporte de integridad con `estricto=true` para que CI no publique un activo sin la cadena mínima.
- **Criterios de aceptación:**
  - Ruta `/distrito/{ubigeo}/integridad?estricto=true` consume `radar_ejecucion_infrastructure_integrity` (puerto 4000).
  - Renderiza estado: `INTEGRIDAD_COMPLETA` / `BLOQUEADO_POR_EVIDENCIA` con la lista de lo que falta.
  - Si la API responde 409 (`estricto=true` y falta evidencia), la UI muestra el código HTTP y el mensaje textual del tool.
  - Página de ayuda `/docs/integridad` explica: qué cuenta como evidencia mínima, qué significa "BLOQUEADO", por qué no es un score.
- **Dependencias:** AL3-09
- **Prioridad:** P0 · **Esfuerzo:** S

---

## ÉPICA 5 — Búsqueda transversal

### AL3-11 · Buscador `/buscar`
- **Historia:** Como visitante, quiero buscar un RUC, CUI, código INFOBRAS o palabra clave de obra y obtener resultados rankeados.
- **Criterios de aceptación:**
  - Ruta `/buscar?q=...` (q mínimo 3 caracteres).
  - Endpoint interno `/api/search` que pregunta a 3 sources (en paralelo, con timeout individual de 4 s):
    1. `radar_inversiones_investments` filtrado por texto en `nombre`.
    2. `identidad_fiscal_contribuyentes` filtrado por `razonSocial` o `ruc`.
    3. `infobras_public_works` filtrado por `descripcion`.
  - Une resultados en una sola tabla con: tipo (inversión / RUC / obra), identificador oficial, descripción, puntaje de similitud, fuente.
  - Si una API está caída: omite esa fuente con texto explícito ("fuente X no disponible en este momento") en vez de fallar toda la búsqueda.
  - Rate limit: 30 req/min por IP.
- **Dependencias:** AL3-02, AL3-13
- **Prioridad:** P1 · **Esfuerzo:** M

---

## ÉPICA 6 — Estado del producto

### AL3-12 · Página `/estado` con `meta_sources` agregadas
- **Historia:** Como visitante, quiero ver de un vistazo si las 14 APIs están vivas y cuándo se ingirió cada fuente.
- **Criterios de aceptación:**
  - Ruta `/estado`.
  - Tabla con 14 filas (una por app): nombre, URL base, último `meta_sources.runAt`, conteo de registros, cobertura declarada.
  - Refresh automático cada 60 s (sin caché).
  - Si una API está caída, fila en rojo con el error textual del cliente HTTP.
  - Sin login. Sin tracking individual.
- **Dependencias:** AL3-02, AL3-03
- **Prioridad:** P1 · **Esfuerzo:** S

---

## ÉPICA 7 — Documentación pública

### AL3-15 · Página `/docs/api` con los 82 tools
- **Historia:** Como desarrollador externo, quiero ver la lista de los 82 tools MCP con su descripción, path, parámetros y semántica de "vacío".
- **Criterios de aceptación:**
  - Ruta `/docs/api` generada desde `mcp-server/src/catalog.ts` (build-time).
  - Tabla con: nombre, app, descripción (los primeros 200 caracteres), path template, parámetros.
  - Búsqueda por nombre/descripción.
  - Cada fila tiene tooltip con la nota `SIN_SCHEDULER`.
- **Dependencias:** AL3-01
- **Prioridad:** P1 · **Esfuerzo:** S

### AL3-16 · Manual de uso (1 página Markdown)
- **Historia:** Como periodista o funcionario, quiero una página que me diga cómo citar Rastro correctamente.
- **Criterios de aceptación:**
  - `apps/rastro-web/public/citar-rastro.md` (1 página).
  - Secciones: cómo citar en informe público, cómo citar en noticia, qué NO se puede concluir, cómo reportar un vacío.
  - Ejemplo de bloque de citación: `Rastro v1.0 · La Libertad · corte MEF 2026-08-26 · cobertura PARCIAL · https://rastro.fyi/gore/la-libertad`.
  - Accesible desde el footer de cada página.
- **Dependencias:** —
- **Prioridad:** P1 · **Esfuerzo:** S

---

## ÉPICA 8 — Despliegue y calidad

### AL3-14 · Tests E2E "JSON de API = JSON renderizado"
- **Historia:** Como mantenedor, quiero que CI falle si la UI muestra un número que no vino de la API.
- **Criterios de aceptación:**
  - Suite Playwright que, para cada ruta publicada (`/gore/...`, `/proveedor/...`, `/distrito/...`), captura la respuesta de la API y la compara con el HTML renderizado.
  - Cubre: 5 fichas de sector, 3 perfiles de proveedor (con/sin sanciones, con/sin contrataciones), 2 distritos.
  - Diff visible en el log de CI con el campo que no coincide.
  - Si el test pasa, comentario en el PR confirma: "E2E verde, 12/12 diffs OK".
- **Dependencias:** AL3-04, AL3-07, AL3-09
- **Prioridad:** P0 · **Esfuerzo:** M

### AL3-17 · Rate limit + CAPTCHA en rutas sensibles
- **Historia:** Como operador, quiero evitar abuso en `/proveedor/{ruc}` y `/buscar` sin bloquear al usuario legítimo.
- **Criterios de aceptación:**
  - Middleware que cuenta requests por IP en ventana de 60 s.
  - Límite por defecto: 30 req/min para `/buscar`, 60 req/min para `/proveedor/{ruc}`, 100 req/min para el resto.
  - Cuando se excede: HTTP 429 con `Retry-After`, no CAPTCHA en v1 (se reabre si hay abuso real).
  - Métrica pública en `/estado` con `429Count24h`.
- **Dependencias:** AL3-07, AL3-11
- **Prioridad:** P2 · **Esfuerzo:** S

### AL3-18 · Despliegue en Cloudflare Pages + variables de entorno
- **Historia:** Como operador, quiero que la app esté desplegada en **Cloudflare Pages** (D5 cerrada) con las URLs de las 14 APIs configuradas.
- **Criterios de aceptación:**
  - Proyecto Cloudflare Pages `rastro-web` linkeado al repo `Treevu-ai/appsperu`; build command `npm run build`; output dir `dist/`.
  - Variables de entorno configuradas en Cloudflare dashboard: `VITE_API_BASE_URL_RADAR_EJECUCION`, etc. (14 vars).
  - Dominio personalizado `rastro.fyi` configurado en Cloudflare — **hecho** (custom domain activo sobre el proyecto Pages `rastro`).
  - Build pipeline corre tests E2E antes de promover a producción (preview → production gate vía Cloudflare Pages + GitHub Actions).
  - README en `apps/rastro-web/DEPLOY.md` con runbook de Cloudflare Pages.
  - **No se usa Vercel** (preferencia de Ricardo). Fly.io queda documentado como plan B si en el futuro aparece lógica server-side que Workers no cubra.
- **Dependencias:** AL3-14
- **Prioridad:** P0 · **Esfuerzo:** S

### AL3-19 · CI en GitHub Actions
- **Historia:** Como mantenedor, quiero que cada PR ejecute typecheck + tests E2E + linter.
- **Criterios de aceptación:**
  - Workflow `.github/workflows/rastro-web-ci.yml`.
  - Jobs: `typecheck`, `unit`, `e2e` (con playwright), `lint-meta`.
  - Cache de `node_modules` por lockfile.
  - Falla el PR si cualquier job falla.
  - Sin ingestas, sin migraciones, sin llamadas a fuentes externas.
- **Dependencias:** AL3-13, AL3-14
- **Prioridad:** P0 · **Esfuerzo:** S

### AL3-20 · Reporte de smoke test de los 3 lectores
- **Historia:** Como Ricardo, quiero un reporte Markdown que demuestre que los 3 lectores funcionan con datos reales.
- **Criterios de aceptación:**
  - `docs/validacion-smoke-rastro-web-v1.md` con: screenshot o HTML de cada ruta visitada, JSON crudo de la API, texto renderizado, observación de cobertura.
  - 5 capturas de `/gore/la-libertad`, 3 de `/proveedor/{ruc}`, 2 de `/distrito/{ubigeo}`, 1 de `/estado`, 1 de `/buscar`.
  - Cualquier divergencia entre "lo que dice la API" y "lo que muestra la UI" debe estar marcada explícitamente, no omitida.
- **Dependencias:** AL3-04, AL3-07, AL3-09, AL3-12
- **Prioridad:** P0 · **Esfuerzo:** S

---

## Definition of Done (por ticket)

- Código mergeado con tests donde aplique.
- Sin nuevos endpoints en `apps/*/api` ni migraciones nuevas (este PRD **no toca** el backend).
- Si la UI renderiza un número, el test E2E demuestra que viene verbatim de la API.
- Sin login, sin tracking individual, sin cookies de marketing.
- Documentación pública (manual de uso, página `/docs/api`) actualizada si cambia contrato de cara al usuario.
- Captura o salida de smoke test adjunta al PR.
