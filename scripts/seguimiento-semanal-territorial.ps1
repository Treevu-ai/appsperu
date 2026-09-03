[CmdletBinding()]
param(
  [string]$Departamento = 'LA LIBERTAD'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $repoRoot 'logs\seguimiento-territorial'
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$logPath = Join-Path $logsDir "seguimiento-$stamp.log"

function Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg
  Write-Host $line
  Add-Content -LiteralPath $logPath -Value $line
}

function Run-Step([string]$description, [string]$workDir, [scriptblock]$action) {
  Log "== $description =="
  Push-Location $workDir
  try {
    & $action *>&1 | Tee-Object -FilePath $logPath -Append
    if ($LASTEXITCODE -ne 0) {
      Log "ADVERTENCIA: '$description' termino con codigo $LASTEXITCODE - sigue con el resto del seguimiento."
    }
  } catch {
    Log "ADVERTENCIA: '$description' fallo: $($_.Exception.Message) - sigue con el resto del seguimiento."
  } finally {
    Pop-Location
  }
}

Log "Seguimiento semanal territorial - $Departamento"
Log "Repo: $repoRoot"

# 1. Traer ultimos cambios (no falla el resto si el pull falla, ej. sin red)
Run-Step 'git pull' $repoRoot { git pull origin master }

# 2. Asegurar contenedores de las 3 fuentes que evolucionan durante el anio fiscal
$dbApps = @('radar-ejecucion', 'infobras', 'radar-inversiones')
foreach ($app in $dbApps) {
  Run-Step "docker compose up -d ($app)" (Join-Path $repoRoot "apps\$app\api") { docker compose up -d }
}

# 3. Re-ingesta MEF (presupuesto/ejecucion) - cambia cada mes con el anio fiscal en curso
Run-Step 'ingest:mef:pilot (MEF)' (Join-Path $repoRoot 'apps\radar-ejecucion\api') {
  $env:MEF_PILOT_DEPARTAMENTOS = $Departamento
  npm run ingest:mef:pilot
}

# 4. Re-ingesta INFOBRAS (obras publicas) + re-materializar cobertura
Run-Step 'ingest:infobras (INFOBRAS)' (Join-Path $repoRoot 'apps\infobras\api') {
  $env:INFOBRAS_DEPARTAMENTOS = $Departamento
  npm run ingest:infobras
}
Run-Step 'coverage:infobras' (Join-Path $repoRoot 'apps\infobras\api') {
  npm run coverage:infobras
}

# 5. Re-ingesta Invierte.pe (inversiones) - completa, HTTP Range continuo
Run-Step 'ingest:invierte:full (Invierte)' (Join-Path $repoRoot 'apps\radar-inversiones\api') {
  $env:INVIERTE_DEPARTAMENTOS = $Departamento
  npm run ingest:invierte:full
}

# 6. Snapshot de cobertura territorial completo - corre tsx directo (no "npm run") para que
#    stdout sea JSON puro, sin banner de npm, y asi el snapshot quede parseable tal cual.
Log '== cobertura:territorial (snapshot final) =='
Push-Location (Join-Path $repoRoot 'apps\radar-ejecucion\api')
try {
  $snapshotPath = Join-Path $logsDir "snapshot-$stamp.json"
  npx tsx src/cli/territorial-coverage.ts --jurisdiccion $Departamento 2>&1 |
    Set-Content -LiteralPath $snapshotPath
  Add-Content -LiteralPath $logPath -Value (Get-Content -LiteralPath $snapshotPath)
  Log "Snapshot guardado: $snapshotPath"
} finally {
  Pop-Location
}

Log "Seguimiento semanal completo. Log: $logPath"
