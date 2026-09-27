# Deploy — Rastro en Cloudflare Pages

> **RASTRO** convierte señales dispersas en inteligencia clara para decidir mejor.
> *Cada señal deja un rastro. Nosotros lo hacemos visible.*

**Rastro** es una plataforma de inteligencia que ayuda a equipos y organizaciones a encontrar, conectar y entender las señales que importan. Transformamos información dispersa en contexto accionable, con foco en trazabilidad, claridad y decisiones más seguras.

Porque detrás de cada cambio, oportunidad o riesgo hay un rastro. Y verlo a tiempo cambia lo que viene después.

---

## TL;DR

| Dato | Valor |
|---|---|
| Plataforma | Cloudflare Pages |
| Proyecto | `rastro` |
| URL pública | https://rastro.fyi/ (custom domain sobre el proyecto Pages `rastro`; fallback `rastro-5zm.pages.dev`) |
| Repo | `Treevu-ai/appsperu` (monorepo) |
| App | `apps/rastro-web/` (Vite 8 + React 19) |
| Root directory (dashboard) | `apps/rastro-web` |
| Build command (Pages vía Git) | `npm ci && npm run build` |
| Build output (Pages vía Git) | `dist` (relativo al root directory de arriba) |
| Config wrangler activa | `apps/rastro-web/wrangler.toml` — fuente de verdad real de `[[kv_namespaces]]`, ver §6 |
| Deploy on push | GitHub App (Cloudflare) — confirmado vía API (`source.type: "github"`), no el workflow de GitHub Actions (ver §Workflows) |
| Deploy semanal | Cron miércoles 12:00 UTC → curl a Deploy Hook |
| Secret requerido (deploy manual/cron) | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` **o** `CLOUDFLARE_DEPLOY_HOOK_URL` |
| Decisión cerrada | **No Vercel**. Solo Cloudflare o Fly.io. |

---

## Pre-requisitos

1. Cuenta Cloudflare con acceso al proyecto `rastro`.
2. Repositorio `Treevu-ai/appsperu` con la carpeta `apps/rastro-web/`.
3. Las 14 APIs accesibles vía proxy en el VPS (`https://api.rastro.pe/<app>`). Runbook: **`docs/API_PROXY_DEPLOY.md`**.
4. (Opcional pero recomendado) `api.rastro.pe` protegido con Cloudflare Access — ver **`docs/API_ACCESS_PROTECTION.md`**. Sin este paso, las 14 APIs están abiertas a internet (cualquiera puede descubrirlas por el certificado SSL).

```bash
# En el VPS (149.104.66.100)
cd /opt/appsperu
bash scripts/start-all-postgres.sh
bash scripts/start-all-apis.sh --build
CERTBOT_EMAIL=tu@email.com sudo bash scripts/setup-api-rastro-pe.sh
bash scripts/health-check-apis.sh
```


---

## Setup en Cloudflare (una sola vez)

### 1. Crear el proyecto y conectar el repo

1. Dashboard Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Selecciona el repo `Treevu-ai/appsperu` → autorice la GitHub App de Cloudflare.
3. **Project name:** `rastro` (subdominio asignado por Cloudflare: `rastro-5zm.pages.dev` — el sufijo `-5zm` lo agrega Cloudflare automáticamente cuando `rastro.pages.dev` ya está tomado).
4. **Framework preset:** *Vite* (Cloudflare lo detecta) o *None*.
5. **Root directory:** `apps/rastro-web`. **Crítico** — con esto en blanco (config vieja de este repo, incidente 2026-09-22), Cloudflare nunca encuentra `functions/` y las Pages Functions caen en silencio al fallback del SPA en TODAS las rutas `/api/*`, sin error visible en el sitio. Confirma el valor real con la API si tienes dudas:
   ```bash
   curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/rastro" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq .result.build_config
   ```
6. **Build command:** `npm ci && npm run build` (relativo al root directory de arriba — no repetir `--prefix apps/rastro-web`, eso era del build viejo con root directory en blanco).
7. **Build output directory:** `dist` (también relativo al root directory).
8. **Deploy command:** dejar **vacío** (Pages publica el output automáticamente).
9. **Environment variables:** el repo ya trae `.env.production` con las 14 URLs en `https://api.rastro.pe/<app>`. Opcional: duplicarlas en el dashboard (Production) — sobreescriben el archivo. Script automatizado: `bash scripts/set-cloudflare-pages-env.sh` (requiere `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`).
10. **Save and Deploy.** El primer build tarda ~2 min.

