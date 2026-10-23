"use strict";
/* archive-core.js — الأرشيف والملخصات (منطق صرف من غير firebase-functions، بيتختبر في Node بـ mock).

   الفكرة: الأوامر القديمة اللي خلصت خالص بتتنقل من المجموعات الشغالة (requests / walletTx / treasury)
   لمجموعات أرشيف (archRequests / archWalletTx / archTreasury)، فالأجهزة بتشيلها من عندها (شاهد حذف arch:true)
   وبتفضل خفيفة. ومع النقل:
   - رصيد مُرحّل: لكل محفظة حركة واحدة ثابتة (walletTx/archive-carry-…) وللخزنة (treasury/archive-carry)
     قيمتها = صافي كل الحركات اللي اتأرشفت → الأرصدة على الأجهزة ماتتغيرش ولا قرش، من غير أي تعديل في حساب الرصيد.
     القيمة الحقيقية محفوظة على السيرفر (archMeta/totals) والحركة المُرحّلة مجرد «عرض» ليها بيتكتب كل مرة بالقيمة الكاملة
     (مش بالفرق)، فلو نسخة احتياطية قديمة اترفعت فوقها بترجع صح لوحدها.
   - ملخصات يومية (archSum/{YYYY-MM}) لكل اللي اتأرشف: إيراد ومصنعية وقطع وأجور وعدد أوامر وتحصيل ومصاريف وخزنة —
     التقارير بتجمع «الحالي + الملخص» فالأرقام القديمة ماتضيعش.
   - ملخص لكل عميل (archCust/{id}): عدد أوامره المتأرشفة وإجمالي اللي دفعه.
   - أرقام الأوامر المتأرشفة (archMeta/nos): أكبر مسلسل لكل يوم، عشان رقم أمر جديد مايتكررش مع أمر في الأرشيف.
   - رجوع تلقائي: لو أمر/حركة متأرشفة اتعملت تاني في المجموعة الشغالة (اتفتحت واتعدّلت، أو جهاز كان عليه تعديل قديم)،
     بترجع للشغل العادي هي وحركاتها، والملخصات والرصيد المُرحّل بيتخصم منهم نفس المبلغ بالظبط. */

const crypto = require("node:crypto");

const ARCH = { requests: "archRequests", walletTx: "archWalletTx", treasury: "archTreasury" };
const META = "archMeta/state", TOT = "archMeta/totals", NOS = "archMeta/nos";
const DEFAULT_MONTHS = 4, MIN_MONTHS = 3, MAX_MONTHS = 24;
const QUIET_MS = 14 * 864e5;      // أمر اتعدّل في آخر أسبوعين مايتأرشفش (حتى لو قديم)
const TOMB_MS = 45 * 864e5;        // شاهد الحذف بتاع الأرشيف بيتمسح لوحده بعد 45 يوم (TTL على exp)
const LEASE_MS = 9 * 60 * 1000;
// حركات ليها حساب على السيرفر نفسه (عهدة وأجور الفني) مابتتأرشفش: حسابهم بيقرا المجموعة الشغالة
const KEEP_TX_SRC = ["custody", "custody-expense", "techpay", "archive-carry"];
const CARRY_CAT = "رصيد مُرحّل";

function r2(n) { return Math.round((+n || 0) * 100) / 100; }
function num(v) { return v == null || v === "" ? 0 : (+v || 0); }
function msOf(v) {
  if (v == null || v === "") return NaN;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(s + "T12:00:00+02:00");
  return Date.parse(s);
}
const DAY_FMT = (() => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }); } catch (e) { return null; } })();
/* يوم العمل بتوقيت القاهرة (نفس اليوم اللي الجهاز بيحسبه في التقارير) */
function cairoDay(v) {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = msOf(v); if (!isFinite(t)) return "";
  const d = new Date(t);
  if (DAY_FMT) { const p = {}; DAY_FMT.formatToParts(d).forEach((x) => { p[x.type] = x.value; }); return `${p.year}-${p.month}-${p.day}`; }
  return new Date(t + 2 * 36e5).toISOString().slice(0, 10);
}
function clampMonths(m) { m = Math.round(+m); return isFinite(m) && m > 0 ? Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, m)) : DEFAULT_MONTHS; }
function cutoffOf(nowMs, months) { const d = new Date(nowMs); d.setUTCMonth(d.getUTCMonth() - months); return d.getTime(); }
function walletKey(w) { return String(w || "").trim(); }
function carryId(w) { return "archive-carry-" + crypto.createHash("sha1").update(walletKey(w)).digest("hex").slice(0, 12); }

