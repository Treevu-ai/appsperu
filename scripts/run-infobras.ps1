[CmdletBinding()]
param(
  [string]$Departamentos = $env:INFOBRAS_DEPARTAMENTOS
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$apiRoot = Join-Path $repoRoot 'apps\infobras\api'
$logsDir = Join-Path $repoRoot 'logs'

function Get-EnvValue([string]$path, [string]$name) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  $line = Get-Content -LiteralPath $path | Where-Object { $_ -match "^$([regex]::Escape($name))=" } | Select-Object -First 1
  if ($null -eq $line) { return $null }
  return $line.Split('=', 2)[1]
}

if (-not $Departamentos) {
  $Departamentos = Get-EnvValue (Join-Path $apiRoot '.env') 'INFOBRAS_DEPARTAMENTOS'
}
if (-not $Departamentos) {
  $Departamentos = 'LA LIBERTAD,LAMBAYEQUE,PIURA,CAJAMARCA,CUSCO'
}

$env:INFOBRAS_DEPARTAMENTOS = $Departamentos
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
$logPath = Join-Path $logsDir ("infobras-{0:yyyyMMdd-HHmm}.log" -f (Get-Date))

Push-Location $apiRoot
try {
  Write-Host "INFOBRAS — departamentos: $Departamentos"
  Write-Host "Log: $logPath"
  npm run ingest:infobras 2>&1 | Tee-Object -FilePath $logPath
  if ($LASTEXITCODE -ne 0) { throw "La ingesta terminó con código $LASTEXITCODE." }
  Write-Host "Materializando cobertura territorial..."
  npm run coverage:infobras 2>&1 | Tee-Object -FilePath $logPath -Append
  if ($LASTEXITCODE -ne 0) { throw "coverage:infobras terminó con código $LASTEXITCODE." }
  Write-Host "Listo. Revisa el log y corre el SQL de verificación del runbook §4.4."
} finally {
  Pop-Location
}
