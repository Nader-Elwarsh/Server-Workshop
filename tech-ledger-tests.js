// اختبار حساب الفني على السيرفر (functions/tech-ledger.js) بقاعدة بيانات وهمية.
const assert = require("assert");
const { createTechLedger } = (() => { try { return require("./functions/tech-ledger"); } catch (e) { return require("./tech-ledger"); } })(); // بيشتغل من جذر المشروع أو من جوه functions (Cloud Shell)

let autoN = 0;
function makeDb(seed) {
  const data = JSON.parse(JSON.stringify(seed));
  const get = (path) => { const [c, id] = path.split("/"); return data[c] && data[c][id] ? JSON.parse(JSON.stringify(data[c][id])) : null; };
  const put = (path, v) => { const [c, id] = path.split("/"); (data[c] = data[c] || {})[id] = JSON.parse(JSON.stringify(v)); };
  const del = (path) => { const [c, id] = path.split("/"); if (data[c]) delete data[c][id]; };
  const snap = (path) => { const v = get(path); return { exists: !!v, id: path.split("/")[1], data: () => v }; };
  const doc = (path) => ({ path, get: async () => snap(path), set: async (v) => put(path, v), update: async (v) => put(path, Object.assign(get(path) || {}, v)) });
  function query(c, filters, lim) {
    return {
      where: (f, op, v) => query(c, filters.concat([[f, v, op]]), lim),
      limit: (n) => query(c, filters, n),
      get: async () => {
        let docs = Object.keys(data[c] || {}).filter((id) => filters.every(([f, v, op]) => op === "array-contains" ? Array.isArray(data[c][id][f]) && data[c][id][f].includes(v) : data[c][id][f] === v)).map((id) => ({ id, data: () => JSON.parse(JSON.stringify(data[c][id])) }));
        if (lim) docs = docs.slice(0, lim);
        return { docs, empty: !docs.length, size: docs.length };
      }
    };
  }
  return {
    data,
    doc,
    collection: (c) => Object.assign(query(c, [], 0), { doc: (id) => { const d = doc(`${c}/${id || "auto" + (++autoN)}`); d.id = d.path.split("/")[1]; return d; } }),
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
  // عربون اترد جزء منه للعميل: الفني يقدر يقفل، والتحصيل = الإجمالي − (العربون − المرتجع)
  db.data.requests.r6 = { techId: "t1", no: "A6", status: "مكتمل", labor: 300, total: 300, deposit: 500, depositRefunded: 250, closed: false };
  const o6 = await L.closeOrder("t1", { orderId: "r6", expectTotal: 300, expectDeposit: 500 });
  assert.strictEqual(o6.collected, 50, "300 − (500 − 250)");
  // أمر ضمان: الأجرة اللي الفني كتبها مابتتحسبش على العميل
  db.data.requests.r7 = { techId: "t1", no: "A7", status: "مكتمل", labor: 0, total: 80, partsTotal: 80, parts: [{ external: true, name: "ثرموستات", qty: 1, sell: 80, cost: 50 }], deposit: 0, warrantyDecision: "warranty", closed: false };
  const o7 = await L.closeOrder("t1", { orderId: "r7", fields: { labor: 200, total: 280, parts: [{ external: true, name: "ثرموستات", qty: 1, sell: 80, cost: 50 }] } });
  assert.deepStrictEqual([o7.collected, db.data.requests.r7.labor, db.data.requests.r7.total], [80, 0, 80], "المصنعية صفر على أمر الضمان");
  ["r6", "r7"].forEach((k) => { delete db.data.requests[k]; delete db.data.walletTx["order-final-" + k]; });

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
  // أجور الفني: المكسوب من الأوامر المقفولة − المصروف له (حركات techpay مش محذوفة)
  Object.assign(db.data.requests.r1, { jobType: "jt1", techPay: 200 }); Object.assign(db.data.requests.old, { techPay: 150, techPayManual: true });
  db.data.requests.r2.jobType = "jt0"; db.data.requests.r2.techPay = 0; // معاينة مجانية: متسعّرة بصفر
  db.data.requests.r6 = { techId: "t1", no: "A6", status: "جديد", closed: false, techPay: 70, jobType: "jt1" };
  db.data.walletTx.p1 = { wallet: "كاش الورشة", type: "out", amount: 100, source: "techpay", techPayFor: "t1", date: "2026-10-12", note: "أسبوع", deleted: false };
  db.data.walletTx.p2 = { wallet: "كاش الورشة", type: "out", amount: 500, source: "techpay", techPayFor: "t1", date: "2026-10-12", deleted: true };
  db.data.walletTx.p3 = { wallet: "كاش الورشة", type: "out", amount: 40, source: "techpay", techPayFor: "t2", date: "2026-10-12", deleted: false };
  const pa = (await L.account("t1", {})).pay;
  assert.deepStrictEqual([pa.earned, pa.paid, pa.due, pa.earnedMonth, pa.unpriced, pa.openPay, pa.payouts.length], [350, 100, 250, 350, 1, 70, 1]);
  // مصاريف من جيبه: المعتمدة بتتضاف للمستحق، والمعلّقة بتظهر لوحدها، ومش بتتحسب على العهدة
  db.data.techExpenses.o1 = { techId: "t1", amount: 25, note: "قطعة", status: "approved", pay: "own", at: "2026-10-12T09:00:00.000Z" };
  db.data.techExpenses.o2 = { techId: "t1", amount: 15, note: "قطعة", status: "pending", pay: "own", at: "2026-10-12T09:10:00.000Z" };
  db.data.techExpenses.w1 = { techId: "t1", amount: 99, note: "قطعة", status: "pending", pay: "workshop", at: "2026-10-12T09:20:00.000Z" };
  const acR = await L.account("t1", {});
  assert.deepStrictEqual([acR.pay.reimb, acR.pay.pendingReimb, acR.pay.due, acR.stats.pendingExpenses, acR.expenses.filter((x) => x.id === "o1")[0].pay], [25, 15, 275, 40, "own"]);
  delete db.data.techExpenses.o1; delete db.data.techExpenses.o2; delete db.data.techExpenses.w1;
  // مرتجع: حصة الشغل الأول اتثبتت للفني t1 والأمر اتحوّل لـ t2 → بتتحسب لـ t1، والخصم (أجرة بالسالب) بيتطرح
  db.data.requests.sh1 = { techId: "t2", no: "S1", status: "جاري التنفيذ", closed: false, techPay: 50, payShares: [{ uid: "t1", name: "نادر", amount: 120, note: "أجرة الشغل الأول", at: "2026-10-12T09:00:00.000Z" }], payShareUids: ["t1"] };
  db.data.requests.sh2 = { techId: "t1", no: "S2", status: "مكتمل", closed: true, paid: true, closedAt: "2026-10-12T09:30:00.000Z", total: 0, deposit: 0, techPay: -30, techPayManual: true };
  const acS = await L.account("t1", {});
  assert.deepStrictEqual([acS.pay.earned, acS.pay.shares.length, acS.pay.shares[0].no], [350 - 30 + 120, 1, "S1"]);
  delete db.data.requests.sh1; delete db.data.requests.sh2;
  const ph = (await L.account("t1", {})).history.filter((h) => h.no === "A1")[0];
  assert.deepStrictEqual([ph.pay, ph.priced], [200, true]);
  delete db.data.requests.r6;
  // قطع من المخزن: الفني يضيف من المخزن (يتخصم ويتسجل حركة)، والقطع اللي من بره من شغله تفضل، ويرجّع القطعة
  db.data.parts = { P1: { name: "سخان", qty: 3, buy: 100, use: 180 }, P2: { name: "فيشة", qty: 0, buy: 5, use: 10 } };
  db.data.requests.u1 = { techId: "t1", no: "U1", status: "جاري التنفيذ", labor: 100, deposit: 50, parts: [], total: 100, closed: false };
  const cat = await L.partsCatalog("t1");
  assert.deepStrictEqual(cat.parts.map((x) => [x.name, x.qty, x.sell, x.cost]), [["سخان", 3, 180, undefined], ["فيشة", 0, 10, undefined]], "من غير سعر الشراء");
  const u = await L.usePart("t1", { orderId: "u1", partId: "P1", qty: 2, fields: { parts: [{ external: true, name: "موتور", qty: 1, sell: 300, cost: 200 }, { partId: "P2", qty: 9, sell: 1, cost: 0 }], work: "ركبت" } });
  const o = db.data.requests.u1;
  assert.deepStrictEqual([db.data.parts.P1.qty, o.parts.length, o.partsTotal, o.partsCost, o.total, o.remain, o.work], [1, 2, 660, 400, 760, 710, "ركبت"], "اتخصم ومزوّرش سطر مخزن");
  assert(Object.values(db.data.partMoves || {}).some((m) => m.partId === "P1" && m.qty === 2 && m.requestId === "u1"), "حركة مخزن");
  assert.strictEqual(u.left, 1);
  await fail(L.usePart("t1", { orderId: "u1", partId: "P1", qty: 5 }), "not_enough");
  await fail(L.usePart("t2", { orderId: "u1", partId: "P1", qty: 1 }), "not_your_order");
  await fail(L.usePart("v", { orderId: "u1", partId: "P1", qty: 1 }), "no_edit_permission");
  await L.returnPart("t1", { orderId: "u1", partId: "P1" });
  assert.deepStrictEqual([db.data.parts.P1.qty, db.data.requests.u1.parts.length, db.data.requests.u1.total], [3, 1, 400], "رجعت المخزن");
  // عربون يستلمه الفني (معاينة وزيارة تانية): العربون يزيد، حركة منفصلة في عهدته، والقفل بعدين يحصّل الباقي بس
  const dep = await L.collectDeposit("t1", { orderId: "u1", amount: 150, note: "معاينة" });
  assert.deepStrictEqual([dep.deposit, dep.depositExtra, dep.wallet, db.data.requests.u1.deposit, db.data.requests.u1.remain], [200, 150, "عهدة نادر", 200, 200]);
  const dtx = Object.values(db.data.walletTx).filter((x) => x.orderId === "u1" && x.source === "order-part");
  assert.deepStrictEqual([dtx.length, dtx[0].amount, dtx[0].wallet, dtx[0].type], [1, 150, "عهدة نادر", "in"]);
  await fail(L.collectDeposit("t1", { orderId: "u1", amount: 0 }), "bad_amount");
  await fail(L.collectDeposit("t1", { orderId: "u1", amount: 10, wallet: "محفظة غريبة" }), "bad_wallet");
  await fail(L.collectDeposit("t2", { orderId: "u1", amount: 10 }), "not_your_order");
  await fail(L.collectDeposit("v", { orderId: "u1", amount: 10 }), "no_close_permission");
  // القفل مايقبلش سطر مخزن مزوّر من الجهاز
  db.data.requests.u1.status = "مكتمل";
  await L.closeOrder("t1", { orderId: "u1", fields: { parts: [{ partId: "P1", qty: 50, sell: 1, cost: 0 }, { external: true, name: "موتور", qty: 1, sell: 300, cost: 200 }] } });
  assert.deepStrictEqual([db.data.requests.u1.parts.length, db.data.requests.u1.total, db.data.requests.u1.closed, db.data.walletTx["order-final-u1"].amount], [1, 400, true, 200], "القفل حصّل الباقي بعد العربون بس");
  delete db.data.requests.u1; delete db.data.walletTx["order-final-u1"]; Object.keys(db.data.walletTx).forEach((k) => { if (db.data.walletTx[k].orderId === "u1") delete db.data.walletTx[k]; });
  // فني تاني مايشوفش حساب غيره، والمالك يشوف
  await fail(L.account("t2", { uid: "t1" }), "custody_only");
  const byBoss = await L.account("boss", { uid: "t1" });
  assert.strictEqual(byBoss.uid, "t1");
  // 🔁 (2026-10-30) نفس الضغطة وصلت مرتين (نت ضعيف: السيرفر نفّذ والرد ما وصلش، فالفني أعاد المحاولة) = دفعة واحدة
  db.data.requests.u9 = { techId: "t1", no: "U9", status: "جاري التنفيذ", labor: 500, deposit: 0, parts: [], total: 500, closed: false };
  const op = "op_abc12345";
  const d1 = await L.collectDeposit("t1", { orderId: "u9", amount: 120, opId: op });
  const d2 = await L.collectDeposit("t1", { orderId: "u9", amount: 120, opId: op });
  const u9tx = () => Object.values(db.data.walletTx).filter((x) => x.orderId === "u9" && x.source === "order-part");
  assert.deepStrictEqual([d1.deposit, d2.deposit, d2.repeated, db.data.requests.u9.deposit, db.data.requests.u9.depositExtra, db.data.requests.u9.remain, u9tx().length], [120, 120, true, 120, 120, 380, 1], "التكرار ما زوّدش العربون ولا الحركة");
  assert.strictEqual(u9tx()[0].opId, op);
  await fail(L.collectDeposit("t1", { orderId: "u9", amount: 999, opId: op }), "op_conflict"); // نفس المعرّف بمبلغ تاني = تلاعب/خطأ
  await fail(L.collectDeposit("t1", { orderId: "u9", amount: 10, opId: "bad id!" }), "bad_op");
  await L.collectDeposit("t1", { orderId: "u9", amount: 30, opId: "op_second99" }); // ضغطة جديدة فعلًا = دفعة جديدة
  assert.deepStrictEqual([db.data.requests.u9.deposit, u9tx().length], [150, 2]);
  await L.collectDeposit("t1", { orderId: "u9", amount: 5 }); // واجهة قديمة من غير opId: نفس السلوك القديم
  assert.deepStrictEqual([db.data.requests.u9.deposit, u9tx().length], [155, 3]);
  // 🔁 نفس الشيء للقطع: «استخدم قطعة» وصلت مرتين بنفس opId = خصم واحد من المخزن وسطر واحد على الأمر
  db.data.parts.P9 = { name: "ترموستات", qty: 5, use: 100, buy: 60 };
  const sop = "op_part1234";
  const s1 = await L.usePart("t1", { orderId: "u9", partId: "P9", qty: 2, opId: sop });
  const s2 = await L.usePart("t1", { orderId: "u9", partId: "P9", qty: 2, opId: sop });
  const p9lines = db.data.requests.u9.parts.filter((x) => x.partId === "P9");
  assert.deepStrictEqual([db.data.parts.P9.qty, p9lines.length, p9lines[0].qty, s1.left, s2.left, s2.repeated, Object.values(db.data.partMoves).filter((m) => m.partId === "P9").length], [3, 1, 2, 3, 3, true, 1], "القطعة اتخصمت مرة واحدة");
  await fail(L.usePart("t1", { orderId: "u9", partId: "P9", qty: 3, opId: sop }), "op_conflict");
  await L.usePart("t1", { orderId: "u9", partId: "P9", qty: 1, opId: "op_part5678" });
  assert.deepStrictEqual([db.data.parts.P9.qty, db.data.requests.u9.parts.find((x) => x.partId === "P9").qty], [2, 3]);
  delete db.data.parts.P9;
  delete db.data.requests.u9; Object.keys(db.data.walletTx).forEach((k) => { if (db.data.walletTx[k].orderId === "u9") delete db.data.walletTx[k]; });
  // التاريخ بتوقيت القاهرة
  assert.deepStrictEqual(L._cairoParts(new Date("2026-10-12T22:30:00.000Z")), { date: "2026-10-13", time: "01:30" });
  console.log("tech-ledger-tests: PASS (قفل من السيرفر + حركة التحصيل، الحمايات، اختيار محفظة، الرصيد والسجل والمصروفات، إصلاح التحصيل الناقص مرة واحدة)");
})().catch((e) => { console.error(e); process.exit(1); });
