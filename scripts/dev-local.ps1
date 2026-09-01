# Dev local en Windows (PowerShell) - equivalente a dev-local.sh
#
# Uso:
#   .\scripts\dev-local.ps1 -Web
#   .\scripts\dev-local.ps1 -Mcp
#   .\scripts\dev-local.ps1 -Check
param(
  [switch]$Postgres,
  [switch]$Apis,
  [switch]$Mcp,
  [switch]$Web,
  [switch]$Check
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Start-Web {
  $webDir = Join-Path $Root "apps\rastro-web"
  $port = if ($env:PORT) { $env:PORT } else { "5173" }
  $envExample = Join-Path $webDir ".env.example"
  $envFile = Join-Path $webDir ".env"
  if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envFile
    Write-Host "   -> apps/rastro-web/.env (localhost APIs)"
  }
  if (-not (Test-Path $envFile)) {
    Write-Error "Falta apps/rastro-web/.env - copia .env.example"
  }
  Write-Host "==> Rastro Web (espera el URL que imprima Vite abajo)"
  Push-Location $webDir
  try {
    npm ci
    npm run dev -- --host --port $port
  } finally {
    Pop-Location
  }
}

function Build-Mcp {
  Write-Host "==> MCP server"
  Push-Location (Join-Path $Root "mcp-server")
  try {
    npm ci
    npm run build
  } finally {
    Pop-Location
  }
  $dist = Join-Path $Root "mcp-server\dist\index.js"
  Write-Host ""
  Write-Host "Agrega a ~/.cursor/mcp.json:"
  Write-Host "  node $dist"
}

function Invoke-HealthCheck {
  & bash (Join-Path $Root "scripts\health-check-apis.sh") --local
}

if ($Web) { Start-Web; exit 0 }
if ($Mcp) { Build-Mcp; exit 0 }
if ($Check) { Invoke-HealthCheck; exit 0 }
if ($Postgres) { & bash (Join-Path $Root "scripts\dev-local.sh") --postgres; exit 0 }
if ($Apis) { & bash (Join-Path $Root "scripts\dev-local.sh") --apis; exit 0 }

Write-Host @"
Uso:
  .\scripts\dev-local.ps1 -Web       # frontend Vite
  .\scripts\dev-local.ps1 -Mcp       # build MCP
  .\scripts\dev-local.ps1 -Check     # health APIs
  .\scripts\dev-local.ps1 -Postgres  # Docker Postgres (requiere bash + docker)
  .\scripts\dev-local.ps1 -Apis      # PM2 APIs (requiere bash)

Stack completo en Windows: usa Git Bash tras git pull:
  bash scripts/dev-local.sh
"@