/* ---------- الأمر يتأرشف؟ (فاضي = أيوه، غير كده السبب) ---------- */
function netDeposit(o) { return r2(num(o.deposit) - num(o.depositRefunded)); }
function closeMs(o) {
  if (o.status === "ملغي") {
    const h = (Array.isArray(o.statusHistory) ? o.statusHistory : []).filter((x) => x && x.to === "ملغي").pop();
    return msOf((h && h.at) || o.cancelledAt || o.updatedAt || o.createdAt);
  }
  return msOf(o.closedAt || o.paidAt || o.completedAt || o.createdAt);
}
function warrantyEndMs(o) {
  const w = o.warrantyUntil; if (!w) return NaN;
  const s = String(w);
  return msOf(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + "T23:59:59+02:00" : s);
}
function holdReason(o, ctx) {
  if (!o) return "missing";
  const cancelled = o.status === "ملغي";
  if (!cancelled && o.closed !== true) return "open";
  if (!cancelled && !(o.paid === true || r2(num(o.total) - netDeposit(o)) <= 0.004)) return "unpaid";
  if (o.techId || (Array.isArray(o.payShares) && o.payShares.length) || o.returnPayPending) return "tech"; // حساب الفني بيتحسب من أوامره الشغالة
  const w = warrantyEndMs(o); if (isFinite(w) && w >= ctx.now) return "warranty";
  const c = closeMs(o); if (!isFinite(c) || c >= ctx.cutMs) return "recent";
  const t = msOf(o._ts); if (isFinite(t) && ctx.now - t < QUIET_MS) return "touched";
  if (ctx.refOpen && o.id && ctx.refOpen.has(String(o.id))) return "referenced"; // أمر ضمان مفتوح بيشاور عليه
  return "";
}
/* الحركة مربوطة بأنهي أمر (أو "") */
function txOrderId(x) {
  if (!x) return "";
  const m = String(x.refKey || "").match(/^order-(?:deposit|final)-(.+)$/);
  if (m) return m[1];
  return x.orderId ? String(x.orderId) : "";
}
function txArchivable(x) { return !!x && !x.byTech && !x.techPayFor && KEEP_TX_SRC.indexOf(String(x.source || "")) < 0 && !/^archive-carry/.test(String(x.refKey || "")); }
function trArchivable(x) { return !!x && x.refKey !== "opening-balance" && x.source !== "archive-carry" && x.refKey !== "archive-carry"; }

/* ---------- المساهمة في الملخصات ---------- */
function newAcc() { return { days: {}, w: {}, t: 0, cust: {}, nos: {}, n: { orders: 0, tx: 0, tr: 0 } }; }
function addDay(acc, day, f, v) { if (!day || !v) return; const d = acc.days[day] || (acc.days[day] = {}); d[f] = r2((d[f] || 0) + v); }
function addDayMap(acc, day, f, key, v) { if (!day || !v) return; const d = acc.days[day] || (acc.days[day] = {}); const m = d[f] || (d[f] = {}); m[key] = r2((m[key] || 0) + v); }
function orderContrib(o, acc) {
  acc.n.orders++;
  const cancelled = o.status === "ملغي", created = cairoDay(o.createdAt);
  addDay(acc, created, "cr", 1);
  if (o.closed === true) {
    const cd = cairoDay(o.closedAt || o.createdAt);
    addDay(acc, cd, "cl", 1); addDay(acc, cd, "lab", num(o.labor)); addDay(acc, cd, "ps", num(o.partsTotal));
    addDay(acc, cd, "pc", num(o.partsCost)); addDay(acc, cd, "tp", num(o.techPay));
    const s = msOf(o.restartedAt || o.createdAt), e = msOf(o.closedAt);
    if (isFinite(s) && isFinite(e) && e >= s) { addDay(acc, cd, "durS", (e - s) / 864e5); addDay(acc, cd, "durN", 1); }
  }
  if (cancelled) addDay(acc, cairoDay(closeMs(o)), "cx", 1);
  (Array.isArray(o.statusHistory) ? o.statusHistory : []).forEach((h) => { if (h && /^مرتجع/.test(String(h.note || ""))) addDay(acc, cairoDay(h.at), "rt", 1); });
  if (!cancelled) (Array.isArray(o.payShares) ? o.payShares : []).forEach((sh) => { if (sh) addDay(acc, cairoDay(sh.at), "tp", num(sh.amount)); });
  if (o.customerId) {
    const c = acc.cust[o.customerId] || (acc.cust[o.customerId] = { n: 0, nc: 0, paid: 0, rev: 0, first: "", last: "" });
    c.n++; if (cancelled) c.nc++;
    c.paid = r2(c.paid + (o.closed === true ? Math.max(0, num(o.total)) : Math.max(0, netDeposit(o))));
    if (o.closed === true && !cancelled) c.rev = r2(c.rev + num(o.labor) + num(o.partsTotal));
    if (created && (!c.first || created < c.first)) c.first = created;
    if (created && created > c.last) c.last = created;
  }
  const m = String(o.no || "").match(/^(.*-)(\d+)$/);
  if (m) acc.nos[m[1]] = Math.max(acc.nos[m[1]] || 0, +m[2]);
}
function txContrib(x, acc) {
  acc.n.tx++;
  if (!x || x.deleted === true) return;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(x.date || "")) ? x.date : cairoDay(x.createdAt);
  const amt = num(x.amount), sg = x.type === "in" ? amt : -amt; // نفس حساب رصيد المحفظة على الجهاز
  const w = walletKey(x.wallet);
  acc.w[w] = r2((acc.w[w] || 0) + sg);
  if (x.category === "مصروف تشغيل") addDay(acc, day, "ex", x.type === "in" ? -amt : amt);
  if (x.category === "تحصيل عميل" && (x.type === "in" || x.type === "out")) {
    const v = x.type === "out" ? -amt : amt;
    addDay(acc, day, "co", v); addDayMap(acc, day, "cw", w || "غير محدد", v);
  }
}
function trContrib(x, acc) {
  acc.n.tr++;
  if (!x || x.deleted === true) return;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(x.date || "")) ? x.date : cairoDay(x.createdAt);
  const amt = num(x.amount), sg = x.type === "in" ? amt : -amt;
  acc.t = r2(acc.t + sg); addDay(acc, day, "tr", sg);
}
function monthsOf(acc) { const s = {}; Object.keys(acc.days).forEach((d) => { s[d.slice(0, 7)] = 1; }); return Object.keys(s).sort(); }