A partir de aquí, **cada push a `master` que toque `apps/rastro-web/**` triggerea rebuild automático** vía la GitHub App. No necesitas hacer nada más para el deploy on push. Confirmado con la API (`GET /pages/projects/rastro` → `source.type: "github"`) que este es el mecanismo activo hoy, no el workflow `rastro-web-deploy.yml` de GitHub Actions (ver más abajo) ni `scripts/cloudflare-rastro-deploy.sh` — ese script y el `wrangler.toml` de la raíz del repo (`[assets] directory = "./apps/rastro-web/dist"`) quedaron de un intento anterior de usar Workers Builds; no están en uso, pero tampoco se borraron por si algún día se vuelve a esa vía.

#### 1b. Gotchas de Pages Functions en este proyecto (3 incidentes reales, 2026-09-22)

Estos tres se dieron encadenados el mismo día — cada uno destapaba al siguiente una vez arreglado. Documentados acá para que no se repitan:

1. **`root_dir` vacío → `functions/` nunca se encuentra.** Ver el paso 5 de arriba. Sin esto, `/api/*` sirve el HTML del SPA (200 pero vacío) en vez de JSON — parece que "el sitio funciona" porque no hay error 4xx/5xx visible, solo respuestas equivocadas.
2. **`with { type: "json" }` rompe el bundler interno de Pages.** El wrangler que Cloudflare usa para bundlear Functions (3.114.17 al momento de escribir esto) es más viejo que el `wrangler` que usas en tu CLI local y no soporta import attributes modernos. Si un import de `.json` en `functions/**/*.ts` usa `with { type: "json" }`, el build de Functions falla con `Expected ";" but found "with"` — y tumba **todas** las Functions del deploy, no solo el archivo que lo tiene. Import plano (`import x from "./y.json";`, sin atributo) funciona igual en local (esbuild/Vite lo soportan nativamente) y en Cloudflare.
3. **`apps/rastro-web/wrangler.toml` sincroniza los KV bindings del dashboard, no los espeja.** Cloudflare pisa `deployment_configs.production.kv_namespaces` del proyecto para que coincida con lo que declara este `wrangler.toml`, en cada build. Si agregas un binding nuevo por el dashboard (Settings → Functions → KV namespace bindings) pero no lo agregas también acá, el próximo deploy **lo borra**. `wrangler.toml` es la única fuente de verdad real — el dashboard es solo lo que refleja la última sincronización.

### 2. Crear el Deploy Hook (para workflow_dispatch y cron semanal)

Los triggers que **no son push** (botón "Run workflow" en GitHub Actions, o el cron semanal) necesitan un endpoint que le diga a Cloudflare "rebuildea". Ese endpoint es un Deploy Hook:

1. Cloudflare → **Pages** → `rastro` → **Settings** → **Builds** → **Deploy hooks** → **Create hook**.
2. **Name:** `GitHub Actions weekly + manual`
3. **Branch:** `master`
4. **Deploy hook URL:** copia la URL que Cloudflare genera (es un secreto, no la pegues en el repo).

### 3. Secrets en GitHub (deploy manual y cron)

El workflow `Rastro Web Deploy` puede publicar de dos formas (prefiere la primera):

**Opción A — wrangler (recomendada):** sube el `dist/` que ya pasó CI.

1. Cloudflare → **My Profile** → **API Tokens** → **Create Token** → plantilla **Edit Cloudflare Workers** (incluye Pages:Edit).
2. Copia el **Account ID** desde el dashboard (barra lateral derecha de cualquier zona).
3. GitHub → repo `appsperu` → **Settings** → **Secrets and variables** → **Actions**:
   - `CLOUDFLARE_API_TOKEN` = el token
   - `CLOUDFLARE_ACCOUNT_ID` = el account id

**Opción B — Deploy Hook:** pide a Cloudflare que rebuildee desde Git (requiere que el build en Pages también pase).

1. Cloudflare → **Pages** → `rastro` → **Settings** → **Builds** → **Deploy hooks** → **Create hook**.
2. **Name:** `GitHub Actions weekly + manual` · **Branch:** `master`
3. GitHub → secret `CLOUDFLARE_DEPLOY_HOOK_URL` = la URL del hook.

Con cualquiera de las dos, el workflow puede triggerear redeploys manuales y semanales.

### 4. Dominio personalizado: `www.rastro.fyi` (canónica)

