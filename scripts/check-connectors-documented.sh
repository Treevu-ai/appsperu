#!/usr/bin/env bash
# CX-06 — Falla si un conector de ingesta (apps/*/api/src/ingest/*-connector.ts)
# no está mencionado por nombre de archivo en docs/conectores.md.
#
# Motivo (ver docs/TICKETS_Confiabilidad_Conectores_y_Cruces_v1.md#CX-06):
# el diagnóstico de 2026-09-02 encontró 6 conectores activos sin ficha en el
# catálogo, y uno documentado incorrectamente como "no implementado". Este
# chequeo no exige un formato de ficha específico — solo que el nombre del
# archivo aparezca mencionado como texto en el documento.
#
# Uso: scripts/check-connectors-documented.sh
# Exit 0 si todo está documentado, exit 1 con la lista de faltantes si no.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CATALOG="$REPO_ROOT/docs/conectores.md"

if [[ ! -f "$CATALOG" ]]; then
  echo "[check-connectors-documented] No se encontró $CATALOG" >&2
  exit 1
fi

missing=()

while IFS= read -r -d '' file; do
  name="$(basename "$file")"
  if ! grep -qF -- "$name" "$CATALOG"; then
    missing+=("${file#"$REPO_ROOT"/}")
  fi
done < <(find "$REPO_ROOT/apps" -path "*/api/src/ingest/*-connector.ts" -not -path "*/node_modules/*" -print0)

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "[check-connectors-documented] Conectores sin documentar en docs/conectores.md:" >&2
  for f in "${missing[@]}"; do
    echo "  - $f" >&2
  done
  echo "" >&2
  echo "Agrega una ficha (o al menos una mención del nombre del archivo) en docs/conectores.md antes de mergear." >&2
  exit 1
fi

echo "[check-connectors-documented] OK — todos los conectores de ingesta están mencionados en docs/conectores.md"
