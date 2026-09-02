# Desarrollo local — Rastro + MCP

Stack completo en tu máquina. Sin Fly, sin VPS, sin URLs públicas de API.

## ⚠️ Terminal remota vs tu PC (ERR_CONNECTION_REFUSED)

Si la terminal muestra `/workspace/...` o `ubuntu@`, **Vite corre en la VM de Cursor**, no en Windows.

| Vite en… | Navegador en… | Resultado |
|----------|---------------|-----------|
| VM remota | `localhost` Windows | **Rechazado** |
| Tu PC (PowerShell) | `localhost` Windows | ✓ |
| VM remota | Link **Ports** en Cursor | ✓ |

**Arreglo:** PowerShell **local** (fuera de Cursor remoto):

```powershell
cd ~\appsperu
git pull
.\scripts\start-web.ps1
```

O: panel **Ports / Puertos** en Cursor → forward **5173** tras `bash scripts/start-web.sh`.

Diagnóstico: `bash scripts/diagnose-web.sh`

## Requisitos

- Docker (Postgres de las 13 apps con BD)
- Node.js 22+
- PM2 (`npm i -g pm2`) — lo instala `dev-local.sh` si falta

## Arranque rápido

**Git Bash (desde la raíz `appsperu/`):**

```bash
bash scripts/start-web.sh
```

**PowerShell (desde la raíz `appsperu/`):**

```powershell
.\scripts\start-web.ps1
```

No uses `apps\rastro-web` en Git Bash — usa `/` o el script de arriba.

Abre la URL **`Local:`** que imprima Vite (ej. `http://localhost:5173/`). La terminal debe **seguir abierta**.

> Si Git Bash falla con `set: pipefail: invalid option`, haz `git pull` (`.gitattributes` fuerza LF en `*.sh`) o corre:
> `sed -i 's/\r$//' scripts/dev-local.sh`

## Frontend no abre (localhost rechaza la conexión)

1. **¿Vite sigue corriendo?** La terminal debe quedar abierta mostrando algo como:
   `Local: http://localhost:5173/` — usa **exactamente** esa URL (http, no https).
2. **¿Falta `.env`?** Sin él Vite no arranca:
   ```bash
   cd apps/rastro-web
   cp .env.example .env   # Git Bash
   copy .env.example .env # PowerShell
   npm run dev
   ```
3. **Puerto ocupado:** Vite elige el siguiente libre (5174, 5175…). Mira la línea `Local:` en la terminal.
4. **Mata procesos viejos (PowerShell):**
   ```powershell
   Get-NetTCPConnection -LocalPort 5173,5174 -ErrorAction SilentlyContinue |
     ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
   ```

Abre **http://localhost:5173** — el `.env` apunta a `localhost:4000–4013`.

Si el puerto 5173 está ocupado (otra instancia de Vite):

```bash
# otro puerto
PORT=5174 bash scripts/dev-local.sh --web
```

```powershell
$env:PORT=5174; .\scripts\dev-local.ps1 -Web
```

O mata el proceso anterior (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## MCP (Cursor / Claude Code)

```bash
bash scripts/dev-local.sh --mcp
```

Copia `.mcp.json.example` a la raíz del repo como `.mcp.json` (Claude Code) o pégalo en `~/.cursor/mcp.json` (Cursor) ajustando la ruta absoluta a `mcp-server/dist/index.js`.

Reinicia Cursor. Verás **82 tools** de solo lectura.

## Comandos útiles

| Acción | Comando |
|--------|---------|
| Solo Postgres | `bash scripts/dev-local.sh --postgres` |
| Solo APIs | `bash scripts/dev-local.sh --apis` |
| Solo un subset (RAM limitada) | `bash scripts/dev-local.sh --only "radar-ejecucion,infobras"` |
| Health local | `bash scripts/dev-local.sh --check` |
| Logs PM2 | `pm2 logs` |
| Parar APIs | `pm2 delete all` |

## RAM limitada (laptop, no VPS)

Las 14 APIs + 13 Postgres están pensadas para el VPS. En una laptop con poca RAM libre:

1. **Limita el VM de WSL2/Docker Desktop** — crea `C:\Users\<tú>\.wslconfig`:
   ```ini
   [wsl2]
   memory=4GB
   processors=4
   swap=2GB
   ```
   Reinicia WSL después (`wsl --shutdown` en PowerShell, luego reabre Docker Desktop). Sin esto, Docker Desktop puede crecer sin techo y comerse toda la RAM libre.
2. **Levanta solo lo que necesitas**, no las 14: `bash scripts/dev-local.sh --only "radar-ejecucion,infobras"` levanta Postgres + API únicamente para esas apps (vía `docker compose` y `pm2 --only` filtrados). Los slugs válidos están en `infra/api-proxy/apps.tsv`.
3. Para bajar lo que no uses: `pm2 delete <slug>` (APIs) y `docker compose -f apps/<app>/api/docker-compose.yml down` (Postgres de esa app).

### Volumen Docker externo faltante (primera vez)

`radar-ejecucion`, `ceplan-geo`, `actividad-agraria` y `seguridad-ciudadana` declaran su volumen de Postgres como `external: true` en su `docker-compose.yml` — Docker no lo autocrea. Si `docker compose up` falla con `external volume "..." not found`, créalo a mano una vez (el nombre exacto está en el `docker-compose.yml` de esa app, bajo `volumes:`):

```bash
docker volume create api_radar_pgdata   # ejemplo para radar-ejecucion
```

### PM2 en Windows (nativo, no WSL)

`infra/api-proxy/ecosystem.config.cjs` usa `interpreter: "none"` para spawnear `npm`/`npx` directo — en Windows eso falla con `spawn EINVAL` porque son scripts `.cmd`, no ejecutables, y Node no puede correrlos sin shell (ni referenciando la extensión). El archivo ya detecta `process.platform === "win32"` y envuelve el comando en `cmd /c` en ese caso; en Linux (VPS) no cambia nada. Si ves `EINVAL` al levantar APIs con PM2 en Windows, confirma que estás en una versión del repo con este fix.

## Frontend vs producción

- **Local:** `apps/rastro-web/.env` con URLs `http://localhost:400*`
- **Cloudflare Pages:** no usa APIs en la nube; el sitio público es informativo + docs MCP. Datos en vivo solo vía MCP local.

## Ingesta de datos

Las BDs arrancan vacías. Para datos de La Libertad, corre ingestas manualmente en cada `apps/<nombre>/api` (ver `docs/ESTADO.md`).
