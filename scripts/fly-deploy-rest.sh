#!/usr/bin/env bash
# Continua deploy Fly tras radar-ejecucion + compras-publicas.
set -eu
export PATH="$HOME/.fly/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FLY="${FLYCTL:-flyctl}"
P="${FLY_APP_PREFIX:-treevu-rastro}"

REMAINING=(
  radar-inversiones
  infobras
  ceplan-estrategico
  ceplan-geo
  identidad-fiscal
  salud-institucional
  proveedores-sancionados
  actividad-agraria
  seguridad-ciudadana
  bcrp-comercio-exterior
  inversion-privada
  bcrp-la-libertad
)

declare -A DB_NAMES=(
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

while IFS=$'\t' read -r slug _ app_dir _; do
  [[ "$slug" =~ ^# ]] && continue
  [[ -z "$slug" ]] && continue
  case " ${REMAINING[*]} " in
    *" $slug "*) ;;
    *) continue ;;
  esac
  fly_app="${P}-${slug}"
  db_name="${DB_NAMES[$slug]:-${slug//-/_}}"
  echo "========== ${slug} =========="
  if [ "$slug" != "salud-institucional" ]; then
    bash "$ROOT/scripts/fly-attach-postgres.sh" 2>/dev/null | grep -E "^(ATTACH|OK|DEPLOY|SET)" || \
      bash "$ROOT/scripts/fly-attach-postgres.sh" || true
  fi
  bash "$ROOT/scripts/fly-cross-secrets-for-app.sh" "$slug" || true
  cd "$ROOT"
  "$FLY" deploy . \
    --config "infra/fly/manifests/${slug}.toml" \
    --build-arg "APP_DIR=${app_dir}" \
    --app "$fly_app" \
    --remote-only \
    --ha=false
done < "$ROOT/infra/api-proxy/apps.tsv"

echo "========== gateway =========="
bash "$ROOT/scripts/fly-deploy-gateway.sh"
echo "DONE deploy-rest"
