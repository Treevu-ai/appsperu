#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLY="${FLYCTL:-flyctl}"
FLY_APP_PREFIX="${FLY_APP_PREFIX:-treevu-rastro}"
GATEWAY_APP="${FLY_GATEWAY_APP:-${FLY_APP_PREFIX}-gw}"
export FLY_APP_PREFIX GATEWAY_APP
bash "${ROOT}/scripts/fly-generate-configs.sh"
cd "${ROOT}/infra/fly/gateway"
exec "$FLY" deploy --app "$GATEWAY_APP" --remote-only --ha=false
