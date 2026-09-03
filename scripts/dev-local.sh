#!/usr/bin/env bash
# Dev local: Postgres (Docker) + 14 APIs + MCP server + Rastro Web.
#
# Uso:
#   bash scripts/dev-local.sh              # todo (postgres + apis + web)
#   bash scripts/dev-local.sh --postgres   # solo Postgres
#   bash scripts/dev-local.sh --apis       # solo APIs (requiere Postgres)
#   bash scripts/dev-local.sh --mcp        # build MCP (stdio, para Cursor)
#   bash scripts/dev-local.sh --web        # solo frontend Vite
#   bash scripts/dev-local.sh --check      # health check local
#   bash scripts/dev-local.sh --only "radar-ejecucion,infobras"
#                                           # solo ese subset (postgres + apis) —
#                                           # para RAM limitada, no levantes las 14
# Compatible con Git Bash en Windows (sin pipefail — CRLF rompe "set -o pipefail")
set -eu

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-all}"

need_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: Docker no está instalado. Instálalo y vuelve a correr este script." >&2
    echo "  https://docs.docker.com/engine/install/" >&2
    exit 1
  fi
}

ensure_api_envs() {
  while IFS=$'\t' read -r slug _ app_dir _; do
    [[ "$slug" =~ ^# ]] && continue
    [[ -z "$slug" ]] && continue
    [[ "$slug" == "salud-institucional" ]] && continue
    api_dir="${ROOT}/apps/${app_dir}/api"
    if [ -f "${api_dir}/.env.example" ] && [ ! -f "${api_dir}/.env" ]; then
      cp "${api_dir}/.env.example" "${api_dir}/.env"
      echo "   → ${app_dir}/api/.env (desde .env.example)"
    fi
  done < "${ROOT}/infra/api-proxy/apps.tsv"
}

start_postgres() {
  need_docker
  # $@: slugs a levantar; vacío = todas
  bash "${ROOT}/scripts/start-all-postgres.sh" "$@"
  ensure_api_envs
}

start_apis() {
  if ! command -v pm2 >/dev/null 2>&1; then
    echo "==> Instalando PM2..."
    npm install -g pm2
  fi
  export APPSPERU_ROOT="$ROOT"
  export WEB_ORIGIN="http://localhost:5173,http://127.0.0.1:5173"
  bash "${ROOT}/scripts/start-all-apis.sh" --build
}

start_only() {
  local only="$1"
  [ -n "$only" ] || { echo "ERROR: --only requiere una lista, ej. --only \"radar-ejecucion,infobras\"" >&2; exit 1; }
  # bash 3 (macOS/Git Bash) no tiene mapfile — split manual por coma
  local slugs=()
  local IFS=','
  read -ra slugs <<< "$only"
  start_postgres "${slugs[@]}"
  ONLY="$only" start_apis
}

build_mcp() {
  echo "==> MCP server"
  (cd "${ROOT}/mcp-server" && npm ci && npm run build)
  echo ""
  echo "Agrega a ~/.cursor/mcp.json (ver .mcp.json.example):"
  echo "  node ${ROOT}/mcp-server/dist/index.js"
}

start_web() {
  web_dir="${ROOT}/apps/rastro-web"
  local port="${PORT:-5173}"
  if [ ! -f "${web_dir}/.env" ] && [ -f "${web_dir}/.env.example" ]; then
    cp "${web_dir}/.env.example" "${web_dir}/.env"
    echo "   → apps/rastro-web/.env (desde .env.example)"
  fi
  if [ ! -f "${web_dir}/.env" ]; then
    echo "ERROR: falta apps/rastro-web/.env — copia .env.example" >&2
    exit 1
  fi
  echo "==> Rastro Web (espera el URL que imprima Vite abajo)"
  (cd "$web_dir" && npm ci && npm run dev -- --host --port "$port")
}

health_check() {
  bash "${ROOT}/scripts/health-check-apis.sh" --local || true
}

case "$MODE" in
  --postgres) start_postgres ;;
  --apis) start_apis ;;
  --mcp) build_mcp ;;
  --web) start_web ;;
  --check) health_check ;;
  --only) start_only "${2:-}" ;;
  all|"")
    start_postgres
    start_apis
    build_mcp
    echo ""
    echo "APIs + MCP listos. Inicia el frontend en otra terminal:"
    echo "  bash scripts/dev-local.sh --web"
    echo ""
    health_check
    ;;
  *)
    echo "Uso: bash scripts/dev-local.sh [--postgres|--apis|--mcp|--web|--check|--only \"a,b\"]" >&2
    exit 1
    ;;
esac
