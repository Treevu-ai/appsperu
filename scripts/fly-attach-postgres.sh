#!/usr/bin/env bash
# Adjunta rastro-api-pg a las 13 APIs que usan DATABASE_URL (no salud-institucional).
# Útil si corriste --skip-pg antes del fix y las apps arrancan sin secret.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLY="${FLYCTL:-flyctl}"
FLY_APP_PREFIX="${FLY_APP_PREFIX:-rastro-api}"
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

attach_with_retry() {
  local fly_app="$1"
  local db_name="$2"
  local attempt max=5 delay=5
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
  return 1
}

while IFS=$'\t' read -r slug _ _ _ <&3 || [ -n "${slug:-}" ]; do
  [[ "$slug" =~ ^# ]] && continue
  [[ -z "$slug" ]] && continue
  [[ "$slug" == "salud-institucional" ]] && continue
  fly_app="${FLY_APP_PREFIX}-${slug}"
  db_name="${DB_NAMES[$slug]:-${slug//-/_}}"

  if ! "$FLY" status -a "$fly_app" >/dev/null 2>&1; then
    echo "SKIP ${fly_app} (app aún no existe — corre fly-bootstrap primero)"
    continue
  fi

  secrets="$("$FLY" secrets list -a "$fly_app" 2>/dev/null || true)"
  if echo "$secrets" | grep -q DATABASE_URL; then
    if echo "$secrets" | grep DATABASE_URL | grep -q Staged; then
      echo "DEPLOY ${fly_app} (DATABASE_URL staged)"
      "$FLY" secrets deploy -a "$fly_app"
    else
      echo "OK   ${fly_app} (ya tiene DATABASE_URL)"
    fi
  else
    echo "ATTACH ${fly_app} → ${db_name}"
    attach_with_retry "$fly_app" "$db_name"
  fi
done 3< "${ROOT}/infra/api-proxy/apps.tsv"

echo "Listo. Redeploy apps fallidas: FLY_APP_PREFIX=${FLY_APP_PREFIX} bash scripts/fly-bootstrap.sh --skip-pg"
