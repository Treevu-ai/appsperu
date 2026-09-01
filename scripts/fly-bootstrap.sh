#!/usr/bin/env bash
# Bootstrap Fly.io: Postgres + secrets + deploy gateway + 14 APIs.
#
# Variables:
#   FLY_APP_PREFIX   default treevu-rastro (único en Fly.io; evita rastro-* tomados)
#   FLY_PG_APP       default ${FLY_APP_PREFIX}-pg
#   FLY_GATEWAY_APP  default ${FLY_APP_PREFIX}-gw
#   FLY_ORG          default personal
#   FLY_REGION       default gru
#
# Uso:
#   bash scripts/fly-bootstrap.sh
#   bash scripts/fly-bootstrap.sh --skip-pg
#   bash scripts/fly-bootstrap.sh --gateway-only
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLY="${FLYCTL:-flyctl}"
REGION="${FLY_REGION:-gru}"
ORG="${FLY_ORG:-personal}"
FLY_APP_PREFIX="${FLY_APP_PREFIX:-treevu-rastro}"
GATEWAY_APP="${FLY_GATEWAY_APP:-${FLY_APP_PREFIX}-gw}"
PG_APP="${FLY_PG_APP:-${FLY_APP_PREFIX}-pg}"
WEB_ORIGIN="${WEB_ORIGIN:-https://www.rastro.fyi,https://rastro.fyi,https://rastro-5zm.pages.dev}"
SKIP_PG=0
GATEWAY_ONLY=0

export FLY_APP_PREFIX GATEWAY_APP

for arg in "$@"; do
  case "$arg" in
    --skip-pg) SKIP_PG=1 ;;
    --gateway-only) GATEWAY_ONLY=1 ;;
  esac
done

if ! command -v "$FLY" >/dev/null 2>&1; then
  echo "ERROR: instala flyctl → curl -L https://fly.io/install.sh | sh" >&2
  exit 1
fi

if ! "$FLY" auth whoami >/dev/null 2>&1; then
  echo "ERROR: ejecuta 'flyctl auth login' o export FLY_API_TOKEN." >&2
  exit 1
fi

fly_app_exists() {
  "$FLY" apps list --json 2>/dev/null | jq -e --arg name "$1" '.[] | select(.name == $name)' >/dev/null
}

fly_app_name() {
  echo "${FLY_APP_PREFIX}-${1}"
}

bash "${ROOT}/scripts/fly-generate-configs.sh"

echo "==> Prefijo Fly: ${FLY_APP_PREFIX} (gateway: ${GATEWAY_APP}, postgres: ${PG_APP})"

if [ "$GATEWAY_ONLY" -eq 1 ]; then
  exec bash "${ROOT}/scripts/fly-deploy-gateway.sh"
fi

if [ "$SKIP_PG" -eq 0 ]; then
  if ! fly_app_exists "$PG_APP"; then
    echo "==> Creando Postgres ${PG_APP} (${REGION}, org ${ORG})..."
    "$FLY" postgres create \
      -n "$PG_APP" \
      -r "$REGION" \
      -o "$ORG" \
      --initial-cluster-size 1 \
      --vm-size shared-cpu-1x \
      --volume-size 20
  else
    echo "==> Postgres ${PG_APP} ya existe."
  fi
fi

declare -A DB_NAMES=(
  [radar-ejecucion]=radar_ejecucion
  [compras-publicas]=compras_publicas
  [radar-inversiones]=radar_inversiones
  [infobras]=infobras
  [ceplan-estrategico]=ceplan_estrategico
  [ceplan-geo]=ceplan_geo
  [identidad-fiscal]=identidad_fiscal
  [proveedores-sancionados]=proveedores_sancionados
  [actividad-agraria]=actividad_agraria
  [seguridad-ciudadana]=seguridad_ciudadana
  [bcrp-comercio-exterior]=bcrp_comercio_exterior
  [inversion-privada]=inversion_privada
  [bcrp-la-libertad]=bcrp_la_libertad
)

echo "==> Desplegando 14 APIs..."
while IFS=$'\t' read -r slug _ app_dir _; do
  [[ "$slug" =~ ^# ]] && continue
  [[ -z "$slug" ]] && continue
  fly_app="$(fly_app_name "$slug")"
  db_name="${DB_NAMES[$slug]:-${slug//-/_}}"

  if ! fly_app_exists "$fly_app"; then
    echo "   → fly apps create ${fly_app}"
    "$FLY" apps create "$fly_app" -o "$ORG" || {
      echo "ERROR: no se pudo crear ${fly_app}. Prueba otro prefijo:" >&2
      echo "  FLY_APP_PREFIX=treevu-rastro-$(date +%s) bash scripts/fly-bootstrap.sh --skip-pg" >&2
      exit 1
    }
  else
    echo "   → ${fly_app} ya existe, deploy only"
  fi

  if [ "$SKIP_PG" -eq 0 ] && [ "$slug" != "salud-institucional" ]; then
    echo "   → attach postgres ${fly_app} → ${db_name}"
    if ! "$FLY" secrets list -a "$fly_app" 2>/dev/null | grep -q DATABASE_URL; then
      "$FLY" postgres attach "$PG_APP" -a "$fly_app" --database-name "$db_name" -y
    fi
  fi

  if [ "$slug" = "salud-institucional" ]; then
    echo "   → salud-institucional: configurar BDs cruzadas después"
  fi

  echo "   → deploy ${fly_app}"
  (
    cd "$ROOT"
    "$FLY" deploy . \
      --config "infra/fly/apps/${slug}/fly.toml" \
      --dockerfile "${ROOT}/infra/fly/Dockerfile.api" \
      --build-arg "APP_DIR=${app_dir}" \
      --app "$fly_app" \
      --remote-only \
      --ha=false \
      --now
  )
done < "${ROOT}/infra/api-proxy/apps.tsv"

echo "==> Desplegando gateway ${GATEWAY_APP}..."
if ! fly_app_exists "$GATEWAY_APP"; then
  "$FLY" apps create "$GATEWAY_APP" -o "$ORG"
fi
(cd "${ROOT}/infra/fly/gateway" && "$FLY" deploy --app "$GATEWAY_APP" --remote-only --ha=false)

echo ""
echo "==> Siguiente: certificado y DNS"
echo "  fly certs add api.rastro.pe -a ${GATEWAY_APP}"
echo "  fly certs show api.rastro.pe -a ${GATEWAY_APP}"
echo ""
bash "${ROOT}/scripts/health-check-apis.sh" || true
