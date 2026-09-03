# Protección de `api.rastro.pe` con Cloudflare Access

> **TL;DR**: `api.rastro.pe` (proxy público de las 14 APIs en el VPS
> 149.104.66.100) está abierto a internet. Esto doc activa **Cloudflare
> Access** sobre esa zona con 2 Service Tokens dedicados: uno para la
> Cloudflare Function `/api/search` de `rastro-web`, otro opcional para
> futuros clientes backend (MCP server remoto, prensa, etc.). Los
> visitantes de `www.rastro.fyi` no se enteran — la UI sigue cargando
> igual.

## Por qué

El proxy nginx en `infra/api-proxy/nginx/api.rastro.pe.conf` está expuesto
a internet con TLS (Certbot) pero sin autenticación. El certificado SSL
de Let's Encrypt publica el dominio en los logs de Certificate
Transparency — cualquiera puede descubrir `api.rastro.pe` en minutos y
empezar a scrapear las 14 APIs.

Cloudflare Access es la pieza de **Cloudflare Zero Trust** que se sienta
delante de una zona y exige un JWT firmado por Cloudflare (Service Token
para backend, sesión interactiva para humanos). Es nativo de Cloudflare,
no requiere mantener un Worker, y deja un audit log de cada request.

## Lo que se protege

| Ruta | Antes | Después |
|---|---|---|
| `GET https://api.rastro.pe/<app>/...` desde internet | 200, sin auth | 403 de Cloudflare Access |
| `GET https://api.rastro.pe/<app>/...` desde `www.rastro.fyi` (Function `/api/search` con Service Token) | 200 | 200 (igual) |
| `GET http://localhost:<port>/...` desde el VPS | 200 (sin pasar por Access) | 200 (igual) |
| `GET http://localhost:<port>/...` desde tu laptop (MCP server local) | 200 (sin pasar por Access) | 200 (igual) |

El Service Token **no** protege el tráfico entre el proxy nginx y las 14
APIs en `127.0.0.1` — eso sigue siendo una red de confianza. Protege el
tráfico de internet al proxy, que es lo que está expuesto.

## Setup (una sola vez, dashboard-only)

Cloudflare Access se activa **a mano** desde el dashboard. No hay
automatización segura desde este repo (crear la aplicación requiere
definir un `aud` tag específico de la cuenta; automatizarlo agregaría
más riesgo que valor).

### 1. Crear la aplicación Self-hosted

1. Cloudflare Zero Trust → **Access** → **Applications** → **Add an
   application** → **Self-hosted**.
2. **Application name**: `Rastro API (api.rastro.pe)`.
3. **Session duration**: 1 hora (recomendado para Service Tokens — ver §3).
4. **Application domain**:
   - **Domain**: `api.rastro.pe`
   - **Path**: `*` (cubre las 14 apps)
5. **Identity providers**: dejar el default (One-time PIN si más adelante
   agregas acceso interactivo para prensa/sociedad civil).
6. **Next**.

### 2. Crear la primera Policy (Service Token only)

En la pantalla de policies de la aplicación:

1. **Policy name**: `Service Tokens only`.
2. **Action**: **Allow**.
3. **Session duration**: 24 horas (los Service Tokens son válidos 24h por
   defecto; la Function los renueva en cada request — no requiere
   refresh tokens).
4. **Assign a group**: dejar vacío.
5. **Selector**: **Service Auth** → **Service Tokens** (selector
   específico que solo aplica a Service Tokens, no a usuarios
   interactivos).
6. **Save**.

Resultado: cualquier request sin un Service Token válido recibe 403
inmediatamente. No hay forma de entrar con usuario/clave de la app; solo
Service Tokens o una sesión interactiva (que más adelante puedes abrir
para prensa, etc.).

### 3. Crear el Service Token `rastro-search`

1. Cloudflare Zero Trust → **Access** → **Service Auth** → **Create
   Service Token**.
2. **Name**: `rastro-search` (consistente con el binding en
   `wrangler.toml`/dashboard de Pages).
3. **Duration**: 1 año. Anota la fecha de expiración en `docs/ESTADO.md`
   como pendiente de renovación.
4. Copia el **Client ID** y **Client Secret** que aparecen UNA sola vez
   (no se vuelven a mostrar).
5. Guarda ambos en un password manager o directamente en los secrets del
   dashboard de Cloudflare Pages (paso §4).

### 4. Setear los 2 secrets en Cloudflare Pages (NO en el repo)

1. Cloudflare → **Workers & Pages** → proyecto `rastro` → **Settings**
   → **Environment variables**.
2. **Production**:
   - `CF_ACCESS_CLIENT_ID` = el Client ID de §3
   - `CF_ACCESS_CLIENT_SECRET` = el Client Secret de §3
   - Marcar ambos como **Encrypt** (secrets, no plain env vars).
3. Si quieres probar antes en preview, repetí en **Preview**.
4. **Save** → el próximo deploy los recoge.

`wrangler.toml` no necesita cambios para los secrets (ya está
documentado en el comentario del archivo apuntando a este doc).

### 5. Verificación (antes de activar Access en producción)

Orden recomendado para no romper la búsqueda en producción:

1. **Hacé deploy con los secrets** del paso §4 a `rastro.fyi` (push a
   `master` o `workflow_dispatch`).
2. **Verificá que `/buscar` sigue funcionando** en `www.rastro.fyi`. La
   Function ya manda los headers CF-Access — pero como Access todavía no
   está activado, las requests pasan con 200 igual.
