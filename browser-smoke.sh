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
localStorage.setItem("wf_p", JSON.stringify([{id:"p1",name:"Part",category:"Cooling",qty:4}]));
localStorage.setItem("wf_m", JSON.stringify([{id:"m1",partId:"p1",type:"توريد",qty:4,at:"2026-10-07T00:00:00.000Z"}]));
localStorage.setItem("wf_wallet_tx", JSON.stringify([{id:"w1",wallet:"Cash",refKey:"order-final-r1",deleted:false,amount:20}]));
localStorage.setItem("wf_theme", "dark");
</script>
<script src="workshop-idb.js"></script>
<script src="shared-data.js"></script>
<script>
WorkshopDBReady.then(async function () {
  if (WFStorageStatus.ready !== true || WFStorageStatus.migrationComplete !== true || WFStorageStatus.legacySourceCleared !== true) throw Error("migration status must confirm ready, complete, and legacy source cleared");
  if (localStorage.length !== 0) throw Error("legacy localStorage should be cleared after a successful import");
  if (WFStorage.getItem("wf_theme") !== "dark") throw Error("preference key-value migration");
  if (!await WorkshopDB.readCollection("wf_c").then(x => x.length === 1 && x[0].id === "c1")) throw Error("legacy import");
  await WorkshopDB.transaction(["wf_c", "wf_d", "wf_r", "wf_p", "wf_m", "wf_wallet_tx"], function (draft) {
    draft.wf_c[0].name = "Updated customer";
    draft.wf_d.push({id:"d2",customerId:"c1",type:"Fridge"});
    draft.wf_r[0].status = "closed";
    draft.wf_p[0].qty = 7;
    draft.wf_m.push({id:"m2",partId:"p1",type:"خروج",qty:3,requestId:"r1",at:"2026-10-07T00:01:00.000Z"});
    draft.wf_wallet_tx[0].deleted = true;
    return true;
  });
  const [customer, devices, requests, parts, moves, walletTx, indexed, moveIndex, walletIndex] = await Promise.all([
    WorkshopDB.getById("wf_c", "c1"), WorkshopDB.readCollection("wf_d"),
    WorkshopDB.readCollection("wf_r"), WorkshopDB.readCollection("wf_p"), WorkshopDB.readCollection("wf_m"),
    WorkshopDB.readCollection("wf_wallet_tx"), WorkshopDB.queryIndex("wf_d", "customerId", "c1"),
    WorkshopDB.queryIndex("wf_m", "partId", "p1"), WorkshopDB.queryIndex("wf_wallet_tx", "wallet", "Cash")
  ]);
  if (customer.name !== "Updated customer" || devices.length !== 2 || requests[0].status !== "closed" || indexed.length !== 2 || parts[0].qty !== 7 || moves.length !== 2 || moveIndex.length !== 2 || walletTx[0].deleted !== true || walletIndex.length !== 1) throw Error("transaction/index");
  if (JSON.parse(WFStorage.getItem("wf_c"))[0].name !== "Updated customer") throw Error("durable IndexedDB key-value mirror");
  nativeSetItem.call(localStorage, "orphaned-after-migration", "ignored");
  if (arr(K.c)[0].name !== "Updated customer" || arrCached(K.d).length !== 2) throw Error("shared-data must read the hydrated IDB snapshot");
  const saved = await commitStorageAsync({
    [K.c]: [{id:"c1",name:"Async customer"}],
    [K.d]: [{id:"d1",customerId:"c1",type:"Washer"}],
    [K.r]: [{id:"r1",customerId:"c1",deviceId:"d1",status:"new"}],
    [K.p]: [{id:"p1",name:"Part",category:"Cooling",qty:11}],
    [K.m]: [{id:"m1",partId:"p1",type:"توريد",qty:11,at:"2026-10-07T00:00:00.000Z"}],
    [K.wtx]: [{id:"w1",wallet:"Cash",refKey:"order-final-r1",deleted:false,amount:35}]
  });
  const [durableCustomer,durablePart,durableMove,durableWallet] = await Promise.all([WorkshopDB.getById("wf_c", "c1"),WorkshopDB.getById("wf_p","p1"),WorkshopDB.getById("wf_m","m1"),WorkshopDB.getById("wf_wallet_tx","w1")]);
  if (!saved || durableCustomer.name !== "Async customer" || durablePart.qty!==11 || durableMove.qty!==11 || durableWallet.amount!==35 || arr(K.c)[0].name !== "Async customer" || arr(K.p)[0].qty!==11) throw Error("awaited async commit");
  if (localStorage.getItem("wf_c") !== null || JSON.parse(WFStorage.getItem("wf_c"))[0].name !== "Async customer") throw Error("legacy storage must not be used after import");
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
echo "browser-smoke: PASS (customer portal, IndexedDB key-value migration, six operational stores, atomic transaction, and legacy-storage removal)"
