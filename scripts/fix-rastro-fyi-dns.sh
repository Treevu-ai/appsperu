#!/usr/bin/env bash
# Corrige DNS de rastro.fyi para Cloudflare Pages (proyecto rastro → rastro-5zm.pages.dev).
#
# Requiere:
#   CLOUDFLARE_API_TOKEN — Zone:Read, Zone:Edit, DNS:Edit en rastro.fyi
#   CLOUDFLARE_ZONE_ID   — opcional; si falta, se resuelve por nombre de zona
#
# Uso: CLOUDFLARE_API_TOKEN=... bash scripts/fix-rastro-fyi-dns.sh

set -euo pipefail

PAGES_TARGET="${PAGES_TARGET:-rastro-5zm.pages.dev}"
ZONE_NAME="${ZONE_NAME:-rastro.fyi}"
API="https://api.cloudflare.com/client/v4"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "ERROR: export CLOUDFLARE_API_TOKEN con permiso DNS:Edit en ${ZONE_NAME}." >&2
  exit 1
fi

auth=( -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" )

if [ -z "${CLOUDFLARE_ZONE_ID:-}" ]; then
  echo "==> Resolviendo zone id de ${ZONE_NAME}..."
  CLOUDFLARE_ZONE_ID=$(curl -fsS "${auth[@]}" "${API}/zones?name=${ZONE_NAME}" | jq -r '.result[0].id // empty')
  if [ -z "$CLOUDFLARE_ZONE_ID" ] || [ "$CLOUDFLARE_ZONE_ID" = "null" ]; then
    echo "ERROR: zona ${ZONE_NAME} no encontrada en esta cuenta." >&2
    exit 1
  fi
fi

echo "==> Zone ID: ${CLOUDFLARE_ZONE_ID}"

echo "==> Eliminando registros A/AAAA/CNAME conflictivos en apex y www..."
records=$(curl -fsS "${auth[@]}" "${API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records?per_page=100")
echo "$records" | jq -c '.result[] | select(.name=="'"${ZONE_NAME}"'" or .name=="www.'"${ZONE_NAME}"'") | select(.type=="A" or .type=="AAAA" or .type=="CNAME")' | while read -r row; do
  id=$(echo "$row" | jq -r '.id')
  type=$(echo "$row" | jq -r '.type')
  name=$(echo "$row" | jq -r '.name')
  content=$(echo "$row" | jq -r '.content')
  echo "    DELETE ${type} ${name} → ${content}"
  curl -fsS -X DELETE "${auth[@]}" "${API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${id}" >/dev/null
done

upsert_cname() {
  local name=$1
  local payload
  payload=$(jq -n --arg name "$name" --arg content "$PAGES_TARGET" \
    '{type:"CNAME", name:$name, content:$content, proxied:true, ttl:1}')
  echo "==> CNAME ${name} → ${PAGES_TARGET} (proxied)"
  curl -fsS -X POST "${auth[@]}" -d "$payload" \
    "${API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records" | jq -e '.success' >/dev/null
}

upsert_cname "${ZONE_NAME}"
upsert_cname "www.${ZONE_NAME}"

echo ""
echo "✅ DNS actualizado. Espera 1–5 min y verifica:"
echo "   curl -sI https://${ZONE_NAME}/ | head -1"
echo "   curl -sI https://www.${ZONE_NAME}/ | head -1"
echo ""
echo "Luego en Cloudflare Pages → rastro → Custom domains → Check DNS records."
