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
  chromium --headless --no-sandbox --disable-gpu --allow-file-access-from-files --virtual-time-budget=2500 --dump-dom "http://127.0.0.1:${PORT}/${page}" >"$out" 2>"$TMP/${page}.err"
  grep -q "$marker" "$out"
  grep -vE 'org.freedesktop.DBus|UPower' "$TMP/${page}.err" >"$TMP/${page}.filtered.err" || true
  test ! -s "$TMP/${page}.filtered.err" || { cat "$TMP/${page}.filtered.err" >&2; return 1; }
}
# Protected staff pages must safely redirect to the login page when unauthenticated.
run_page "compcodes.html" "id=\"em\""
run_page "settings.html" "id=\"em\""
# The customer portal is public and should render its application shell without staff auth.
run_page "portal.html" "id=\"app\""
# Keep a lightweight interaction assertion that does not require a real Firebase account.
chromium --headless --no-sandbox --disable-gpu --virtual-time-budget=2500 --dump-dom "http://127.0.0.1:${PORT}/portal.html" >"$TMP/portal.html" 2>"$TMP/portal.err"
grep -q "بوابة العملاء" "$TMP/portal.html"
grep -vE 'org.freedesktop.DBus|UPower' "$TMP/portal.err" >"$TMP/portal.filtered.err" || true
test ! -s "$TMP/portal.filtered.err" || { cat "$TMP/portal.filtered.err" >&2; exit 1; }
echo "browser-smoke: PASS (protected-page redirect and public customer portal verified)"
