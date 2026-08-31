#!/usr/bin/env bash
# Despliega solo el gateway (tras cambiar Caddyfile o apps.tsv).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLY="${FLYCTL:-flyctl}"
bash "${ROOT}/scripts/fly-generate-configs.sh"
cd "${ROOT}/infra/fly/gateway"
exec "$FLY" deploy --remote-only --ha=false
