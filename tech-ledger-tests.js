// اختبار حساب الفني على السيرفر (functions/tech-ledger.js) بقاعدة بيانات وهمية.
const assert = require("assert");
const { createTechLedger } = require("./functions/tech-ledger");

function makeDb(seed) {
  const data = JSON.parse(JSON.stringify(seed));
  const get = (path) => { const [c, id] = path.split("/"); return data[c] && data[c][id] ? JSON.parse(JSON.stringify(data[c][id])) : null; };
  const put = (path, v) => { const [c, id] = path.split("/"); (data[c] = data[c] || {})[id] = JSON.parse(JSON.stringify(v)); };
  const del = (path) => { const [c, id] = path.split("/"); if (data[c]) delete data[c][id]; };
  const snap = (path) => { const v = get(path); return { exists: !!v, id: path.split("/")[1], data: () => v }; };
  const doc = (path) => ({ path, get: async () => snap(path), set: async (v) => put(path, v), update: async (v) => put(path, Object.assign(get(path) || {}, v)) });
  function query(c, filters, lim) {
    return {
      where: (f, op, v) => query(c, filters.concat([[f, v]]), lim),
      limit: (n) => query(c, filters, n),
      get: async () => {
        let docs = Object.keys(data[c] || {}).filter((id) => filters.every(([f, v]) => data[c][id][f] === v)).map((id) => ({ id, data: () => JSON.parse(JSON.stringify(data[c][id])) }));
        if (lim) docs = docs.slice(0, lim);
        return { docs, empty: !docs.length, size: docs.length };
      }
    };
  }
  return {
    data,
    doc,
    collection: (c) => query(c, [], 0),
    runTransaction: async (fn) => {
      const writes = [];
      const tx = { get: async (ref) => snap(ref.path), set: (ref, v) => writes.push(() => put(ref.path, v)), update: (ref, v) => writes.push(() => put(ref.path, Object.assign(get(ref.path) || {}, v))), delete: (ref) => writes.push(() => del(ref.path)) };
      const out = await fn(tx); writes.forEach((w) => w()); return out;
    }
  };
}

