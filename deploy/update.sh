#!/usr/bin/env bash
# Pulls the latest approved version from GitHub and restarts the site.
set -euo pipefail
DIR="/opt/402scope-compliance-web"
git -C "$DIR" pull --ff-only
chown -R scope402:scope402 "$DIR"
systemctl restart 402scope-compliance
echo "Updated to $(git -C "$DIR" log -1 --format='%h %s')"
