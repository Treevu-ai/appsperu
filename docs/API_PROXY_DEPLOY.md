# Despliegue del proxy API — `api.rastro.pe`

Expone las 14 APIs del monorepo en **`https://api.rastro.pe/<app-slug>/`**, consumidas por [rastro-web](https://www.rastro.fyi).

## Arquitectura

```
Browser (rastro.fyi)
    → Cloudflare Pages (SPA estática)
    → fetch https://api.rastro.pe/radar-ejecucion/health
         → nginx (443) en VPS 149.104.66.100
              → http://127.0.0.1:4000/health  (Express + Postgres)
```

| App slug | Puerto local |
|----------|-------------|
| radar-ejecucion | 4000 |
| compras-publicas | 4001 |
| radar-inversiones | 4002 |
| infobras | 4003 |
| ceplan-estrategico | 4004 |
| ceplan-geo | 4005 |
| identidad-fiscal | 4006 |
| salud-institucional | 4007 |
| proveedores-sancionados | 4008 |
| actividad-agraria | 4009 |
| seguridad-ciudadana | 4010 |
| bcrp-comercio-exterior | 4011 |
| inversion-privada | 4012 |
| bcrp-la-libertad | 4013 |

## Requisitos en el VPS

- Ubuntu/Debian con Docker
- Node.js 22+
- DNS **`A`** de `api.rastro.pe` → IP del VPS (`149.104.66.100`)
- Repo clonado en `/opt/appsperu` (o `APPSPERU_ROOT`)
- `.env` por app (copiar desde `.env.example`) con `DATABASE_URL` y datos ingeridos

## Setup (una sola vez)

SSH al VPS:

```bash
git clone https://github.com/Treevu-ai/appsperu.git /opt/appsperu
cd /opt/appsperu

# 1. Postgres (14 contenedores)
bash scripts/start-all-postgres.sh

# 2. .env por app — mínimo PORT, WEB_ORIGIN, DATABASE_URL
#    WEB_ORIGIN=https://www.rastro.fyi,https://rastro.fyi,https://rastro-5zm.pages.dev

# 3. Ingesta de datos (La Libertad) — ver scripts/ingest-la-libertad-completo.sh

# 4. APIs con PM2
bash scripts/start-all-apis.sh --build

# 5. nginx + TLS
export CERTBOT_EMAIL=tu@email.com
sudo bash scripts/setup-api-rastro-pe.sh
```

## Verificación

```bash
# En el VPS (procesos locales)
bash scripts/health-check-apis.sh --local

# Desde internet
bash scripts/health-check-apis.sh
curl -s https://api.rastro.pe/radar-ejecucion/health
# → {"status":"ok"}
```

## Archivos

| Archivo | Propósito |
|---------|-----------|
| `infra/api-proxy/nginx/api.rastro.pe.conf` | Site nginx HTTPS + 14 locations |
| `infra/api-proxy/nginx/rastro-proxy-params.conf` | Headers proxy comunes |
| `infra/api-proxy/ecosystem.config.cjs` | PM2 — 14 procesos |
| `infra/api-proxy/apps.tsv` | Mapa slug → puerto → directorio |
| `scripts/setup-api-rastro-pe.sh` | Instala nginx + certbot + site |
| `scripts/start-all-apis.sh` | PM2 start/reload |
| `scripts/start-all-postgres.sh` | Docker Postgres |
| `scripts/health-check-apis.sh` | Smoke test /health |

## CORS

Cada API usa `WEB_ORIGIN` (ver `src/lib/security.ts`). En producción debe incluir:

```
WEB_ORIGIN=https://www.rastro.fyi,https://rastro.fyi,https://rastro-5zm.pages.dev
```

PM2 lo inyecta vía `ecosystem.config.cjs`; también puedes ponerlo en cada `.env`.

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---------|----------------|-----|
| `SSL_ERROR_SYSCALL` en :443 | nginx/TLS no instalado | `sudo bash scripts/setup-api-rastro-pe.sh` |
| 502 Bad Gateway | API caída en ese puerto | `pm2 list`, `pm2 logs radar-ejecucion` |
| CORS error en browser | `WEB_ORIGIN` sin rastro.fyi | Actualizar `.env` + `pm2 reload all` |
| 503 en `/readyz` | Postgres caído | `docker ps`, `bash scripts/start-all-postgres.sh` |
| Datos vacíos | Sin ingesta | `bash scripts/ingest-la-libertad-completo.sh` |

## Relación con rastro-web

El frontend en Cloudflare Pages usa las URLs de `apps/rastro-web/.env.production`:

```
VITE_API_BASE_URL_RADAR_EJECUCION=https://api.rastro.pe/radar-ejecucion
… (14 vars)
```

Ver también `apps/rastro-web/DEPLOY.md`.
