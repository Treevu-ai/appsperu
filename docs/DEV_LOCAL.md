# Desarrollo local — Rastro + MCP

Stack completo en tu máquina. Sin Fly, sin VPS, sin URLs públicas de API.

## Requisitos

- Docker (Postgres de las 13 apps con BD)
- Node.js 22+
- PM2 (`npm i -g pm2`) — lo instala `dev-local.sh` si falta

## Arranque rápido

**Linux / macOS / Git Bash (Windows):**

```bash
# Terminal 1 — Postgres + APIs + build MCP
bash scripts/dev-local.sh

# Terminal 2 — frontend
bash scripts/dev-local.sh --web
```

**PowerShell (Windows):**

```powershell
.\scripts\dev-local.ps1 -Web
.\scripts\dev-local.ps1 -Mcp
```

> Si Git Bash falla con `set: pipefail: invalid option`, haz `git pull` (`.gitattributes` fuerza LF en `*.sh`) o corre:
> `sed -i 's/\r$//' scripts/dev-local.sh`

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
| Health local | `bash scripts/dev-local.sh --check` |
| Logs PM2 | `pm2 logs` |
| Parar APIs | `pm2 delete all` |

## Frontend vs producción

- **Local:** `apps/rastro-web/.env` con URLs `http://localhost:400*`
- **Cloudflare Pages:** no usa APIs en la nube; el sitio público es informativo + docs MCP. Datos en vivo solo vía MCP local.

## Ingesta de datos

Las BDs arrancan vacías. Para datos de La Libertad, corre ingestas manualmente en cada `apps/<nombre>/api` (ver `docs/ESTADO.md`).
