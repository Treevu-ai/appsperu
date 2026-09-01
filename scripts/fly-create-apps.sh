#!/usr/bin/env bash
# Crea todas las apps Fly (14 APIs + gateway) antes de attach/deploy.
# Evita "Could not find App" al correr fly postgres attach en paralelo o mid-bootstrap.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLY="${FLYCTL:-flyctl}"
ORG="${FLY_ORG:-personal}"
FLY_APP_PREFIX="${FLY_APP_PREFIX:-treevu-rastro}"
GATEWAY_APP="${FLY_GATEWAY_APP:-${FLY_APP_PREFIX}-gw}"

fly_app_exists() {
  "$FLY" status -a "$1" >/dev/null 2>&1
}

ensure_fly_app() {
  local fly_app="$1"
  if fly_app_exists "$fly_app"; then
    echo "OK   ${fly_app}"
    return 0
  fi
  echo "CREATE ${fly_app}"
  if ! "$FLY" apps create "$fly_app" -o "$ORG"; then
    if fly_app_exists "$fly_app"; then
      echo "OK   ${fly_app} (ya existía tras create)"
      return 0
    fi
    echo "ERROR: no se pudo crear ${fly_app}" >&2
    return 1
  fi
}

echo "==> Creando apps con prefijo ${FLY_APP_PREFIX} (org ${ORG})"
while IFS=$'\t' read -r slug _ _ _; do
  [[ "$slug" =~ ^# ]] && continue
  [[ -z "$slug" ]] && continue
  ensure_fly_app "${FLY_APP_PREFIX}-${slug}"
done < "${ROOT}/infra/api-proxy/apps.tsv"

ensure_fly_app "$GATEWAY_APP"
echo "Listo."