/* دمج مساهمة (sign = 1 أرشفة، −1 رجوع) في نسخ المستندات */
function mergeDays(target, days, sign) {
  target = target && typeof target === "object" ? target : {};
  Object.keys(days).forEach((day) => {
    const src = days[day], dst = target[day] || (target[day] = {});
    Object.keys(src).forEach((f) => {
      if (f === "cw") { const m = dst.cw || (dst.cw = {}); Object.keys(src.cw).forEach((k) => { m[k] = r2((m[k] || 0) + sign * src.cw[k]); if (Math.abs(m[k]) < 0.005) delete m[k]; }); if (!Object.keys(m).length) delete dst.cw; return; }
      dst[f] = r2((dst[f] || 0) + sign * src[f]); if (Math.abs(dst[f]) < 0.005) delete dst[f];
    });
    if (!Object.keys(dst).length) delete target[day];
  });
  return target;
}
function mergeCust(cur, c, sign) {
  const o = Object.assign({ n: 0, nc: 0, paid: 0, rev: 0, first: "", last: "" }, cur || {});
  o.n = Math.max(0, o.n + sign * c.n); o.nc = Math.max(0, o.nc + sign * c.nc);
  o.paid = r2(o.paid + sign * c.paid); o.rev = r2(o.rev + sign * c.rev);
  if (sign > 0) { if (c.first && (!o.first || c.first < o.first)) o.first = c.first; if (c.last > (o.last || "")) o.last = c.last; }
  return o;
}
function mergeTotals(cur, acc, sign) {
  const o = { w: Object.assign({}, (cur && cur.w) || {}), t: r2((cur && cur.t) || 0), n: Object.assign({ orders: 0, tx: 0, tr: 0 }, (cur && cur.n) || {}) };
  Object.keys(acc.w).forEach((w) => { o.w[w] = r2((o.w[w] || 0) + sign * acc.w[w]); });
  o.t = r2(o.t + sign * acc.t);
  ["orders", "tx", "tr"].forEach((k) => { o.n[k] = Math.max(0, o.n[k] + sign * acc.n[k]); });
  return o;
}

