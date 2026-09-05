# Despliegue de las 14 APIs en Fly.io — `api.rastro.fyi`

> Reemplaza el plan original de `api.rastro.pe` (VPS `149.104.66.100` +
> nginx). Ese dominio se gestiona en RCP (registro `.pe`) y el VPS no está
> bajo el control del equipo actual — ninguno de los dos es viable hoy. Este
> runbook despliega en Fly.io y expone la API bajo un subdominio de
> `rastro.fyi`, que sí es una zona controlada en la misma cuenta de
> Cloudflare que ya usa `rastro-web`. Ver `docs/API_ACCESS_PROTECTION.md`
> para el paso siguiente (Cloudflare Access), que con `api.rastro.pe` era
> estructuralmente imposible de activar y con `api.rastro.fyi` sí lo es.

## Arquitectura

```
Browser (rastro.fyi)
    → Cloudflare Pages (SPA estática)
    → fetch https://api.rastro.fyi/radar-ejecucion/health
         → Cloudflare (proxied, una vez activado — ver §4)
              → gateway Caddy en Fly.io (rastro-api-gw)
                   → rastro-api-radar-ejecucion.internal:8080 (Fly, red privada)
                        → Postgres compartido (rastro-api-pg, un cluster, 14 bases)
```

Diferencia clave con el diseño VPS: cada API es su propia Fly app (14 apps +
gateway + Postgres = 16 apps Fly), no procesos PM2 compartiendo una sola
máquina. El gateway Caddy hace el mismo ruteo path-based que hacía nginx.

## Requisitos

- Cuenta de Fly.io propia (no la `contacto@treevu.app` del intento anterior —
  puede no ser accesible; usar una cuenta nueva evita esa dependencia).
- `flyctl` instalado (`irm https://fly.io/install.ps1 | iex` en PowerShell,
  o `curl -L https://fly.io/install.sh | sh` en Linux/macOS/WSL).
- `FLY_API_TOKEN` (o `flyctl auth login` interactivo) para automatizar sin
  sesión de navegador.
- Acceso de administrador a la zona `rastro.fyi` en Cloudflare (mismo lugar
  donde ya se gestiona `rastro-web`), con un `CLOUDFLARE_API_TOKEN` scopeado
  a `Zone:DNS:Edit` sobre esa zona.

## Setup (una sola vez)

```bash
export FLY_API_TOKEN=...          # o: flyctl auth login
bash scripts/fly-bootstrap.sh     # crea 14 apps + gateway + Postgres, despliega todo
```

Variables opcionales (todas tienen default razonable):

| Variable | Default | Para qué |
|---|---|---|
| `FLY_APP_PREFIX` | `rastro-api` | Prefijo de nombre de cada Fly app — cambiarlo si ya está tomado |
| `FLY_ORG` | `personal` | Organización de Fly.io donde crear las apps |
| `FLY_REGION` | `gru` (São Paulo) | Región más cercana a Perú disponible en Fly |
| `API_HOSTNAME` | `api.rastro.fyi` | Dominio público final |

Si `--skip-pg` o algo falla a mitad de camino, `fly-bootstrap.sh` es
reentrante — reintentar sin flags retoma donde quedó (`fly-deploy-rest.sh`
también sirve para reintentar solo lo que falta).

## DNS + certificado (dos pasos, en ese orden)

```bash
# 1. Registro DNS-only (Fly necesita esto para poder emitir su propio
#    certificado Let's Encrypt vía challenge HTTP-01/TLS-ALPN)
CLOUDFLARE_API_TOKEN=... bash scripts/fly-dns-api-rastro-fyi.sh
fly certs add api.rastro.fyi -a rastro-api-gw
fly certs show api.rastro.fyi -a rastro-api-gw   # esperar "Ready"

# 2. Recién con el cert listo, activar el proxy de Cloudflare (nube naranja)
#    — sin esto, Cloudflare Access no puede proteger el hostname más
#    adelante: Access solo evalúa tráfico que pasa por el borde de Cloudflare.
CLOUDFLARE_API_TOKEN=... bash scripts/fly-dns-api-rastro-fyi.sh --proxy
```

En Cloudflare, **SSL/TLS → Overview** debe quedar en modo **Full** (no
"Flexible") una vez proxied — Cloudflare conecta al gateway de Fly por HTTPS
con el certificado real que Fly ya emitió.

## Verificación

```bash
curl -s https://api.rastro.fyi/radar-ejecucion/health
# → {"status":"ok"}

bash scripts/health-check-apis.sh   # smoke test de las 14 (ajustar API_BASE si hace falta)
```

## Frontend (`rastro-web`)

En Cloudflare Pages, actualizar las 14 `VITE_API_BASE_URL_*` en
`apps/rastro-web/.env.production` de `https://api.rastro.pe/<slug>` a
`https://api.rastro.fyi/<slug>`, o dejar `VITE_PUBLIC_APIS_LIVE=false`
(modo snapshot actual) si no se quiere exponer el frontend a las APIs en
vivo todavía.

## Siguiente paso: Cloudflare Access

Con `api.rastro.fyi` proxied, seguir `docs/API_ACCESS_PROTECTION.md` — el
mismo runbook que ya existe, cambiando cada mención de `api.rastro.pe` por
`api.rastro.fyi` (pendiente de actualizar ese doc como follow-up una vez
que el deploy esté confirmado en vivo).

## Costos

Fly.io no tiene tier gratuito indefinido para apps con `min_machines_running
> 0` (el Postgres lo necesita). Presupuestar aproximadamente lo mismo que el
VPS actual (~$20-30/mes) entre el cluster Postgres compartido y 14
`shared-cpu-1x` con `auto_stop_machines` (la mayoría en 0 réplicas mínimas,
solo el gateway se mantiene siempre arriba).

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `fly apps create` falla con "name taken" | El prefijo `rastro-api-*` ya existe en Fly (de otra cuenta) | `FLY_APP_PREFIX=rastro-api-2 bash scripts/fly-bootstrap.sh` |
| `fly certs show` se queda en "Awaiting configuration" | DNS aún no propagó, o el registro quedó proxied antes de tiempo | Verificar `dig api.rastro.fyi` resuelve a las IPs de Fly directamente (no las de Cloudflare) mientras se espera el cert |
| 502 en el gateway | Alguna API no desplegó o crasheó en el arranque | `fly logs -a rastro-api-<slug>` — con el fix de este PR, una migración rota ahora sí hace fallar el arranque en vez de servir en silencio contra un schema roto |
| CORS error en el navegador | `WEB_ORIGIN` sin `rastro.fyi` | Ya viene seteado por default en los manifests generados; verificar que no se sobreescribió |