(async () => {
  let clock = new Date("2026-10-12T10:00:00.000Z");
  const seed = {
    accessConfig: { roles: { version: 1, order: ["owner", "manager", "tech"], roles: { owner: { name: "المالك", perms: [] }, tech: { name: "فني", perms: ["requests.view", "requests.edit", "requests.close"], scope: "assigned" }, viewer: { name: "مشاهد", perms: ["requests.view"] } } } },
    staff: {
      t1: { name: "نادر", role: "tech", acl: 1, wallet: "عهدة نادر" },
      t2: { name: "سيد", role: "tech", acl: 1, wallet: "عهدة سيد" },
      boss: { name: "المالك", role: "owner", acl: 1 },
      v: { name: "مشاهد", role: "viewer", acl: 1 }
    },
    settings: { global: { wallets: ["كاش الورشة", "عهدة نادر", "عهدة سيد"], warranty: { enabled: true, days: 30 } } },
    customers: { c1: { name: "سعاد" } }, devices: { d1: { type: "غسالة", brand: "LG" } },
    requests: {
      r1: { techId: "t1", no: "A1", customerId: "c1", deviceId: "d1", status: "مكتمل", total: 500, deposit: 100, labor: 300, closed: false },
      r2: { techId: "t1", no: "A2", customerId: "c1", status: "جاري التنفيذ", total: 200, deposit: 0, closed: false },
      r3: { techId: "t2", no: "B1", customerId: "c1", status: "مكتمل", total: 100, deposit: 0, closed: false },
      // اتقفل بالطريقة القديمة من جهاز الفني ومحفظته اتحددت، بس حركة التحصيل ما اتسجلتش على السيرفر
      old: { techId: "t1", no: "A0", customerId: "c1", status: "مكتمل", total: 250, deposit: 50, closed: true, paid: true, closeWallet: "عهدة نادر", closedAt: "2026-10-11T08:00:00.000Z" },
      // اتقفل من جهاز إدارة من دقيقتين: لسه مانكمّلش حركته (الجهاز بيرفعها)
      fresh: { techId: "t1", no: "A9", customerId: "c1", status: "مكتمل", total: 80, deposit: 0, closed: true, paid: true, closeWallet: "كاش الورشة", closedAt: "2026-10-12T09:58:00.000Z" }
    },
    walletTx: {
      dep1: { wallet: "عهدة نادر", type: "in", amount: 1000, category: "سلفة / تحويل", reason: "عهدة", date: "2026-10-10", time: "09:00", deleted: false },
      exp1: { wallet: "عهدة نادر", type: "out", amount: 60, category: "مصروف تشغيل", reason: "بنزين", date: "2026-10-11", time: "12:00", deleted: false },
      gone: { wallet: "عهدة نادر", type: "out", amount: 999, deleted: true }
    },
    techExpenses: { e1: { techId: "t1", amount: 40, note: "مواصلات", status: "pending", at: "2026-10-12T08:00:00.000Z" }, e9: { techId: "t2", amount: 5, note: "x", status: "pending", at: "2026-10-12T08:00:00.000Z" } },
    techOrders: { r1: { techId: "t1" } }
  };
  const db = makeDb(seed);
  const L = createTechLedger({ db, now: () => clock });
  const fail = async (p, code) => { try { await p; } catch (e) { assert.strictEqual(e.message, code, "كود الخطأ"); return; } assert.fail("كان المفروض يترفض: " + code); };

  // القفل: محفظة الفني افتراضيًا، الحركة بنفس معرّف أجهزة الإدارة، والأمر اتقفل، ونسخة العرض اتمسحت
  const out = await L.closeOrder("t1", { orderId: "r1", expectTotal: 500, expectDeposit: 100, date: "2026-10-12", time: "13:05" });
  assert.deepStrictEqual([out.collected, out.wallet], [400, "عهدة نادر"]);
  const r1 = db.data.requests.r1, tx = db.data.walletTx["order-final-r1"];
  assert.deepStrictEqual([r1.closed, r1.paid, r1.remain, r1.closeWallet, r1.closedByTech, r1.warrantyDays], [true, true, 0, "عهدة نادر", "t1", 30]);
  assert.deepStrictEqual([tx.refKey, tx.type, tx.amount, tx.wallet, tx.category, tx.date, tx.time, tx.deleted, tx.source], ["order-final-r1", "in", 400, "عهدة نادر", "تحصيل عميل", "2026-10-12", "13:05", false, "order-link"]);
  assert(!db.data.techOrders.r1, "نسخة العرض اتمسحت");
  assert(db.data.settings.wf_meta && db.data.settings.wf_meta.dev === "server", "الأجهزة التانية اتنبهت");
  await fail(L.closeOrder("t1", { orderId: "r1" }), "already_closed");
  // حمايات
  await fail(L.closeOrder("t1", { orderId: "r3" }), "not_your_order");
  await fail(L.closeOrder("t1", { orderId: "r2" }), "not_completed");
  db.data.requests.r2.status = "مكتمل";
  await fail(L.closeOrder("t1", { orderId: "r2", expectTotal: 150 }), "stale_total");
  await fail(L.closeOrder("t1", { orderId: "r2", wallet: "محفظة مش موجودة" }), "bad_wallet");
  await fail(L.closeOrder("v", { orderId: "r2" }), "no_close_permission");
  // اختيار محفظة تانية من محافظ الورشة
  clock = new Date("2026-10-12T10:01:00.000Z");
  const o2 = await L.closeOrder("t1", { orderId: "r2", wallet: "كاش الورشة", expectTotal: 200 });
  assert.strictEqual(o2.wallet, "كاش الورشة"); assert.strictEqual(db.data.walletTx["order-final-r2"].wallet, "كاش الورشة");
  // موظف موقوف
  db.data.staff.t2.disabled = true; await fail(L.closeOrder("t2", { orderId: "r3" }), "not_staff"); delete db.data.staff.t2.disabled;

  // المزامنة لسه مارفعتش شغل الفني: القفل بيسجّل الحالة والأجرة مع القفل نفسه
  db.data.requests.r4 = { techId: "t1", no: "A4", customerId: "c1", status: "جاري التنفيذ", total: 0, deposit: 0, closed: false, fault: "من الإدارة" };
  const o4 = await L.closeOrder("t1", { orderId: "r4", expectTotal: 150, fields: { status: "مكتمل", work: "غيرت الكارتة", labor: 150, total: 150, fault: "تلاعب", deposit: 0, closed: false } });
  assert.strictEqual(o4.collected, 150);
  assert.deepStrictEqual([db.data.requests.r4.status, db.data.requests.r4.work, db.data.requests.r4.labor, db.data.requests.r4.closed, db.data.requests.r4.fault], ["مكتمل", "غيرت الكارتة", 150, true, "من الإدارة"], "حقول الشغل بس اتقبلت");
  await fail(L.closeOrder("t1", { orderId: "r9x" }), "no_order");
  db.data.requests.r5 = { techId: "t1", no: "A5", status: "جديد", total: 10, closed: false };
  await fail(L.closeOrder("t1", { orderId: "r5", fields: { status: "ملغي" } }), "not_completed");
  delete db.data.requests.r4; delete db.data.requests.r5; delete db.data.walletTx["order-final-r4"];

  // الحساب: إصلاح التحصيل القديم الناقص (مرة واحدة)، الرصيد، السجل، المصروفات
  const acc = await L.account("t1", {});
  assert.strictEqual(acc.healed, 1, "التحصيل القديم اتسجل");
  assert(db.data.walletTx["order-final-old"] && db.data.walletTx["order-final-old"].amount === 200, "حركة الأمر القديم");
  assert(!db.data.walletTx["order-final-fresh"], "الأمر المقفول من جهاز إدارة حالًا: نستنى الجهاز يرفع حركته");
  assert.strictEqual(acc.balance, 1000 - 60 + 400 + 200, "الرصيد من السيرفر (المحذوف مش محسوب، وكاش الورشة مش محسوب)");
  assert.deepStrictEqual(acc.history.map((h) => h.no), ["A2", "A1", "A9", "A0"]);
  assert.deepStrictEqual([acc.history[1].customer, acc.history[1].device, acc.history[1].collected, acc.history[1].byTech], ["سعاد", "غسالة LG", 400, true]);
  assert.deepStrictEqual(acc.expenses.map((e) => e.id), ["e1"], "مصروفاته بس");
  assert.deepStrictEqual([acc.stats.open, acc.stats.closedTotal, acc.stats.closedMonth, acc.stats.collectedMonth, acc.stats.pendingExpenses], [0, 4, 4, 880, 40]);
  const again = await L.account("t1", {});
  assert.strictEqual(again.healed, 0, "الإصلاح مايتكررش");
  // حركة اتمسحت بقصد من الإدارة: ماترجعش
  db.data.walletTx["order-final-old"].deleted = true; db.data.walletTx["order-final-old"].userDeleted = true;
  assert.strictEqual((await L.account("t1", {})).healed, 0);
  // بعد ربع ساعة: الأمر المقفول من جهاز إدارة ولسه حركته ناقصة يتكمّل
  clock = new Date("2026-10-12T10:30:00.000Z");
  assert.strictEqual((await L.account("t1", {})).healed, 1);
  // فني تاني مايشوفش حساب غيره، والمالك يشوف
  await fail(L.account("t2", { uid: "t1" }), "custody_only");
  const byBoss = await L.account("boss", { uid: "t1" });
  assert.strictEqual(byBoss.uid, "t1");
  // التاريخ بتوقيت القاهرة
  assert.deepStrictEqual(L._cairoParts(new Date("2026-10-12T22:30:00.000Z")), { date: "2026-10-13", time: "01:30" });
  console.log("tech-ledger-tests: PASS (قفل من السيرفر + حركة التحصيل، الحمايات، اختيار محفظة، الرصيد والسجل والمصروفات، إصلاح التحصيل الناقص مرة واحدة)");
})().catch((e) => { console.error(e); process.exit(1); });
