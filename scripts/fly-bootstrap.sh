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
  "$FLY" apps list --json 2>/dev/null | jq -e --arg name "$1" \
    '.[] | select(.Name == $name or .name == $name)' >/dev/null 2>&1
}

ensure_fly_app() {
  local fly_app="$1"
  if fly_app_exists "$fly_app"; then
    echo "   → ${fly_app} ya existe, deploy only"
    return 0
  fi
  echo "   → fly apps create ${fly_app}"
  if "$FLY" apps create "$fly_app" -o "$ORG" 2>/dev/null; then
    return 0
  fi
  # Creación falló — si la app es nuestra, seguir (nombre tomado en org)
  if "$FLY" status -a "$fly_app" >/dev/null 2>&1; then
    echo "   → ${fly_app} ya existe en tu cuenta (deploy only)"
    return 0
  fi
  echo "ERROR: no se pudo crear ${fly_app}. Prueba otro prefijo:" >&2
  echo "  FLY_APP_PREFIX=treevu-rastro-$(date +%s) bash scripts/fly-bootstrap.sh --skip-pg" >&2
  return 1
}

fly_app_name() {
  echo "${FLY_APP_PREFIX}-${1}"
}

bash "${ROOT}/scripts/fly-generate-configs.sh"

echo "==> Prefijo Fly: ${FLY_APP_PREFIX} (gateway: ${GATEWAY_APP}, postgres: ${PG_APP})"

echo "==> Creando apps Fly (14 APIs + gateway)..."
bash "${ROOT}/scripts/fly-create-apps.sh"

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

# Attach postgres a cada API (incluso con --skip-pg — solo salta CREAR el cluster)
attach_postgres_if_needed() {
  local fly_app="$1"
  local db_name="$2"
  local attempt max=5 delay=5
  if ! fly_app_exists "$PG_APP"; then
    echo "ERROR: Postgres ${PG_APP} no existe. Quita --skip-pg o crea el cluster primero." >&2
    return 1
  fi
  local secrets
  secrets="$("$FLY" secrets list -a "$fly_app" 2>/dev/null || true)"
  if echo "$secrets" | grep -q DATABASE_URL; then
    if echo "$secrets" | grep DATABASE_URL | grep -q Staged; then
      echo "   → ${fly_app} DATABASE_URL staged, desplegando..."
      "$FLY" secrets deploy -a "$fly_app"
    else
      echo "   → ${fly_app} ya tiene DATABASE_URL"
    fi
    return 0
  fi
  echo "   → attach postgres ${fly_app} → ${db_name}"
  for attempt in $(seq 1 "$max"); do
    if "$FLY" postgres attach "$PG_APP" -a "$fly_app" --database-name "$db_name" -y; then
      return 0
    fi
    if [ "$attempt" -lt "$max" ]; then
      echo "   → attach falló (intento ${attempt}/${max}), reintento en ${delay}s..."
      sleep "$delay"
      delay=$((delay * 2))
      if [ "$attempt" -eq 2 ]; then
        echo "   → reiniciando Postgres ${PG_APP}..."
        "$FLY" machine restart -a "$PG_APP" 2>/dev/null || true
        sleep 10
      fi
    fi
  done
  echo "ERROR: attach postgres falló para ${fly_app} tras ${max} intentos." >&2
  return 1
}

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

  ensure_fly_app "$fly_app" || exit 1

  if [ "$slug" != "salud-institucional" ]; then
    attach_postgres_if_needed "$fly_app" "$db_name" || exit 1
  fi

  if [ "$slug" = "salud-institucional" ]; then
    echo "   → salud-institucional: secrets cruzados antes del deploy"
  fi

  bash "${ROOT}/scripts/fly-cross-secrets-for-app.sh" "$slug" || true

  echo "   → deploy ${fly_app}"
  (
    cd "$ROOT"
    "$FLY" deploy . \
      --config "infra/fly/manifests/${slug}.toml" \
      --build-arg "APP_DIR=${app_dir}" \
      --app "$fly_app" \
      --remote-only \
      --ha=false \
      --now
  )
done < "${ROOT}/infra/api-proxy/apps.tsv"

echo "==> Desplegando gateway ${GATEWAY_APP}..."
ensure_fly_app "$GATEWAY_APP" || exit 1
(cd "${ROOT}/infra/fly/gateway" && "$FLY" deploy --app "$GATEWAY_APP" --remote-only --ha=false)

echo ""
echo "==> Siguiente: certificado, DNS y frontend"
echo "  fly certs add api.rastro.pe -a ${GATEWAY_APP}"
echo "  fly certs show api.rastro.pe -a ${GATEWAY_APP}"
echo "  (Cloudflare DNS) quita A -> 149.104.66.100; usa lo que indique Fly"
echo "  (Cloudflare Pages) VITE_PUBLIC_APIS_LIVE=true + redeploy rastro-web"
echo ""
bash "${ROOT}/scripts/health-check-apis.sh" || true
