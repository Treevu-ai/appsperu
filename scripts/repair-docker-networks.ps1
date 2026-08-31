<#
.SYNOPSIS
  Repara el error de Docker "all predefined address pools have been fully subnetted".

.EXAMPLE
  .\scripts\repair-docker-networks.ps1
  .\scripts\corrida-operativa-la-libertad.ps1 -StartApis
#>
[CmdletBinding()]
param(
  [switch]$Aggressive
)

$ErrorActionPreference = 'Stop'

function Log([string]$msg) { Write-Host "[repair-docker] $msg" }

function Test-DockerNetwork([string]$name) {
  docker network inspect $name 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

function Ensure-DockerNetwork([string]$name) {
  if (Test-DockerNetwork $name) {
    Log "Red $name ya existe."
    return
  }
  Log "Creando red compartida $name (una sola subred para todas las apps)..."
  docker network create $name 2>&1 | ForEach-Object { Log "  $_" }
  if ($LASTEXITCODE -ne 0 -or -not (Test-DockerNetwork $name)) {
    throw @"
No se pudo crear la red Docker '$name'.
Si ves 'fully subnetted', amplía default-address-pools en Docker Desktop → Settings → Docker Engine
o ejecuta de nuevo con -Aggressive tras reiniciar Docker Desktop.
"@
  }
}

$before = (docker network ls -q | Measure-Object).Count
Log "Redes Docker antes: $before"

Log "Eliminando redes sin contenedores activos (docker network prune)..."
docker network prune -f

if ($Aggressive) {
  Log "Modo agresivo: eliminando redes huérfanas de proyectos compose detenidos..."
  docker network ls --format '{{.Name}}' |
    Where-Object { $_ -match '_default$' -and $_ -ne 'appsperu_shared' } |
    ForEach-Object {
      Log "  intentando rm $_"
      docker network rm $_ 2>$null | Out-Null
    }
}

Ensure-DockerNetwork 'appsperu_shared'

$after = (docker network ls -q | Measure-Object).Count
Log "Redes Docker después: $after"
Log "Listo. Vuelve a ejecutar la corrida operativa."

if ($after -gt 40) {
  Log @"

ADVERTENCIA: siguen habiendo muchas redes ($after).
Si el error persiste, en Docker Desktop → Settings → Docker Engine agrega:

{
  "default-address-pools": [
    { "base": "172.30.0.0/16", "size": 24 },
    { "base": "172.31.0.0/16", "size": 24 }
  ]
}

Luego Apply & Restart Docker Desktop.
"@
}
