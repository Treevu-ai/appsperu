#!/usr/bin/env bash
# Comprueba /health de las 14 APIs (local o vía api.rastro.pe).
#
# Uso:
#   bash scripts/health-check-apis.sh              # https://api.rastro.pe
#   bash scripts/health-check-apis.sh --local      # http://127.0.0.1:4000…4013
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${API_BASE:-https://api.rastro.pe}"
LOCAL=0

if [ "${1:-}" = "--local" ]; then
  LOCAL=1
fi

ok=0
fail=0

while IFS=$'\t' read -r slug port app_dir _; do
  [[ "$slug" =~ ^# ]] && continue
  [[ -z "$slug" ]] && continue

  if [ "$LOCAL" -eq 1 ]; then
    url="http://127.0.0.1:${port}/health"
  else
    url="${BASE%/}/${slug}/health"
  fi

  code=$(curl -s -o /tmp/rastro-health.json -w "%{http_code}" --connect-timeout 8 "$url" 2>/dev/null || echo "000")
  if [ "$code" = "200" ] && grep -q '"status"' /tmp/rastro-health.json 2>/dev/null; then
    echo "OK   ${slug} (${code})"
    ok=$((ok + 1))
  else
    echo "FAIL ${slug} (${code}) ${url}"
    fail=$((fail + 1))
  fi
done < "${ROOT}/infra/api-proxy/apps.tsv"

echo ""
echo "${ok} OK, ${fail} FAIL (de 14)"
[ "$fail" -eq 0 ]
