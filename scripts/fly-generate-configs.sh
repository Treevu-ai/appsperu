#!/usr/bin/env bash
# Genera Caddyfile + fly.toml por app desde infra/api-proxy/apps.tsv
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TSV="${ROOT}/infra/api-proxy/apps.tsv"
FLY_DIR="${ROOT}/infra/fly"
GATEWAY_DIR="${FLY_DIR}/gateway"
APPS_DIR="${FLY_DIR}/apps"
REGION="${FLY_REGION:-gru}"

mkdir -p "$APPS_DIR"

# --- Caddyfile ---
{
  echo "# Generado por scripts/fly-generate-configs.sh"
  echo ":8080 {"
  echo "  handle / {"
  echo '    respond "{\"status\":\"ok\",\"service\":\"api.rastro.pe\",\"apps\":14}" 200'
  echo "  }"
  while IFS=$'\t' read -r slug _ app_dir _; do
    [[ "$slug" =~ ^# ]] && continue
    [[ -z "$slug" ]] && continue
    fly_app="rastro-${slug}"
    cat <<EOF

  handle_path /${slug}/* {
    reverse_proxy ${fly_app}.internal:8080 {
      health_uri /health
      health_interval 30s
    }
  }
  redir /${slug} /${slug}/
EOF
  done < "$TSV"
  echo "}"
} > "${GATEWAY_DIR}/Caddyfile"

# --- fly.toml per API ---
while IFS=$'\t' read -r slug _ app_dir _; do
  [[ "$slug" =~ ^# ]] && continue
  [[ -z "$slug" ]] && continue
  fly_app="rastro-${slug}"
  mkdir -p "${APPS_DIR}/${slug}"
  cat > "${APPS_DIR}/${slug}/fly.toml" <<EOF
# Generado por scripts/fly-generate-configs.sh
app = "${fly_app}"
primary_region = "${REGION}"

[build]
  dockerfile = "infra/fly/Dockerfile.api"
  [build.args]
    APP_DIR = "${app_dir}"

[env]
  PORT = "8080"
  WEB_ORIGIN = "https://www.rastro.fyi,https://rastro.fyi,https://rastro-5zm.pages.dev"

[http_service]
  internal_port = 8080
  force_https = false
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

  [[http_service.checks]]
    interval = "30s"
    timeout = "5s"
    grace_period = "20s"
    method = "GET"
    path = "/health"

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
EOF
done < "$TSV"

count="$(grep -vc '^#' "$TSV" || true)"
echo "OK: Caddyfile + ${count} fly.toml en ${APPS_DIR}/"
