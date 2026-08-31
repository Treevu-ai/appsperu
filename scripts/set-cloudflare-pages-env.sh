#!/usr/bin/env bash
# Configura las 14 VITE_API_BASE_URL_* en Cloudflare Pages (Production + Preview).
#
# Requiere:
#   CLOUDFLARE_API_TOKEN — permiso Account → Cloudflare Pages → Edit
#   CLOUDFLARE_ACCOUNT_ID
#
# Opcional:
#   CLOUDFLARE_PAGES_PROJECT — default: rastro
#
# Uso:
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... bash scripts/set-cloudflare-pages-env.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/apps/rastro-web/.env.production.cloudflare"
PROJECT="${CLOUDFLARE_PAGES_PROJECT:-rastro}"
API="https://api.cloudflare.com/client/v4"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "ERROR: export CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: no existe ${ENV_FILE}" >&2
  exit 1
fi

auth=( -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" )

ENV_JSON="$(grep -v '^#' "$ENV_FILE" | grep -v '^[[:space:]]*$' | jq -R -s '
  split("\n")
  | map(select(length > 0))
  | map(split("="))
  | map({(.[0]): {value: .[1], type: "plain_text"}})
  | add
')"

count="$(echo "$ENV_JSON" | jq 'length')"
if [ "$count" -eq 0 ] 2>/dev/null; then
  echo "ERROR: ${ENV_FILE} no tiene variables VITE_*." >&2
  exit 1
fi

payload="$(jq -n \
  --argjson production "$ENV_JSON" \
  --argjson preview "$ENV_JSON" \
  '{
    deployment_configs: {
      production: { env_vars: $production },
      preview: { env_vars: $preview }
    }
  }')"

echo "==> Actualizando env vars en Pages → proyecto '${PROJECT}' (${count} vars)..."
response="$(curl -fsS -X PATCH "${auth[@]}" \
  "${API}/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT}" \
  -d "$payload")"

echo "$response" | jq -e '.success' >/dev/null
echo "OK. Variables aplicadas. Dispara un redeploy en Cloudflare Pages (Deployments → Retry deployment)."
