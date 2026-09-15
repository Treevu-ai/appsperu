#!/bin/sh
# Mismo espíritu que infra/fly/docker-entrypoint.sh (set -e: una migración
# fallida tumba el arranque en vez de dejar la app corriendo contra un
# schema a medio migrar) — copiado y adaptado, no reusado directo, porque
# ese script asume el layout apps/<slug>/api y mcp-server/ es standalone.
set -e
if [ -f dist/db/migrate.js ]; then
  node dist/db/migrate.js
fi
exec node dist/index.js
