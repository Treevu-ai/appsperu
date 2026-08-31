# Despliegue en Fly.io — `api.rastro.pe`

Las 14 APIs Express + Postgres corren en **Fly.io** (región `gru`, São Paulo). Un **gateway Caddy** enruta `https://api.rastro.pe/<app>/` a cada app por la red privada `.internal`.

> **No uses LightNode** (`149.104.66.100`) — ese VPS nunca tuvo las APIs. Fly.io reemplaza ese setup.

## Arquitectura

```
api.rastro.pe (Fly TLS)
  └── rastro-api-gateway (Caddy :8080)
        ├── rastro-radar-ejecucion.internal:8080
        ├── rastro-compras-publicas.internal:8080
        └── … (14 apps)
              └── rastro-pg (Postgres compartido, 1 BD por app)
```

Las URLs del frontend **no cambian**: `https://api.rastro.pe/radar-ejecucion`, etc.

---

## 1. Cuenta Fly.io

1. [https://fly.io/app/sign-up](https://fly.io/app/sign-up) (Google/GitHub).
2. Instala CLI:

```bash
curl -L https://fly.io/install.sh | sh
export PATH="$HOME/.fly/bin:$PATH"
flyctl auth login
```

3. (Opcional CI) Token para GitHub:

```bash
flyctl tokens create deploy -x 999999h
```

GitHub → **Secrets** → `FLY_API_TOKEN` = ese token.

---

## 2. Deploy (una vez)

Desde la raíz del repo:

```bash
cd /path/to/appsperu
export PATH="$HOME/.fly/bin:$PATH"   # tras instalar flyctl
flyctl auth login
bash scripts/fly-bootstrap.sh
```

Org por defecto: `personal`. Otra org: `FLY_ORG=tu-org bash scripts/fly-bootstrap.sh`

Si Postgres ya existe: `bash scripts/fly-bootstrap.sh --skip-pg`

Eso hace:

- Genera `Caddyfile` + 14 `fly.toml`
- Crea Postgres **`rastro-pg`** (si no existe)
- Crea y despliega **`rastro-<app>`** (14 APIs)
- Despliega **`rastro-api-gateway`**

Duración aproximada: 30–60 min (14 builds). Coste Fly: ~USD 5–15/mes con `auto_stop` (varía por uso).

Si Postgres ya existe:

```bash
bash scripts/fly-bootstrap.sh --skip-pg
```

---

## 3. Dominio `api.rastro.pe`

Tras el deploy:

```bash
fly certs add api.rastro.pe -a rastro-api-gateway
fly certs show api.rastro.pe -a rastro-api-gateway
```

Fly muestra qué registro DNS crear. **Importante:**

- **Elimina** el registro **A** → `149.104.66.100` (LightNode)
- Crea lo que indique Fly (normalmente **A/AAAA** a IPs de Fly o **CNAME**)

Espera 5–15 min y prueba:

```bash
curl -s https://api.rastro.pe/radar-ejecucion/health
# {"status":"ok"}
bash scripts/health-check-apis.sh
```

---

## 4. Ingesta de datos

Las APIs arrancan con BD vacía (solo `/health` responde). Para datos de La Libertad, en una máquina con acceso a Fly:

```bash
# Ejemplo: ingesta MEF en radar-ejecucion
fly ssh console -a rastro-radar-ejecucion
npm run ingest:libertad
```

O corre ingestas localmente apuntando `DATABASE_URL` al Postgres de Fly (ver `fly postgres connect -a rastro-pg`).

---

## 5. Comandos útiles

| Acción | Comando |
|--------|---------|
| Estado apps | `fly apps list` |
| Logs gateway | `fly logs -a rastro-api-gateway` |
| Logs una API | `fly logs -a rastro-radar-ejecucion` |
| Redeploy gateway | `bash scripts/fly-deploy-gateway.sh` |
| Regenerar configs | `bash scripts/fly-generate-configs.sh` |
| Postgres shell | `fly postgres connect -a rastro-pg` |

---

## 6. `salud-institucional`

Es un agregador sin Postgres propio. Necesita secrets con URLs a otras BDs:

```bash
fly secrets set -a rastro-salud-institucional \
  EJECUCION_DATABASE_URL="..." \
  INFOBRAS_DATABASE_URL="..." \
  INVERSIONES_DATABASE_URL="..." \
  COMPRAS_DATABASE_URL="..." \
  FISCAL_DATABASE_URL="..."
```

Configura esto **después** de que las otras apps tengan datos.

---

## 7. Archivos en el repo

| Ruta | Propósito |
|------|-----------|
| `infra/fly/Dockerfile.api` | Imagen Docker genérica por app |
| `infra/fly/gateway/` | Caddy + `fly.toml` del gateway |
| `infra/fly/apps/<slug>/fly.toml` | Config por API (generado) |
| `scripts/fly-generate-configs.sh` | Regenera Caddyfile + fly.toml |
| `scripts/fly-bootstrap.sh` | Deploy completo |
| `scripts/fly-deploy-gateway.sh` | Solo gateway |

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| `502` en api.rastro.pe | DNS aún apunta a LightNode → cambia DNS a Fly |
| `502` tras DNS OK | `fly logs -a rastro-api-gateway` — backend caído |
| App no arranca | Falta `DATABASE_URL` → `fly secrets list -a rastro-radar-ejecucion` |
| CORS en browser | `WEB_ORIGIN` debe incluir `rastro.fyi` (ya en fly.toml) |
| Muy caro | `min_machines_running = 0` ya está; apps hibernan solas |

---

## Relación con Cloudflare Pages

El frontend en `www.rastro.fyi` ya usa `https://api.rastro.pe/...` (`.env.production`). Cuando Fly responda en ese dominio, **no hace falta** cambiar Cloudflare Pages.
