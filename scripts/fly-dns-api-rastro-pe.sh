#!/usr/bin/env bash
# Apunta api.rastro.pe al gateway Fly (treevu-rastro-gw).
#
# Requiere:
#   CLOUDFLARE_API_TOKEN — DNS:Edit en rastro.pe
#   FLY_IPV4 / FLY_IPV6   — opcional; default IPs del gateway treevu-rastro-gw
#
# Uso:
#   CLOUDFLARE_API_TOKEN=... bash scripts/fly-dns-api-rastro-pe.sh
#
# Nota: registros A/AAAA deben ir sin proxy (proxied=false) para TLS de Fly.

set -euo pipefail

ZONE_NAME="${ZONE_NAME:-rastro.pe}"
HOST="${API_HOST:-api}"
FLY_IPV4="${FLY_IPV4:-66.241.124.193}"
FLY_IPV6="${FLY_IPV6:-2a09:8280:1::180:6c67:0}"
API="https://api.cloudflare.com/client/v4"
FQDN="${HOST}.${ZONE_NAME}"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "ERROR: export CLOUDFLARE_API_TOKEN con permiso DNS:Edit en ${ZONE_NAME}." >&2
  exit 1
fi

auth=( -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" )

if [ -z "${CLOUDFLARE_ZONE_ID:-}" ]; then
  echo "==> Resolviendo zone id de ${ZONE_NAME}..."
  CLOUDFLARE_ZONE_ID=$(curl -fsS "${auth[@]}" "${API}/zones?name=${ZONE_NAME}" | jq -r '.result[0].id // empty')
  [ -n "$CLOUDFLARE_ZONE_ID" ] && [ "$CLOUDFLARE_ZONE_ID" != "null" ] || {
    echo "ERROR: zona ${ZONE_NAME} no encontrada." >&2
    exit 1
  }
fi

echo "==> Zone: ${ZONE_NAME} (${CLOUDFLARE_ZONE_ID})"

echo "==> Eliminando registros A/AAAA/CNAME de ${FQDN}..."
records=$(curl -fsS "${auth[@]}" "${API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records?name=${FQDN}&per_page=100")
echo "$records" | jq -c '.result[] | select(.type=="A" or .type=="AAAA" or .type=="CNAME")' | while read -r row; do
  id=$(echo "$row" | jq -r '.id')
  type=$(echo "$row" | jq -r '.type')
  content=$(echo "$row" | jq -r '.content')
  echo "    DELETE ${type} ${FQDN} → ${content}"
  curl -fsS -X DELETE "${auth[@]}" "${API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${id}" >/dev/null
done

upsert() {
  local type=$1 content=$2
  local payload
  payload=$(jq -n --arg type "$type" --arg name "${FQDN}" --arg content "$content" \
    '{type:$type, name:$name, content:$content, proxied:false, ttl:1}')
  echo "==> ${type} ${FQDN} → ${content} (DNS only)"
  curl -fsS -X POST "${auth[@]}" -d "$payload" \
    "${API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records" | jq -e '.success' >/dev/null
}

upsert A "$FLY_IPV4"
upsert AAAA "$FLY_IPV6"

echo ""
echo "✅ DNS actualizado. Verifica certificado Fly:"
echo "   fly certs check api.rastro.pe -a treevu-rastro-gw"
echo "   curl -s https://api.rastro.pe/radar-ejecucion/health"