3. **Verificá que una request directa a `api.rastro.pe` SIN token sigue
   dando 200** (todavía no está bloqueada — esto confirma que el cambio
   del lado de Pages no rompió nada).
4. Recién ahí activá Access en el dashboard (la aplicación ya está creada
   en §1, ahora hay que ponerla en **Active**).

### 6. Activar Access (un solo toggle)

1. Cloudflare Zero Trust → **Access** → **Applications** → seleccionar
   `Rastro API (api.rastro.pe)`.
2. Cambiar el toggle de **Disabled** a **Active**.
3. **Verificación inmediata**:
   - Desde tu laptop, sin token:
     ```bash
     curl -sI https://api.rastro.pe/radar-ejecucion/health
     # → HTTP/2 403
     ```
   - Desde el navegador de `www.rastro.fyi`, abrir `/buscar` y hacer una
     búsqueda → sigue devolviendo resultados (la Function manda el
     Service Token, Access valida, la API responde).
4. **Audit log**: Cloudflare Zero Trust → **Access** → **Logs** muestra
   cada request a `api.rastro.pe` con IP, User-Agent, path, y
   Allow/Deny.

## Rollback

Si algo se rompe (por ej. los secrets de Pages se pierden y la búsqueda
deja de funcionar):

1. **Corto plazo**: Cloudflare Zero Trust → **Access** → **Applications**
   → `Rastro API (api.rastro.pe)` → toggle a **Disabled**. La API vuelve
   a estar abierta (como antes de este cambio).
2. **Corto plazo #2**: en `wrangler.toml` no se tocó nada; los secrets
   en Pages están como **Encrypted** y se pueden re-ingresar manualmente
   sin redeploy (Cloudflare los encripta en reposo, no en tránsito).
3. **Diagnóstico**: el Audit Log de Access muestra exactamente qué
   request fue denegada y por qué (token ausente, expirado, IP no
   permitida, etc.).

## Costos

Cloudflare Access:
- **Free tier**: hasta 50 usuarios. Los Service Tokens NO cuentan como
  usuarios.
- **Plan estándar** ($7/usuario/mes, no aplica para Service Tokens).
- **Para Rastro hoy**: $0/mes. Si más adelante das acceso interactivo a
  prensa o sociedad civil, los primeros 50 son gratis.

## Lo que este runbook NO hace

- **No protege `apps/rastro-web` (`www.rastro.fyi`)**. Eso es Cloudflare
  Pages, ya está protegido por la CDN + WAF de Cloudflare y por el rate
  limit de la Function `/api/search` (AL3-17).
- **No protege el MCP server local**. El MCP corre en tu máquina contra
  `localhost:<port>` directamente, nunca toca `api.rastro.pe`. Si en el
  futuro querés correr el MCP desde otra máquina apuntando a
  `api.rastro.pe`, generás un Service Token adicional (`rastro-mcp` en el
  dashboard) y lo configurás en el `.env` de esa máquina.
- **No protege la ingestión ni los scripts de cron**. Esos corren en el
  VPS o en tu laptop contra `localhost`, no contra el proxy público.
- **No encripta los datos en tránsito entre el proxy nginx y las 14
  APIs**. Eso es `http://127.0.0.1:<port>/` sin TLS — la red de
  confianza del VPS. Si el VPS se compromete, el proxy queda como única
  barrera; mitigable con `ufw`/`iptables` para que solo nginx pueda
  hablar a los puertos 4000-4013 (no en alcance de este runbook).

## Cambios incluidos en este PR (referencia)

| Archivo | Cambio |
|---|---|
| `apps/rastro-web/functions/types.d.ts` | Agrega `CF_ACCESS_CLIENT_ID` y `CF_ACCESS_CLIENT_SECRET` opcionales a `PagesEnv`. |
| `apps/rastro-web/functions/api/search.ts` | Helper `cfAccessHeaders(env)` que agrega `CF-Access-Client-Id` y `CF-Access-Client-Secret` a los 3 fetch a APIs en vivo. |
| `apps/rastro-web/functions/__tests__/cf-access-headers.test.ts` | Test que valida que los headers se envían cuando los 2 secrets están presentes, y NO se envían si falta alguno (dev local, config a medias). |
| `apps/rastro-web/.env.production` | Limpia las 14 URLs de `api.rastro.pe` (eran código muerto en el bundle — filtraban el endpoint público a cualquiera con DevTools). Solo deja `VITE_PUBLIC_APIS_LIVE=false` y un comentario apuntando a este runbook. |
| `apps/rastro-web/.env.example` | Documenta el nuevo modelo en el header. |
| `apps/rastro-web/.dev.vars.example` | Agrega `CF_ACCESS_CLIENT_ID` y `CF_ACCESS_CLIENT_SECRET` como placeholders opcionales. |
| `apps/rastro-web/wrangler.toml` | Comentario en la sección de env vars apuntando a este runbook. |
| `apps/rastro-web/vite.config.ts` | El check de las 14 URLs solo se exige si `VITE_PUBLIC_APIS_LIVE=true` (modo APIs publicadas); si es `false` (modo snapshot, valor de producción), se salta la validación. |
| `docs/API_ACCESS_PROTECTION.md` | Este runbook. |
| `apps/rastro-web/DEPLOY.md` | Una línea en §6 mencionando este runbook como dependencia para entender por qué `wrangler.toml` ya no menciona las 14 vars. |
