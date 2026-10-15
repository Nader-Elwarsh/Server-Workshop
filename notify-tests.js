/* اختبارات الإشعارات (functions/notify.js) بـ mock لـ Firestore: مين بيوصله إيه، ومفيش تكرار ولا إشعارات قديمة. */
const assert = require("assert");
const { createNotifier, KINDS, BROADCAST } = require("./functions/notify");

function mockDb(seed) {
  const data = JSON.parse(JSON.stringify(seed || {})); // { "col/id": {...}, "col/id/sub/id2": {...} }
  function docRef(path) {
    return {
      path, id: path.split("/").pop(),
      get: async () => ({ exists: data[path] !== undefined, data: () => (data[path] === undefined ? undefined : JSON.parse(JSON.stringify(data[path]))), id: path.split("/").pop() }),
      set: async (v) => { data[path] = JSON.parse(JSON.stringify(v)); },
      delete: async () => { delete data[path]; }
    };
  }
  function query(col, filters, order, off, lim) {
    return {
      where: (f, op, v) => query(col, filters.concat([[f, v, op]]), order, off, lim),
      orderBy: (f, dir) => query(col, filters, [f, dir], off, lim),
      offset: (n) => query(col, filters, order, n, lim),
      limit: (n) => query(col, filters, order, off, n),
      get: async () => {
        let ids = Object.keys(data).filter((p) => p.startsWith(col + "/") && p.slice(col.length + 1).indexOf("/") < 0);
        const cmp = { "==": (x, v) => x === v, ">": (x, v) => x != null && x > v, ">=": (x, v) => x != null && x >= v, "<": (x, v) => x != null && x < v, "<=": (x, v) => x != null && x <= v };
        ids = ids.filter((p) => filters.every(([f, v, op]) => cmp[op || "=="](data[p][f], v)));
        if (order) ids.sort((x, y) => (data[x][order[0]] - data[y][order[0]]) * (order[1] === "desc" ? -1 : 1));
        if (off) ids = ids.slice(off);
        if (lim) ids = ids.slice(0, lim);
        const docs = ids.map((p) => ({ id: p.split("/").pop(), data: () => JSON.parse(JSON.stringify(data[p])), ref: docRef(p) }));
        return { docs, empty: !docs.length, size: docs.length };
      }
    };
  }
  return { data, doc: docRef, collection: (c) => query(c, [], null, 0, 0) };
}
const inbox = (db, uid) => Object.keys(db.data).filter((p) => p.startsWith(`inbox/${uid}/items/`)).map((p) => db.data[p]);
const NOW = new Date("2026-10-15T10:00:00Z");
const seed = {
  "accessConfig/roles": { roles: { owner: { name: "مالك" }, tech: { name: "فني", perms: ["requests.view", "requests.close"], scope: "assigned" }, store: { name: "مخزن", perms: ["inventory.view", "inventory.add"] } } },
  "staff/own": { name: "نادر", role: "owner" },
  "staff/t1": { name: "حسن", role: "tech", acl: 1, wallet: "عهدة حسن", sc: "a" },
  "staff/t2": { name: "سيد", role: "tech", acl: 1, wallet: "عهدة سيد", sc: "a" },
  "staff/st": { name: "أمين المخزن", role: "store", acl: 1 },
  "staff/off": { name: "موقوف", role: "owner", disabled: true },
  "customers/c1": { name: "أحمد", portal: true },
  "customers/c2": { name: "محمود" },
  "portalLinks/u9": { customerId: "c2" },
  "notifPrefs/st": { mute: ["tech_part"] }
};

