// اختبارات الأرشيف (functions/archive-core.js) على Firestore وهمي في الذاكرة:
// الأرصدة ماتتغيرش ولا قرش بعد الأرشفة، الملخصات صح، الرجوع من الأرشيف بيرجّع كل حاجة، وإعادة الحساب بتدي نفس النتيجة.
"use strict";
const assert = require("assert");
// بيشتغل من جذر المشروع (functions/archive-core.js) أو من فولدر الدوال نفسه (~/phase2)
const core = (() => { try { return require("./functions/archive-core"); } catch (e) { return require("./archive-core"); } })();

/* ---------- Firestore وهمي ---------- */
function mockDb() {
  const store = new Map(); // path → data
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x.toMillis === "function" ? { __ms: x.toMillis() } : x)), (k, x) => (x && typeof x === "object" && "__ms" in x ? ts(x.__ms) : x)));
  function snap(path) { const d = store.get(path); return { exists: d !== undefined, id: path.split("/").pop(), ref: ref(path), data: () => clone(d) }; }
  function applySet(path, d, opts) { store.set(path, clone(opts && opts.merge ? Object.assign({}, store.get(path) || {}, d) : d)); }
  function ref(path) {
    return { id: path.split("/").pop(), path, get: async () => snap(path), set: async (d, o) => applySet(path, d, o), delete: async () => { store.delete(path); }, update: async (d) => applySet(path, d, { merge: true }), collection: (n) => col(path + "/" + n) };
  }
  function col(name, filters, lim) {
    filters = filters || [];
    const q = {
      doc: (id) => ref(name + "/" + id),
      where: (f, op, v) => col(name, filters.concat([[f, op, v]]), lim),
      limit: (n) => col(name, filters, n),
      get: async () => {
        const depth = name.split("/").length + 1;
        let docs = [...store.keys()].filter((p) => p.startsWith(name + "/") && p.split("/").length === depth).sort().map(snap);
        docs = docs.filter((s) => filters.every(([f, op, v]) => { const x = s.data()[f]; return op === "==" ? x === v : op === "<" ? x < v : op === "in" ? v.indexOf(x) > -1 : true; }));
        if (lim) docs = docs.slice(0, lim);
        return { docs, size: docs.length, empty: !docs.length };
      },
      listDocuments: async () => { const ids = new Set(); [...store.keys()].forEach((p) => { if (p.startsWith(name + "/")) ids.add(p.split("/")[1]); }); return [...ids].map((id) => ref(name + "/" + id)); }
    };
    return q;
  }
  const db = {
    store,
    doc: (p) => ref(p),
    collection: (n) => col(n),
    batch: () => { const ops = []; return { set: (r, d, o) => ops.push(() => applySet(r.path, d, o)), update: (r, d) => ops.push(() => applySet(r.path, d, { merge: true })), delete: (r) => ops.push(() => store.delete(r.path)), commit: async () => ops.forEach((f) => f()) }; },
    runTransaction: async (fn) => {
      const ops = []; let wrote = false;
      const tx = {
        get: async (r) => { if (wrote) throw new Error("read after write in transaction"); return snap(r.path); },
        set: (r, d, o) => { wrote = true; ops.push(() => applySet(r.path, d, o)); },
        delete: (r) => { wrote = true; ops.push(() => store.delete(r.path)); },
        update: (r, d) => { wrote = true; ops.push(() => applySet(r.path, d, { merge: true })); }
      };
      const out = await fn(tx); ops.forEach((f) => f()); return out;
    }
  };
  return db;
}
let CLOCK = Date.parse("2026-10-23T10:00:00Z");
function ts(ms) { return { toMillis: () => ms, toDate: () => new Date(ms) }; }
const DAY = 864e5, ago = (d) => new Date(CLOCK - d * DAY).toISOString(), dayAgo = (d) => core.cairoDay(CLOCK - d * DAY);

