<#
.SYNOPSIS
  Corrida operativa La Libertad — Docker, migraciones, ingestas nuevas y smoke de los 5 frentes sectoriales.

.DESCRIPTION
  Pensado para Windows + Docker Desktop + PowerShell.
  Usa rutas absolutas desde la raíz del repo (evita el error de encadenar `cd` relativos).

.EXAMPLE
  cd C:\Users\acuba\appsperu
  git pull origin master
  .\scripts\corrida-operativa-la-libertad.ps1

.EXAMPLE
  .\scripts\corrida-operativa-la-libertad.ps1 -StartApis -Year 2026
#>
[CmdletBinding()]
param(
  [int]$Year = 2026,
  [switch]$StartApis,
  [switch]$SkipIngest,
  [switch]$SkipSmoke
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $repoRoot 'logs'
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
$logPath = Join-Path $logsDir ("corrida-operativa-{0:yyyyMMdd-HHmm}.log" -f (Get-Date))

function Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg
  Write-Host $line
  Add-Content -LiteralPath $logPath -Value $line
}

function Ensure-EnvFile([string]$apiDir) {
  $envFile = Join-Path $apiDir '.env'
  $example = Join-Path $apiDir '.env.example'
  if (-not (Test-Path -LiteralPath $envFile) -and (Test-Path -LiteralPath $example)) {
    Copy-Item -LiteralPath $example -Destination $envFile
    Log "Copiado .env desde .env.example en $apiDir"
  }
}

function Wait-PostgresPort([int]$port, [string]$label, [int]$timeoutSec = 90) {
  Log "Esperando Postgres $label en 127.0.0.1:$port ..."
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $iar = $client.BeginConnect('127.0.0.1', $port, $null, $null)
      if ($iar.AsyncWaitHandle.WaitOne(2000, $false)) {
        $client.EndConnect($iar)
        $client.Close()
        Log "Postgres $label listo en puerto $port"
        return
      }
      $client.Close()
    } catch {
      # sigue intentando
    }
    Start-Sleep -Seconds 2
  }
  throw "Timeout esperando Postgres $label en puerto $port. ¿Docker Desktop está corriendo?"
}

function Invoke-AppStep([string]$description, [string]$relativeApiPath, [scriptblock]$action) {
  $apiDir = Join-Path $repoRoot $relativeApiPath
  if (-not (Test-Path -LiteralPath $apiDir)) {
    throw "No existe $apiDir"
  }
  Log "== $description =="
  Push-Location $apiDir
  try {
    & $action *>&1 | Tee-Object -FilePath $logPath -Append
    if ($LASTEXITCODE -ne 0) {
      throw "'$description' terminó con código $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Start-ApiDev([string]$name, [string]$relativeApiPath, [int]$port) {
  $apiDir = Join-Path $repoRoot $relativeApiPath
  Log "Iniciando API $name (puerto $port) en segundo plano..."
  Start-Process -FilePath 'npm' -ArgumentList @('run', 'dev') -WorkingDirectory $apiDir -WindowStyle Minimized | Out-Null
}

function Wait-HttpOk([string]$url, [int]$timeoutSec = 60) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) { return }
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  throw "Timeout esperando $url"
}

Log "Corrida operativa La Libertad — repo: $repoRoot"
Log "Log: $logPath"

# Volumen externo de radar-ejecucion (primera vez)
docker volume inspect api_radar_pgdata 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Log "Creando volumen Docker api_radar_pgdata ..."
  docker volume create api_radar_pgdata | Tee-Object -FilePath $logPath -Append
}

$dbApps = @(
  @{ Name = 'radar-ejecucion'; Path = 'apps\radar-ejecucion\api'; Port = 5432 },
  @{ Name = 'actividad-agraria'; Path = 'apps\actividad-agraria\api'; Port = 5440 },
  @{ Name = 'ceplan-geo'; Path = 'apps\ceplan-geo\api'; Port = 5437 },
  @{ Name = 'seguridad-ciudadana'; Path = 'apps\seguridad-ciudadana\api'; Port = 5441 }
)

