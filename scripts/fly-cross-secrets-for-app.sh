#!/usr/bin/env bash
# Secrets cruzados antes del deploy de cada app (lee DATABASE_URL via fly ssh).
set -eu

FLY="${FLYCTL:-flyctl}"
P="${FLY_APP_PREFIX:-treevu-rastro}"

fetch_db_url() {
  local slug="$1"
  local app="${P}-${slug}"
  local mid
  mid=$("$FLY" machine list -a "$app" --json 2>/dev/null | jq -r '.[0].id // empty')
  [ -n "$mid" ] || return 1
  "$FLY" machine start "$mid" -a "$app" >/dev/null 2>&1 || true
  sleep 2
  "$FLY" ssh console -a "$app" -C 'printenv DATABASE_URL' 2>/dev/null | tr -d '\r\n'
}

set_if() {
  local app="$1"
  local name="$2"
  local url="$3"
  [ -n "$url" ] || return 0
  echo "   → cross-secret ${app} ${name}"
  "$FLY" secrets set -a "$app" "${name}=${url}" >/dev/null
}

apply_cross_secrets() {
  local slug="$1"
  local app="${P}-${slug}"
  local ejec inv com inf fis

  case "$slug" in
    compras-publicas)
      ejec=$(fetch_db_url radar-ejecucion || true)
      set_if "$app" RADAR_DATABASE_URL "$ejec"
      ;;
    radar-inversiones)
      ejec=$(fetch_db_url radar-ejecucion || true)
      set_if "$app" EJECUCION_DATABASE_URL "$ejec"
      ;;
    infobras)
      ejec=$(fetch_db_url radar-ejecucion || true)
      inv=$(fetch_db_url radar-inversiones || true)
      set_if "$app" EJECUCION_DATABASE_URL "$ejec"
      set_if "$app" INVERSIONES_DATABASE_URL "$inv"
      ;;
    identidad-fiscal)
      ejec=$(fetch_db_url radar-ejecucion || true)
      com=$(fetch_db_url compras-publicas || true)
      set_if "$app" EJECUCION_DATABASE_URL "$ejec"
      set_if "$app" COMPRAS_DATABASE_URL "$com"
      ;;
    proveedores-sancionados)
      ejec=$(fetch_db_url radar-ejecucion || true)
      com=$(fetch_db_url compras-publicas || true)
      fis=$(fetch_db_url identidad-fiscal || true)
      set_if "$app" EJECUCION_DATABASE_URL "$ejec"
      set_if "$app" COMPRAS_DATABASE_URL "$com"
      set_if "$app" FISCAL_DATABASE_URL "$fis"
      ;;
    actividad-agraria|seguridad-ciudadana)
      ejec=$(fetch_db_url radar-ejecucion || true)
      set_if "$app" EJECUCION_DATABASE_URL "$ejec"
      ;;
    ceplan-estrategico)
      ejec=$(fetch_db_url radar-ejecucion || true)
      inf=$(fetch_db_url infobras || true)
      set_if "$app" EJECUCION_DATABASE_URL "$ejec"
      set_if "$app" INFOBRAS_DATABASE_URL "$inf"
      ;;
    inversion-privada)
      inv=$(fetch_db_url radar-inversiones || true)
      set_if "$app" INVERSIONES_DATABASE_URL "$inv"
      ;;
    salud-institucional)
      ejec=$(fetch_db_url radar-ejecucion || true)
      inf=$(fetch_db_url infobras || true)
      inv=$(fetch_db_url radar-inversiones || true)
      com=$(fetch_db_url compras-publicas || true)
      fis=$(fetch_db_url identidad-fiscal || true)
      set_if "$app" EJECUCION_DATABASE_URL "$ejec"
      set_if "$app" INFOBRAS_DATABASE_URL "$inf"
      set_if "$app" INVERSIONES_DATABASE_URL "$inv"
      set_if "$app" COMPRAS_DATABASE_URL "$com"
      set_if "$app" FISCAL_DATABASE_URL "$fis"
      ;;
  esac
}

if [ "${1:-}" = "--all-before" ]; then
  while IFS=$'\t' read -r slug _ _ _; do
    [[ "$slug" =~ ^# ]] && continue
    [[ -z "$slug" ]] && continue
    apply_cross_secrets "$slug"
  done < "$(cd "$(dirname "$0")/.." && pwd)/infra/api-proxy/apps.tsv"
else
  [ -n "${1:-}" ] || { echo "Uso: $0 <slug> | --all-before"; exit 1; }
  apply_cross_secrets "$1"
fi