/* ---------- بيانات ---------- */
function seed(db) {
  const put = (p, d) => db.store.set(p, Object.assign({ _ts: ts(CLOCK - 60 * DAY) }, d));
  put("settings/global", { wallets: ["كاش", "فودافون"] });
  const closed = (id, extra) => put("requests/" + id, Object.assign({ no: "W26-4-1-" + id.slice(1), customerId: "c1", deviceId: "d1", status: "مكتمل", closed: true, paid: true, labor: 150, partsTotal: 150, partsCost: 90, total: 300, deposit: 100, remain: 0, createdAt: ago(200), closedAt: ago(190) }, extra));
  closed("o1", {});
  closed("o2", { warrantyUntil: dayAgo(-30) });                                       // لسه في الضمان
  put("requests/o3", { no: "W26-10-1-1", customerId: "c1", status: "جديد", closed: false, total: 0, createdAt: ago(3) }); // مفتوح
  closed("o4", { closedAt: ago(30), createdAt: ago(35) });                           // حديث
  put("requests/o5", { no: "W26-5-2-1", customerId: "c2", status: "ملغي", closed: false, deposit: 50, total: 0, createdAt: ago(160), statusHistory: [{ to: "ملغي", at: ago(150) }] });
  closed("o6", { techId: "t1" });                                                     // مع فني
  closed("o7", { paid: false, deposit: 0, remain: 300 });                             // عليه باقي
  closed("o8", {});                                                                   // أمر ضمان مفتوح بيشاور عليه
  put("requests/o9", { no: "W26-10-2-1", customerId: "c1", status: "جديد", closed: false, warrantyOf: "o8", createdAt: ago(2) });
  closed("o10", { _ts: ts(CLOCK - 2 * DAY) });                                        // اتعدّل من يومين
  const tx = (id, d) => put("walletTx/" + id, Object.assign({ id, deleted: false, createdAt: ago(1) }, d));
  tx("order-deposit-o1", { refKey: "order-deposit-o1", type: "in", amount: 100, wallet: "كاش", category: "تحصيل عميل", date: dayAgo(200), source: "order-link" });
  tx("order-final-o1", { refKey: "order-final-o1", type: "in", amount: 200, wallet: "فودافون", category: "تحصيل عميل", date: dayAgo(190), source: "order-link" });
  tx("p-o1", { orderId: "o1", source: "order-part", type: "out", amount: 20, wallet: "كاش", category: "تحصيل عميل", date: dayAgo(189) }); // ردّ زيادة
  tx("order-deposit-o5", { refKey: "order-deposit-o5", type: "in", amount: 50, wallet: "كاش", category: "تحصيل عميل", date: dayAgo(160), source: "order-link" });
  tx("order-deposit-o2", { refKey: "order-deposit-o2", type: "in", amount: 100, wallet: "كاش", category: "تحصيل عميل", date: dayAgo(200), source: "order-link" });
  tx("m1", { type: "out", amount: 30, wallet: "كاش", category: "مصروف تشغيل", date: dayAgo(170) });
  tx("m2", { type: "in", amount: 40, wallet: "كاش", category: "أخرى", date: dayAgo(20) });
  tx("m3", { type: "out", amount: 15, wallet: "فودافون", category: "مصروف شخصي", date: dayAgo(300), deleted: true });
  tx("c1", { type: "in", amount: 500, wallet: "عهدة فني", source: "custody", date: dayAgo(300) });
  const tr = (id, d) => put("treasury/" + id, Object.assign({ id, deleted: false }, d));
  tr("ob", { refKey: "opening-balance", type: "in", amount: 1000, date: dayAgo(400) });
  tr("t1", { type: "in", amount: 500, date: dayAgo(200) });
  tr("t2", { type: "out", amount: 120, date: dayAgo(180) });
  tr("t3", { type: "out", amount: 10, date: dayAgo(5) });
  put("inbox/u1/items/n1", { at: CLOCK - 200 * DAY, read: true });
  put("inbox/u1/items/n2", { at: CLOCK - 200 * DAY, read: false });
  put("inbox/u1/items/n3", { at: CLOCK - 2 * DAY, read: true });
}
function live(db, col) { return [...db.store.entries()].filter(([p]) => p.startsWith(col + "/") && p.split("/").length === 2).map(([p, d]) => Object.assign({ id: p.split("/")[1] }, d)); }
function balances(db) {
  const b = {}; live(db, "walletTx").forEach((x) => { if (x.deleted) return; const w = String(x.wallet || "").trim(); b[w] = Math.round(((b[w] || 0) + (x.type === "in" ? +x.amount : -x.amount)) * 100) / 100; });
  return b;
}
function trBal(db) { return Math.round(live(db, "treasury").filter((x) => !x.deleted).reduce((a, x) => a + (x.type === "in" ? +x.amount : -x.amount), 0) * 100) / 100; }
function sumField(db, f) { let s = 0; live(db, "archSum").forEach((m) => Object.values(m.d || {}).forEach((d) => { s += +d[f] || 0; })); return Math.round(s * 100) / 100; }