foreach ($app in $dbApps) {
  $apiDir = Join-Path $repoRoot $app.Path
  Ensure-EnvFile $apiDir
  Invoke-AppStep "docker compose up -d ($($app.Name))" $app.Path { docker compose up -d }
  Wait-PostgresPort -port $app.Port -label $app.Name
}

foreach ($app in $dbApps) {
  Invoke-AppStep "migrate ($($app.Name))" $app.Path { npm run migrate }
}

if (-not $SkipIngest) {
  Invoke-AppStep 'ingest:mincetur-hospedaje' 'apps\radar-ejecucion\api' { npm run ingest:mincetur-hospedaje }

  Invoke-AppStep 'ingest:midagri-regional' 'apps\actividad-agraria\api' { npm run ingest:midagri-regional }

  # MEF meta La Libertad — necesario para crossrefs gasto (puede tardar varios minutos)
  Invoke-AppStep 'ingest:mef:meta LA LIBERTAD' 'apps\radar-ejecucion\api' {
    $env:MEF_INGESTA_META_DEPARTAMENTO = 'true'
    npm run ingest:libertad
  }

  # SIDPOL La Libertad — denominadores/tasas (opcional pero recomendado)
  Invoke-AppStep 'ingest:sidpol' 'apps\seguridad-ciudadana\api' { npm run ingest:sidpol }
}

if ($StartApis) {
  Start-ApiDev 'radar-ejecucion' 'apps\radar-ejecucion\api' 4000
  Start-ApiDev 'actividad-agraria' 'apps\actividad-agraria\api' 4009
  Start-ApiDev 'ceplan-geo' 'apps\ceplan-geo\api' 4005
  Start-ApiDev 'seguridad-ciudadana' 'apps\seguridad-ciudadana\api' 4010

  Wait-HttpOk 'http://127.0.0.1:4000/health'
  Wait-HttpOk 'http://127.0.0.1:4009/health'
  Wait-HttpOk 'http://127.0.0.1:4005/health'
  Wait-HttpOk 'http://127.0.0.1:4010/health'
  Log 'APIs en marcha (ventanas minimizadas).'
} else {
  Log 'Omitido -StartApis. Para smoke HTTP, abre 4 terminales con npm run dev en:'
  Log '  apps/radar-ejecucion/api (4000), actividad-agraria/api (4009), ceplan-geo/api (4005), seguridad-ciudadana/api (4010)'
}

if (-not $SkipSmoke) {
  if (-not $StartApis) {
    Log 'ADVERTENCIA: smoke HTTP requiere APIs corriendo. Re-ejecuta con -StartApis o levanta npm run dev manualmente.'
  } else {
    Log '== Smoke tests (5 frentes) =='
    $smokes = @(
      "http://127.0.0.1:4009/api/crossref?departamento=LA%20LIBERTAD&anio=2024",
      "http://127.0.0.1:4000/api/turismo/crossref?departamento=LA%20LIBERTAD&anioFiscal=$Year",
      "http://127.0.0.1:4000/api/infraestructura/activos/ACTIVO-DRENAJE-2539202",
      "http://127.0.0.1:4005/api/crossref/ejecucion?ubigeo=130101",
      "http://127.0.0.1:4005/api/denominadores/tasas?provincia=TRUJILLO&anio=2024"
    )
    foreach ($url in $smokes) {
      Log "GET $url"
      try {
        $json = Invoke-RestMethod -Uri $url -TimeoutSec 30
        ($json | ConvertTo-Json -Depth 4 -Compress).Substring(0, [Math]::Min(500, ($json | ConvertTo-Json -Depth 4 -Compress).Length)) | Tee-Object -FilePath $logPath -Append
        Log '  OK'
      } catch {
        Log "  FALLO: $($_.Exception.Message)"
      }
    }
  }
}

Log 'Corrida operativa finalizada.'
Log "Revisa el log completo: $logPath"
