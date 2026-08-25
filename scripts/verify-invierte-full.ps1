[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$apiRoot = Join-Path $repoRoot 'apps\radar-ejecucion\api'

Push-Location $apiRoot
try {
  npm run cobertura:territorial -- --app radar-inversiones --require-complete
  if ($LASTEXITCODE -ne 0) {
    throw 'La cobertura de Invierte aún no es completa. No publicar ni hacer commit como corte final.'
  }
} finally {
  Pop-Location
}
