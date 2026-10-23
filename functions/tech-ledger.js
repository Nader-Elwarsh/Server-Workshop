"use strict";
/* tech-ledger.js — حساب الفني على السيرفر (مش على أي جهاز):
   - closeOrder: الفني بيقفل أمره المعيّن له. في معاملة واحدة: الأمر يتقفل + حركة «تحصيل نهائي» تتسجل في المحفظة
     (نفس شكل ومعرّف الحركة اللي أجهزة الإدارة بتعملها: walletTx/order-final-<id>) + تنبيه الأجهزة التانية تسحب.
   - account: رصيد محفظة عهدة الفني وحركاتها وسجل أوامره المقفولة ومصروفاته — محسوبة من بيانات السيرفر نفسها،
     فمش بتتصفّر لو الفني خرج ودخل أو غيّر الجهاز، ومش محتاجة جهاز المدير يكون فاتح.
     وبتسجّل أي تحصيل ناقص لأمر اتقفل من الفني ولسه حركته ما اتسجلتش (إصلاح ذاتي، ما بيتكررش).
   منطق صرف من غير firebase-functions عشان يتختبر في Node بـ mock. */
const core = require("./roles-core");
const { AdminError } = require("./staff-admin");

const CONFIG_PATH = "accessConfig/roles";
const HEAL_AFTER_MS = 15 * 60 * 1000; // أوامر اتقفلت من جهاز إدارة: نسيب الجهاز يرفع حركته الأول قبل ما السيرفر يكمّلها
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^\d{2}:\d{2}$/;

