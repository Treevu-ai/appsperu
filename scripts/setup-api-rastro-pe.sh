#!/usr/bin/env bash
# Instala nginx + TLS + proxy path-based para api.rastro.pe (149.104.66.100).
#
# Ejecutar EN EL VPS como root (o con sudo):
#   git clone https://github.com/Treevu-ai/appsperu.git /opt/appsperu
#   cd /opt/appsperu && bash scripts/setup-api-rastro-pe.sh
#
# Requisitos previos:
#   - DNS A de api.rastro.pe → IP del VPS
#   - Las 14 APIs escuchando en 127.0.0.1:4000–4013 (ver scripts/start-all-apis.sh)
#   - .env por app con DATABASE_URL (Postgres en Docker)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOMAIN="${API_DOMAIN:-api.rastro.pe}"
EMAIL="${CERTBOT_EMAIL:-}"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: ejecuta como root o con sudo." >&2
  exit 1
fi

echo "==> Instalando nginx y certbot..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx

echo "==> Copiando snippets de proxy..."
install -d /etc/nginx/snippets
install -m 644 "${ROOT}/infra/api-proxy/nginx/rastro-proxy-params.conf" \
  /etc/nginx/snippets/rastro-proxy-params.conf

echo "==> Instalando site ${DOMAIN} (HTTP only primero)..."
# Site temporal sin SSL para que certbot pueda validar
cat > "/etc/nginx/sites-available/${DOMAIN}" <<'SITE'
server {
    listen 80;
    listen [::]:80;
    server_name api.rastro.pe;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'api.rastro.pe — pendiente TLS\n';
        add_header Content-Type text/plain;
    }
}
SITE
sed -i "s/api.rastro.pe/${DOMAIN}/g" "/etc/nginx/sites-available/${DOMAIN}"

ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  if [ -z "$EMAIL" ]; then
    echo "ERROR: export CERTBOT_EMAIL=tu@email.com para emitir el certificado." >&2
    exit 1
  fi
  echo "==> Emitiendo certificado Let's Encrypt..."
  certbot certonly --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}"
fi

echo "==> Instalando config HTTPS completa..."
install -m 644 "${ROOT}/infra/api-proxy/nginx/api.rastro.pe.conf" \
  "/etc/nginx/sites-available/${DOMAIN}"
sed -i "s/api.rastro.pe/${DOMAIN}/g" "/etc/nginx/sites-available/${DOMAIN}"

nginx -t
systemctl reload nginx

echo ""
echo "OK. Proxy nginx activo en https://${DOMAIN}/"
echo ""
echo "Verifica (con APIs levantadas):"
echo "  curl -s https://${DOMAIN}/radar-ejecucion/health"
echo ""
echo "Siguiente paso: bash ${ROOT}/scripts/start-all-apis.sh"
