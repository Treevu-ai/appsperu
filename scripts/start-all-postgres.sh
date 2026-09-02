#!/usr/bin/env bash
# Levanta los contenedores Postgres de las 14 apps (Docker).
# Requiere red Docker externa appsperu_shared (radar-ejecucion la crea).
#
# Uso (VPS, todas):      bash scripts/start-all-postgres.sh
# Uso (subset, local):   bash scripts/start-all-postgres.sh radar-ejecucion infobras
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! docker network inspect appsperu_shared >/dev/null 2>&1; then
  echo "==> Creando red Docker appsperu_shared..."
  docker network create appsperu_shared
fi

ALL_APPS=(
  radar-ejecucion
  compras-publicas
  radar-inversiones
  infobras
  ceplan-estrategico
  ceplan-geo
  identidad-fiscal
  proveedores-sancionados
  actividad-agraria
  seguridad-ciudadana
  bcrp-comercio-exterior
  inversion-privada
  bcrp-la-libertad
)

if [ "$#" -gt 0 ]; then
  APPS=("$@")
else
  APPS=("${ALL_APPS[@]}")
fi

for app in "${APPS[@]}"; do
  compose="${ROOT}/apps/${app}/api/docker-compose.yml"
  if [ -f "$compose" ]; then
    echo "==> ${app} postgres"
    docker compose -f "$compose" up -d
  else
    echo "SKIP ${app} (sin docker-compose.yml)"
  fi
done

echo ""
echo "Postgres listo. salud-institucional no tiene BD propia."
echo "Siguiente: copiar .env.example → .env en cada apps/*/api/ y ajustar DATABASE_URL."
