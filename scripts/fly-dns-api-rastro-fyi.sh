#!/usr/bin/env bash
# Apunta api.rastro.fyi al gateway Fly (rastro-api-gw por defecto) y, en un
# segundo paso explícito, activa el proxy de Cloudflare sobre ese registro.
#
# Por qué dos pasos: Fly.io emite su propio certificado (Let's Encrypt) para
# el hostname, y para eso necesita validarlo contra un registro DNS-only
# (proxied=false) primero — si el registro ya estuviera proxied, Fly vería
# las IPs de Cloudflare en vez de poder completar el challenge HTTP-01/TLS-ALPN
# contra su propia máquina. Una vez que `fly certs show` confirma el cert
# como Ready, recién ahí conviene activar el proxy (nube naranja) — y eso es
# justamente lo que se necesita para que Cloudflare Access (ver
# docs/API_ACCESS_PROTECTION.md) pueda proteger este hostname: Access solo
# evalúa tráfico que pasa por el borde de Cloudflare, no un registro DNS-only.
#
# Requiere:
#   CLOUDFLARE_API_TOKEN — permiso Zone:DNS:Edit en la zona rastro.fyi
#   FLY_IPV4 / FLY_IPV6   — opcional; default IPs del gateway Fly (verificar
#                           con `fly ips list -a <gateway-app>` si difieren)
#
# Uso:
#   # 1. Crear el registro DNS-only para que Fly pueda emitir el certificado
#   CLOUDFLARE_API_TOKEN=... bash scripts/fly-dns-api-rastro-fyi.sh
#   fly certs show api.rastro.fyi -a rastro-api-gw   # esperar "Ready"
#
#   # 2. Activar el proxy de Cloudflare sobre ese mismo registro
#   CLOUDFLARE_API_TOKEN=... bash scripts/fly-dns-api-rastro-fyi.sh --proxy
#
# Nota SSL/TLS: con el registro proxied, en Cloudflare (SSL/TLS → Overview)
# el modo debe quedar en "Full" como mínimo (no "Flexible") — Cloudflare
# necesita conectar a Fly por HTTPS con el certificado real que Fly emitió.

set -euo pipefail

ZONE_NAME="${ZONE_NAME:-rastro.fyi}"
HOST="${API_HOST:-api}"
FLY_IPV4="${FLY_IPV4:-66.241.124.193}"
FLY_IPV6="${FLY_IPV6:-2a09:8280:1::180:6c67:0}"
API="https://api.cloudflare.com/client/v4"
FQDN="${HOST}.${ZONE_NAME}"
PROXY_MODE=0

for arg in "$@"; do
  case "$arg" in
    --proxy) PROXY_MODE=1 ;;
  esac
done

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "ERROR: export CLOUDFLARE_API_TOKEN con permiso DNS:Edit en ${ZONE_NAME}." >&2
  exit 1
fi

auth=( -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" )

if [ -z "${CLOUDFLARE_ZONE_ID:-}" ]; then
  echo "==> Resolviendo zone id de ${ZONE_NAME}..."
  CLOUDFLARE_ZONE_ID=$(curl -fsS "${auth[@]}" "${API}/zones?name=${ZONE_NAME}" | jq -r '.result[0].id // empty')
  [ -n "$CLOUDFLARE_ZONE_ID" ] && [ "$CLOUDFLARE_ZONE_ID" != "null" ] || {
    echo "ERROR: zona ${ZONE_NAME} no encontrada en esta cuenta de Cloudflare." >&2
    exit 1
  }
fi

echo "==> Zone: ${ZONE_NAME} (${CLOUDFLARE_ZONE_ID})"

if [ "$PROXY_MODE" -eq 1 ]; then
  echo "==> Activando proxy (nube naranja) en ${FQDN}..."
  records=$(curl -fsS "${auth[@]}" "${API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records?name=${FQDN}&per_page=100")
  echo "$records" | jq -c '.result[] | select(.type=="A" or .type=="AAAA")' | while read -r row; do
    id=$(echo "$row" | jq -r '.id')
    type=$(echo "$row" | jq -r '.type')
    content=$(echo "$row" | jq -r '.content')
    echo "    PATCH ${type} ${FQDN} → proxied=true"
    curl -fsS -X PATCH "${auth[@]}" -d '{"proxied":true}' \
      "${API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${id}" | jq -e '.success' >/dev/null
  done
  echo ""
  echo "✅ Proxy activado. Verifica en SSL/TLS → Overview que el modo sea 'Full' (no 'Flexible'),"
  echo "   y sigue con docs/API_ACCESS_PROTECTION.md para activar Cloudflare Access."
  exit 0
fi

echo "==> Eliminando registros A/AAAA/CNAME previos de ${FQDN}..."
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
  echo "==> ${type} ${FQDN} → ${content} (DNS only, para que Fly pueda emitir el cert)"
  curl -fsS -X POST "${auth[@]}" -d "$payload" \
    "${API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records" | jq -e '.success' >/dev/null
}

upsert A "$FLY_IPV4"
upsert AAAA "$FLY_IPV6"

echo ""
echo "✅ DNS creado (sin proxy). Próximos pasos:"
echo "   fly certs show ${FQDN} -a \${FLY_GATEWAY_APP:-rastro-api-gw}   # esperar 'Ready'"
echo "   curl -s https://${FQDN}/radar-ejecucion/health                # confirmar que responde"
echo "   CLOUDFLARE_API_TOKEN=... bash scripts/fly-dns-api-rastro-fyi.sh --proxy"
