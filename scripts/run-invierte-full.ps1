[CmdletBinding()]
param(
  [int]$ChunkBytes = 52428800
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$apiRoot = Join-Path $repoRoot 'apps\radar-inversiones\api'

function Get-EnvValue([string]$path, [string]$name) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  $line = Get-Content -LiteralPath $path | Where-Object { $_ -match "^$([regex]::Escape($name))=" } | Select-Object -First 1
  if ($null -eq $line) { return $null }
  return $line.Split('=', 2)[1]
}

$connection = $env:EJECUCION_DATABASE_URL
if (-not $connection) { $connection = Get-EnvValue (Join-Path $apiRoot '.env') 'EJECUCION_DATABASE_URL' }
if (-not $connection) { $connection = Get-EnvValue (Join-Path $apiRoot '.env.example') 'EJECUCION_DATABASE_URL' }
if (-not $connection) { throw 'No se encontró EJECUCION_DATABASE_URL. Configúrala en la sesión o en .env.' }

$env:EJECUCION_DATABASE_URL = $connection
$env:INVIERTE_CHUNK_BYTES = $ChunkBytes.ToString()

Push-Location $apiRoot
try {
  Write-Host "Iniciando Invierte.pe con rangos de $ChunkBytes bytes. No cierres esta ventana."
  npm run ingest:invierte:full
  if ($LASTEXITCODE -ne 0) { throw "La ingesta terminó con código $LASTEXITCODE." }
} finally {
  Pop-Location
}
