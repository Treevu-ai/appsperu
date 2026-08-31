#!/bin/sh
set -e
if [ -f dist/db/migrate.js ]; then
  node dist/db/migrate.js || echo "migrate: skip/fail (dist)"
elif [ -f src/db/migrate.ts ]; then
  npx tsx src/db/migrate.ts || echo "migrate: skip/fail (tsx)"
fi
if [ -f dist/index.js ]; then
  exec node dist/index.js
fi
exec npx tsx src/index.ts
