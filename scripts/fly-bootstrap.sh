#!/usr/bin/env bash
# Bootstrap Fly.io: Postgres + secrets + deploy gateway + 14 APIs.
#
# Requisitos:
#   flyctl auth login   (o export FLY_API_TOKEN)
#   DNS api.rastro.pe apuntará a Fly tras: fly certs setup (ver docs/FLY_DEPLOY.md)
#
# Uso:
#   bash scripts/fly-bootstrap.sh              # postgres + deploy todo
#   bash scripts/fly-bootstrap.sh --skip-pg    # solo deploy (postgres ya existe)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLY="${FLYCTL:-flyctl}"
REGION="${FLY_REGION:-gru}"
PG_APP="${FLY_PG_APP:-rastro-pg}"
WEB_ORIGIN="${WEB_ORIGIN:-https://www.rastro.fyi,https://rastro.fyi,https://rastro-5zm.pages.dev}"
SKIP_PG=0

for arg in "$@"; do
  case "$arg" in
    --skip-pg) SKIP_PG=1 ;;
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

bash "${ROOT}/scripts/fly-generate-configs.sh"

if [ "$SKIP_PG" -eq 0 ]; then
  if ! "$FLY" apps list 2>/dev/null | grep -q "^${PG_APP} "; then
    echo "==> Creando Postgres ${PG_APP} (${REGION})..."
    "$FLY" postgres create \
      --name "$PG_APP" \
      --region "$REGION" \
      --initial-cluster-size 1 \
      --vm-size shared-cpu-1x \
      --volume-size 20 \
      --yes
  else
    echo "==> Postgres ${PG_APP} ya existe."
  fi
fi

# Map slug → database name (matches docker-compose defaults)
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
  fly_app="rastro-${slug}"
  db_name="${DB_NAMES[$slug]:-${slug//-/_}}"
  config="${ROOT}/infra/fly/apps/${slug}/fly.toml"

  if ! "$FLY" apps list 2>/dev/null | grep -q "^${fly_app} "; then
    echo "   → fly apps create ${fly_app}"
    "$FLY" apps create "$fly_app" 2>/dev/null || true
  fi

  if [ "$SKIP_PG" -eq 0 ] && [ "$slug" != "salud-institucional" ]; then
    echo "   → attach postgres ${fly_app}"
    "$FLY" postgres attach "$PG_APP" --app "$fly_app" --database-name "$db_name" --yes 2>/dev/null || true
  fi

  if [ "$slug" = "salud-institucional" ]; then
    # Agregador: apunta a otras BDs vía URLs internas (ver docs/FLY_DEPLOY.md)
    "$FLY" secrets set -a "$fly_app" \
      WEB_ORIGIN="$WEB_ORIGIN" \
      EJECUCION_DATABASE_URL="postgres://placeholder:configure@rastro-radar-ejecucion.internal:5432/radar_ejecucion" \
      --stage 2>/dev/null || true
  fi

  echo "   → deploy ${fly_app}"
  "$FLY" deploy --config "$config" --app "$fly_app" --remote-only --ha=false
done < "${ROOT}/infra/api-proxy/apps.tsv"

echo "==> Desplegando gateway rastro-api-gateway..."
if ! "$FLY" apps list 2>/dev/null | grep -q "^rastro-api-gateway "; then
  "$FLY" apps create rastro-api-gateway --org personal 2>/dev/null || "$FLY" apps create rastro-api-gateway
fi
(cd "${ROOT}/infra/fly/gateway" && "$FLY" deploy --remote-only --ha=false)

echo ""
echo "==> Certificado custom domain"
echo "Ejecuta:"
echo "  fly certs add api.rastro.pe -a rastro-api-gateway"
echo "  fly certs show api.rastro.pe -a rastro-api-gateway"
echo ""
echo "Luego actualiza DNS de api.rastro.pe según las instrucciones (quita A → 149.104.66.100 LightNode)."
echo ""
bash "${ROOT}/scripts/health-check-apis.sh" || true
