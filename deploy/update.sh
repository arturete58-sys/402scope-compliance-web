#!/usr/bin/env bash
# Pulls the latest approved version from GitHub and restarts the site if something changed.
set -euo pipefail
DIR="/opt/402scope-compliance-web"
G=(git -c safe.directory="$DIR" -C "$DIR")
OLD="$("${G[@]}" rev-parse HEAD)"
"${G[@]}" fetch -q origin main
NEW="$("${G[@]}" rev-parse origin/main)"
if [ "$OLD" = "$NEW" ]; then echo "Already up to date ($("${G[@]}" log -1 --format='%h %s'))"; exit 0; fi
"${G[@]}" merge -q --ff-only origin/main
chown -R scope402:scope402 "$DIR"
systemctl restart 402scope-compliance
echo "Updated to $("${G[@]}" log -1 --format='%h %s')"