(async () => {
  const db = mockDb(); seed(db);
  const A = core.createArchiver({ db, stamp: () => ts(CLOCK), ts: (d) => ts(d.getTime()), now: () => new Date(CLOCK) });
  const before = balances(db), trBefore = trBal(db);

  /* --- 1) الأرشفة --- */
  const r = await A.run({ by: "test" });
  assert.strictEqual(r.months, 4);
  assert.strictEqual(r.orders, 2, "o1 + o5 بس: " + JSON.stringify(r));
  const lr = live(db, "requests").map((x) => x.id).sort();
  assert.deepStrictEqual(lr, ["o10", "o2", "o3", "o4", "o6", "o7", "o8", "o9"]);
  assert.ok(db.store.get("archRequests/o1") && db.store.get("archRequests/o5"));
  assert.strictEqual(r.held.warranty, 1); assert.strictEqual(r.held.tech, 1); assert.strictEqual(r.held.unpaid, 1); assert.strictEqual(r.held.referenced, 1); assert.strictEqual(r.held.touched, 1);
  // حركات o1 الثلاثة + o5 + m1 + m3(محذوفة) اتأرشفوا؛ عربون o2 (أمر شغال) والعهدة والحديث فضلوا
  ["order-deposit-o1", "order-final-o1", "p-o1", "order-deposit-o5", "m1", "m3"].forEach((id) => assert.ok(db.store.get("archWalletTx/" + id), "archived " + id));
  ["order-deposit-o2", "m2", "c1"].forEach((id) => assert.ok(db.store.get("walletTx/" + id), "kept " + id));
  assert.deepStrictEqual(balances(db), before, "أرصدة المحافظ ماتتغيرش");
  assert.strictEqual(trBal(db), trBefore, "رصيد الخزنة مايتغيرش");
  assert.ok(db.store.get("treasury/ob"), "الرصيد الافتتاحي مايتأرشفش");
  assert.ok(db.store.get("archTreasury/t1") && db.store.get("archTreasury/t2") && db.store.get("treasury/t3"));
  const carry = db.store.get("walletTx/" + core.carryId("كاش"));
  assert.strictEqual(carry.type, "in"); assert.strictEqual(carry.amount, 100); // 100 − 20 + 50 − 30
  assert.strictEqual(carry.source, "archive-carry"); assert.strictEqual(carry.category, core.CARRY_CAT);
  assert.strictEqual(db.store.get("treasury/archive-carry").amount, 380);
  // شواهد الحذف: من غير نسخة السجل (مابتظهرش في «المحذوف من السحابة») وبعلامة arch
  const tb = db.store.get("syncDeletes/requests__o1"); assert.ok(tb.arch && !tb.rec && tb.c === "requests" && tb.exp);
  // الملخصات
  assert.strictEqual(sumField(db, "lab"), 150); assert.strictEqual(sumField(db, "ps"), 150); assert.strictEqual(sumField(db, "pc"), 90);
  assert.strictEqual(sumField(db, "cl"), 1); assert.strictEqual(sumField(db, "cr"), 2); assert.strictEqual(sumField(db, "cx"), 1);
  assert.strictEqual(sumField(db, "co"), 330); assert.strictEqual(sumField(db, "ex"), 30); assert.strictEqual(sumField(db, "tr"), 380);
  const c1 = db.store.get("archCust/c1"); assert.strictEqual(c1.n, 1); assert.strictEqual(c1.paid, 300); assert.strictEqual(c1.rev, 300);
  const c2 = db.store.get("archCust/c2"); assert.strictEqual(c2.nc, 1); assert.strictEqual(c2.paid, 50);
  assert.strictEqual(db.store.get("archMeta/nos").d["W26-4-1-"], 1);
  assert.ok(db.store.get("settings/wf_meta"), "الأجهزة اتبلّغت تسحب");
  assert.strictEqual(r.inbox, 1); assert.ok(!db.store.get("inbox/u1/items/n1") && db.store.get("inbox/u1/items/n2") && db.store.get("inbox/u1/items/n3"));

  /* --- 2) تشغيل تاني: مفيش حاجة جديدة --- */
  const r2 = await A.run({ by: "test" });
  assert.strictEqual(r2.orders + r2.tx + r2.tr, 0);
  assert.deepStrictEqual(balances(db), before);

  /* --- 3) «رجّعه للشغل» لأمر متأرشف --- */
  const rv = await A.revive("requests", "o1");
  assert.ok(rv.revived); assert.strictEqual(rv.tx, 3);
  assert.ok(db.store.get("requests/o1") && !db.store.get("archRequests/o1"));
  ["order-deposit-o1", "order-final-o1", "p-o1"].forEach((id) => assert.ok(db.store.get("walletTx/" + id) && !db.store.get("archWalletTx/" + id)));
  assert.deepStrictEqual(balances(db), before, "الأرصدة بعد الرجوع");
  assert.strictEqual(db.store.get("walletTx/" + core.carryId("كاش")).amount, 20); // 50 − 30
  assert.strictEqual(sumField(db, "lab"), 0); assert.strictEqual(sumField(db, "cl"), 0);
  assert.strictEqual(db.store.get("archCust/c1").n, 0);
  assert.strictEqual(db.store.get("requests/o1")._by, "srv");
  assert.ok(!(await A.revive("requests", "o1")).revived, "مرة واحدة بس");

  /* --- 4) جهاز رجّع حركة متأرشفة بنفسه (كان عليها تعديل) → التريجر --- */
  db.store.set("walletTx/m1", { type: "out", amount: 35, wallet: "كاش", category: "مصروف تشغيل", date: dayAgo(170), deleted: false }); // اتعدّلت 30 → 35
  const rv2 = await A.revive("walletTx", "m1");
  assert.ok(rv2.revived && !db.store.get("archWalletTx/m1"));
  assert.strictEqual(db.store.get("walletTx/m1").amount, 35, "نسخة الجهاز تفضل");
  const exp = Object.assign({}, before); exp["كاش"] = Math.round((before["كاش"] - 5) * 100) / 100;
  assert.deepStrictEqual(balances(db), exp, "الفرق بس هو التعديل نفسه");
  assert.strictEqual(sumField(db, "ex"), 0);

  /* --- 5) الرصيد المُرحّل اتمسح (نسخة قديمة اترفعت) → بيرجع لوحده --- */
  db.store.delete("walletTx/" + core.carryId("كاش")); db.store.delete("treasury/archive-carry");
  const healed = await A.healCarry(); assert.strictEqual(healed, 2);
  assert.deepStrictEqual(balances(db), exp); assert.strictEqual(trBal(db), trBefore);

  /* --- 6) إعادة الحساب من مستندات الأرشيف = نفس الحالة --- */
  const snapSum = JSON.stringify(live(db, "archSum").map((m) => m.d)), snapTot = JSON.stringify(db.store.get("archMeta/totals").w);
  const rb = await A.rebuild();
  assert.strictEqual(rb.orders, 1); // o5
  assert.strictEqual(JSON.stringify(live(db, "archSum").map((m) => m.d)), snapSum);
  assert.strictEqual(JSON.stringify(db.store.get("archMeta/totals").w), snapTot);
  assert.deepStrictEqual(balances(db), exp);

  /* --- 7) استيراد من نسخة احتياطية: بيضيف الناقص بس --- */
  const im = await A.importDocs({ requests: [{ id: "o5", data: { no: "x" } }, { id: "old1", data: { no: "W25-1-1-3", customerId: "c3", status: "مكتمل", closed: true, paid: true, total: 80, labor: 80, createdAt: ago(500), closedAt: ago(499) } }, { id: "../bad", data: {} }] });
  assert.deepStrictEqual(im, { added: 1, skipped: 2 });
  await A.rebuild();
  assert.strictEqual(db.store.get("archCust/c3").paid, 80); assert.strictEqual(db.store.get("archMeta/nos").d["W25-1-1-"], 3);

  /* --- 7ب) دمج عميلين: الأرشيف بيتنقل للعميل اللي فضل --- */
  const rp = await A.repointCustomer("c3", "c1");
  assert.strictEqual(rp.orders, 1);
  assert.strictEqual(db.store.get("archRequests/old1").customerId, "c1");
  assert.ok(!db.store.get("archCust/c3"), "ملخص المكرر اتشال");
  assert.strictEqual(db.store.get("archCust/c1").paid, 80, "ملخص العميل اللي فضل بقى فيه أوامر المكرر");
  assert.deepStrictEqual(await A.repointCustomer("c1", "c1"), { orders: 0, tx: 0 });

  /* --- 8) مدة الأرشفة من الإعدادات (3..24) والإيقاف --- */
  assert.strictEqual(core.clampMonths(1), 3); assert.strictEqual(core.clampMonths(99), 24); assert.strictEqual(core.clampMonths(undefined), 4); assert.strictEqual(core.clampMonths("6"), 6);
  db.store.set("settings/global", { archiveOff: true });
  assert.strictEqual((await A.run({})).skipped, "off");
  // قفل التشغيل: تشغيلين مع بعض
  db.store.set("settings/global", { archiveMonths: 6 });
  db.store.set("archMeta/state", { lockUntil: CLOCK + 60000, lockBy: "other" });
  assert.strictEqual((await A.run({ by: "me" })).skipped, "busy");

  console.log("archive-tests: PASS (أرشفة بشروطها، الأرصدة ثابتة، الملخصات، الرجوع، التريجر، إصلاح المُرحّل، إعادة الحساب، الاستيراد)");
})().catch((e) => { console.error(e); process.exit(1); });
