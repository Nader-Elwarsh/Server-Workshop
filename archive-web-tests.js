// الأرشيف على الأجهزة: التقارير بتجمع «الحالي + ملخص الأرشيف»، الرصيد المُرحّل مش حركة فترة،
// ورقم الأمر الجديد مايتكررش مع رقم أمر متأرشف.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const now = new Date(), y = now.getFullYear(), m = now.getMonth();
const old = new Date(y, m - 6, 10), oldKey = key(old), oldFrom = key(new Date(y, m - 6, 1)), oldTo = key(new Date(y, m - 5, 0));
const thisFrom = key(new Date(y, m, 1)), thisTo = key(new Date(y, m + 1, 0));
const stamp = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString();

const cache = { v: 3, nos: { "W26-4-10-": 7 }, sums: {}, cust: { c9: { n: 4, nc: 1, paid: 1200, rev: 1000, first: "2025-01-05", last: oldKey } } };
cache.sums[oldKey.slice(0, 7)] = {};
cache.sums[oldKey.slice(0, 7)][oldKey] = { lab: 200, ps: 100, pc: 60, tp: 0, cl: 2, cr: 3, cx: 1, rt: 0, durS: 4, durN: 2, co: 250, cw: { "كاش": 250 }, ex: 40, tr: 500 };
const store = { wf_arch_cache: JSON.stringify(cache) };
const WFStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };

const records = {
  orders: [{ id: "live1", no: "W-L1", customerId: "c1", deviceId: "d1", createdAt: stamp(new Date(y, m, 2)), closedAt: stamp(new Date(y, m, 3)), closed: true, status: "مكتمل", labor: 50, partsTotal: 0, partsCost: 0, total: 50, deposit: 0 }],
  customers: [{ id: "c1" }], devices: [{ id: "d1", type: "غسالة" }], parts: [], tasks: [], moves: [],
  treasury: [
    { id: "archive-carry", source: "archive-carry", refKey: "archive-carry", type: "in", amount: 500, date: oldTo, time: "00:00" },
    { id: "t-now", type: "out", amount: 30, date: key(new Date(y, m, 2)), time: "10:00" }
  ]
};
const walletEntries = [{ id: "wc", source: "archive-carry", category: "رصيد مُرحّل", type: "in", amount: 210, date: oldTo, wallet: "كاش" }];
const K = { r: "orders", c: "customers", d: "devices", p: "parts", tasks: "tasks", tr: "treasury", m: "moves", wtx: "walletEntries" };

function run(from, to) {
  const els = {};
  ["reportsHost", "reportStatus", "reportPeriodLabel", "repFrom", "repTo", "repApply", "repToday", "repWeek", "repMonth"].forEach((id) => {
    els[id] = { id, value: "", innerHTML: "", textContent: "", attrs: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, addEventListener() {}, setAttribute(n, v) { this.attrs[n] = v; }, removeAttribute(n) { delete this.attrs[n]; }, getAttribute(n) { return this.attrs[n] || null; } };
  });
  els.repFrom.value = from; els.repTo.value = to;
  const ev = {}, frames = [];
  const ctx = {
    document: { addEventListener(t, f) { ev[t] = f; }, getElementById: (id) => els[id] || null },
    K, WFStorage, arr: (k) => records[k] || [], walletTxEntries: () => walletEntries,
    customerName: (id) => id, deviceName: (id) => id, dayKeyLocal: key, console: { error(e) { throw e; } },
    URL: { createObjectURL() {}, revokeObjectURL() {} }, Blob: function () {}, alert() {}, setTimeout, location: { search: "?only=all" },
    window: { requestAnimationFrame: (f) => frames.push(f), WFNavState: { getParam: (k) => (k === "from" ? from : to), setParams() {} } }
  };
  ctx.window.dayKeyLocal = key;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "reports.js"), "utf8"), ctx, { filename: "reports.js" });
  ev.DOMContentLoaded(); frames.shift()();
  return { html: els.reportsHost.innerHTML, data: ctx.window.WFReportData() };
}

