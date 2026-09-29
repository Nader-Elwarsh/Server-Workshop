#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${WORKSHOP_TEST_PORT:-8765}"
TMP="$(mktemp -d)"
cleanup(){ kill "$SERVER_PID" 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >"$TMP/server.log" 2>&1 &
SERVER_PID=$!
sleep 1
run_page(){
  local page="$1" marker="$2"
  local out="$TMP/${page}.html"
  chromium --headless --no-sandbox --disable-gpu --allow-file-access-from-files --virtual-time-budget=6000 --dump-dom "http://127.0.0.1:${PORT}/${page}" >"$out" 2>"$TMP/${page}.err"
  grep -q "$marker" "$out"
  grep -vE 'org.freedesktop.DBus|UPower' "$TMP/${page}.err" >"$TMP/${page}.filtered.err" || true
  test ! -s "$TMP/${page}.filtered.err" || { cat "$TMP/${page}.filtered.err" >&2; return 1; }
}
# The public customer portal must render without a staff session.
run_page "portal.html" "id=\"app\""
grep -q "بوابة العملاء" "$TMP/portal.html.html"
# Verify the new portal navigation/help code is present in the delivered DOM source.
grep -q "openOrder" "$TMP/portal.html.html"
grep -q "دليل استخدام بوابة العميل" "$TMP/portal.html.html"
# A protected staff page must still expose its static controls; auth behavior is tested by firebase-sync.
grep -q 'data-action="backup"' "$ROOT/settings.html"
grep -q 'id="cp"' "$ROOT/portal-admin.html"
grep -q 'function complaintOrder' "$ROOT/portal-admin.html"
grep -q 'request.html?id=' "$ROOT/portal-admin.html"
grep -q 'customer.html?id=' "$ROOT/portal-admin.html"
echo "browser-smoke: PASS (customer portal shell, order navigation, guide, and settings controls verified)"