**Decisión:** el sitio vive en **`https://www.rastro.fyi`**. El apex `rastro.fyi` redirige **301 → www**.

1. **Workers & Pages** → proyecto `rastro` → **Custom domains** → agrega solo **`www.rastro.fyi`** (no el apex si da **522**).
2. **DNS** (`rastro.fyi`): `www` → **CNAME** → `rastro-5zm.pages.dev` (Proxied).
3. **Redirect Rule** (Rules → Redirect Rules):
   - **When:** `(http.host eq "rastro.fyi")`
   - **Then:** Dynamic redirect → `https://www.rastro.fyi${http.request.uri.path}` · **301** · preserve query string
4. Automatizado: `CLOUDFLARE_API_TOKEN=... bash scripts/cloudflare-www-canonical.sh`

Verifica:

```bash
curl -sI https://rastro.fyi/ | grep -i location    # -> www
curl -sI https://www.rastro.fyi/ | head -1           # HTTP/2 200
```

> **Diagnóstico rápido**
>
> | Síntoma | Causa probable | Fix |
> |---|---|---|
> | Custom domain **Active** pero **522** | CNAME apunta mal, o no hay deploy exitoso en Pages | CNAME → `rastro-5zm.pages.dev`; revisar Deployments |
> | `rastro.pages.dev` muestra sitio ajeno | Ese subdominio es de otro proyecto | Usar solo `rastro-5zm.pages.dev` |
> | Rutas `/gore/...` dan 404 en refresh | Falta SPA fallback | `public/_redirects` en el repo (ya incluido) |
> | Build falla en Cloudflare | Faltan 14 vars `VITE_*` | Agregar en dashboard **o** confiar en `.env.production` del repo |

### 5. Migrar el URL viejo (si tenías `alsolperu.pages.dev`)

Para no perder SEO de enlaces antiguos:

1. Cloudflare Pages → proyecto viejo `alsolperu` → **Settings** → **Custom domains / redirects** → crear un **bulk redirect** (`301`) desde `alsolperu.pages.dev/*` a `https://rastro.fyi/$1`. Cloudflare lo soporta nativamente.
2. (Opcional) Google Search Console → **Change of Address** tool, si `alsolperu.pages.dev` estaba indexado.

### 6. KV namespaces de las Pages Functions — AL3-11/AL3-17

`apps/rastro-web/functions/` son **Cloudflare Pages Functions** — código server-side que corre en el edge, no en el navegador. Hoy usan 2 namespaces de KV:

| Binding | Para qué | Usado por |
|---|---|---|
| `RATE_LIMIT` | Contador de requests por IP (rate limit + métrica de 429) | `functions/api/search.ts`, `functions/api/rate-limit-stats.ts` |
| `ACCESS_REQUESTS` | Solicitudes del formulario `/solicitar-acceso` (nombre, correo, teléfono, motivo) — retención 90 días | `functions/api/solicitud-acceso.ts` |

Cada namespace nuevo se crea una sola vez por CLI (no hay forma de automatizarlo desde este repo):

1. Desde `apps/rastro-web/`, con `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` configurados o logueado con `npx wrangler login`:
   ```bash
   npx wrangler kv namespace create <NOMBRE_DEL_BINDING>
   ```
   Devuelve algo como:
   ```
   { binding = "<NOMBRE_DEL_BINDING>", id = "abcd1234..." }
   ```
2. Copia ese `id` y agrega el bloque en `apps/rastro-web/wrangler.toml`:
   ```toml
   [[kv_namespaces]]
   binding = "<NOMBRE_DEL_BINDING>"
   id = "abcd1234..."   # el id real
   ```
   **Este archivo es la única fuente de verdad.** Cloudflare sincroniza `deployment_configs.production.kv_namespaces` del proyecto para que coincida con lo que hay acá en cada build — si el binding solo existe en el dashboard (Settings → Functions → KV namespace bindings) y no acá, el próximo deploy lo borra del dashboard también. Ver §1b, incidente 3. No hace falta tocar el dashboard a mano si ya está declarado acá: el propio deploy lo sincroniza.
3. Local: `npx wrangler pages dev dist` simula el KV automáticamente (no necesita el `id` real — solo para producción). `npm run dev`/`vite` normal **no** sirve las Functions; para probarlas localmente hay que buildear (`npm run build`) y correr `wrangler pages dev dist`.

