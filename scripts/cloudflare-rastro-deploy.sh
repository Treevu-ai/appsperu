#!/usr/bin/env bash
# Build + deploy de Rastro para Cloudflare Workers Builds.
# Usar como deploy command en el dashboard, o ejecutar manualmente desde la raíz del repo.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Instalando dependencias de rastro-web..."
npm --prefix apps/rastro-web ci

echo "==> Build de producción..."
npm --prefix apps/rastro-web run build

if [ ! -f apps/rastro-web/dist/index.html ]; then
  echo "ERROR: apps/rastro-web/dist/index.html no existe tras el build." >&2
  exit 1
fi

echo "==> Subiendo assets a Cloudflare (wrangler versions upload)..."
exec npx wrangler versions upload