// 1) فترة قديمة كلها في الأرشيف: الأرقام من الملخص
let r = run(oldFrom, oldTo), d = r.data;
assert.strictEqual(d.labor, 200); assert.strictEqual(d.partsSell, 100); assert.strictEqual(d.revenue, 300);
assert.strictEqual(d.partsCost, 60); assert.strictEqual(d.totalExp, 40); assert.strictEqual(d.net, 300 - 60 - 40);
assert.strictEqual(d.collected, 250); assert.strictEqual(d.n_closedOrders, 2); assert.strictEqual(d.n_created, 3); assert.strictEqual(d.n_cancelled, 1);
assert.strictEqual(d.avgTicket, 150); assert.strictEqual(d.avgDays, 2);
assert.strictEqual(d.byWallet.get("كاش"), 250);
assert.ok(r.html.includes("rep-arch-note"), "تنبيه إن الفترة فيها أرشيف");
assert.ok(r.html.includes("📦 من الأرشيف (أقدم)"), "المصاريف المتأرشفة ظاهرة كبند");
assert.strictEqual(d.tr.length, 0, "الرصيد المُرحّل مش حركة خزنة في الفترة");
assert.strictEqual(d.treasuryBalance, 500, "رصيد الخزنة آخر الفترة = المتأرشف لحد اليوم ده (من غير الرصيد المُرحّل)");
const ser = [...d.series.values()].reduce((a, v) => ({ rev: a.rev + v.rev, orders: a.orders + v.orders }), { rev: 0, orders: 0 });
assert.deepStrictEqual(ser, { rev: 300, orders: 3 }, "الاتجاه بيشمل الأرشيف");

assert.ok(d.ltvArr.some((x) => x[0] === "c9" && x[1].rev === 1000 && x[1].n === 3), "قيمة العميل بتشمل أوامره المتأرشفة");
assert.ok(d.sleepingVip.some((x) => x[0] === "c9"), "العميل الكبير اللي بطّل ييجي بيظهر حتى لو كل أوامره في الأرشيف");
// 2) الشهر الحالي: مفيش أرشيف فيه، والرصيد = المتأرشف + الحالي (مرة واحدة بس)
r = run(thisFrom, thisTo); d = r.data;
assert.strictEqual(d.labor, 50); assert.strictEqual(d.n_closedOrders, 1);
assert.ok(!r.html.includes("rep-arch-note"));
assert.strictEqual(d.treasuryBalance, 470, "500 أرشيف − 30 حالي (الرصيد المُرحّل مش محسوب مرتين)");

// 3) رقم الأمر: بيتخطى أرقام الأرشيف لنفس اليوم
const shared = fs.readFileSync(path.join(__dirname, "app-shared.js"), "utf8");
const fn = shared.match(/function orderNo\([\s\S]*?\n/)[0] + shared.match(/function archivedMaxNo\([\s\S]*?\n/)[0];
const c2 = { WFStorage, K: { r: "orders" }, arr: () => [{ no: "W26-4-10-8", createdAt: "x" }], localDateKey: (dt) => key(dt) };
vm.runInNewContext(fn, c2);
assert.strictEqual(c2.orderNo(new Date(2026, 3, 10)), "W26-4-10-9", "7 في الأرشيف و8 على الجهاز → 9");
assert.strictEqual(c2.orderNo(new Date(2026, 3, 11)), "W26-4-11-1");

// 4) الملفات المطلوبة موجودة في الصفحات والكاش
const sw = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
assert.ok(sw.includes('"./archive.js"'));
["index.html", "customer.html", "device.html", "request.html", "reports.html", "settings.html", "requests.html"].forEach((p) => assert.ok(fs.readFileSync(path.join(__dirname, p), "utf8").includes('src="archive.js"'), p));
assert.ok(fs.readFileSync(path.join(__dirname, "settings.html"), "utf8").includes('id="archiveSettings"'));
const rules = fs.readFileSync(path.join(__dirname, "firestore.rules"), "utf8");
["archRequests", "archWalletTx", "archTreasury", "archSum", "archCust", "archMeta"].forEach((c) => assert.ok(rules.includes("match /" + c + "/{id}"), c));

console.log("archive-web-tests: PASS (التقارير بالأرشيف، الرصيد المُرحّل، رقم الأمر، الصفحات، القواعد)");
