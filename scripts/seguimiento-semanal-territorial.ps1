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

# 2. Asegurar contenedores de las fuentes que evolucionan durante el anio fiscal,
#    mas compras-publicas y ceplan-geo (no se re-ingestan cada semana, pero el
#    export:snapshot del paso 7 si necesita que su API este arriba para leerlas).
$dbApps = @('radar-ejecucion', 'infobras', 'radar-inversiones', 'compras-publicas', 'ceplan-geo')
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

# 7. Corte semanal explicito: exporta src/data/snapshot.json y abre un PR con
#    el cambio (nunca push directo a master, mismo patron que el resto del
#    proyecto). Asume que las 14 APIs ya estan arriba (scripts/dev-local.sh /
#    PM2) - este script solo trae contenedores de base de datos, no los
#    servidores HTTP. Un fallo aca no debe tumbar el resto del seguimiento.
try {
  Log '== export:snapshot (corte semanal para rastro-web) =='
  Push-Location (Join-Path $repoRoot 'apps\rastro-web')
  npm run export:snapshot *>&1 | Tee-Object -FilePath $logPath -Append
  Pop-Location

  Push-Location $repoRoot
  $changed = git status --porcelain -- apps/rastro-web/src/data/snapshot.json
  if ([string]::IsNullOrWhiteSpace($changed)) {
    Log 'snapshot.json sin cambios (export fallo o no hay diferencias) - no se abre PR.'
  } else {
    $branch = "data/corte-semanal-$stamp"
    git checkout -b $branch
    git add apps/rastro-web/src/data/snapshot.json
    git commit -m "data(rastro-web): corte semanal $stamp`n`nGenerado por scripts/seguimiento-semanal-territorial.ps1."
    git push -u origin $branch
    gh pr create --title "data(rastro-web): corte semanal $stamp" --body "Snapshot generado automaticamente por el cron semanal (scripts/export-snapshot.mjs). Revisar y mergear para publicar el corte nuevo." *>&1 |
      Tee-Object -FilePath $logPath -Append
    git checkout master
    Log "PR de corte semanal abierto (rama $branch)."
  }
  Pop-Location
} catch {
  Log "ADVERTENCIA: publicacion del corte semanal fallo: $($_.Exception.Message) - revisar manualmente."
}

Log "Seguimiento semanal completo. Log: $logPath"
