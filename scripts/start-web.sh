#!/usr/bin/env bash
# Arranca Rastro Web (Vite). Ejecutar desde la raíz del repo.
#   bash scripts/start-web.sh
set -eu

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="${ROOT}/apps/rastro-web"
PORT="${PORT:-5173}"

cd "$WEB"

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "✓ Creado apps/rastro-web/.env"
  else
    echo "ERROR: falta .env.example en apps/rastro-web" >&2
    exit 1
  fi
fi

if [ ! -d node_modules ]; then
  echo "→ npm install (primera vez)..."
  npm install
fi

echo ""
echo "============================================"
echo "  Rastro Web"
echo "  Abre la URL 'Local:' que aparezca abajo"
echo "  (http://localhost:XXXX — deja esta terminal abierta)"
echo "============================================"
echo ""

exec npm run dev -- --host --port "$PORT"
