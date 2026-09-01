#!/usr/bin/env bash
# Canonical: www.rastro.fyi (Pages) + redirect 301 apex -> www
#
# Requiere token con Zone:Read, Zone:Edit, DNS:Edit, Page Rules o Transform Rules
#   CLOUDFLARE_API_TOKEN
#
# Uso:
#   CLOUDFLARE_API_TOKEN=... bash scripts/cloudflare-www-canonical.sh
set -eu

ZONE_NAME="${ZONE_NAME:-rastro.fyi}"
PAGES_TARGET="${PAGES_TARGET:-rastro-5zm.pages.dev}"
API="https://api.cloudflare.com/client/v4"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "ERROR: export CLOUDFLARE_API_TOKEN (DNS:Edit + Rules en ${ZONE_NAME})." >&2
  exit 1
fi

auth=( -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" )

if [ -z "${CLOUDFLARE_ZONE_ID:-}" ]; then
  CLOUDFLARE_ZONE_ID=$(curl -fsS "${auth[@]}" "${API}/zones?name=${ZONE_NAME}" | jq -r '.result[0].id // empty')
fi
[ -n "$CLOUDFLARE_ZONE_ID" ] && [ "$CLOUDFLARE_ZONE_ID" != "null" ] || { echo "ERROR: zona no encontrada"; exit 1; }

echo "==> Zone: ${ZONE_NAME} (${CLOUDFLARE_ZONE_ID})"

echo "==> DNS: solo www -> Pages (elimina apex apuntando a Pages)..."
records=$(curl -fsS "${auth[@]}" "${API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records?per_page=100")
echo "$records" | jq -c --arg apex "$ZONE_NAME" --arg www "www.${ZONE_NAME}" \
  '.result[] | select(.name==$apex or .name==$www) | select(.type=="A" or .type=="AAAA" or .type=="CNAME")' | while read -r row; do
  id=$(echo "$row" | jq -r '.id')
  type=$(echo "$row" | jq -r '.type')
  name=$(echo "$row" | jq -r '.name')
  content=$(echo "$row" | jq -r '.content')
  echo "    DELETE ${type} ${name} -> ${content}"
  curl -fsS -X DELETE "${auth[@]}" "${API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${id}" >/dev/null
done

upsert_cname() {
  local name=$1
  local target=$2
  local payload
  payload=$(jq -n --arg name "$name" --arg content "$target" \
    '{type:"CNAME", name:$name, content:$content, proxied:true, ttl:1}')
  echo "==> CNAME ${name} -> ${target} (proxied)"
  curl -fsS -X POST "${auth[@]}" -d "$payload" \
    "${API}/zones/${CLOUDFLARE_ZONE_ID}/dns_records" | jq -e '.success' >/dev/null
}

upsert_cname "www.${ZONE_NAME}" "${PAGES_TARGET}"
# Apex: CNAME a www (Cloudflare flattening) — el redirect 301 lo refuerza en Rules
upsert_cname "${ZONE_NAME}" "www.${ZONE_NAME}"

echo ""
echo "==> Redirect Rule (apex -> www) — crea en dashboard si el API falla:"
echo "    Rules -> Redirect Rules -> Custom rule"
echo "    When: (http.host eq \"${ZONE_NAME}\")"
echo "    Then: Dynamic redirect -> https://www.${ZONE_NAME}\${http.request.uri.path}"
echo "    Status: 301, Preserve query string: ON"
echo ""

# Intentar ruleset de redirect dinamico (puede fallar si ya existe otro ruleset)
ruleset_payload=$(jq -n \
  --arg host "$ZONE_NAME" \
  --arg www "www.${ZONE_NAME}" \
  '{
    name: "rastro apex to www",
    kind: "zone",
    phase: "http_request_dynamic_redirect",
    rules: [{
      expression: ("(http.host eq \"" + $host + "\")"),
      description: "301 apex to www canonical",
      action: "redirect",
      action_parameters: {
        from_value: {
          status_code: 301,
          preserve_query_string: true,
          target_url: {
            expression: ("concat(\"https://" + $www + "\", http.request.uri.path)")
          }
        }
      }
    }]
  }')

if curl -fsS -X POST "${auth[@]}" -d "$ruleset_payload" \
  "${API}/zones/${CLOUDFLARE_ZONE_ID}/rulesets" >/dev/null 2>&1; then
  echo "OK Redirect rule creada via API."
else
  echo "WARN No se pudo crear ruleset via API (puede existir ya). Usa el dashboard arriba."
fi

echo ""
echo "==> Pages: Custom domains -> solo www.${ZONE_NAME} (quita ${ZONE_NAME} si da 522)"
echo ""
echo "Verifica (1-5 min):"
echo "  curl -sI https://${ZONE_NAME}/ | grep -i location"
echo "  curl -sI https://www.${ZONE_NAME}/ | head -1"
