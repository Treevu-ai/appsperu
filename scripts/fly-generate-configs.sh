#!/usr/bin/env bash
# Genera Caddyfile + fly.toml por app desde infra/api-proxy/apps.tsv
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TSV="${ROOT}/infra/api-proxy/apps.tsv"
FLY_DIR="${ROOT}/infra/fly"
GATEWAY_DIR="${FLY_DIR}/gateway"
MANIFESTS_DIR="${FLY_DIR}/manifests"
REGION="${FLY_REGION:-gru}"
FLY_APP_PREFIX="${FLY_APP_PREFIX:-treevu-rastro}"
GATEWAY_APP="${FLY_GATEWAY_APP:-${FLY_APP_PREFIX}-gw}"

mkdir -p "$MANIFESTS_DIR"

# --- Gateway fly.toml (queda en gateway/ junto a su Dockerfile) ---
cat > "${GATEWAY_DIR}/fly.toml" <<EOF
# Generado por scripts/fly-generate-configs.sh
app = "${GATEWAY_APP}"
primary_region = "${REGION}"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1
EOF

# --- Caddyfile ---
{
  echo "# Generado por scripts/fly-generate-configs.sh (prefix: ${FLY_APP_PREFIX})"
  echo ":8080 {"
  echo "  handle / {"
  echo '    respond "{\"status\":\"ok\",\"service\":\"api.rastro.pe\",\"apps\":14}" 200'
  echo "  }"
  while IFS=$'\t' read -r slug _ _ _; do
    [[ "$slug" =~ ^# ]] && continue
    [[ -z "$slug" ]] && continue
    fly_app="${FLY_APP_PREFIX}-${slug}"
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

# --- fly.toml per API: en infra/fly/manifests/ (dockerfile = ../Dockerfile.api) ---
while IFS=$'\t' read -r slug _ app_dir _; do
  [[ "$slug" =~ ^# ]] && continue
  [[ -z "$slug" ]] && continue
  fly_app="${FLY_APP_PREFIX}-${slug}"
  cat > "${MANIFESTS_DIR}/${slug}.toml" <<EOF
# Generado por scripts/fly-generate-configs.sh
# Deploy desde raíz: fly deploy . --config infra/fly/manifests/${slug}.toml
app = "${fly_app}"
primary_region = "${REGION}"

[build]
  dockerfile = "../Dockerfile.api"
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
    timeout = "10s"
    grace_period = "120s"
    method = "GET"
    path = "/health"

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
EOF
done < "$TSV"

count="$(grep -v '^#' "$TSV" | grep -cv '^[[:space:]]*$' || true)"
echo "OK: prefix=${FLY_APP_PREFIX} gateway=${GATEWAY_APP} → manifests/${count} + Caddyfile"
