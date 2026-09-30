#!/usr/bin/env bash
# Checks GitHub every 15 minutes and publishes new approved versions automatically.
# Turn off with: systemctl disable --now 402scope-update.timer
set -euo pipefail
DIR="/opt/402scope-compliance-web"
cat > /etc/systemd/system/402scope-update.service <<UNIT
[Unit]
Description=Update 402Scope Compliance website from GitHub
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/env bash $DIR/deploy/update.sh
UNIT
cat > /etc/systemd/system/402scope-update.timer <<UNIT
[Unit]
Description=Check for website updates every 15 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now 402scope-update.timer
echo "Automatic updates on. Next check: $(systemctl list-timers 402scope-update.timer --no-legend | awk '{print $1, $2}')"
