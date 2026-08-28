#!/usr/bin/env bash
# Ingesta completa verificada para La Libertad — orquesta los conectores que
# admiten cobertura total (sin isPartial residual) en el scope actual del proyecto.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
YEAR="${1:-2026}"
OECE_START="${OECE_START_SEGMENT:-2024-01}"
OECE_END="${OECE_END_SEGMENT:-$(date -u +%Y-%m)}"

echo "==> radar-ejecucion: MEF año completo dirigido a LA LIBERTAD ($YEAR)"
(cd "$ROOT/apps/radar-ejecucion/api" && npm run ingest:mef:meta -- "LA LIBERTAD")

echo "==> radar-inversiones: CSV nacional completo filtrado a LA LIBERTAD"
(cd "$ROOT/apps/radar-inversiones/api" && INVIERTE_DEPARTAMENTOS=LA LIBERTAD npm run ingest:invierte:full)

echo "==> infobras: XLSX nacional completo filtrado a LA LIBERTAD"
(cd "$ROOT/apps/infobras/api" && INFOBRAS_DEPARTAMENTOS=LA LIBERTAD npm run ingest:infobras)

echo "==> compras-publicas: OECE segmentado LA LIBERTAD ($OECE_START → $OECE_END)"
(cd "$ROOT/apps/compras-publicas/api" && OECE_DEPARTAMENTOS=LA LIBERTAD npm run ingest:processes:segmented -- --kind releases --start-segment "$OECE_START" --end-segment "$OECE_END")
(cd "$ROOT/apps/compras-publicas/api" && OECE_DEPARTAMENTOS=LA LIBERTAD npm run ingest:awards:segmented -- --kind records --start-segment "$OECE_START" --end-segment "$OECE_END")

echo "==> ceplan-estrategico: ObservaPerú (agregado por nivel de gobierno)"
(cd "$ROOT/apps/ceplan-estrategico/api" && npm run ingest:observa)

echo "==> bcrp-comercio-exterior: balanza comercial nacional (contexto macro)"
(cd "$ROOT/apps/bcrp-comercio-exterior/api" && npm run ingest:trade)

echo "==> actividad-agraria: series MIDAGRI regionales (jornal, tractor, yunta)"
(cd "$ROOT/apps/actividad-agraria/api" && npm run ingest:midagri-regional)

echo "==> ceplan-geo: red hídrica principal + proyectos agro sectoriales"
(cd "$ROOT/apps/ceplan-geo/api" && npm run ingest:extended-infrastructure)

echo "==> radar-ejecucion: MINCETUR hospedaje (2023-2024)"
(cd "$ROOT/apps/radar-ejecucion/api" && npm run ingest:mincetur-hospedaje)

echo "==> inversion-privada: cartera VERTIX APP/PA + OxI (snapshot nacional)"
(cd "$ROOT/apps/inversion-privada/api" && npm run ingest:vertix)
(cd "$ROOT/apps/inversion-privada/api" && npm run ingest:oxi)

echo "Ingesta La Libertad completa finalizada."
