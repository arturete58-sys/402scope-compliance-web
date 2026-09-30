#!/usr/bin/env bash
# Installs compliance.402scope.org on a Debian/Ubuntu server.
# - Clones the public repo to /opt/402scope-compliance-web
# - Runs the site + scanner with Node as a systemd service on 127.0.0.1:8402
# - Adds HTTPS in front: reuses nginx or Caddy if already running, otherwise installs Caddy
# It does not touch other sites already on the server.
# Usage (as root):  bash install.sh            Optional: DOMAIN=... EMAIL=you@example.com bash install.sh
set -euo pipefail

DOMAIN="${DOMAIN:-compliance.402scope.org}"
EMAIL="${EMAIL:-}"
REPO="https://github.com/arturete58-sys/402scope-compliance-web.git"
DIR="/opt/402scope-compliance-web"
PORT=8402
SVC="402scope-compliance"

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m!!  %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mXX  %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root."
command -v apt-get >/dev/null || die "This script supports Debian/Ubuntu (apt). Send the output of: cat /etc/os-release"

say "Server check"
. /etc/os-release; echo "System: ${PRETTY_NAME:-unknown}"
PUBLIC_IP="$(curl -4 -fsS --max-time 5 https://api.ipify.org || true)"
DNS_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
echo "Public IP: ${PUBLIC_IP:-unknown} | $DOMAIN resolves to: ${DNS_IP:-nothing}"
DNS_OK=0; [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" = "$DNS_IP" ] && DNS_OK=1
[ "$DNS_OK" -eq 1 ] || warn "$DOMAIN does not point to this server yet. Create an A record 'compliance' -> ${PUBLIC_IP:-the server IP} in your DNS. The site will install anyway; HTTPS starts once DNS points here (re-run this script if needed)."

say "Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates gnupg >/dev/null
NODE_MAJOR=0; command -v node >/dev/null && NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  say "Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "Node $(node -v)"

say "Code"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only -q; else git clone -q "$REPO" "$DIR"; fi
id -u scope402 >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin scope402
chown -R scope402:scope402 "$DIR"

say "Service $SVC on 127.0.0.1:$PORT"
if ss -ltn "( sport = :$PORT )" | grep -q ":$PORT" && ! systemctl is-active --quiet "$SVC"; then die "Port $PORT is already used by another program. Tell Claude which one (ss -ltnp | grep $PORT)."; fi
cat > "/etc/systemd/system/$SVC.service" <<EOF
[Unit]
Description=402Scope Compliance website and scanner
After=network-online.target
Wants=network-online.target

[Service]
User=scope402
WorkingDirectory=$DIR
Environment=PORT=$PORT HOST=127.0.0.1 NODE_ENV=production
ExecStart=$(command -v node) server/server.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now "$SVC" >/dev/null
systemctl restart "$SVC"
sleep 1
curl -fsS -o /dev/null "http://127.0.0.1:$PORT/" && echo "Site answers locally." || die "The service did not start. Send: journalctl -u $SVC -n 50"

say "HTTPS"
PROXY=""
if systemctl is-active --quiet caddy; then PROXY=caddy
elif systemctl is-active --quiet nginx; then PROXY=nginx
elif systemctl is-active --quiet apache2; then PROXY=apache
elif ss -ltn '( sport = :80 or sport = :443 )' | grep -qE ':(80|443) '; then
  ss -ltnp '( sport = :80 or sport = :443 )' || true
  die "Something else (maybe Docker) already uses ports 80/443. Send the lines above to Claude; the site is running on 127.0.0.1:$PORT meanwhile."
else PROXY=caddy-new
fi
echo "Web server: $PROXY"

case "$PROXY" in
  caddy-new|caddy)
    if [ "$PROXY" = caddy-new ]; then
      curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
      apt-get update -qq && apt-get install -y -qq caddy >/dev/null
      : > /etc/caddy/Caddyfile
    fi
    if ! grep -q "^$DOMAIN" /etc/caddy/Caddyfile 2>/dev/null; then
      cat >> /etc/caddy/Caddyfile <<EOF

$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$PORT
	header Strict-Transport-Security "max-age=31536000; includeSubDomains"
}
EOF
    fi
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
    systemctl reload caddy || systemctl restart caddy
    ;;
  nginx)
    CONF="/etc/nginx/sites-available/$DOMAIN"; [ -d /etc/nginx/sites-available ] || CONF="/etc/nginx/conf.d/$DOMAIN.conf"
    cat > "$CONF" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF
    [ -d /etc/nginx/sites-enabled ] && ln -sf "$CONF" "/etc/nginx/sites-enabled/$DOMAIN"
    nginx -t && systemctl reload nginx
    if [ "$DNS_OK" -eq 1 ]; then
      apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
      if [ -n "$EMAIL" ]; then M=(-m "$EMAIL"); else M=(--register-unsafely-without-email); fi
      certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos "${M[@]}" --redirect
    fi
    ;;
  apache)
    a2enmod proxy proxy_http headers >/dev/null
    cat > "/etc/apache2/sites-available/$DOMAIN.conf" <<EOF
<VirtualHost *:80>
    ServerName $DOMAIN
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "http"
    ProxyPass / http://127.0.0.1:$PORT/
    ProxyPassReverse / http://127.0.0.1:$PORT/
</VirtualHost>
EOF
    a2ensite "$DOMAIN" >/dev/null && apache2ctl configtest && systemctl reload apache2
    if [ "$DNS_OK" -eq 1 ]; then
      apt-get install -y -qq certbot python3-certbot-apache >/dev/null
      if [ -n "$EMAIL" ]; then M=(-m "$EMAIL"); else M=(--register-unsafely-without-email); fi
      certbot --apache -d "$DOMAIN" --non-interactive --agree-tos "${M[@]}" --redirect
    fi
    ;;
esac

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  say "Firewall: opening 80 and 443"; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

say "Done"
echo "Site service: systemctl status $SVC"
echo "Update later: bash $DIR/deploy/update.sh"
if [ "$DNS_OK" -eq 1 ]; then echo "Open: https://$DOMAIN"; else echo "Point DNS first (A record 'compliance' -> ${PUBLIC_IP:-server IP}), wait a few minutes, then run this script again."; fi
