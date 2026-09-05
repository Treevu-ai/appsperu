#!/bin/sh
# `set -e` ya hace que una migración fallida tumbe el entrypoint (y con eso
# el healthcheck de Fly, que reinicia la máquina) en vez de arrancar la API
# contra un schema a medio migrar. No enmascarar esto con `|| echo` — antes
# lo hacía, y una migración rota quedaba invisible salvo mirando logs a mano.
set -e
if [ -f dist/db/migrate.js ]; then
  node dist/db/migrate.js
elif [ -f src/db/migrate.ts ]; then
  npx tsx src/db/migrate.ts
fi
if [ -f dist/index.js ]; then
  exec node dist/index.js
fi
if [ -x node_modules/.bin/tsx ]; then
  exec node_modules/.bin/tsx src/index.ts
fi
exec npx tsx src/index.ts
