#!/usr/bin/env bash
# Adjunta treevu-rastro-pg a las 13 APIs que usan DATABASE_URL (no salud-institucional).
# Útil si corriste --skip-pg antes del fix y las apps arrancan sin secret.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLY="${FLYCTL:-flyctl}"
FLY_APP_PREFIX="${FLY_APP_PREFIX:-treevu-rastro}"
PG_APP="${FLY_PG_APP:-${FLY_APP_PREFIX}-pg}"

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

while IFS=$'\t' read -r slug _ _ _; do
  [[ "$slug" =~ ^# ]] && continue
  [[ -z "$slug" ]] && continue
  [[ "$slug" == "salud-institucional" ]] && continue
  fly_app="${FLY_APP_PREFIX}-${slug}"
  db_name="${DB_NAMES[$slug]:-${slug//-/_}}"
  if "$FLY" secrets list -a "$fly_app" 2>/dev/null | grep -q DATABASE_URL; then
    echo "OK   ${fly_app} (ya tiene DATABASE_URL)"
  else
    echo "ATTACH ${fly_app} → ${db_name}"
    "$FLY" postgres attach "$PG_APP" -a "$fly_app" --database-name "$db_name" -y
  fi
done < "${ROOT}/infra/api-proxy/apps.tsv"

echo "Listo. Redeploy apps fallidas: FLY_APP_PREFIX=${FLY_APP_PREFIX} bash scripts/fly-bootstrap.sh --skip-pg"