Sin un namespace declarado y bindeado, la Function que lo usa devuelve 500 al intentar leer/escribir en `env.<BINDING>` — ninguna tiene un modo "deshabilitado silenciosamente": `/api/search` sin protección de rate limit, o `/solicitar-acceso` sin poder guardar solicitudes, son peores que fallar fuerte.

---

## Workflows de GitHub Actions

Hay 2 workflows en `.github/workflows/`:

| Workflow | Trigger | Acción |
|---|---|---|
| `rastro-web-ci.yml` | PR + push a master | typecheck + lint:meta + test + build (CI checks) |
| `rastro-web-deploy.yml` | push a master + `workflow_dispatch` + **cron miércoles 12:00 UTC** | CI + deploy vía `wrangler pages deploy` (opción A); cae a Deploy Hook (opción B) solo si faltan los secrets de wrangler |

El **cron semanal** (`0 12 * * 3`) refresca el build cada miércoles a las 07:00 hora Perú para arrastrar los datos más recientes de las 14 APIs (ingestas diarias/semanales).

> Confirmado 2026-09-22 vía la API de Cloudflare (`source.type: "github"`) que un push normal a `master` despliega por la GitHub App nativa de Cloudflare Pages (§1), no por el paso `wrangler pages deploy` de este workflow — ese paso solo dispara si `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` están configurados como secrets. Si en algún momento SÍ lo están, ambos caminos deployan en paralelo para el mismo push (redundante pero inofensivo — el último build que termine gana).

`rastro-web-ci.yml` tiene 2 jobs: `ci` (typecheck + lint:meta + unit + build) y `e2e` (AL3-14, Playwright — ver abajo).

### E2E local (AL3-14 — "JSON de API = JSON renderizado")

La suite (`apps/rastro-web/e2e/*.spec.ts`) corre contra `vite preview` (build de producción), no contra `vite dev` — y **no depende de Postgres ni de las 14 APIs corriendo**: cada test intercepta las llamadas HTTP con `page.route` usando fixtures fijas en `e2e/fixtures/`, y compara el HTML renderizado contra el valor exacto de la fixture. Determinista en CI, no depende de datos reales que cambian.

```bash
cd apps/rastro-web
npx playwright install chromium   # una sola vez
npm run e2e                        # corre playwright.config.ts (build + preview + tests)
npx playwright show-report         # abre el reporte HTML si algo falló
```

No confundir con las Pages Functions (`functions/`, sección 6 arriba): el E2E prueba páginas client-side (ficha de sector, proveedor, distrito), no `/api/search`. Si en el futuro se agrega E2E para el buscador, necesitará `wrangler pages dev dist` en vez de `vite preview`, porque las Functions no corren bajo `vite preview`.

### Disparar un redeploy manual

GitHub → tab **Actions** → workflow **Rastro Web Deploy** → **Run workflow** → **Run**.

---

## SEO + GEO (sin configuración adicional)

Cloudflare Pages sirve los archivos `public/` directamente en la raíz. No requieren config especial.

- `public/robots.txt` — permite indexar todo y declara el `Sitemap:`.
- `public/sitemap.xml` — incluye las rutas públicas.
- `public/llms.txt` — descripción del sitio para LLM crawlers (ChatGPT, Perplexity, Claude).
- `index.html` — JSON-LD con `Organization`, `WebSite` y `SoftwareApplication` (este último para que AI crawlers descubran el MCP server con sus <!-- COUNT:TOOL_COUNT -->190<!-- /COUNT --> tools).
- `index.html` — `<link rel="canonical">` apunta a `https://rastro.fyi/`.

---

## Rollback

1. Cloudflare Pages → **Deployments** → historial.
2. Click en el deploy anterior estable → **Rollback to this deploy**.

---

## Runbook de emergencia

Si la UI muestra "API no disponible" para una app específica:

1. `https://rastro.fyi/estado` — la app caída aparece en rojo.
2. Revisar logs de esa API (puerto 4000–4013).
3. Si la API está caída, re-ejecutar su conector (ver `docs/conectores.md`).
4. Cloudflare Pages sirve el último build válido mientras tanto.

---

## Por qué Cloudflare Pages (no Vercel)

- Costo: free tier generoso para SPAs estáticas, sin límites artificiales.
- Edge: CDN global, baja latencia en LATAM.
- Deploy hooks: un endpoint simple para los triggers no-push.
- Sin lock-in de Vercel Functions (la app es 100% estática).
- Consistente con el resto del stack: Workers para MCP server, R2/D1/KV ya disponibles si se necesitan más adelante.
