# Arranca Rastro Web (Vite). Ejecutar desde la raíz del repo.
#   .\scripts\start-web.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Web = Join-Path $Root "apps\rastro-web"
$port = if ($env:PORT) { $env:PORT } else { "5173" }

Set-Location $Web

if (-not (Test-Path ".env")) {
  if (Test-Path ".env.example") {
    Copy-Item ".env.example" ".env"
    Write-Host "OK Creado apps/rastro-web/.env"
  } else {
    throw "Falta .env.example en apps/rastro-web"
  }
}

if (-not (Test-Path "node_modules")) {
  Write-Host "-> npm install (primera vez)..."
  npm install
}

Write-Host ""
Write-Host "============================================"
Write-Host "  Rastro Web"
Write-Host "  Abre la URL Local: que aparezca abajo"
Write-Host "  (http://localhost:XXXX — deja esta ventana abierta)"
Write-Host "============================================"
Write-Host ""

npm run dev -- --host --port $port
