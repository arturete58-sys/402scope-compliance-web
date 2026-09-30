#!/usr/bin/env bash
# Pulls the latest approved version from GitHub and restarts the site if something changed.
set -euo pipefail
DIR="/opt/402scope-compliance-web"
git -C "$DIR" config --global --add safe.directory "$DIR" 2>/dev/null || true
OLD="$(git -C "$DIR" rev-parse HEAD)"
git -C "$DIR" fetch -q origin main
NEW="$(git -C "$DIR" rev-parse origin/main)"
if [ "$OLD" = "$NEW" ]; then echo "Already up to date ($(git -C "$DIR" log -1 --format='%h %s'))"; exit 0; fi
git -C "$DIR" merge -q --ff-only origin/main
chown -R scope402:scope402 "$DIR"
systemctl restart 402scope-compliance
echo "Updated to $(git -C "$DIR" log -1 --format='%h %s')"