function r2(n) { return Math.round((+n || 0) * 100) / 100; }
function num(v) { return v == null || v === "" ? 0 : +v; }
function iso(v) {
  if (!v) return "";
  if (typeof v.toDate === "function") return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
function cairoParts(d) {
  try {
    const p = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
  } catch (e) { const s = d.toISOString(); return { date: s.slice(0, 10), time: s.slice(11, 16) }; }
}
const WORK_FIELDS = ["status", "work", "labor", "parts", "partsTotal", "partsCost", "total", "statusHistory", "startedAt", "completedAt", "visit"];
const STATUSES = ["جديد", "جاري التنفيذ", "مكتمل", "مجمد"];
function cleanWork(f) {
  const out = {};
  if (!f || typeof f !== "object") return out;
  WORK_FIELDS.forEach((k) => {
    if (!Object.prototype.hasOwnProperty.call(f, k)) return;
    let v = f[k];
    if (k === "status" && STATUSES.indexOf(v) < 0) return;
    if (["labor", "partsTotal", "partsCost", "total"].indexOf(k) > -1) { v = +v; if (!isFinite(v) || v < 0 || v > 10000000) return; }
    if ((k === "parts" || k === "statusHistory") && !Array.isArray(v)) return;
    if (["work", "startedAt", "completedAt", "visit"].indexOf(k) > -1) { if (v == null) v = ""; if (typeof v !== "string" || v.length > 4000) return; }
    try { const j = JSON.stringify(v); if (j.length > 60000) return; v = JSON.parse(j); } catch (e) { return; }
    out[k] = v;
  });
  return out;
}
/* قطع الأمر: سطور المخزن (partId) دايمًا من نسخة السيرفر (اتخصمت من المخزن هنا)، والقطع اللي من بره من شغل الفني */
function mergeParts(serverParts, clientParts) {
  const stock = (Array.isArray(serverParts) ? serverParts : []).filter((p) => p && !p.external && p.partId);
  const ext = (Array.isArray(clientParts) ? clientParts : (Array.isArray(serverParts) ? serverParts : [])).filter((p) => p && p.external);
  return stock.concat(ext);
}
function recalc(r) {
  const parts = Array.isArray(r.parts) ? r.parts : [];
  r.partsTotal = r2(parts.reduce((a, p) => a + num(p.qty) * num(p.sell), 0));
  r.partsCost = r2(parts.reduce((a, p) => a + num(p.qty) * num(p.cost), 0));
  r.total = r2(num(r.labor) + r.partsTotal);
  r.remain = Math.max(0, r2(r.total - netDeposit(r)));
  return r;
}
/* العربون الصافي = اللي اتدفع − اللي اترد للعميل (ردّ زيادة العربون من الإدارة). من غيره الفني كان مايقدرش يقفل أمر اترد فيه عربون */
function netDeposit(r) { return r2(num(r.deposit) - num(r.depositRefunded)); }
/* أمر ضمان: المصنعية على الورشة مش على العميل — حتى لو الفني كتب أجرة */
function warrantyLabor(r, work) { if (r.warrantyDecision === "warranty" && num(r.labor) !== 0) { r.labor = 0; work.labor = 0; } }
function collectedOf(r) { return Math.max(0, r2(num(r.total) - netDeposit(r))); }

const PAY_KINDS = ["custody", "own", "workshop"];
function createTechLedger(deps) {
  const { db, now = () => new Date(), ts = (d) => d, log = () => {}, stamp = () => now() } = deps; // stamp = ختم وقت السيرفر للمزامنة بالتغييرات (_ts)

  async function loadConfig() {
    const s = await db.doc(CONFIG_PATH).get();
    return s.exists ? core.normalizeConfig(s.data()) : core.defaultConfig();
  }
  async function requireStaff(uid) {
    const s = await db.doc(`staff/${uid}`).get();
    const staff = s.exists ? s.data() : null;
    if (!staff || staff.disabled === true) throw new AdminError("permission-denied", "not_staff");
    const cfg = await loadConfig();
    const perms = {};
    core.effectivePerms(cfg, staff).forEach((k) => { perms[k] = 1; });
    return { staff, cfg, perms, owner: core.isOwner(cfg, staff) };
  }
  async function settingsGlobal() {
    const s = await db.doc("settings/global").get();
    return s.exists ? (s.data() || {}) : {};
  }
  function bumpMeta(tx) {
    const ref = db.doc("settings/wf_meta"), v = { ts: now().getTime(), dev: "server" };
    // merge: يحافظ على s (نسخة الإعدادات) عشان الأجهزة ماتقراش مجموعة الإعدادات كلها مع كل تعديل من الفني
    if (tx) tx.set(ref, v, { merge: true }); else return ref.set(v, { merge: true });
  }
  function finalTx(order, wallet, amount, when, existing) {
    const base = existing && typeof existing === "object" ? Object.assign({}, existing) : {};
    ["userDeleted", "deletedAmount", "deletedWallet", "deletedAt"].forEach((k) => { delete base[k]; });
    return Object.assign(base, {
      refKey: `order-final-${order.id}`, manualOverride: false, deleted: false, type: "in", amount, wallet,
      category: "تحصيل عميل", reason: `💳 تحصيل نهائي أمر الشغل ${order.no || ""}`, note: base.note || "",
      date: when.date, time: when.time, source: "order-link", createdAt: base.createdAt || ts(now()), byServer: true, _ts: stamp()
    });
  }

  /* ---------- قفل أمر من الفني ---------- */
  async function closeOrder(uid, data) {
    const { staff, perms } = await requireStaff(uid);
    if (!perms["requests.close"]) throw new AdminError("permission-denied", "no_close_permission");
    const orderId = String((data && data.orderId) || "");
    if (!orderId || orderId.length > 120 || orderId.indexOf("/") > -1) throw new AdminError("invalid-argument", "bad_order");
    const wanted = String((data && data.wallet) || "").replace(/\s+/g, " ").trim();
    const myWallet = String(staff.wallet || "").trim();
    const g = await settingsGlobal();
    const allowed = new Set((Array.isArray(g.wallets) ? g.wallets : []).map((w) => String(w || "").trim()).filter(Boolean));
    if (myWallet) allowed.add(myWallet);
    const wallet = wanted || myWallet;
    let when = cairoParts(now());
    if (data && DATE_RE.test(String(data.date || "")) && TIME_RE.test(String(data.time || ""))) {
      // تاريخ الجهاز مقبول لو النهارده أو امبارح بس (الفني كان أوفلاين) — مايتسجلش تحصيل بتاريخ قديم أو مستقبلي
      const yday = cairoParts(new Date(now().getTime() - 86400000)).date;
      if (String(data.date) === when.date || String(data.date) === yday) when = { date: String(data.date), time: String(data.time) };
    }
    const wc = g.warranty || {};

    const ref = db.doc(`requests/${orderId}`);
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AdminError("not-found", "no_order");
      const r = Object.assign({ id: orderId }, snap.data());
      if (r.techId !== uid) throw new AdminError("permission-denied", "not_your_order");
      if (r.closed === true || r.paid === true) throw new AdminError("failed-precondition", "already_closed");
      // شغل الفني على الأمر (الحالة/الشغل/الأجرة/القطع) بيتسجل مع القفل نفسه، حتى لو المزامنة لسه مارفعتهوش
      const work = cleanWork(data && data.fields);
      const srvParts = r.parts;
      Object.assign(r, work); warrantyLabor(r, work);
      if (work.parts || work.labor !== undefined) { r.parts = mergeParts(srvParts, work.parts); recalc(r); ["parts", "partsTotal", "partsCost", "total"].forEach((k) => { work[k] = r[k]; }); }
      if (r.status !== "مكتمل") throw new AdminError("failed-precondition", "not_completed");
      const total = num(r.total), deposit = num(r.deposit);
      if (!isFinite(total) || total < 0 || !isFinite(deposit) || deposit < 0) throw new AdminError("failed-precondition", "bad_amounts");
      if (netDeposit(r) > total + 0.001) throw new AdminError("failed-precondition", "deposit_over_total");
      if (data && data.expectTotal != null && Math.abs(r2(data.expectTotal) - r2(total)) > 0.005) throw new AdminError("aborted", "stale_total");
      if (data && data.expectDeposit != null && Math.abs(r2(data.expectDeposit) - r2(deposit)) > 0.005) throw new AdminError("aborted", "stale_total");
      const collected = collectedOf(r);
      if (collected > 0 && !wallet) throw new AdminError("failed-precondition", "wallet_required");
      if (wallet && !allowed.has(wallet)) throw new AdminError("invalid-argument", "bad_wallet");
      const txRef = db.doc(`walletTx/order-final-${orderId}`);
      const txSnap = collected > 0 ? await tx.get(txRef) : null;

      const at = now().toISOString();
      const patch = Object.assign({}, work, { paid: true, remain: 0, paidAt: at, closed: true, closedAt: at, closeWallet: wallet, closedByTech: uid, _by: "srv", _ts: stamp() });
      if (wc.enabled !== false && !r.warrantyManual) {
        const days = isFinite(+wc.days) && +wc.days > 0 ? +wc.days : 90;
        patch.warrantyDays = days;
        patch.warrantyUntil = new Date(now().getTime() + days * 86400000).toISOString();
      }
      tx.update(ref, patch);
      if (collected > 0) {
        const ex = txSnap && txSnap.exists ? txSnap.data() : null;
        if (!ex || ex.deleted === true) tx.set(txRef, finalTx(r, wallet, collected, when, ex));
      }
      tx.delete(db.doc(`techOrders/${orderId}`));
      bumpMeta(tx);
      return { ok: true, orderId, no: r.no || "", collected, wallet, closedAt: at };
    });
    log("tech close", uid, orderId, out.collected);
    return out;
  }

  /* ---------- حساب الفني ---------- */
  async function healMissing(orders, techUid) {
    const t = now().getTime(), healed = [];
    for (const r of orders) {
      if (!(r.closed === true && r.paid === true)) continue;
      const amount = collectedOf(r), w = String(r.closeWallet || "").trim();
      if (!(amount > 0) || !w) continue;
      const closedMs = Date.parse(iso(r.closedAt || r.paidAt)) || 0;
      if (r.closedByTech !== techUid && t - closedMs < HEAL_AFTER_MS) continue;
      const ref = `order-final-${r.id}`;
      const own = await db.doc(`walletTx/${ref}`).get();
      if (own.exists) continue; // موجودة (أو اتمسحت بقصد): مانلمسهاش
      const other = await db.collection("walletTx").where("refKey", "==", ref).limit(1).get();
      if (!other.empty) continue;
      const d = new Date(closedMs || t);
      await db.doc(`walletTx/${ref}`).set(finalTx(r, w, amount, cairoParts(d), null));
      healed.push(r.id);
    }
    if (healed.length) { try { await bumpMeta(); } catch (e) {} log("tech heal", techUid, healed.join(",")); }
    return healed;
  }
  async function namesFor(col, ids) {
    const out = {}, list = Array.from(new Set(ids.filter(Boolean))).slice(0, 150);
    for (let i = 0; i < list.length; i += 50) {
      const part = list.slice(i, i + 50);
      const snaps = typeof db.getAll === "function"
        ? await db.getAll(...part.map((id) => db.doc(`${col}/${id}`)))
        : await Promise.all(part.map((id) => db.doc(`${col}/${id}`).get()));
      snaps.forEach((s, j) => { if (s && s.exists) out[part[j]] = s.data() || {}; });
    }
    return out;
  }

  async function account(uid, data) {
    const me = await requireStaff(uid);
    let target = uid, staff = me.staff;
    const asked = data && data.uid ? String(data.uid) : "";
    if (asked && asked !== uid) {
      if (!(me.owner || me.perms["custody.approve"] || me.perms["custody.settle"])) throw new AdminError("permission-denied", "custody_only");
      const s = await db.doc(`staff/${asked}`).get();
      if (!s.exists) throw new AdminError("not-found", "no_such_user");
      target = asked; staff = s.data() || {};
    }
    const wallet = String(staff.wallet || "").trim();
    const oSnap = await db.collection("requests").where("techId", "==", target).get();
    const orders = oSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    let healed = [];
    try { healed = await healMissing(orders, target); } catch (e) { log("heal failed", e && e.message); }

    let balance = 0, entries = [];
    if (wallet) {
      const wSnap = await db.collection("walletTx").where("wallet", "==", wallet).get();
      const rows = wSnap.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((x) => x.deleted !== true);
      balance = r2(rows.reduce((a, x) => a + (x.type === "in" ? num(x.amount) : -num(x.amount)), 0));
      rows.sort((p, q) => String((q.date || "") + " " + (q.time || "") + iso(q.createdAt)).localeCompare(String((p.date || "") + " " + (p.time || "") + iso(p.createdAt))));
      entries = rows.slice(0, 200).map((x) => ({ id: x.id, ref: String(x.refKey || ""), type: x.type === "in" ? "in" : "out", amount: r2(x.amount), category: String(x.category || ""), reason: String(x.reason || "").slice(0, 160), date: x.date || "", time: x.time || "" }));
    }

    const closed = orders.filter((r) => r.closed === true).sort((a, b) => iso(b.closedAt || b.paidAt).localeCompare(iso(a.closedAt || a.paidAt)));
    const open = orders.filter((r) => r.closed !== true && r.status !== "ملغي");
    const recent = closed.slice(0, 100);
    const custs = await namesFor("customers", recent.map((r) => r.customerId));
    const devs = await namesFor("devices", recent.map((r) => r.deviceId));
    const history = recent.map((r) => {
      const c = custs[r.customerId] || {}, d = devs[r.deviceId] || {};
      return { id: r.id, no: r.no || "", customer: c.name || "", device: [d.type, d.brand, d.model].filter(Boolean).join(" "), fault: String(r.fault || "").slice(0, 120), work: String(r.work || "").slice(0, 200),
        status: r.status || "", total: r2(r.total), deposit: r2(r.deposit), collected: r.paid ? collectedOf(r) : 0, wallet: String(r.closeWallet || ""), closedAt: iso(r.closedAt || r.paidAt), byTech: r.closedByTech === target,
        pay: r2(r.techPay), jobType: String(r.jobTypeName || ""), priced: num(r.techPay) !== 0 || !!r.jobType };
    });

    const eSnap = await db.collection("techExpenses").where("techId", "==", target).get();
    const allExp = eSnap.docs.map((d) => { const x = d.data() || {}; return { id: d.id, amount: r2(x.amount), note: String(x.note || ""), status: String(x.status || ""), orderNo: String(x.orderNo || ""), at: iso(x.at), decisionNote: String(x.decisionNote || ""), pay: PAY_KINDS.includes(x.pay) ? x.pay : "custody" }; })
      .sort((a, b) => b.at.localeCompare(a.at));
    const expenses = allExp.slice(0, 80);

    const month = cairoParts(now()).date.slice(0, 7);
    const inMonth = (v) => { const s = iso(v); if (!s) return false; return cairoParts(new Date(s)).date.slice(0, 7) === month; };
    const monthClosed = closed.filter((r) => inMonth(r.closedAt || r.paidAt));
    const stats = {
      open: open.length, closedTotal: closed.length, closedMonth: monthClosed.length,
      collectedMonth: r2(monthClosed.reduce((a, r) => a + (r.paid ? collectedOf(r) : 0), 0)),
      laborMonth: r2(monthClosed.reduce((a, r) => a + num(r.labor), 0)),
      pendingExpenses: r2(allExp.filter((e) => e.status === "pending" && e.pay === "custody").reduce((a, e) => a + e.amount, 0))
    };
    // أجور الفني: المكسوب من الأوامر المقفولة (الأجرة اللي المالك/المدير حددها) − اللي اتصرف له (حركات source=techpay)
    const priced = closed.filter((r) => r.status !== "ملغي" && (num(r.techPay) !== 0 || r.jobType));
    // حصص أجرة اتثبتت له على أوامر اتعملها مرتجع (حتى لو الأمر دلوقتي مع فني تاني)
    const shSnap = await db.collection("requests").where("payShareUids", "array-contains", target).get();
    const shares = [];
    shSnap.docs.forEach((d) => { const r = d.data() || {}; if (r.status === "ملغي") return; (Array.isArray(r.payShares) ? r.payShares : []).forEach((sh) => { if (sh && sh.uid === target) shares.push({ orderId: d.id, no: String(r.no || ""), amount: r2(sh.amount), note: String(sh.note || "").slice(0, 120), at: iso(sh.at) }); }); });
    const sharesSum = r2(shares.reduce((a, x) => a + x.amount, 0));
    const earned = r2(priced.reduce((a, r) => a + num(r.techPay), 0) + sharesSum);
    const pSnap = await db.collection("walletTx").where("techPayFor", "==", target).get();
    const paidRows = pSnap.docs.map((d) => d.data() || {}).filter((x) => x.deleted !== true && x.source === "techpay");
    const paid = r2(paidRows.reduce((a, x) => a + (x.type === "in" ? -num(x.amount) : num(x.amount)), 0));
    // مصاريف دفعها من جيبه واتعتمدت: الورشة مديونة له بيها (بتتضاف للمستحق)
    const reimb = r2(allExp.filter((e) => e.pay === "own" && e.status === "approved").reduce((a, e) => a + e.amount, 0));
    const pendingReimb = r2(allExp.filter((e) => e.pay === "own" && e.status === "pending").reduce((a, e) => a + e.amount, 0));
    const pay = { earned, reimb, pendingReimb, paid, due: r2(earned + reimb - paid), earnedMonth: r2(priced.filter((r) => inMonth(r.closedAt || r.paidAt)).reduce((a, r) => a + num(r.techPay), 0) + shares.filter((x) => inMonth(x.at)).reduce((a, x) => a + x.amount, 0)), shares: shares.slice(0, 30),
      unpriced: closed.filter((r) => r.status !== "ملغي" && !(num(r.techPay) !== 0) && !r.jobType && inMonth(r.closedAt || r.paidAt)).length,
      openPay: r2(open.reduce((a, r) => a + num(r.techPay), 0)),
      payouts: paidRows.map((x) => ({ amount: r2(x.amount), date: x.date || "", note: String(x.note || "").slice(0, 120) })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20) };
    return { uid: target, name: String(staff.name || ""), wallet, balance, entries, history, expenses, stats, pay, healed: healed.length, at: now().toISOString() };
  }

  /* ---------- قطع من المخزن للفني ---------- */
  async function requireTechEdit(uid) {
    const me = await requireStaff(uid);
    if (!me.perms["requests.edit"]) throw new AdminError("permission-denied", "no_edit_permission");
    return me;
  }
  // قايمة المخزن للفني: الاسم والكمية وسعر البيع بس (من غير سعر الشراء)
  async function partsCatalog(uid) {
    await requireTechEdit(uid);
    const snap = await db.collection("parts").get();
    const parts = snap.docs.map((d) => { const x = d.data() || {}; return { id: d.id, name: String(x.name || ""), qty: num(x.qty), sell: r2(x.use), category: String(x.category || ""), code: String(x.code || "") }; })
      .filter((p) => p.name).sort((a, b) => a.name.localeCompare(b.name, "ar"));
    return { parts };
  }
  async function stockMove(uid, data, dir) {
    await requireTechEdit(uid);
    const orderId = String((data && data.orderId) || ""), partId = String((data && data.partId) || "");
    if (!orderId || orderId.indexOf("/") > -1 || !partId || partId.indexOf("/") > -1) throw new AdminError("invalid-argument", "bad_args");
    const q = dir === "use" ? Math.floor(+data.qty) : 0;
    if (dir === "use" && (!(q >= 1) || q > 1000)) throw new AdminError("invalid-argument", "bad_qty");
    const ref = db.doc(`requests/${orderId}`), pref = db.doc(`parts/${partId}`), mref = db.collection("partMoves").doc();
    const at = now().toISOString();
    const out = await db.runTransaction(async (tx) => {
      const [snap, psnap] = [await tx.get(ref), await tx.get(pref)];
      if (!snap.exists) throw new AdminError("not-found", "no_order");
      const r = Object.assign({ id: orderId }, snap.data());
      if (r.techId !== uid) throw new AdminError("permission-denied", "not_your_order");
      if (r.closed === true || r.paid === true) throw new AdminError("failed-precondition", "already_closed");
      if (r.status === "ملغي") throw new AdminError("failed-precondition", "cancelled");
      if (!psnap.exists) throw new AdminError("not-found", "no_part");
      const p = psnap.data() || {};
      const work = cleanWork(data && data.fields); const srvParts = r.parts;
      Object.assign(r, work); warrantyLabor(r, work); r.parts = mergeParts(srvParts, work.parts);
      let moved;
      if (dir === "use") {
        if (num(p.qty) < q) throw new AdminError("failed-precondition", "not_enough");
        const sell = r2(p.use), cost = r2(p.buy);
        const line = r.parts.find((x) => !x.external && x.partId === partId && num(x.sell) === sell && num(x.cost) === cost);
        if (line) line.qty = num(line.qty) + q; else r.parts.push({ partId, qty: q, sell, cost });
        moved = q;
        tx.update(pref, { qty: num(p.qty) - q, _ts: stamp() });
        tx.set(mref, { id: mref.id, partId, type: "خروج بسبب إضافة قطعة لأمر شغل", qty: q, requestId: orderId, at, byTech: uid, _ts: stamp() });
      } else {
        moved = r.parts.filter((x) => !x.external && x.partId === partId).reduce((a, x) => a + num(x.qty), 0);
        if (!moved) throw new AdminError("failed-precondition", "not_on_order");
        r.parts = r.parts.filter((x) => x.external || x.partId !== partId);
        tx.update(pref, { qty: num(p.qty) + moved, _ts: stamp() });
        tx.set(mref, { id: mref.id, partId, type: "إرجاع بسبب تعديل أمر", qty: moved, requestId: orderId, at, byTech: uid, _ts: stamp() });
      }
      recalc(r);
      const patch = Object.assign({}, work, { parts: r.parts, partsTotal: r.partsTotal, partsCost: r.partsCost, total: r.total, remain: r.remain, _by: "srv", _ts: stamp() });
      tx.update(ref, patch);
      bumpMeta(tx);
      return { parts: r.parts, partsTotal: r.partsTotal, partsCost: r.partsCost, total: r.total, remain: r.remain, moved, name: String(p.name || ""), left: dir === "use" ? num(p.qty) - q : num(p.qty) + moved };
    });
    log("tech part " + dir, uid, orderId, partId, out.moved);
    return out;
  }
  /* ---------- عربون/دفعة يستلمها الفني (معاينة والجهاز محتاج قطع وزيارة تانية مثلًا) ----------
     بتتسجل زي الدفعة الجزئية من خط السير: العربون يزيد، والمبلغ يتسجل كحركة منفصلة في محفظة الفني (depositExtra)،
     فحركة العربون الأساسية للأمر ماتتلمسش، والقفل بعدين بيحصّل الباقي بس. */
  async function collectDeposit(uid, data) {
    const { staff, perms } = await requireStaff(uid);
    if (!perms["requests.close"]) throw new AdminError("permission-denied", "no_close_permission");
    const orderId = String((data && data.orderId) || "");
    if (!orderId || orderId.length > 120 || orderId.indexOf("/") > -1) throw new AdminError("invalid-argument", "bad_order");
    const amount = r2(data && data.amount);
    if (!(amount > 0) || amount > 1000000) throw new AdminError("invalid-argument", "bad_amount");
    const myWallet = String(staff.wallet || "").trim();
    const g = await settingsGlobal();
    const allowed = new Set((Array.isArray(g.wallets) ? g.wallets : []).map((w) => String(w || "").trim()).filter(Boolean));
    if (myWallet) allowed.add(myWallet);
    const wallet = String((data && data.wallet) || "").replace(/\s+/g, " ").trim() || myWallet;
    if (!wallet) throw new AdminError("failed-precondition", "wallet_required");
    if (!allowed.has(wallet)) throw new AdminError("invalid-argument", "bad_wallet");
    const note = String((data && data.note) || "").slice(0, 200);
    const when = cairoParts(now());
    const ref = db.doc(`requests/${orderId}`), txRef = db.collection("walletTx").doc();
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AdminError("not-found", "no_order");
      const r = Object.assign({ id: orderId }, snap.data());
      if (r.techId !== uid) throw new AdminError("permission-denied", "not_your_order");
      if (r.closed === true || r.paid === true) throw new AdminError("failed-precondition", "already_closed");
      if (r.status === "ملغي") throw new AdminError("failed-precondition", "cancelled");
      const work = cleanWork(data && data.fields), srvParts = r.parts;
      Object.assign(r, work); warrantyLabor(r, work);
      if (work.parts || work.labor !== undefined) { r.parts = mergeParts(srvParts, work.parts); recalc(r); ["parts", "partsTotal", "partsCost", "total"].forEach((k) => { work[k] = r[k]; }); }
      const deposit = r2(num(r.deposit) + amount), extra = r2(num(r.depositExtra) + amount);
      const remain = Math.max(0, r2(num(r.total) - deposit + num(r.depositRefunded)));
      tx.update(ref, Object.assign({}, work, { deposit, depositExtra: extra, remain, _by: "srv", _ts: stamp() }));
      tx.set(txRef, { id: txRef.id, refKey: null, orderId, manualOverride: true, deleted: false, type: "in", amount, wallet, category: "تحصيل عميل",
        reason: `💵 عربون/دفعة أمر الشغل ${r.no || ""} — استلمها ${staff.name || "الفني"}`, note, date: when.date, time: when.time, source: "order-part", byTech: uid, createdAt: ts(now()), _ts: stamp() });
      bumpMeta(tx);
      return { deposit, depositExtra: extra, remain, total: r2(r.total), wallet, amount };
    });
    log("tech deposit", uid, orderId, amount, wallet);
    return out;
  }
  return { closeOrder, account, partsCatalog, collectDeposit, usePart: (uid, d) => stockMove(uid, d, "use"), returnPart: (uid, d) => stockMove(uid, d, "return"), _cairoParts: cairoParts };
}

module.exports = { createTechLedger };
