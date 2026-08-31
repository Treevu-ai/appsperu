#!/usr/bin/env bash
# Levanta las 14 APIs con PM2 en el VPS.
#
# Uso (en el VPS, desde /opt/appsperu):
#   bash scripts/start-all-apis.sh
#   bash scripts/start-all-apis.sh --build   # npm ci + build antes de arrancar
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export APPSPERU_ROOT="${APPSPERU_ROOT:-$ROOT}"
export WEB_ORIGIN="${WEB_ORIGIN:-https://www.rastro.fyi,https://rastro.fyi,https://rastro-5zm.pages.dev}"

BUILD=0
if [ "${1:-}" = "--build" ]; then
  BUILD=1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> Instalando PM2..."
  npm install -g pm2
fi

if [ "$BUILD" -eq 1 ]; then
  echo "==> Instalando deps y compilando APIs..."
  while IFS=$'\t' read -r slug port app_dir start_cmd; do
    [[ "$slug" =~ ^# ]] && continue
    [[ -z "$slug" ]] && continue
    api_dir="${APPSPERU_ROOT}/apps/${app_dir}/api"
    echo "   → ${app_dir}"
    (cd "$api_dir" && npm ci --silent)
    if jq -e '.scripts.build' "$api_dir/package.json" >/dev/null 2>&1; then
      (cd "$api_dir" && npm run build)
    fi
  done < "${ROOT}/infra/api-proxy/apps.tsv"
fi

echo "==> Arrancando/reiniciando PM2..."
pm2 startOrReload "${ROOT}/infra/api-proxy/ecosystem.config.cjs" --update-env
pm2 save

echo ""
echo "Estado:"
pm2 list
echo ""
echo "Health local:"
bash "${ROOT}/scripts/health-check-apis.sh" --local