function createArchiver(deps) {
  const { db, stamp = () => new Date(), ts = (d) => d, now = () => new Date(), log = () => {} } = deps;
  const nowMs = () => now().getTime();

  function carryWalletDoc(w, net, cutDay) {
    return { refKey: carryId(w), source: "archive-carry", manualOverride: true, deleted: false, type: net < 0 ? "out" : "in", amount: Math.abs(r2(net)), wallet: walletKey(w),
      category: CARRY_CAT, reason: "📦 رصيد مُرحّل من الأرشيف" + (cutDay ? ` (حركات قبل ${cutDay})` : ""), note: "صافي الحركات القديمة اللي اتنقلت للأرشيف — بيتحسب لوحده",
      date: cutDay || "2000-01-01", time: "00:00", createdAt: "2000-01-01T00:00:00.000Z", _ts: stamp(), _by: "srv" };
  }
  function carryTreasuryDoc(net, cutDay) {
    return { refKey: "archive-carry", source: "archive-carry", manualOverride: true, deleted: false, type: net < 0 ? "out" : "in", amount: Math.abs(r2(net)),
      category: CARRY_CAT, reason: "📦 رصيد مُرحّل من الأرشيف" + (cutDay ? ` (حركات قبل ${cutDay})` : ""), counterparty: "", place: "", note: "صافي حركات الخزنة القديمة اللي اتنقلت للأرشيف",
      date: cutDay || "2000-01-01", time: "00:00", createdAt: "2000-01-01T00:00:00.000Z", _ts: stamp(), _by: "srv" };
  }
  function tomb(col, id) { return { c: col, id, _ts: stamp(), by: "srv", arch: true, exp: ts(new Date(nowMs() + TOMB_MS)) }; }
  function stripArch(d) { const o = Object.assign({}, d); delete o._archAt; delete o._archCut; o._ts = stamp(); o._by = "srv"; return o; }

  async function readConfig() {
    const s = await db.doc("settings/global").get();
    const g = s.exists ? (s.data() || {}) : {};
    return { months: clampMonths(g.archiveMonths), off: g.archiveOff === true };
  }

  /* بيكتب في المعاملة: الملخصات الشهرية + العميل + الإجماليات + أرقام الأوامر + الرصيد المُرحّل. لازم كل القراءات تكون اتعملت قبلها. */
  async function readSide(tx, acc) {
    const months = monthsOf(acc), custIds = Object.keys(acc.cust);
    const [sums, custs, tot, nos] = await Promise.all([
      Promise.all(months.map((m) => tx.get(db.doc(`archSum/${m}`)))),
      Promise.all(custIds.map((c) => tx.get(db.doc(`archCust/${c}`)))),
      tx.get(db.doc(TOT)), tx.get(db.doc(NOS))
    ]);
    return { months, sums, custIds, custs, tot, nos };
  }
  function writeSide(tx, acc, side, sign, cutDay) {
    side.months.forEach((m, i) => {
      const cur = side.sums[i].exists ? (side.sums[i].data() || {}) : {};
      const d = mergeDays(JSON.parse(JSON.stringify(cur.d || {})), Object.fromEntries(Object.entries(acc.days).filter(([k]) => k.slice(0, 7) === m)), sign);
      tx.set(db.doc(`archSum/${m}`), { m, d, _ts: stamp() });
    });
    side.custIds.forEach((c, i) => { tx.set(db.doc(`archCust/${c}`), Object.assign(mergeCust(side.custs[i].exists ? side.custs[i].data() : null, acc.cust[c], sign), { _ts: stamp() })); });
    const tot = mergeTotals(side.tot.exists ? side.tot.data() : null, acc, sign);
    const cut = cutDay || (side.tot.exists && side.tot.data().cutDay) || "";
    tx.set(db.doc(TOT), Object.assign({}, tot, { cutDay: cut, _ts: stamp() }));
    if (sign > 0 && Object.keys(acc.nos).length) {
      const cur = side.nos.exists ? ((side.nos.data() || {}).d || {}) : {}, next = Object.assign({}, cur); let ch = false;
      Object.keys(acc.nos).forEach((p) => { if ((next[p] || 0) < acc.nos[p]) { next[p] = acc.nos[p]; ch = true; } });
      if (ch) tx.set(db.doc(NOS), { d: next, _ts: stamp() });
    }
    Object.keys(acc.w).forEach((w) => { tx.set(db.doc(`walletTx/${carryId(w)}`), carryWalletDoc(w, tot.w[w] || 0, cut)); });
    if (acc.n.tr || acc.t) tx.set(db.doc("treasury/archive-carry"), carryTreasuryDoc(tot.t, cut));
    return tot;
  }

  /* ---------- أرشفة أمر واحد مع حركاته (معاملة واحدة: يا كله يا مفيش) ---------- */
  async function archiveOrder(id, ctx) {
    return db.runTransaction(async (tx) => {
      const oRef = db.doc(`requests/${id}`), oSnap = await tx.get(oRef);
      if (!oSnap.exists) return null;
      const o = oSnap.data() || {};
      if (holdReason(Object.assign({ id }, o), ctx)) return null;
      const cand = ctx.txByOrder.get(id) || [];
      const tSnaps = await Promise.all(cand.map((tid) => tx.get(db.doc(`walletTx/${tid}`))));
      const txs = tSnaps.filter((s) => s.exists).map((s) => ({ id: s.id, d: s.data() || {} })).filter((t) => txOrderId(t.d) === id && txArchivable(t.d));
      const acc = newAcc(); orderContrib(o, acc); txs.forEach((t) => txContrib(t.d, acc));
      const side = await readSide(tx, acc);
      tx.set(db.doc(`${ARCH.requests}/${id}`), Object.assign({}, o, { _archAt: ts(now()), _archCut: ctx.cutDay }));
      tx.delete(oRef); tx.set(db.doc(`syncDeletes/requests__${id}`), tomb("requests", id));
      txs.forEach((t) => {
        tx.set(db.doc(`${ARCH.walletTx}/${t.id}`), Object.assign({}, t.d, { _archAt: ts(now()), _archCut: ctx.cutDay }));
        tx.delete(db.doc(`walletTx/${t.id}`)); tx.set(db.doc(`syncDeletes/walletTx__${t.id}`), tomb("walletTx", t.id));
      });
      writeSide(tx, acc, side, 1, ctx.cutDay);
      return { tx: txs.length };
    });
  }
  /* حركات (محافظ أو خزنة) قديمة مش مربوطة بأمر شغال: مجموعات صغيرة في معاملة واحدة */
  async function archiveLoose(col, ids, ctx) {
    return db.runTransaction(async (tx) => {
      const snaps = await Promise.all(ids.map((id) => tx.get(db.doc(`${col}/${id}`))));
      const ok = [];
      snaps.forEach((s) => {
        if (!s.exists) return; const x = s.data() || {};
        if (col === "walletTx") { if (!txArchivable(x) || !(String(x.date || cairoDay(x.createdAt)) < ctx.cutDay)) return; const oid = txOrderId(x); if (oid && ctx.liveOrders.has(oid)) return; }
        else if (!trArchivable(x) || !(String(x.date || cairoDay(x.createdAt)) < ctx.cutDay)) return;
        ok.push({ id: s.id, d: x });
      });
      if (!ok.length) return 0;
      const acc = newAcc(); ok.forEach((t) => (col === "walletTx" ? txContrib : trContrib)(t.d, acc));
      const side = await readSide(tx, acc);
      ok.forEach((t) => {
        tx.set(db.doc(`${ARCH[col]}/${t.id}`), Object.assign({}, t.d, { _archAt: ts(now()), _archCut: ctx.cutDay }));
        tx.delete(db.doc(`${col}/${t.id}`)); tx.set(db.doc(`syncDeletes/${col}__${t.id}`), tomb(col, t.id));
      });
      writeSide(tx, acc, side, 1, ctx.cutDay);
      return ok.length;
    });
  }

  async function lease(owner) {
    const ref = db.doc(META);
    return db.runTransaction(async (tx) => {
      const s = await tx.get(ref), d = s.exists ? (s.data() || {}) : {};
      if (d.lockUntil && d.lockUntil > nowMs() && d.lockBy !== owner) return false;
      tx.set(ref, { lockUntil: nowMs() + LEASE_MS, lockBy: owner }, { merge: true });
      return true;
    });
  }

  /* ---------- التشغيل (كل ليلة أو «أرشف دلوقتي») ---------- */
  async function run(opts) {
    opts = opts || {};
    const started = nowMs(), budget = opts.budgetMs || 400000, owner = opts.by || "srv-" + started;
    const cfg = await readConfig();
    if (cfg.off && !opts.force) return { skipped: "off" };
    if (!(await lease(owner))) return { skipped: "busy" };
    const cutMs = cutoffOf(started, cfg.months), cutDay = cairoDay(cutMs);
    const out = { orders: 0, tx: 0, tr: 0, inbox: 0, held: {}, more: false, months: cfg.months, cutDay };
    const timeUp = () => nowMs() - started > budget;
    try {
      const [rSnap, wSnap, tSnap] = await Promise.all([db.collection("requests").get(), db.collection("walletTx").get(), db.collection("treasury").get()]);
      const orders = rSnap.docs.map((d) => Object.assign({}, d.data() || {}, { id: d.id }));
      const refOpen = new Set();
      orders.forEach((o) => { if (o.warrantyOf && o.closed !== true && o.status !== "ملغي") refOpen.add(String(o.warrantyOf)); });
      const txByOrder = new Map();
      wSnap.docs.forEach((d) => { const oid = txOrderId(d.data()); if (oid) { if (!txByOrder.has(oid)) txByOrder.set(oid, []); txByOrder.get(oid).push(d.id); } });
      const ctx = { now: started, cutMs, cutDay, refOpen, txByOrder, liveOrders: new Set(orders.map((o) => o.id)) };
      const due = orders.filter((o) => { const r = holdReason(o, ctx); if (r) out.held[r] = (out.held[r] || 0) + 1; return !r; }).sort((a, b) => closeMs(a) - closeMs(b));
      for (const o of due) {
        if (timeUp()) { out.more = true; break; }
        try { const r = await archiveOrder(o.id, ctx); if (r) { out.orders++; out.tx += r.tx; ctx.liveOrders.delete(o.id); } }
        catch (e) { log("archive order failed", o.id, e && e.message); }
      }
      if (!out.more) {
        const looseW = wSnap.docs.filter((d) => { const x = d.data() || {}; if (!txArchivable(x)) return false; const oid = txOrderId(x); if (oid && ctx.liveOrders.has(oid)) return false; return String(x.date || cairoDay(x.createdAt)) < cutDay; }).map((d) => d.id);
        const looseT = tSnap.docs.filter((d) => { const x = d.data() || {}; return trArchivable(x) && String(x.date || cairoDay(x.createdAt)) < cutDay; }).map((d) => d.id);
        for (const [col, ids] of [["walletTx", looseW], ["treasury", looseT]]) {
          for (let i = 0; i < ids.length; i += 80) {
            if (timeUp()) { out.more = true; break; }
            try { const n = await archiveLoose(col, ids.slice(i, i + 80), ctx); if (col === "walletTx") out.tx += n; else out.tr += n; }
            catch (e) { log("archive loose failed", col, e && e.message); }
          }
        }
      }
      if (!out.more && !timeUp()) { try { out.inbox = await cleanInbox(cutMs); } catch (e) { log("inbox cleanup failed", e && e.message); } }
      try { await healCarry(); } catch (e) { log("carry heal failed", e && e.message); }
      const changed = out.orders + out.tx + out.tr > 0;
      const st = await db.doc(META).get(), v = ((st.exists && st.data().v) || 0) + (changed ? 1 : 0);
      await db.doc(META).set({ lastRun: ts(now()), lastResult: { orders: out.orders, tx: out.tx, tr: out.tr, inbox: out.inbox, more: out.more, held: out.held }, months: cfg.months, cutDay, v, lockUntil: 0, lockBy: "" }, { merge: true });
      if (changed) await db.doc("settings/wf_meta").set({ ts: nowMs(), dev: "srv-archive" }, { merge: true }); // الأجهزة المفتوحة تسحب التغييرات
      return out;
    } catch (e) {
      try { await db.doc(META).set({ lockUntil: 0, lockBy: "", lastError: String((e && e.message) || e).slice(0, 300) }, { merge: true }); } catch (x) {}
      throw e;
    }
  }

  /* الحركات المُرحّلة لازم تساوي الإجماليات المحفوظة على السيرفر (لو نسخة قديمة اترفعت فوقها أو اتمسحت) */
  async function healCarry() {
    const t = await db.doc(TOT).get(); if (!t.exists) return 0;
    const tot = t.data() || {}, cut = tot.cutDay || "", fixes = [];
    for (const w of Object.keys(tot.w || {})) {
      const want = carryWalletDoc(w, tot.w[w] || 0, cut), s = await db.doc(`walletTx/${carryId(w)}`).get(), cur = s.exists ? s.data() : null;
      if (!cur || cur.deleted === true || r2(cur.amount) !== want.amount || cur.type !== want.type || walletKey(cur.wallet) !== want.wallet) fixes.push([`walletTx/${carryId(w)}`, want]);
    }
    if (tot.n && tot.n.tr) {
      const want = carryTreasuryDoc(tot.t || 0, cut), s = await db.doc("treasury/archive-carry").get(), cur = s.exists ? s.data() : null;
      if (!cur || cur.deleted === true || r2(cur.amount) !== want.amount || cur.type !== want.type) fixes.push(["treasury/archive-carry", want]);
    }
    for (const [p, d] of fixes) await db.doc(p).set(d);
    if (fixes.length) await db.doc("settings/wf_meta").set({ ts: nowMs(), dev: "srv-archive" }, { merge: true });
    return fixes.length;
  }

  /* الإشعارات القديمة اللي اتقرت (أقدم من مدة الأرشفة) بتتمسح */
  async function cleanInbox(cutMs) {
    if (!db.collection("inbox").listDocuments) return 0;
    const users = await db.collection("inbox").listDocuments(); let n = 0;
    for (const u of users) {
      const s = await u.collection("items").where("at", "<", cutMs).limit(400).get();
      const dead = s.docs.filter((d) => (d.data() || {}).read === true);
      if (!dead.length) continue;
      const b = db.batch(); dead.forEach((d) => b.delete(d.ref)); await b.commit(); n += dead.length;
    }
    return n;
  }

  /* ---------- الرجوع من الأرشيف ---------- */
  async function archivedTxIdsFor(orderId) {
    const ids = new Set([`order-deposit-${orderId}`, `order-final-${orderId}`]);
    const [a, b] = await Promise.all([
      db.collection(ARCH.walletTx).where("orderId", "==", orderId).get(),
      db.collection(ARCH.walletTx).where("refKey", "in", [`order-deposit-${orderId}`, `order-final-${orderId}`]).get()
    ]);
    a.docs.concat(b.docs).forEach((d) => ids.add(d.id));
    return [...ids];
  }
  /* col = requests | walletTx | treasury. بيرجّع { revived, tx } */
  async function revive(col, id) {
    if (!ARCH[col] || !id || /^archive-carry/.test(id)) return { revived: false };
    const txIds = col === "requests" ? await archivedTxIdsFor(id) : [];
    const res = await db.runTransaction(async (tx) => {
      const aRef = db.doc(`${ARCH[col]}/${id}`), lRef = db.doc(`${col}/${id}`);
      const [aSnap, lSnap] = await Promise.all([tx.get(aRef), tx.get(lRef)]);
      if (!aSnap.exists) return { revived: false };
      const rec = aSnap.data() || {}, acc = newAcc();
      let txs = [];
      if (col === "requests") {
        const pairs = await Promise.all(txIds.map((t) => Promise.all([tx.get(db.doc(`${ARCH.walletTx}/${t}`)), tx.get(db.doc(`walletTx/${t}`))])));
        txs = pairs.filter((p) => p[0].exists && txOrderId(p[0].data()) === id).map((p) => ({ id: p[0].id, d: p[0].data() || {}, live: p[1].exists }));
        orderContrib(rec, acc); txs.forEach((t) => txContrib(t.d, acc));
      } else if (col === "walletTx") txContrib(rec, acc); else trContrib(rec, acc);
      const side = await readSide(tx, acc);
      if (!lSnap.exists) tx.set(lRef, stripArch(rec)); // لو الجهاز رجّعه بنفسه (اتعدّل عليه) نسيب نسخته
      tx.delete(aRef);
      txs.forEach((t) => { if (!t.live) tx.set(db.doc(`walletTx/${t.id}`), stripArch(t.d)); tx.delete(db.doc(`${ARCH.walletTx}/${t.id}`)); });
      writeSide(tx, acc, side, -1, "");
      return { revived: true, tx: txs.length };
    });
    if (res.revived) {
      try { const st = await db.doc(META).get(); await db.doc(META).set({ v: ((st.exists && st.data().v) || 0) + 1 }, { merge: true }); } catch (e) {}
      try { await db.doc("settings/wf_meta").set({ ts: nowMs(), dev: "srv-archive" }, { merge: true }); } catch (e) {}
    }
    return res;
  }

  /* ---------- إعادة حساب كل الملخصات من مستندات الأرشيف نفسها (إصلاح / بعد استيراد نسخة) ---------- */
  async function rebuild() {
    const [r, w, t, oldSum, oldCust, tot0] = await Promise.all([db.collection(ARCH.requests).get(), db.collection(ARCH.walletTx).get(), db.collection(ARCH.treasury).get(), db.collection("archSum").get(), db.collection("archCust").get(), db.doc(TOT).get()]);
    const acc = newAcc();
    r.docs.forEach((d) => orderContrib(d.data() || {}, acc)); w.docs.forEach((d) => txContrib(d.data() || {}, acc)); t.docs.forEach((d) => trContrib(d.data() || {}, acc));
    const cut = (tot0.exists && tot0.data().cutDay) || "";
    const ops = [];
    const months = monthsOf(acc);
    months.forEach((m) => ops.push((b) => b.set(db.doc(`archSum/${m}`), { m, d: Object.fromEntries(Object.entries(acc.days).filter(([k]) => k.slice(0, 7) === m)), _ts: stamp() })));
    oldSum.docs.forEach((d) => { if (months.indexOf(d.id) < 0) ops.push((b) => b.delete(d.ref)); });
    Object.keys(acc.cust).forEach((c) => ops.push((b) => b.set(db.doc(`archCust/${c}`), Object.assign({}, acc.cust[c], { _ts: stamp() }))));
    oldCust.docs.forEach((d) => { if (!acc.cust[d.id]) ops.push((b) => b.delete(d.ref)); });
    const oldW = (tot0.exists && tot0.data().w) || {};
    const tot = { w: Object.assign({}, acc.w), t: acc.t, n: acc.n, cutDay: cut, _ts: stamp() };
    Object.keys(oldW).forEach((k) => { if (tot.w[k] === undefined) tot.w[k] = 0; }); // محفظة ماعادش ليها أرشيف: رصيدها المُرحّل يبقى صفر
    ops.push((b) => b.set(db.doc(TOT), tot));
    ops.push((b) => b.set(db.doc(NOS), { d: acc.nos, _ts: stamp() }));
    for (let i = 0; i < ops.length; i += 400) { const b = db.batch(); ops.slice(i, i + 400).forEach((f) => f(b)); await b.commit(); }
    const healed = await healCarry();
    const st = await db.doc(META).get();
    await db.doc(META).set({ v: ((st.exists && st.data().v) || 0) + 1, rebuiltAt: ts(now()) }, { merge: true });
    await db.doc("settings/wf_meta").set({ ts: nowMs(), dev: "srv-archive" }, { merge: true });
    return { orders: acc.n.orders, tx: acc.n.tx, tr: acc.n.tr, months: months.length, customers: Object.keys(acc.cust).length, healed };
  }

  /* ---------- استيراد أرشيف من نسخة احتياطية: بيضيف اللي مش موجود بس (لا في الشغال ولا في الأرشيف) ---------- */
  const ID_RE = /^[A-Za-z0-9_~.\-]{1,200}$/;
  async function importDocs(data) {
    let added = 0, skipped = 0;
    for (const col of Object.keys(ARCH)) {
      const list = Array.isArray(data && data[col]) ? data[col].slice(0, 500) : [];
      for (const item of list) {
        const id = item && String(item.id || ""), d = item && item.data;
        if (!ID_RE.test(id) || /^archive-carry/.test(id) || !d || typeof d !== "object" || Array.isArray(d)) { skipped++; continue; }
        const [a, l] = await Promise.all([db.doc(`${ARCH[col]}/${id}`).get(), db.doc(`${col}/${id}`).get()]);
        if (a.exists || l.exists) { skipped++; continue; }
        const clean = JSON.parse(JSON.stringify(d)); delete clean.id;
        await db.doc(`${ARCH[col]}/${id}`).set(Object.assign(clean, { _archAt: ts(now()), _archCut: String(clean._archCut || "") }));
        added++;
      }
    }
    return { added, skipped };
  }

  /* دمج عميلين مكررين: الأوامر والحركات المتأرشفة للعميل المكرر بتتنقل للعميل اللي فضل، وملخصه بيتضاف لملخصه */
  async function repointCustomer(dupId, keepId) {
    dupId = String(dupId || ""); keepId = String(keepId || "");
    if (!ID_RE.test(dupId) || !ID_RE.test(keepId) || dupId === keepId) return { orders: 0, tx: 0 };
    const [r, w, c1, c2] = await Promise.all([db.collection(ARCH.requests).where("customerId", "==", dupId).get(), db.collection(ARCH.walletTx).where("customerId", "==", dupId).get(), db.doc(`archCust/${dupId}`).get(), db.doc(`archCust/${keepId}`).get()]);
    const ops = [];
    r.docs.concat(w.docs).forEach((d) => ops.push((b) => b.update(d.ref, { customerId: keepId })));
    if (c1.exists) {
      const a = c1.data() || {}, merged = mergeCust(c2.exists ? c2.data() : null, { n: +a.n || 0, nc: +a.nc || 0, paid: +a.paid || 0, rev: +a.rev || 0, first: a.first || "", last: a.last || "" }, 1);
      ops.push((b) => b.set(db.doc(`archCust/${keepId}`), Object.assign(merged, { _ts: stamp() })));
      ops.push((b) => b.delete(db.doc(`archCust/${dupId}`)));
    }
    for (let i = 0; i < ops.length; i += 400) { const b = db.batch(); ops.slice(i, i + 400).forEach((f) => f(b)); await b.commit(); }
    if (ops.length) { const st = await db.doc(META).get(); await db.doc(META).set({ v: ((st.exists && st.data().v) || 0) + 1 }, { merge: true }); }
    return { orders: r.size, tx: w.size };
  }

  return { run, revive, rebuild, importDocs, healCarry, archiveOrder, cleanInbox, readConfig, repointCustomer };
}

module.exports = { createArchiver, holdReason, orderContrib, txContrib, trContrib, newAcc, mergeDays, mergeCust, mergeTotals, cairoDay, clampMonths, cutoffOf, carryId, txOrderId, txArchivable, trArchivable, ARCH, KEEP_TX_SRC, CARRY_CAT };
