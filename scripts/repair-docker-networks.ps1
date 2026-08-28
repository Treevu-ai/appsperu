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

if (-not (docker network inspect appsperu_shared 2>$null)) {
  Log "Creando red compartida appsperu_shared (una sola subred para todas las apps)..."
  docker network create appsperu_shared | Out-Null
} else {
  Log "Red appsperu_shared ya existe."
}

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
