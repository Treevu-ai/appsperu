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
| Build command | `npm --prefix apps/rastro-web run build` |
| Build output | `apps/rastro-web/dist` |
| Deploy on push | GitHub App (Cloudflare) |
| Deploy semanal | Cron miércoles 12:00 UTC → curl a Deploy Hook |
| Secret requerido | `CLOUDFLARE_DEPLOY_HOOK_URL` |
| Decisión cerrada | **No Vercel**. Solo Cloudflare o Fly.io. |

---

## Pre-requisitos

1. Cuenta Cloudflare con acceso al proyecto `rastro`.
2. Repositorio `Treevu-ai/appsperu` con la carpeta `apps/rastro-web/`.
3. Las 14 APIs de appsperu accesibles desde internet (puertos 4000–4013) o un proxy público (ej. `https://api.rastro.pe/radar-ejecucion`).

---

## Setup en Cloudflare (una sola vez)

### 1. Crear el proyecto y conectar el repo

1. Dashboard Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Selecciona el repo `Treevu-ai/appsperu` → autorice la GitHub App de Cloudflare.
3. **Project name:** `rastro` (subdominio asignado por Cloudflare: `rastro-5zm.pages.dev` — el sufijo `-5zm` lo agrega Cloudflare automáticamente cuando `rastro.pages.dev` ya está tomado).
4. **Framework preset:** *Vite* (Cloudflare lo detecta).
5. **Build command:** `npm --prefix apps/rastro-web run build`
6. **Build output directory:** `apps/rastro-web/dist`
7. **Root directory:** dejar en blanco (la build ya apunta al subdirectorio).
8. **Environment variables:** agregar las 14 `VITE_API_BASE_URL_*` apuntando a tus APIs públicas. Recomendado: proxy público único (`https://api.rastro.pe/<app>`).
9. **Save and Deploy.** El primer build tarda ~2 min.

A partir de aquí, **cada push a `master` que toque `apps/rastro-web/**` triggerea rebuild automático** vía la GitHub App. No necesitas hacer nada más para el deploy on push.

### 2. Crear el Deploy Hook (para workflow_dispatch y cron semanal)

Los triggers que **no son push** (botón "Run workflow" en GitHub Actions, o el cron semanal) necesitan un endpoint que le diga a Cloudflare "rebuildea". Ese endpoint es un Deploy Hook:

1. Cloudflare → **Pages** → `rastro` → **Settings** → **Builds** → **Deploy hooks** → **Create hook**.
2. **Name:** `GitHub Actions weekly + manual`
3. **Branch:** `master`
4. **Deploy hook URL:** copia la URL que Cloudflare genera (es un secreto, no la pegues en el repo).

### 3. Agregar el secret en GitHub

1. GitHub → repo `appsperu` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. **Name:** `CLOUDFLARE_DEPLOY_HOOK_URL`
3. **Value:** la URL del paso 2.

Con esto, el workflow `Rastro Web Deploy` puede triggerear redeploys manuales y semanales sin tokens de Cloudflare.

### 4. Dominio personalizado: `rastro.fyi`

El proyecto Pages `rastro` quedó publicado en `rastro-5zm.pages.dev` (Cloudflare le agregó el sufijo `-5zm` porque `rastro.pages.dev` ya estaba tomado). El dominio `rastro.fyi` no vive en la misma cuenta/zona que ese proyecto, así que Cloudflare **no** auto-genera el DNS — pide verificación manual vía CNAME:

1. **Workers & Pages** → proyecto `rastro` → tab **Custom domains** → **Set up a custom domain** → escribe `rastro.fyi` → **Continue**. Queda en estado **Verifying** y Cloudflare muestra el registro que hay que crear.
2. En el proveedor de DNS que controla `rastro.fyi` (zona de Cloudflare si el dominio ya está ahí, o el panel del registrador si no): crea un `CNAME` — **Name:** `rastro.fyi` (o `@`) → **Target:** `rastro-5zm.pages.dev` → si la zona es de Cloudflare, **Proxy status:** Proxied (naranja).
3. Guarda y vuelve a **Custom domains** en el proyecto Pages → botón **Check DNS records** para forzar la verificación. El estado pasa de **Verifying** a **Active** cuando propague (hasta 24 h, normalmente minutos si el DNS ya está en Cloudflare) y Cloudflare emite el certificado TLS automáticamente.
4. Repite con `www.rastro.fyi` si quieres servir ambas variantes, y agrega una **redirect rule** (`www` → raíz o viceversa) en **Rules → Redirect Rules** de la zona `rastro.fyi` para no dejar la otra variante huérfana (los custom domains de Pages no redirigen entre sí automáticamente).
5. Una vez **Active**, `rastro-5zm.pages.dev` sigue funcionando como fallback (Cloudflare nunca lo retira), pero `rastro.fyi` pasa a ser la URL canónica — ya reflejada en `index.html`, `robots.txt`, `sitemap.xml`, `llms.txt` y `citar-rastro.md` de este repo.

### 5. Migrar el URL viejo (si tenías `alsolperu.pages.dev`)

Para no perder SEO de enlaces antiguos:

1. Cloudflare Pages → proyecto viejo `alsolperu` → **Settings** → **Custom domains / redirects** → crear un **bulk redirect** (`301`) desde `alsolperu.pages.dev/*` a `https://rastro.fyi/$1`. Cloudflare lo soporta nativamente.
2. (Opcional) Google Search Console → **Change of Address** tool, si `alsolperu.pages.dev` estaba indexado.

---

## Workflows de GitHub Actions

Hay 2 workflows en `.github/workflows/`:

| Workflow | Trigger | Acción |
|---|---|---|
| `rastro-web-ci.yml` | PR + push a master | typecheck + lint:meta + test + build (CI checks) |
| `rastro-web-deploy.yml` | push a master + `workflow_dispatch` + **cron miércoles 12:00 UTC** | CI + curl al Deploy Hook → Cloudflare rebuild |

El **cron semanal** (`0 12 * * 3`) refresca el build cada miércoles a las 07:00 hora Perú para arrastrar los datos más recientes de las 14 APIs (ingestas diarias/semanales).

### Disparar un redeploy manual

GitHub → tab **Actions** → workflow **Rastro Web Deploy** → **Run workflow** → **Run**.

---

## SEO + GEO (sin configuración adicional)

Cloudflare Pages sirve los archivos `public/` directamente en la raíz. No requieren config especial.

- `public/robots.txt` — permite indexar todo y declara el `Sitemap:`.
- `public/sitemap.xml` — incluye las rutas públicas.
- `public/llms.txt` — descripción del sitio para LLM crawlers (ChatGPT, Perplexity, Claude).
- `index.html` — JSON-LD con `Organization`, `WebSite` y `SoftwareApplication` (este último para que AI crawlers descubran el MCP server con sus 82 tools).
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
