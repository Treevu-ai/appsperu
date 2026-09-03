# Estado del proyecto — Follow the Sol

Última actualización: 2026-09-02.

Doce apps standalone con API propia; todas son API-only (sin frontend web), salvo `rastro-web` (ver abajo). `salud-institucional` no tiene Postgres propio — es un agregador de solo lectura sobre las otras fuentes.

## Dashboard INFOBRAS + tema Cursor + diagnóstico UX + corte semanal explícito (2026-09-02)

**Dashboard de señales INFOBRAS (PR #63)**: `/distrito/:ubigeo` ganó columnas de Cost Drift y Gap físico-financiero (`resumenObras` calculado en cliente); nueva ruta `/auditoria/entidades-infobras` para el crosswalk MEF↔INFOBRAS con filtro por nivel de confianza. De paso se encontró y corrigió un bug real preexistente: `PublicWork`/`PublicWorksResponse` en `api-client.ts` tenían un shape inventado (`descripcion`/`entidad`/`estado`/`paralizada`/`avanceFisicoPct`, envoltorio `items`) que nunca coincidió con la respuesta real de `apps/infobras/api/src/routes/public-works.ts` — corregido al shape real (`resultados`, `costDriftPct`, `gapFisicoFinanciero`, etc.).

**Sistema de diseño Cursor light (PR #64)**: remap completo de tokens `@theme` en `index.css` (canvas crema `#f7f7f4`, acento naranja `#f54e00`, sin sombras, tipografía Inter/JetBrains Mono cargada de verdad por primera vez — antes los `font-family` declarados nunca se cargaban, siempre caían a fallback del sistema). Un solo archivo re-temató las ~30 rutas/componentes existentes sin tocarlos, porque el 100% del theming de color ya pasaba por esos tokens (verificado por grep: cero hex/rgba hardcodeados fuera de `index.css`).

**Lenguaje simple en la landing + fixes responsivos (PR #65)**: reescritura completa de "El problema", "Cómo funciona", "Capacidades" y "Para quién" en `Home.tsx`/`components/home/*` para un público sin conocimiento técnico (sin PIA/PIM/devengado, sin JSON crudo — "Para agentes IA" se mantuvo técnico a propósito). Bug sistémico encontrado y corregido en 7 archivos: una `<table className="w-full">` sin `min-w-[...]` rompe `overflow-x-auto` en mobile aunque el wrapper exista — afectaba incluso tablas construidas en esta misma sesión.

**Diagnóstico UX/UI del sitio en vivo + fixes (PR #67)**: revisión de `rastro.fyi` en producción encontró 6 problemas. El más grave — el CTA principal del hero llevaba a un error porque las APIs no están publicadas — quedó fuera de este PR (requería una solución de arquitectura, ver abajo). Se corrigieron los otros 4 accionables de inmediato: `Proveedor.tsx` quedaba en blanco sin ningún mensaje cuando las 3 APIs fallaban (`Promise.allSettled` nunca rechaza — bug real, no solo copy); `/buscar` filtraba puertos de desarrollo local (`:4000`...) al público en producción; lenguaje técnico en `/buscar` fuera de tono con el resto de la landing ya simplificada; mensaje "datos no disponibles" con tono de disculpa técnica como primera línea que ve cualquier visitante.

**Corte semanal explícito (PRs #66, #68, #69)** — resuelve el hallazgo más grave del diagnóstico UX: en vez de exponer las 14 APIs en vivo (no publicadas hoy), se publica semanalmente una foto (corte) de los datos, generada por el cron ya existente (`scripts/seguimiento-semanal-territorial.ps1`, miércoles 8am hora Perú — PR #66 corrige que hacía `git pull` de una rama ya borrada). Arquitectura (PR #68): un solo punto de intercepción, `requestJson()` en `api-client.ts`, que ahora busca en `src/data/snapshot.json` (bundleado en el build) antes de fallar — no hizo falta tocar las 19 funciones exportadas del cliente. `export-snapshot.mjs` (nuevo) enumera el espacio finito de consultas que la UI realmente usa. `DataFreshnessBar` pasó de decir "datos en vivo no están en la web pública" a "Datos al `<fecha>` — corte semanal, no en vivo", leyendo el corte bundleado sin llamada de red.

Quedaron 2 excepciones documentadas en el PR #68 (`Proveedor.tsx` por RUC, `Buscar.tsx` texto libre — espacio de input no finito) y se cerraron en el PR #69: `export-snapshot.mjs` gana una fase 2 que deriva el universo real de RUCs de la respuesta *sin filtro* de `compras-publicas/suppliers` (una sola llamada nacional, no el padrón completo de SUNAT de ~373MB/millones de RUCs) y precalcula identidad + sanciones de cada uno. `functions/api/search.ts` (Cloudflare Pages Function, código server-side separado de `api-client.ts`) gana un fallback a un índice de búsqueda bundleado (`search-index.json`, mismos datos ya descargados) cuando sus 3 fuentes en vivo no responden, con `corteUsado` expuesto en la respuesta para que la UI sea honesta sobre el origen del dato.

**Nota operativa**: por ahora `snapshot.json`/`search-index.json` siguen en su placeholder vacío (`corte: null`) — el primer corte real lo genera la corrida del cron del miércoles 9 de septiembre, que abre un PR para revisión antes de publicarse (nunca push directo a `master`).

## `rastro-web` 20/20 tickets AL3-* + pipeline de deploy verde de punta a punta + MCP crossref INFOBRAS (2026-09-02)

**Cierre de los 20 tickets AL3-\* de `docs/TICKETS_Rastro_Capa_Lectura_v1.md`** (la auditoría del 2026-08-31 había encontrado 6 hechos, 9 parciales, 5 pendientes). PR #54 cerró AL3-08/10/11/14/17/20 (catálogo PNDA, ranking de proveedores, búsqueda + rate limit, suite E2E Playwright, integridad de infraestructura, smoke test). PR #57 cerró los 6 restantes:

- **AL3-02**: las 9 apps que solo tenían health-check ahora tienen función de datos tipada en `api-client.ts` (radar-inversiones, ceplan-estrategico, ceplan-geo, salud-institucional, actividad-agraria, seguridad-ciudadana, bcrp-comercio-exterior, inversion-privada, bcrp-la-libertad) — las 14 apps quedan cubiertas.
- **AL3-03**: `<DataFreshnessBar>` ahora abre un modal (`components/Modal.tsx`, `<dialog>` nativo, sin librería) con la lista completa de `meta_sources`.
- **AL3-07**: botón "Citar Rastro" con modal in-page en `/proveedor/:ruc`.
- **AL3-09**: `/distrito/:ubigeo` resuelve el distrito exacto vía `ceplan_geo_territories` (el UBIGEO completo) y filtra en el cliente tanto `infobras_public_works` como el nuevo fetch en paralelo a `radar_ejecucion_infrastructure_assets` — ninguno de los dos backends filtra por distrito, solo por departamento.
- **AL3-12**: `/estado` hace refresh automático cada 60s.
- **AL3-15**: `/docs/api` se genera en build-time (`scripts/generate-mcp-catalog.mjs` parsea `mcp-server/src/catalog.ts` por regex, sin arrastrar zod/el workspace de mcp-server al build de rastro-web) en vez de mantener una copia manual de los 82 tools a mano.

**AL3-18 cerrado por separado (PR #58)**: `rastro-web-deploy.yml` no corría la suite E2E antes de desplegar. Se agregó el gate — corre ANTES del build de producción a propósito (el `webServer` de Playwright hace su propio build con URLs de prueba; si corriera después pisaría el `dist/` real que usa `.env.production`).

**Bug real de CI encontrado y corregido, dos veces**: el job `e2e` de `rastro-web-ci.yml` **nunca había pasado en CI** desde que existe (PR #54 en adelante) — pasaba en local (40/40, 10/10) pero fallaba 0/10 en GitHub Actions. Causa: el comentario del workflow asumía "los valores de las URLs no importan porque `page.route` intercepta todo" — falso. Vite build usa `process.env` por encima de `.env.production` (así es como `loadEnv` de Vite prioriza), así que el job sí construye con esos valores falsos. Los `page.route("**/<app>/api/...")` de `e2e/*.spec.ts` necesitan el literal `/<app>/api/` en la URL — funciona con la convención real de producción (`https://api.rastro.pe/<app>`, un host + path por app) pero no con un host distinto por app (`https://infobras.example.test/api/x` no contiene `/infobras/api/x`). Corregido en `rastro-web-ci.yml` (PR #57) y replicado en `rastro-web-deploy.yml` (PR #58) con el mismo patrón path-based.

**KV namespace `RATE_LIMIT` sin crear bloqueaba todo deploy a producción desde PR #54** (`wrangler.toml` tenía el placeholder `REEMPLAZAR_CON_EL_ID_DEL_NAMESPACE_KV`, `Error 8000022: Invalid KV namespace ID`) — nadie lo había notado porque el job `e2e` fallaba antes de llegar al deploy. Ricardo creó el namespace (`npx wrangler kv namespace create RATE_LIMIT`) y se actualizó `wrangler.toml` con el id real (PR #59).

**Bug de configuración en el dashboard de Cloudflare Pages** (no en el repo): el check "Cloudflare Pages" de los PRs empezó a fallar en el PR #60 — Cloudflare cambió a "v2 root directory strategy" (cambio de su lado), y el "Build output directory" del proyecto (`dist`, no editable desde el dashboard en este proyecto) dejó de coincidir con dónde realmente cae el build (`apps/rastro-web/dist`, porque el "Build command" configurado usa `npm --prefix apps/rastro-web`). Como el campo de output directory no era editable, se ajustó el **Build command** para mover el resultado al final: `... && rm -rf dist && mv apps/rastro-web/dist dist`. Sin esto, ni los PR previews de Cloudflare ni el deploy real a producción hubieran podido servir un build actualizado, aunque el `wrangler pages deploy` de `rastro-web-deploy.yml` seguía funcionando bien (usa `apps/rastro-web/dist` directo, no pasa por esta configuración del dashboard).

**Auditoría del PRD de 6 sprints de INFOBRAS retomada parcialmente** (ver pendiente #3 de abajo, corregido): la mayoría de lo que `docs/adr/0002-infobras-app-standalone-y-cruce-por-cui.md` marcaba como "fuera de alcance" en realidad ya estaba construido en el backend — señales Cost Drift/Gap físico-financiero/Paralización y el crosswalk INFOBRAS↔radar-ejecucion por nombre con niveles de confianza (`confirmada`/`candidata`, `GET /api/crossref/ejecucion`), todo probado. El único gap real era que ese endpoint nunca se agregó al catálogo MCP — PR #60 agrega `infobras_crossref_ejecucion` (83 tools totales). De paso se corrigió un bug en `generate-mcp-catalog.mjs`: no parseaba `querySchema` de una sola línea (ej. `{ confidence: z.enum([...]).optional() }`), devolvía `queryParams: []` aunque sí tuviera parámetros.

**Verificación end-to-end confirmada en producción**: después de los PR #57–#60, un push a `master` corrió el pipeline completo (typecheck → lint-meta → unit → **E2E 10/10** → build → deploy Cloudflare Pages) en verde de punta a punta por primera vez — confirmado con `gh run view` contra el run real, no solo localmente.

**Pendiente real que queda** (no urgente, ver pendiente #3 actualizado abajo): un dashboard en `rastro-web` que muestre visualmente las señales de INFOBRAS (Cost Drift, Gap físico-financiero, crosswalk de confianza) — hoy `/distrito/:ubigeo` solo muestra descripción/entidad/estado/avance físico, sin las señales. `docs/adr/0002-infobras-app-standalone-y-cruce-por-cui.md` también sigue sin actualizarse (todavía dice "fuera de alcance" sobre cosas que ya están hechas).

## `rastro.fyi` 522 + canonical `www` + UI mobile de `rastro-web` + limpieza de repo + dossier La Libertad (2026-09-01)

- **522 en `rastro.fyi` (apex sin `www`)**: el proyecto Pages `rastro` solo tenía `www.rastro.fyi` como Custom Domain — faltaba el apex. El DNS (CNAME proxied → `rastro-5zm.pages.dev`) ya estaba bien, pero al no estar vinculado el hostname al proyecto, Cloudflare no sabía a qué origin enrutarlo. Fix inicial: agregar `rastro.fyi` como Custom Domain vía la API de Cloudflare (ambos dominios servían 200 directo).
- **Ese fix quedó revertido por decisión de diseño**: al sincronizar `master` apareció un commit ya mergeado de otra sesión (`be321bd`, #46) que fija `www.rastro.fyi` como canónico (`index.html`, `sitemap.xml`, `robots.txt`, `llms.txt` ya actualizados) con el apex haciendo 301 a `www` — pero ese commit nunca se había ejecutado en Cloudflare (ambos dominios seguían sirviendo 200 directo, sin redirect). Se resolvió el conflicto a favor de `www` (consistente con el SEO ya committeado): se quitó `rastro.fyi` de Custom Domains, se apuntó el CNAME del apex a `www.rastro.fyi`, y se creó una Redirect Rule (`http_request_dynamic_redirect`, 301, preserva path y query string). Verificado en vivo: `rastro.fyi` → 301 → `www.rastro.fyi` (200). El script `scripts/cloudflare-www-canonical.sh` del repo quedó sin ejecutar — se hizo el equivalente manual vía API.
- **UI mobile de `rastro-web`** (rama `fix/rastro-web-mobile-hero-nav`, 2 commits):
  - 4 secciones nuevas en `Home.tsx` migradas de `rastro-landing.html` (`ElProblema`, `ComoFunciona`, `Capacidades`, `ParaQuien`) + menú hamburguesa responsive en `Layout.tsx`.
  - **Bug real encontrado y corregido**: el hero (`Home.tsx`) tenía `min-h-[200px]` en mobile combinado con `object-cover`, lo que forzaba a recortar ~26% de cada lado de `hero-banner.png` (1584×396px) — cortaba el titular principal horneado en la imagen, ilegible en pantallas angostas. Se quitó el `min-h` forzado.
  - Nav reorganizado por feedback de usuario: header solo con "Buscar"; "Estado" y "Docs API" movidos al footer; "GORE La Libertad" removido del nav (sigue accesible desde el hero CTA y la sección de Lectores) por mezclar audiencias (contenido/dev/ops) sin jerarquía.
  - El tagline "Nosotros lo hacemos visible" estaba horneado en el PNG del hero (solo en el `alt`, no en el DOM) — no se podía aplicar CSS. Se agregó como texto HTML/CSS real superpuesto, con "visible" resaltado en un pill de color accent.
- **Limpieza de repo** (rama `chore/repo-cleanup-and-readme`): se encontraron y borraron 8 carpetas `apps/*/web/` (ceplan-estrategico, compras-publicas, identidad-fiscal, infobras, proveedores-sancionados, radar-ejecucion, radar-inversiones, salud-institucional) que eran cachés huérfanos de un scaffold Next.js — ~13,300 archivos c/u (`node_modules`/`.next`/`coverage`) sin un solo archivo fuente real detrás (ni `package.json`). También se borró un `package.json`/`package-lock.json`/`node_modules` accidental en la raíz del repo (el `description` del `package.json` tenía pegado por error el tagline de RASTRO — típico accidente de `npm init`), y logs operativos sueltos (`logs/*.log`, `.playwright-cli/`). Se agregó un `.gitignore` raíz (antes solo existía por-app) para que un `git add -A` futuro no pueda volver a subir `node_modules`/`.next` de una app nueva por accidente. De paso, README.md actualizado para reflejar el rebrand ALSOL → Rastro.
- **Dossier `docs/dossier/rastro-dossier.html`** (rama `docs/dossier-la-libertad-pagination-logo`, 2 commits): el PDF impreso tenía páginas casi en blanco. Causa: cada `.page` usa `min-height: 297mm` + `page-break-after: always`; 5 de las 8 secciones (01, 03, 04, 05, 07) superaban una página A4 por 18–190px de espaciado vertical acumulado, y ese sobrante generaba una página de continuación casi vacía antes del salto forzado a la siguiente sección. Diagnosticado midiendo en vivo la altura real de cada sección contra 1123px (=297mm a 96dpi) vía navegador; corregido ajustando márgenes/paddings/line-height hasta que las 7 primeras secciones quedaran exactas en una página, sin tocar contenido. Resultado: de 13 páginas "diseñadas" (pero en realidad 16 al imprimir, por el spillover) a **11 páginas reales, ninguna vacía** (verificado con `pypdf`: 741–2351 caracteres de texto por página). Se agregó también el logo oficial (`rastro-logo.png`, no el `rastro-mark.svg` viejo que tenía paleta verde desactualizada) a la portada, embebido como data URI para mantener el documento autocontenido. El PDF se regeneró con Chrome headless (`--print-to-pdf`) contra el HTML corregido.

## Dominio `rastro.fyi` + auditoría real de `rastro-web` (2026-08-31)

- **Custom domain `rastro.fyi`** conectado al proyecto Cloudflare Pages `rastro` (PR #40): metadatos SEO/GEO (`index.html`, `robots.txt`, `sitemap.xml`, `llms.txt`, `citar-rastro.md`) apuntan a `rastro.fyi` como URL canónica; `rastro-5zm.pages.dev` (alias real del proyecto — no `rastro.pages.dev`, que ya estaba tomado) queda como fallback. Requirió CNAME manual en el DNS de `rastro.fyi` porque esa zona no vive en la misma cuenta/proyecto Cloudflare — el custom domain no se auto-configuró. Pasos documentados en `apps/rastro-web/DEPLOY.md` §4.
- **Auditoría de código vs. backlog**: `docs/TICKETS_Rastro_Capa_Lectura_v1.md` y `docs/BACKLOG_Rastro_Capa_Lectura_No_Tecnicos_v1.md` describían un plan pre-build (Sprints 11-14) que nunca se actualizó contra lo que realmente se construyó. Se contrastó ticket por ticket contra `apps/rastro-web/src`: de los 20 tickets AL3-*, **6 hechos, 9 parciales, 5 pendientes**. Huecos más relevantes: 8 de las 14 apps backend no tienen función de datos en `api-client.ts` (solo health-check genérico); sin suite E2E (Playwright) pese a que el CI la asume; búsqueda libre en `/buscar` explícitamente no implementada; sin ranking de proveedores (`/prensa/proveedores`) ni integridad de infraestructura (`/distrito/:ubigeo/integridad`); sin rate limit; sin reporte de smoke test firmado. Detalle ticket por ticket en la tabla "Estado real" al inicio de `docs/TICKETS_Rastro_Capa_Lectura_v1.md`.
- El pendiente #7 de abajo (`CLOUDFLARE_DEPLOY_HOOK_URL`) sigue sin resolverse — no forma parte de esta sesión.

## Corrección — pendiente #7 (`CLOUDFLARE_DEPLOY_HOOK_URL`) ya estaba resuelto (2026-09-02)

Al retomar este pendiente se encontró que estaba desactualizado: los secrets `CLOUDFLARE_API_TOKEN`
y `CLOUDFLARE_ACCOUNT_ID` **ya están configurados** en GitHub → Settings → Secrets and variables →
Actions (agregados en algún momento después del 2026-08-31, sin que se actualizara esta bitácora).
El paso "Deploy a Cloudflare Pages (wrangler)" de `rastro-web-deploy.yml` (opción A, preferida sobre
el Deploy Hook) corre exitosamente desde entonces — verificado contra el historial real de
`gh run list --workflow=rastro-web-deploy.yml`: última falla 2026-08-31 (antes de que se agregaran
los secrets), 16 corridas exitosas seguidas después, incluyendo `schedule` (cron semanal) y
`workflow_dispatch`. `CLOUDFLARE_DEPLOY_HOOK_URL` (opción B, fallback) sigue sin existir pero ya no
hace falta — el workflow nunca llega a ese paso mientras el token de wrangler siga funcionando.
Pendiente #7 se marca resuelto.

## Rename ALSOL → Rastro completado + alta de `rastro-web` (2026-08-29)

- **Rename de marca cerrado en `docs/`**: 7 archivos con "ALSOL" en el nombre renombrados a "Rastro" (`git mv`, historial preservado) y 79 menciones sueltas del nombre de producto reemplazadas en 34 archivos (PRDs, backlogs, memos regionales, reportes, data-contracts). `alsol-landing.html` → `rastro-landing.html`. PR #38.
  - Se dejaron intactas dos menciones que no son parte del rename: el nombre real de una branch histórica en este mismo archivo (línea de PR #27, arriba) y la directiva `@alsol-meta` que usa de verdad el linter en `apps/rastro-web/scripts/lint-meta.mjs` — renombrarlas habría desincronizado la doc del código real.
- **`apps/rastro-web` entra al repo por primera vez** (PR #39): SPA Vite + React que consume las 14 APIs del monorepo; existía en disco desde antes pero nunca se había trackeado en git.
  - `.github/workflows/rastro-web-ci.yml`: typecheck + `lint:meta` + tests + build en cada PR/push a master que toque la app.
  - `.github/workflows/rastro-web-deploy.yml`: dispara el Deploy Hook de Cloudflare Pages en push, `workflow_dispatch` manual y cron semanal (miércoles 12:00 UTC = 07:00 Perú), siempre después de pasar el mismo CI.
  - `apps/rastro-web/.gitignore` corregido para excluir `.env` (placeholders localhost, pero el propio archivo pedía "no commit") y `tsconfig.app.tsbuildinfo` (cache de build que se había colado en el primer commit).
  - `package-lock.json` tuvo que regenerarse desde cero: el lockfile generado en Windows no resolvía completa la dependencia WASM de `@tailwindcss/oxide-wasm32-wasi` que el runner Linux de CI necesita — `npm ci` fallaba con `EUSAGE`.
- **Pendiente real, no resuelto**: falta el secret `CLOUDFLARE_DEPLOY_HOOK_URL` en GitHub. Se investigó usar un token de API para automatizarlo — el archivo de credenciales que se tenía a mano resultó ser un **token de R2** (Access Key ID/Secret + token S3-scoped), no un API Token de cuenta general; falla `"Invalid API Token"` contra `/user/tokens/verify` y no tiene alcance sobre Pages. Cloudflare tampoco expone un endpoint de API para crear Deploy Hooks (es dashboard-only); si se quiere automatizar de verdad, la alternativa es `POST /accounts/{account_id}/pages/projects/rastro/deployments` con un API Token nuevo con permiso `Pages:Edit`, cambiando el workflow de deploy para no depender de un hook. Se decidió pausar y crear el hook manualmente cuando se retome (Cloudflare → Pages → proyecto `rastro` → Settings → Builds → Deploy hooks).

## Última sesión operativa — 2026-08-27

Alcance del proyecto reducido a **La Libertad únicamente** (decisión de producto) — Lambayeque, Piura, Cajamarca y Cusco quedan fuera de scope; sus memos de análisis se conservan como histórico sin actualizar.

- **INFOBRAS destrabado localmente**: el cloud agent no alcanza `infobras.contraloria.gob.pe` (timeout de red); ingesta corrida en máquina local sin ese bloqueo. Verificado: 178,638 obras totales en BD, 10,134 en La Libertad.
- **4 apps certificadas en el ledger de cobertura territorial** (`territorial_coverage`) que estaban `BLOQUEADA` solo por falta del script de materialización, no por falta de datos: `identidad-fiscal` (106,918 contribuyentes), `proveedores-sancionados` (certifica por cruce RUC↔identidad-fiscal, sin UBIGEO propio), `actividad-agraria` (108 registros MIDAGRI), `salud-institucional` (score derivado — certifica verificando que sus 5 dependencias estén completas).
- **Nueva app — `seguridad-ciudadana`** (ver sección dedicada más abajo): denuncias policiales SIDPOL (MININTER).
- Checkpoint final: `cobertura:territorial -- --jurisdiccion "LA LIBERTAD" --require-complete` sale exit 0 — las 9 apps aplicables a La Libertad quedan `COMPLETA_VERIFICADA`; solo `ceplan-estrategico` permanece `NO_APLICA` por diseño (sin llave geográfica departamental).
- **Bug de infraestructura encontrado y corregido**: `.gitignore` de `radar-ejecucion/api` tenía una entrada bare `coverage` (pensada para el output de test-coverage) que también atrapaba `src/coverage/` — el módulo real detrás de `cobertura:territorial`. Nunca había llegado a git; CI fallaba en el PR hasta corregirlo (`coverage` → `/coverage`).
- `scripts/seguimiento-semanal-territorial.ps1` + tarea de Windows Task Scheduler (miércoles 7pm hora Perú): re-ingesta MEF/INFOBRAS/Invierte y guarda snapshot de cobertura territorial por corrida.
- PR #27 (`cursor/alsol-ingest-5-regiones-f938` → `master`) mergeado, CI 19/19 jobs verdes.

## Sesión anterior — 2026-08-26

- Se implementó `ceplan-geo` (API 4005, PostGIS 5437): ingesta WFS de distritos/aeropuertos/puertos, endpoints de lectura, cruces con `radar-inversiones`/`infobras`/`radar-ejecucion`, CLI `cobertura:geoserver` y 11 tools MCP.
- **Planificación Fase 2** (5 regiones Rastro: La Libertad, Lambayeque, Piura, Cajamarca, Cusco): PRD y backlog en `docs/PRD_CEPLAN_Rastro_Fase2_5Regiones_v1.md` y `docs/BACKLOG_CEPLAN_Rastro_Fase2_5Regiones_v1.md` — puente ceplan-estrategico↔geo, indicadores SEG/PBA, spike capas geo, memos regionales.
- **Sprint 6 cerrado:** spike CG-25 (`npm run spike:layers`); matriz cobertura 5 regiones; contratos API territorial y PBA; tests piloto 5 deptos.
- **Sprint 7 cerrado:** `GET /api/crossref/territorial` (ceplan-estrategico) + `GET /api/territories/summary` (ceplan-geo); 2 tools MCP nuevos; validación documentada en `docs/validacion-crossref-territorial-5-regiones-2026-08.md`.
- **Sprint 8 cerrado:** `GET /api/indicators/seg`, `/execution-efficiency`, `/plan-budget-alignment`; proxy departamental MEF+INFOBRAS; CLI `indicators:regional`; 3 tools MCP nuevos (60 total).
- **Sprint 9 cerrado:** plantilla memo Rastro + 6 memos Lambayeque/Piura; preflight PARCIAL documentado; geo verificado (38 y 65 distritos).
- **Sprint 10 cerrado — Fase 2 Rastro lista para review:** memos Cajamarca y Cusco; índice comparativo 5 regiones; release checklist; 60 tools MCP; 10 memos regionales + plantilla.

Sesión anterior (2026-08-24):

- INFOBRAS e Invierte.pe fueron refrescados para La Libertad; se recorrieron los cinco rangos
  del CSV de Invierte publicados por el MEF y se corrigió INFOBRAS para descubrir el enlace
  diario del XLSX en vez de depender de una URL fija.
- El cruce INFOBRAS ↔ radar-ejecución se reconstruyó (75 coincidencias confirmadas y 17
  candidatas) y las nueve APIs disponibles respondieron correctamente en sus puertos.
- Se detectó y corrigió una colisión temporal: 4002 servía una segunda instancia de
  `compras-publicas`; ahora vuelve a servir `radar-inversiones`.

Registro técnico reproducible, resultados de recarga y límites:
[`docs/SESION_ACTUALIZACION_DATOS_Y_RUNTIME_2026-08-24.md`](SESION_ACTUALIZACION_DATOS_Y_RUNTIME_2026-08-24.md).

## Apps

| App | Dominio | API | Postgres | Estado |
|---|---|---|---|---|
| `radar-ejecucion` | Presupuesto/ejecución (MEF) + benchmark territorial | 4000 | 5432 | Construida, probada, verificada |
| `compras-publicas` | Contrataciones (OECE/OCDS) + proveedores/concentración | 4001 | 5433 | Construida, probada, verificada |
| `radar-inversiones` | Inversiones (Invierte.pe) | 4002 | 5434 | Construida, probada, verificada |
| `infobras` | Obras públicas (Contraloría) | 4003 | 5435 | Construida, probada, verificada |
| `ceplan-estrategico` | Gestión estratégica del Estado (ObservaPerú, agregado por nivel de gobierno) | 4004 | 5436 | Construida, probada, verificada |
| `ceplan-geo` | GeoServer (capas territoriales/infraestructura + red hídrica/proyectos agro) | 4005 | 5437 (PostGIS) | Construida (API) |
| `identidad-fiscal` | Padrón RUC (SUNAT) + cruce con proveedores/entidades | 4006 | 5438 | Construida, probada, verificada |
| `salud-institucional` | Score compuesto por entidad (agrega las otras 5, sin base propia) | 4007 | — | Construida, probada, verificada |
| `proveedores-sancionados` | Inhabilitaciones/multas del Tribunal de Contrataciones (RNP/OECE) | 4008 | 5439 | Construida, probada, verificada |
| `actividad-agraria` | Series MIDAGRI regionales: jornal, alquiler tractor y yunta por departamento | 4009 | 5440 | Construida (API) |
| `seguridad-ciudadana` | Denuncias policiales SIDPOL (MININTER) por distrito/mes/modalidad | 4010 | 5441 | Construida (API) |
| `bcrp-comercio-exterior` | Comercio exterior agregado nacional (BCRP PN38714–PN38723) | 4011 | 5442 | Construida (API) |
| `inversion-privada` | Cartera APP/PA + OxI + GIS PROINVERSIÓN (VERTIX / investinperu.pe) | 4012 | 5443 | Construida, probada, verificada |
| `bcrp-la-libertad` | Síntesis de Actividad Económica regional (BCRP Sucursal Trujillo) — ingesta manual | 4013 | 5444 | Construida, probada, verificada (parcial: 7/10 anexos) |

## `bcrp-la-libertad` — ingesta manual, distinto a todo el resto del proyecto (2026-08-28)

A diferencia de los demás conectores (todos automatizados vía HTTP), este necesita que un
humano descargue el PDF mensual con su navegador: `bcrp.gob.pe` está detrás de un WAF
(Incapsula, challenge JS) que bloquea `curl` y `WebFetch` — confirmado en vivo, incluso
reintentando con cookie-jar. No es el mismo tipo de bloqueo que tuvo INFOBRAS (ahí era de
red/IP y se resolvió corriendo la ingesta en otra máquina); acá ninguna máquina sin navegador
real con JS puede resolver el challenge.

El PDF sí es parseable: `pdf-parse` v2 (`getText()`) extrae texto tabulado (`\t`) limpio para
7 de los 10 ANEXOS del reporte (agropecuario, pesca, minería, manufactura-índice, crédito,
depósitos, **ejecución presupuestal** — el más útil para cruzar con `radar-ejecucion`). Los
otros 3 (manufactura-%var, morosidad, importaciones Salaverry) usan un layout donde los
valores van separados por espacio en vez de tab, y algunos valores >999 usan espacio como
separador de miles — ambiguo de partir sin arriesgar corromper datos, así que se dejan sin
ingerir (0 filas, no un error silencioso). Ver
`docs/adr/0014-bcrp-la-libertad-sintesis-economica-ingesta-manual.md`.

Verificado con el PDF real de enero 2026 (`docs/sintesis-la-libertad-01-2026.pdf`, descargado
por el usuario): 650 filas ingeridas, gasto no financiero total enero 2026 = S/ 757M (coincide
con el texto narrativo del reporte).

## `mcp-server` (2026-08-26)

Servidor MCP standalone (`mcp-server/`, transporte stdio) que expone las APIs como tools de
solo lectura para un agente Claude — un tool por endpoint `GET /api/*` real, sin transformar el
shape de la respuesta. Catálogo derivado de `docs/conectores.md` (cada `description` de tool
incluye cobertura parcial/completa y el recordatorio de que ninguna ingesta tiene scheduler).
Validado manualmente: registro del catálogo, llamada con query params reales contra una API
fake, y manejo de error de conectividad cuando la API de destino no responde — más test
automatizado del catálogo (`mcp-server/src/__tests__/catalog.test.ts`). No incluye las ingestas
(`npm run ingest:*`, fuera de alcance) ni autenticación (mismo estado que las APIs que agrega — ver
`mcp-server/README.md`, sección "Alcance actual y lo que falta", antes de exponerlo fuera de
`localhost`).

77 tools (14 apps). Ampliación 2026-08-28: cartera VERTIX APP/PA + OxI + GIS (`inversion-privada`);
nueva app `bcrp-la-libertad` (ingesta manual, ver sección dedicada arriba).

## Cruces entre apps (todos verificados con datos reales)

- **radar-inversiones ↔ radar-ejecucion**, por `SEC_EJEC` (match exacto, sin fuzzy) —
  `GET /api/crossref` en `radar-inversiones/api`.
- **compras-publicas ↔ radar-ejecucion**, por nombre de entidad (matcher difuso,
  `confirmada`/`candidata`) — `GET /api/crossref` en `compras-publicas/api`, persistido en
  `entity_crosswalk` (recalculable vía `npm run crossref:build`).
- **infobras ↔ radar-inversiones**, por `CUI` (match exacto, sin fuzzy) —
  `GET /api/crossref` en `infobras/api`.
- **infobras ↔ radar-ejecucion**, por nombre de entidad (mismo matcher difuso que
  compras-publicas, copiado, `confirmada`/`candidata`) — `GET /api/crossref/ejecucion` en
  `infobras/api`, persistido en `entity_crosswalk` (recalculable vía `npm run crossref:build`,
  necesita `EJECUCION_DATABASE_URL` en `.env`). La migración que crea esta tabla
  (`003_entity_crosswalk.sql`) existía en el código desde antes pero nunca se había aplicado
  ni poblado — se corrió por primera vez el 2026-08-20 (74 confirmadas + 15 candidatas de 121
  entidades).
- **ceplan-estrategico ↔ radar-ejecucion**, por nivel de gobierno (`GN`/`GR`, único bucket
  exacto entre las dos fuentes) — `GET /api/crossref` en `ceplan-estrategico/api`.
- **identidad-fiscal ↔ compras-publicas**, por RUC exacto — `awards.supplier_id` ya trae el
  RUC embebido (`PE-RUC-<11 dígitos>`, 77.3% de cobertura en la muestra real) — `GET
  /api/crossref` en `identidad-fiscal/api`. Marca proveedores con estatus tributario
  irregular (BAJA/NO HABIDO en SUNAT) que ganaron contratos públicos.
- **identidad-fiscal ↔ radar-ejecucion**, por nombre de entidad — reutiliza tal cual el
  matcher difuso de `compras-publicas` (sin ninguna modificación, copiado a
  `identidad-fiscal/api/src/crossref/match.ts`) — `GET /api/crossref/entidades`. Resuelve el
  RUC de cada gobierno/municipalidad para chequear su propio estatus tributario.
- **proveedores-sancionados ↔ compras-publicas**, por RUC exacto (mismo patrón que
  identidad-fiscal) — `GET /api/crossref` en `proveedores-sancionados/api`. Señal más fuerte
  que el estatus tributario: una inhabilitación `VIGENTE` es una prohibición legal de
  contratar con el Estado, no solo una irregularidad administrativa.
- **actividad-agraria ↔ radar-ejecucion**, por `departamento` exacto (sin fuzzy) — `GET
  /api/crossref` en `actividad-agraria/api`. Cruza el jornal agrícola (MIDAGRI) contra la
  ejecución de la función AGROPECUARIA, distinguiendo ejecución con sede regional/local de
  gasto de Gobierno Nacional dirigido al departamento.
- **seguridad-ciudadana ↔ radar-ejecucion**, por `departamento` exacto (sin fuzzy, mismo patrón
  que actividad-agraria) — `GET /api/crossref` en `seguridad-ciudadana/api`. Cruza denuncias
  SIDPOL contra la ejecución de la función ORDEN PUBLICO Y SEGURIDAD — dos series independientes
  para lectura conjunta, no implica causalidad.
- **inversion-privada (OxI) ↔ radar-inversiones**, por `codigo_referencia` vs. `codigo_snip`
  (match exacto, sin fuzzy — mismo patrón que el cruce CUI de `infobras`) —
  `GET /api/crossref/oxi` en `inversion-privada/api`. Solo cubre OxI (761 nacional, 55 en La
  Libertad); la cartera APP/PA sigue sin CUI/SNIP y por tanto sin cruce exacto posible (ver
  `docs/adr/0012-inversion-privada-oxi-y-cruce-snip-con-radar-inversiones.md`). Verificado:
  45/55 proyectos OxI de La Libertad confirmados en Invierte.pe.
- **inversion-privada (GIS) ↔ private_investment_projects (APP/PA)**, por `IDPROYECTO` =
  `vertix_id` (match exacto, sin fuzzy) — `GET /api/gis/projects/:vertixId` en
  `inversion-privada/api`. Verificado: 151/156 `IDPROYECTO` únicos del feed GIS matchean un
  `vertix_id` ya ingerido (ver
  `docs/adr/0013-inversion-privada-gis-vertix-geometria-sin-postgis.md`). `GET
  /api/gis/geojson?departamento=` sirve un `FeatureCollection` real y descargable, sin login —
  cierra el límite "sin mapa" que quedaba documentado en ADR-0011.
- **salud-institucional** no es un cruce par-a-par, es un agregador: combina ejecución
  (radar-ejecucion, propia), obras no paralizadas (infobras, vía su crosswalk), inversiones
  sin sobrecosto (radar-inversiones, SEC_EJEC exacto), compras no concentradas
  (compras-publicas, vía su crosswalk) y salud tributaria de proveedores (identidad-fiscal,
  RUC exacto) en un solo score por `entity_code`. Si una fuente no tiene dato para una
  entidad, ese componente se omite del promedio — nunca se imputa 0 ni 100 por ausencia.

## Cómo levantar todo de nuevo

Por cada app con base propia (`apps/<nombre>/api` — todas menos `salud-institucional`):

```bash
docker compose up -d          # levanta Postgres (los datos ya ingeridos persisten en el volumen)
cp .env.example .env          # si no existe ya
npm run migrate               # idempotente, solo aplica migraciones nuevas
npm run dev                   # API
```

`salud-institucional/api` no tiene `docker-compose.yml` ni `migrate` — solo `.env` con las
connection strings de las otras bases y `npm run dev`.

Los contenedores de Postgres quedan corriendo entre sesiones (no se detienen al cerrar);
los procesos `npm run dev` sí se detienen al final de cada sesión.

Los puertos de Postgres se publican en `127.0.0.1` (no `0.0.0.0`) y Adminer ya no se
levanta por defecto — solo en `radar-ejecucion` y `ceplan-estrategico`, vía
`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d adminer`.

Cada API aplica `helmet`, CORS restringido vía `WEB_ORIGIN` en `.env` (opcional) y rate limiting (100 req/min) en `/api/*`.

## Documentación

- `docs/conectores.md` — ficha técnica por conector (qué hace, cómo, con qué frecuencia,
  fuente de datos), con link al data contract correspondiente para el detalle profundo.
- `docs/data-contracts/` — un archivo por fuente externa (MEF, OECE, Invierte.pe, INFOBRAS,
  ObservaPerú/CEPLAN, Padrón RUC de SUNAT, Tribunal de Contrataciones vía RNP/OECE), con lo
  confirmado en vivo: URLs reales, formato real, anomalías de datos, tasas de cobertura.
  También `salud-institucional-score.md`, que documenta la fórmula del score compuesto y sus
  limitaciones (pesos iguales sin calibrar, no distingue cruce exacto de difuso).
- `docs/adr/` — decisiones arquitectónicas con su razón, no solo el qué.
- `docs/Follow_the_Sol_Peru_Public_Spending_Graph.pdf` — el documento fuente original con el
  roadmap de apps.
- `docs/analisis-la-libertad-2026-08.md` — primer análisis de contenido (brechas y
  competitividad), con draft de post listo.
- `docs/analisis-la-libertad-desarrollo-economico-2026-08.md` — segundo análisis (inversión
  productiva territorial, riego costa vs. sierra).

## `ceplan-estrategico` — Sprint 1 (2026-08-17)

Ingesta real desde `https://observaperu.ceplan.gob.pe` (JSON estático, no requiere sesión —
ver data contract). El modelo per-entidad planeado originalmente no fue posible con datos
públicos: se ingieren indicadores agregados por nivel de gobierno (`GN`/`GR`/`MP`/`MD`/`Total`),
no por pliego. `GET /api/indicators` expone el catálogo completo; `GET /api/crossref` cruza
con `radar-ejecucion` (GN/GR únicamente, único bucket exacto entre las dos fuentes). Web:
página de indicadores (`/`, filtro por nivel de gobierno) y de cruce (`/cruce`). Detalle
completo, incluida la limitación de PIM=0 en la muestra de `radar-ejecucion` para 2026, en
`docs/data-contracts/ceplan-strategic-planning.md`.

### Documentación de planificación de CEPLAN
- Data contracts: `docs/data-contracts/ceplan-strategic-planning.md`, `docs/data-contracts/ceplan-geo.md`
- ADRs: `docs/adr/0003-ceplan-estrategico-app-standalone-y-connector-observaperu.md`, `docs/adr/0004-ceplan-geo-app-standalone-y-connector-geoserver.md`
- Matriz de cruces: `docs/adr/0005-matriz-de-cruces-ceplan-con-ecosistema-existente.md`
- Roadmap: `docs/roadmap-ceplan.md`

### Indicadores derivados — Fase 2 planificada (Sprints 8–10)

Ver [`docs/PRD_CEPLAN_Rastro_Fase2_5Regiones_v1.md`](PRD_CEPLAN_Rastro_Fase2_5Regiones_v1.md):

- **Strategic Execution Gap (SEG)**: nacional CEPLAN (CUMP03−CUMP02) + proxy departamental MEF/INFOBRAS
- **Execution Efficiency**: ratio avance físico / ejecución presupuestal
- **Plan–Budget Alignment**: mapeo heurístico dimensión CEPLAN → función MEF por departamento
- **Enriquecimiento territorial**: cruce `ceplan-estrategico` ↔ `ceplan-geo` por departamento (no per-entidad)

`salud-institucional` (2026-08-20) cubre parcialmente el espíritu de SEG/Execution Efficiency
con datos reales de 5 fuentes, aunque no usa CEPLAN como insumo — es un índice paralelo, no
una implementación de estos indicadores.

## `identidad-fiscal` (2026-08-20)

Ingiere el Padrón Reducido RUC de SUNAT (18.3M contribuyentes → filtrado a personas jurídicas
RUC-20, ~2.3M) — descarga directa sin login, se actualiza a diario. `GET /api/contribuyentes`
(búsqueda), `GET /api/crossref` (proveedores irregulares) y `GET /api/crossref/entidades`
(RUC de gobiernos/municipalidades). Ingesta real verificada: 2,339,313 filas aceptadas, 0
rechazadas. Hallazgo de ingeniería: la primera versión (una sola transacción para 2.3M filas)
era patológicamente lenta (40+ min); commits por lote lo bajó a ~4 minutos. Detalle completo
en `docs/data-contracts/sunat-padron-ruc.md`.

## `salud-institucional` (2026-08-20)

Sin base propia — agrega en vivo las otras 5 apps en un score compuesto 0-100 por entidad
(`GET /api/score`). Verificado: 121/121 entidades de La Libertad con al menos un componente
disponible. Hallazgo de ingeniería: el cruce de entidades sin acotar por región tardaba 89s
por request (comparaba contra los 2.3M contribuyentes completos); acotar por prefijo de
ubigeo del departamento lo bajó a ~2s. Detalle completo en
`docs/data-contracts/salud-institucional-score.md`.

## `proveedores-sancionados` (2026-08-20)

Ingiere inhabilitaciones y multas del Tribunal de Contrataciones vía el portal de RNP/OECE
(`rnp.gob.pe`) — descartado explícitamente el dataset homónimo de `datosabiertos.gob.pe` por
estar abandonado desde 2018. El export real se replica por HTTP directo (`GET` para cookie de
sesión + `POST` al endpoint real del botón "Exportar Excel") sin necesitar navegador ni
resolver el captcha visible en la página — esa función específica del sitio no lo valida ni
en cliente ni en servidor (confirmado con MD5 idéntico contra la descarga manual). Ingesta
real: 17,919 filas (11,208 inhabilitaciones + 6,681 multas tras dedup), 1 sola rechazada.
`GET /api/sanciones?ruc=` y `GET /api/crossref`. Detalle completo, incluido el caveat de que
"vigente hoy" no equivale a "vigente al momento de la adjudicación", en
`docs/data-contracts/proveedores-sancionados.md`.

## `seguridad-ciudadana` (2026-08-27)

Ingiere SIDPOL (MININTER, vía `datosabiertos.gob.pe`) — denuncias policiales ya agregadas por
distrito/mes/modalidad (Robo, Hurto, Extorsión, Estafa, Violencia contra la mujer e
integrantes, Otros, Secuestro), CSV nacional único enero 2018–julio 2026 (27.4 MB, no requiere
streaming por rangos como MEF). Portal detrás de un WAF que bloquea requests sin User-Agent de
navegador (mismo patrón que `actividad-agraria`). `GET /api/denuncias` (consulta con filtros
departamento/provincia/año/modalidad) y `GET /api/crossref` (cruce con gasto MEF en la función
ORDEN PUBLICO Y SEGURIDAD). Ingesta real verificada: 369,100 filas nacionales, 0 rechazadas;
21,902 filas para La Libertad (381,718 denuncias acumuladas 2018-2026). `UBIGEO_HECHO` pierde
el cero inicial en el origen para departamentos 01-09 (ej. `10202` en vez de `010202`) — se
reconstruye a 6 dígitos en la normalización; La Libertad (departamento 13) nunca tiene este
problema. Certificada `COMPLETA_VERIFICADA` en `territorial_coverage`.

## Fix de datos — PIM=0 en `radar-ejecucion` (2026-08-18)

`budget_execution.pim` estaba en 0 en el 100% de las filas ingeridas: el MEF no puebla
`MONTO_PIA`/`MONTO_PIM` en las filas de movimiento mensual del CSV (`MES_EJE` 1-7), solo en
filas separadas `MES_EJE=0` (que a su vez traen `MONTO_DEVENGADO` en 0). Una ingesta de una
sola ventana de bytes solo capturaba uno de los dos campos. Se implementó
`ingestMefFullYearForDepartamento` — descarga las 16 secciones (2 niveles de gobierno × 8
meses) necesarias para LA LIBERTAD, agrega todo en una sola pasada y escribe PIA/PIM/devengado
coherentes en las mismas filas. Resultado real verificado: Gobiernos Regionales 49.2% de
avance (S/2,242.1M devengado / S/4,558.8M PIM), Gobiernos Locales 39.9%
(S/1,092.5M / S/2,738.0M). Detalle completo en
`docs/data-contracts/mef-presupuesto-ejecucion.md`.

## Pendientes conocidos (no bloqueantes, para cuando se retome)

1. ~~`ceplan-estrategico`: modelo per-entidad~~ — **bloqueado por fuente**: ObservaPerú solo trae agregados por nivel de gobierno; `GET /api/meta/aplicativo` y `npm run probe:aplicativo` verifican en vivo si Aplicativo CEPLAN V.01 vuelve a exponer PEI/POI per-pliego. Tablas `strategic_objectives`/`strategic_actions`/`poi_activities`/`physical_targets` siguen vacías por diseño.
2. ~~Implementación de `ceplan-geo`~~ — **hecho (API-only, 2026-08-26)**. Ingesta extendida 2026-08-27: `cb_redhidricaprinx` (`ingest:hydro-principal`) e `ip_prysecagr` (`ingest:projects-sectorial`). `cb_redhidricax` sigue POSPONER (345k).
3. ~~El resto del PRD de INFOBRAS~~ — **hecho de punta a punta (2026-09-02)**: señales Cost Drift/Gap físico-financiero/Paralización, crosswalk INFOBRAS↔radar-ejecucion con niveles de confianza, tool MCP (`infobras_crossref_ejecucion`, PR #60), y el **dashboard consolidado** en `rastro-web` (PR #63) — `/distrito/:ubigeo` expone las señales, `/auditoria/entidades-infobras` expone el crosswalk. `docs/adr/0002-infobras-app-standalone-y-cruce-por-cui.md` actualizado para reflejarlo.
4. ~~Ingestas parciales acotadas a La Libertad~~ — **mitigado (2026-08-27)**: defaults de `.env.example` y `DEFAULT_TERRITORIAL_SCOPE` apuntan solo a `LA LIBERTAD`; scripts `ingest:libertad` por app y orquestador `scripts/ingest-la-libertad-completo.sh` para cobertura verificada.
5. ~~Migración a Next 16 + React 19~~ — **N/A**: frontends web eliminados; el proyecto es API-only.
6. ~~BCRP comercio exterior~~ — **hecho (2026-08-27)**: app `bcrp-comercio-exterior` (API 4011) ingiere series nacionales `PN38714BM`–`PN38723BM`; sin desagregado departamental (`RD38*` sigue congelado en origen).
7. ~~Secret `CLOUDFLARE_DEPLOY_HOOK_URL` sin crear~~ — **resuelto de otra forma (verificado 2026-09-02)**: nunca se creó el Deploy Hook, pero `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` sí se configuraron en algún punto, y el paso de `wrangler pages deploy` (preferido sobre el hook) corre en verde desde 2026-08-31. Ver sección "Corrección — pendiente #7" arriba.
