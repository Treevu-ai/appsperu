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

function Test-DockerNetwork([string]$name) {
  docker network inspect $name 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

function Ensure-AppsPeruSharedNetwork {
  if (Test-DockerNetwork 'appsperu_shared') {
    Log 'Red Docker appsperu_shared OK.'
    return
  }
  Log 'Red appsperu_shared no existe — creando...'
  docker network create appsperu_shared 2>&1 | Tee-Object -FilePath $logPath -Append
  if ($LASTEXITCODE -ne 0 -or -not (Test-DockerNetwork 'appsperu_shared')) {
    throw @"
No se pudo crear la red Docker 'appsperu_shared'.
Ejecuta primero: .\scripts\repair-docker-networks.ps1
Si persiste: .\scripts\repair-docker-networks.ps1 -Aggressive
"@
  }
  Log 'Red appsperu_shared creada.'
}

function Repair-DockerNetworks {
  Log 'Reparando redes Docker (pools agotados)...'
  $repair = Join-Path $repoRoot 'scripts\repair-docker-networks.ps1'
  if (Test-Path -LiteralPath $repair) {
    & $repair
    if ($LASTEXITCODE -ne 0) {
      throw "repair-docker-networks.ps1 falló (código $LASTEXITCODE)"
    }
  } else {
    docker network prune -f | Tee-Object -FilePath $logPath -Append
    Ensure-AppsPeruSharedNetwork
  }
  Ensure-AppsPeruSharedNetwork
}

function Invoke-DockerComposeUp([string]$relativeApiPath) {
  Ensure-AppsPeruSharedNetwork
  Push-Location (Join-Path $repoRoot $relativeApiPath)
  try {
    docker compose up -d 2>&1 | Tee-Object -FilePath $logPath -Append
    if ($LASTEXITCODE -ne 0) {
      $logTail = Get-Content -LiteralPath $logPath -Tail 30 -ErrorAction SilentlyContinue | Out-String
      if ($logTail -match 'fully subnetted|address pools|could not be found|declared as external') {
        Log 'Error de red Docker — reparando y reintentando...'
        Repair-DockerNetworks
        docker compose up -d 2>&1 | Tee-Object -FilePath $logPath -Append
      }
      if ($LASTEXITCODE -ne 0) {
        throw "docker compose up -d falló en $relativeApiPath (código $LASTEXITCODE). Ejecuta: .\scripts\repair-docker-networks.ps1 -Aggressive"
      }
    }
  } finally {
    Pop-Location
  }
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

Repair-DockerNetworks

# Volumen externo de radar-ejecucion (primera vez)
docker volume inspect api_radar_pgdata 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Log "Creando volumen Docker api_radar_pgdata ..."
  docker volume create api_radar_pgdata | Tee-Object -FilePath $logPath -Append
}

$dbApps = @(
  @{ Name = 'radar-ejecucion'; Path = 'apps\radar-ejecucion\api'; Port = 5432 },
  @{ Name = 'radar-inversiones'; Path = 'apps\radar-inversiones\api'; Port = 5434 },
  @{ Name = 'inversion-privada'; Path = 'apps\inversion-privada\api'; Port = 5443 },
  @{ Name = 'actividad-agraria'; Path = 'apps\actividad-agraria\api'; Port = 5440 },
  @{ Name = 'ceplan-geo'; Path = 'apps\ceplan-geo\api'; Port = 5437 },
  @{ Name = 'seguridad-ciudadana'; Path = 'apps\seguridad-ciudadana\api'; Port = 5441 }
)

foreach ($app in $dbApps) {
  $apiDir = Join-Path $repoRoot $app.Path
  Ensure-EnvFile $apiDir
  Log "== docker compose up -d ($($app.Name)) =="
  Invoke-DockerComposeUp $app.Path
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

  # PROINVERSIÓN VERTIX (APP/PA) + OxI — snapshot nacional; filtro territorial en la API
  Invoke-AppStep 'ingest:vertix' 'apps\inversion-privada\api' { npm run ingest:vertix }
  Invoke-AppStep 'ingest:oxi' 'apps\inversion-privada\api' { npm run ingest:oxi }
}

if ($StartApis) {
  Start-ApiDev 'radar-ejecucion' 'apps\radar-ejecucion\api' 4000
  Start-ApiDev 'radar-inversiones' 'apps\radar-inversiones\api' 4002
  Start-ApiDev 'inversion-privada' 'apps\inversion-privada\api' 4012
  Start-ApiDev 'actividad-agraria' 'apps\actividad-agraria\api' 4009
  Start-ApiDev 'ceplan-geo' 'apps\ceplan-geo\api' 4005
  Start-ApiDev 'seguridad-ciudadana' 'apps\seguridad-ciudadana\api' 4010

  Wait-HttpOk 'http://127.0.0.1:4000/health'
  Wait-HttpOk 'http://127.0.0.1:4002/health'
  Wait-HttpOk 'http://127.0.0.1:4012/health'
  Wait-HttpOk 'http://127.0.0.1:4009/health'
  Wait-HttpOk 'http://127.0.0.1:4005/health'
  Wait-HttpOk 'http://127.0.0.1:4010/health'
  Log 'APIs en marcha (ventanas minimizadas).'
} else {
  Log 'Omitido -StartApis. Para smoke HTTP, abre terminales con npm run dev en:'
  Log '  radar-ejecucion (4000), radar-inversiones (4002), inversion-privada (4012),'
  Log '  actividad-agraria (4009), ceplan-geo (4005), seguridad-ciudadana (4010)'
}

if (-not $SkipSmoke) {
  if (-not $StartApis) {
    Log 'ADVERTENCIA: smoke HTTP requiere APIs corriendo. Re-ejecuta con -StartApis o levanta npm run dev manualmente.'
  } else {
    Log '== Smoke tests (5 frentes) =='
    $smokes = @(
      "http://127.0.0.1:4009/api/crossref?departamento=LA%20LIBERTAD&anio=2024",
      "http://127.0.0.1:4012/api/crossref?departamento=LA%20LIBERTAD",
      "http://127.0.0.1:4012/api/oxi/projects?departamento=LA%20LIBERTAD",
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
