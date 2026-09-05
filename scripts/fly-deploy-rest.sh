#!/usr/bin/env bash
# Despliega APIs pendientes (salta las que ya tienen imagen) + redeploy gateway.
set -euo pipefail
export PATH="$HOME/.fly/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FLY="${FLYCTL:-flyctl}"
P="${FLY_APP_PREFIX:-rastro-api}"

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

needs_deploy() {
  local fly_app="$1"
  local image
  image=$("$FLY" status -a "$fly_app" 2>/dev/null | awk '/^ Image / { print $3 }' || true)
  [ -z "$image" ] || [ "$image" = "-" ]
}

attach_postgres() {
  local fly_app="$1"
  local db_name="$2"
  local pg_app="${FLY_PG_APP:-${P}-pg}"
  local secrets
  secrets=$("$FLY" secrets list -a "$fly_app" 2>/dev/null || true)
  if echo "$secrets" | grep -q DATABASE_URL; then
    if echo "$secrets" | grep DATABASE_URL | grep -q Staged; then
      "$FLY" secrets deploy -a "$fly_app"
    fi
    return 0
  fi
  "$FLY" postgres attach "$pg_app" -a "$fly_app" --database-name "$db_name" -y
}

while IFS=$'\t' read -r slug _ app_dir _ <&3 || [ -n "${slug:-}" ]; do
  [[ "$slug" =~ ^# ]] && continue
  [[ -z "$slug" ]] && continue
  fly_app="${P}-${slug}"
  db_name="${DB_NAMES[$slug]:-${slug//-/_}}"

  if ! needs_deploy "$fly_app"; then
    echo "SKIP ${slug} (ya desplegada)"
    continue
  fi

  echo "========== ${slug} =========="
  if [ "$slug" != "salud-institucional" ]; then
    attach_postgres "$fly_app" "$db_name"
  fi
  bash "$ROOT/scripts/fly-cross-secrets-for-app.sh" "$slug" || true
  cd "$ROOT"
  "$FLY" deploy . \
    --config "infra/fly/manifests/${slug}.toml" \
    --build-arg "APP_DIR=${app_dir}" \
    --app "$fly_app" \
    --remote-only \
    --ha=false \
    --now \
    </dev/null
done 3< "$ROOT/infra/api-proxy/apps.tsv"

echo "========== gateway =========="
bash "$ROOT/scripts/fly-deploy-gateway.sh"
echo "DONE deploy-rest"