(async () => {
  const pushed = [];
  const db = mockDb(seed), N = createNotifier({ db, now: () => NOW, push: async (uid, p) => pushed.push([uid, p.title]) });
  const order = { no: "A-15", customerId: "c1", fault: "مش بتبرد", status: "جديد", visit: "2026-10-16T14:30", total: 500, deposit: 100 };

  // 1) تعيين فني: الفني بيوصله + العميل (ليه حساب على البوابة)
  const a1 = Object.assign({}, order, { techId: "t1", techName: "حسن", assignedAt: NOW.toISOString(), _by: "own" });
  await N.onRequestWrite("r1", order, a1, "own");
  let t1 = inbox(db, "t1");
  assert.strictEqual(t1.length, 1); assert.strictEqual(t1[0].kind, "assigned"); assert.ok(/A-15/.test(t1[0].title) && /أحمد/.test(t1[0].body) && /الساعة 2:30 م/.test(t1[0].body), JSON.stringify(t1[0]));
  assert.strictEqual(t1[0].link, "tech.html?id=r1");
  assert.ok(inbox(db, "c1").some((x) => x.kind === "c_tech"), "customer told who the tech is");
  assert.ok(pushed.some(([u]) => u === "t1"), "push sent");
  // نفس الحدث مرتين (الـ trigger ممكن يتكرر) = إشعار واحد
  await N.onRequestWrite("r1", order, a1, "own"); assert.strictEqual(inbox(db, "t1").length, 1);

  // 2) نقل الأمر لفني تاني: القديم بيتبلّغ إنه اتشال، والجديد إنه اتعين
  const a2 = Object.assign({}, a1, { techId: "t2", techName: "سيد", assignedAt: "2026-10-15T10:05:00Z" });
  await N.onRequestWrite("r1", a1, a2, "own");
  assert.ok(inbox(db, "t1").some((x) => x.kind === "unassigned")); assert.ok(inbox(db, "t2").some((x) => x.kind === "assigned"));

  // 3) الإدارة غيّرت الميعاد → الفني + العميل؛ الفني غيّر الميعاد بنفسه → مفيش للفني
  const a3 = Object.assign({}, a2, { visit: "2026-10-17T09:00" });
  await N.onRequestWrite("r1", a2, a3, "own");
  assert.ok(inbox(db, "t2").some((x) => x.kind === "visit_changed")); assert.ok(inbox(db, "c1").some((x) => x.kind === "c_visit" && /9:00 ص/.test(x.body)));
  const a3b = Object.assign({}, a3, { visit: "2026-10-17T11:00", _by: "t2" });
  await N.onRequestWrite("r1", a3, a3b, "t2");
  assert.strictEqual(inbox(db, "t2").filter((x) => x.kind === "visit_changed").length, 1, "tech's own change does not notify him");

  // 4) الفني غيّر الحالة → الإدارة (المالك) + العميل؛ الفني نفسه لأ؛ الموقوف لأ؛ أمين المخزن لأ (مالوش صلاحية)
  const a4 = Object.assign({}, a3b, { status: "جاري التنفيذ", statusHistory: [{ to: "جاري التنفيذ" }], _by: "t2" });
  await N.onRequestWrite("r1", a3b, a4, "t2");
  assert.ok(inbox(db, "own").some((x) => x.kind === "tech_status" && /سيد/.test(x.title)));
  assert.ok(!inbox(db, "off").length && !inbox(db, "st").some((x) => x.kind === "tech_status"));
  assert.ok(inbox(db, "c1").some((x) => x.kind === "c_status" && /بدأنا/.test(x.title)));

  // 5) الفني قفل الأمر من السيرفر: الإدارة بيوصلها القفل + مستحقاته
  const a5 = Object.assign({}, a4, { status: "مكتمل", closed: true, closedByTech: "t2", closeWallet: "عهدة سيد", techPay: 80 });
  await N.onRequestWrite("r1", a4, a5, "t2");
  const own = inbox(db, "own");
  assert.ok(own.some((x) => x.kind === "tech_closed" && /حصّل 400 ج/.test(x.body) && /عهدة سيد/.test(x.body)), JSON.stringify(own));
  assert.ok(own.some((x) => x.kind === "pay_due" && /80 ج/.test(x.title)));

  // 6) الإلغاء من الإدارة → الفني
  const o6 = Object.assign({}, order, { techId: "t1", techName: "حسن", assignedAt: NOW.toISOString() });
  await N.onRequestWrite("r6", o6, Object.assign({}, o6, { status: "ملغي", cancelReason: "العميل اتراجع" }), "own");
  assert.ok(inbox(db, "t1").some((x) => x.kind === "order_cancelled" && /اتراجع/.test(x.body)));

  // 7) أمر قديم بيترفع لأول مرة (أول مزامنة) مابيعملش إشعار تعيين
  await N.onRequestWrite("old", null, Object.assign({}, order, { techId: "t1", assignedAt: "2025-01-01T00:00:00Z", createdAt: "2025-01-01T00:00:00Z" }), "own");
  assert.ok(!inbox(db, "t1").some((x) => x.refId === "old"));

  // 8) مصروفات: طلب جديد → الإدارة (المالك)؛ القرار → الفني
  await N.onExpenseWrite("e1", null, { techId: "t1", techName: "حسن", amount: 50, note: "بنزين", status: "pending" });
  assert.ok(inbox(db, "own").some((x) => x.kind === "expense_new" && /50 ج/.test(x.title)));
  await N.onExpenseWrite("e1", { status: "pending" }, { techId: "t1", amount: 50, note: "بنزين", status: "rejected", decisionNote: "مفيش فاتورة" });
  assert.ok(inbox(db, "t1").some((x) => x.kind === "expense_decided" && /اترفض/.test(x.title) && /فاتورة/.test(x.body)));

  // 9) العهدة والأجور والعربون
  await N.onWalletTxCreate("w1", { source: "custody", type: "in", wallet: "عهدة حسن", amount: 1000 });
  await N.onWalletTxCreate("w2", { source: "custody", type: "out", wallet: "عهدة حسن", amount: 300 });
  await N.onWalletTxCreate("w3", { source: "techpay", techPayFor: "t1", amount: 250, type: "out", wallet: "كاش" });
  const t1all = inbox(db, "t1");
  assert.ok(t1all.some((x) => x.kind === "custody" && /اتسلّمت عهدة 1000/.test(x.title)));
  assert.ok(t1all.some((x) => x.kind === "custody" && /تسوية/.test(x.title)));
  assert.ok(t1all.some((x) => x.kind === "pay_paid" && /250/.test(x.title)));
  await N.onWalletTxCreate("w4", { source: "order-part", type: "in", byTech: "t1", orderId: "r1", amount: 200, wallet: "عهدة حسن", reason: "عربون أمر A-15" });
  assert.ok(inbox(db, "own").some((x) => x.kind === "tech_deposit" && /حسن استلم 200/.test(x.title)));

  // 10) المخزن: الفني صرف قطعة (أمين المخزن قافل النوع ده) + الحد الأدنى
  db.data["parts/p1"] = { name: "مكثف", qty: 2, min: 2 };
  await N.onPartMoveCreate("m1", { partId: "p1", qty: 1, byTech: "t1", requestId: "r1", type: "خروج بسبب إضافة قطعة لأمر شغل" });
  assert.ok(inbox(db, "own").some((x) => x.kind === "tech_part")); assert.ok(!inbox(db, "st").some((x) => x.kind === "tech_part"), "muted kind skipped");
  await N.onPartUpdate("p1", { name: "مكثف", qty: 3, min: 2 }, { name: "مكثف", qty: 2, min: 2 });
  assert.ok(inbox(db, "st").some((x) => x.kind === "low_stock" && /فاضل 2/.test(x.title)), "store keeper gets low stock");
  await N.onPartUpdate("p1", { name: "مكثف", qty: 2, min: 2 }, { name: "مكثف", qty: 1, min: 2 });
  assert.strictEqual(inbox(db, "st").filter((x) => x.kind === "low_stock").length, 1, "only when crossing the limit");

  // 11) البوابة: طلب/شكوى/سؤال → الإدارة؛ الرد → العميل (بحساب مربوط من portalLinks)
  await N.onPortalRequestCreate("pr1", { customerId: "c1", fault: "صوت عالي" });
  await N.onGuestRequestCreate("G-ABC234", { name: "زائر", fault: "مش شغالة", deviceType: "غسالة" });
  await N.onComplaintWrite("cp1", null, { customerId: "c2", text: "الفني اتأخر", orderNo: "A-9" });
  await N.onComplaintWrite("cp1", { reply: "" }, { customerId: "c2", reply: "متأسفين، هنتابع" });
  await N.onQuestionWrite("q1", { answer: "" }, { customerId: "c2", answer: "غيّر الفلتر" });
  const ownK = inbox(db, "own").map((x) => x.kind);
  ["portal_request", "guest_request", "complaint_new"].forEach((k) => assert.ok(ownK.includes(k), k));
  const u9 = inbox(db, "u9").map((x) => x.kind);
  assert.ok(u9.includes("c_reply") && u9.includes("c_answer"), "linked portal account");
  assert.ok(!inbox(db, "c2").length, "customer doc without portal account gets nothing directly");

  // 12) مقال منشور → صندوق العملاء العام مرة واحدة
  await N.onPostWrite("post1", { published: false }, { published: true, title: "نصايح الشتا" });
  await N.onPostWrite("post1", { published: true }, { published: true, title: "نصايح الشتا" });
  assert.strictEqual(inbox(db, BROADCAST).length, 1);

  // كل الأنواع المستخدمة متعرّفة
  Object.keys(db.data).filter((p) => p.startsWith("inbox/")).forEach((p) => assert.ok(KINDS[db.data[p].kind], db.data[p].kind));
  // 13) المجدولة: تذكير، متأخر، ملخص الصبح، رأي العميل، الضمان — والمالك يقدر يقفل أي نوع
  {
    const t0 = new Date("2026-10-15T06:00:00Z"); // 9:00 ص بتوقيت مصر
    const db2 = mockDb(seed); let clock = t0;
    const N2 = createNotifier({ db: db2, now: () => clock });
    db2.data["requests/v1"] = { no: "V1", customerId: "c1", techId: "t1", techName: "حسن", visit: "2026-10-15T09:50", status: "جديد", closed: false };
    db2.data["requests/v2"] = { no: "V2", customerId: "c1", techId: "t1", visit: "2026-10-15T05:00", status: "جاري التنفيذ", closed: false };
    db2.data["requests/v3"] = { no: "V3", customerId: "c1", visit: "2026-10-15T15:00", status: "جديد", closed: false };
    db2.data["requests/v4"] = { no: "V4", customerId: "c1", status: "مكتمل", closed: true, closedAt: "2026-10-12T20:00:00.000Z", warrantyUntil: "2026-10-18T12:00:00.000Z" };
    db2.data["techExpenses/x1"] = { status: "pending" };
    db2.data["parts/p9"] = { name: "فلتر", qty: 0, min: 1 };
    const r = await N2.tick();
    assert.strictEqual(r.reminders, 1, JSON.stringify(r));
    assert.ok(inbox(db2, "t1").some((x) => x.kind === "visit_reminder" && /9:50 ص/.test(x.title)));
    assert.ok(inbox(db2, "own").some((x) => x.kind === "overdue_order" && /V2/.test(x.title)) && inbox(db2, "t1").some((x) => x.kind === "visit_missed"));
    const dg = inbox(db2, "own").find((x) => x.kind === "morning_digest");
    assert.ok(dg && /زيارات النهارده: 3/.test(dg.body) && /متأخرة/.test(dg.body) === false && /مش متعيّنة لفني: 1/.test(dg.body) && /مستنية اعتماد: 1/.test(dg.body) && /ناقصة: 1/.test(dg.body), dg && dg.body);
    assert.ok(inbox(db2, "c1").some((x) => x.kind === "c_feedback") && inbox(db2, "c1").some((x) => x.kind === "c_warranty"));
    // تاني مرة في نفس اليوم: مفيش تكرار
    const r2b = await N2.tick(); assert.strictEqual(r2b.reminders + r2b.overdue + r2b.digest + r2b.feedback + r2b.warranty, 0, JSON.stringify(r2b));
    // المالك قفل التذكير → مابيتبعتش
    db2.data["notifConfig/global"] = { off: ["visit_reminder"], remindMin: 30 };
    clock = new Date(t0.getTime() + 2 * 60000); db2.data["requests/v5"] = { no: "V5", techId: "t2", visit: "2026-10-15T09:30", status: "جديد", closed: false };
    const N3 = createNotifier({ db: db2, now: () => clock });
    assert.strictEqual((await N3.tick()).reminders, 0);
    assert.strictEqual((await N3.deliver(["t2"], { kind: "visit_reminder", key: "x1", title: "x" })).length, 0, "globally off kind is never delivered");
    // عهدة فني عدّت الحد
    db2.data["notifConfig/global"] = { off: [], custodyMax: 1000 };
    const N4 = createNotifier({ db: db2, now: () => clock });
    db2.data["walletTx/k1"] = { wallet: "عهدة حسن", type: "in", amount: 800 }; db2.data["walletTx/k2"] = { wallet: "عهدة حسن", type: "in", amount: 400 };
    await N4.onWalletTxCreate("k2", db2.data["walletTx/k2"]);
    assert.ok(inbox(db2, "own").some((x) => x.kind === "custody_high" && /1200/.test(x.title)));
    // رسائل الإدارة: الفني مايقدرش يبعت، المالك يبعت لكل الفنيين، والفني مايقدرش يكتمها
    await assert.rejects(N4.sendMessage("t1", { to: "techs", title: "x" }));
    db2.data["notifPrefs/t2"] = { mute: ["admin_msg"] };
    const sm = await N4.sendMessage("own", { to: "techs", title: "اجتماع", body: "بكرة 9 الصبح" });
    assert.strictEqual(sm.sent, 2); assert.ok(inbox(db2, "t2").some((x) => x.kind === "admin_msg" && /اجتماع/.test(x.title)));
  }

  // قايمة الأنواع في الواجهة (notif-center.js) لازم تطابق السيرفر
  const src = require("fs").readFileSync(__dirname + "/notif-center.js", "utf8");
  const clientKinds = [...src.matchAll(/(\w+): \["(tech|admin|customer|staff)"/g)].map((m) => m[1] + ":" + m[2]).sort();
  assert.deepStrictEqual(clientKinds, Object.keys(KINDS).map((k) => k + ":" + KINDS[k].aud).sort());
  [...src.matchAll(/(\w+): \["admin", "[^"]+", "[^"]+", "([\w.]+)"\]/g)].forEach((m) => assert.strictEqual(KINDS[m[1]].perm, m[2], m[1]));
  console.log("notify-tests: PASS (" + Object.keys(db.data).filter((p) => p.startsWith("inbox/")).length + " إشعار)");
})().catch((e) => { console.error(e); process.exit(1); });
