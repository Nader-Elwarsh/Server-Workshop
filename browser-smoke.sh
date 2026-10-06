#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${WORKSHOP_TEST_PORT:-8765}"
TMP="$(mktemp -d)"
HARNESS="$ROOT/.indexeddb-smoke.html"
cleanup(){ kill "$SERVER_PID" 2>/dev/null || true; rm -rf "$TMP"; rm -f "$HARNESS"; }
trap cleanup EXIT
cat >"$HARNESS" <<'HTML'
<!doctype html><meta charset="utf-8"><body>INDEXEDDB_SMOKE_RUNNING</body>
<script>
const nativeSetItem = Storage.prototype.setItem;
localStorage.setItem("wf_c", JSON.stringify([{id:"c1",name:"Legacy customer"}]));
localStorage.setItem("wf_d", JSON.stringify([{id:"d1",customerId:"c1",type:"Washer"}]));
localStorage.setItem("wf_r", JSON.stringify([{id:"r1",customerId:"c1",deviceId:"d1",status:"new"}]));
</script>
<script src="workshop-idb.js"></script>
<script src="shared-data.js"></script>
<script>
WorkshopDBReady.then(async function () {
  if (!await WorkshopDB.readCollection("wf_c").then(x => x.length === 1 && x[0].id === "c1")) throw Error("legacy import");
  await WorkshopDB.transaction(["wf_c", "wf_d", "wf_r"], function (draft) {
    draft.wf_c[0].name = "Updated customer";
    draft.wf_d.push({id:"d2",customerId:"c1",type:"Fridge"});
    draft.wf_r[0].status = "closed";
    return true;
  });
  const [customer, devices, requests, indexed] = await Promise.all([
    WorkshopDB.getById("wf_c", "c1"), WorkshopDB.readCollection("wf_d"),
    WorkshopDB.readCollection("wf_r"), WorkshopDB.queryIndex("wf_d", "customerId", "c1")
  ]);
  if (customer.name !== "Updated customer" || devices.length !== 2 || requests[0].status !== "closed" || indexed.length !== 2) throw Error("transaction/index");
  if (JSON.parse(localStorage.getItem("wf_c"))[0].name !== "Updated customer") throw Error("legacy mirror");
  nativeSetItem.call(localStorage, "wf_c", JSON.stringify([{id:"c1",name:"stale legacy copy"}]));
  if (arr(K.c)[0].name !== "Updated customer" || arrCached(K.d).length !== 2) throw Error("shared-data must read the hydrated IDB snapshot");
  document.body.textContent = "INDEXEDDB_SMOKE_PASS";
}).catch(function (error) { document.body.textContent = "INDEXEDDB_SMOKE_FAIL: " + error.message; });
</script>
HTML
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >"$TMP/server.log" 2>&1 &
SERVER_PID=$!
sleep 1
run_page(){
  local page="$1" marker="$2"
  local out="$TMP/${page}.html"
  chromium --headless --no-sandbox --disable-gpu --allow-file-access-from-files --virtual-time-budget=6000 --dump-dom "http://127.0.0.1:${PORT}/${page}" >"$out" 2>"$TMP/${page}.err"
  grep -q "$marker" "$out"
  grep -vE 'org.freedesktop.DBus|UPower|SharedImageManager::ProduceMemory.*non-existent mailbox' "$TMP/${page}.err" >"$TMP/${page}.filtered.err" || true
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
chromium --headless --no-sandbox --disable-gpu --virtual-time-budget=6000 --dump-dom "http://127.0.0.1:${PORT}/.indexeddb-smoke.html" >"$TMP/indexeddb.html" 2>"$TMP/indexeddb.err"
grep -q "INDEXEDDB_SMOKE_PASS" "$TMP/indexeddb.html"
grep -vE 'org.freedesktop.DBus|UPower|SharedImageManager::ProduceMemory.*non-existent mailbox' "$TMP/indexeddb.err" >"$TMP/indexeddb.filtered.err" || true
test ! -s "$TMP/indexeddb.filtered.err" || { cat "$TMP/indexeddb.filtered.err" >&2; exit 1; }
echo "browser-smoke: PASS (customer portal, IndexedDB-backed shared-data reads, transactions/indexes, and compatibility mirror)"
