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
function collectedOf(r) { return Math.max(0, r2(num(r.total) - num(r.deposit))); }

function createTechLedger(deps) {
  const { db, now = () => new Date(), ts = (d) => d, log = () => {} } = deps;

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
    if (tx) tx.set(ref, v); else return ref.set(v);
  }
  function finalTx(order, wallet, amount, when, existing) {
    const base = existing && typeof existing === "object" ? Object.assign({}, existing) : {};
    ["userDeleted", "deletedAmount", "deletedWallet", "deletedAt"].forEach((k) => { delete base[k]; });
    return Object.assign(base, {
      refKey: `order-final-${order.id}`, manualOverride: false, deleted: false, type: "in", amount, wallet,
      category: "تحصيل عميل", reason: `💳 تحصيل نهائي أمر الشغل ${order.no || ""}`, note: base.note || "",
      date: when.date, time: when.time, source: "order-link", createdAt: base.createdAt || ts(now()), byServer: true
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
    if (data && DATE_RE.test(String(data.date || "")) && TIME_RE.test(String(data.time || ""))) when = { date: String(data.date), time: String(data.time) };
    const wc = g.warranty || {};

    const ref = db.doc(`requests/${orderId}`);
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AdminError("not-found", "no_order");
      const r = Object.assign({ id: orderId }, snap.data());
      if (r.techId !== uid) throw new AdminError("permission-denied", "not_your_order");
      if (r.closed === true || r.paid === true) throw new AdminError("failed-precondition", "already_closed");
      if (r.status !== "مكتمل") throw new AdminError("failed-precondition", "not_completed");
      const total = num(r.total), deposit = num(r.deposit);
      if (!isFinite(total) || total < 0 || !isFinite(deposit) || deposit < 0) throw new AdminError("failed-precondition", "bad_amounts");
      if (deposit > total + 0.001) throw new AdminError("failed-precondition", "deposit_over_total");
      if (data && data.expectTotal != null && Math.abs(r2(data.expectTotal) - r2(total)) > 0.005) throw new AdminError("aborted", "stale_total");
      if (data && data.expectDeposit != null && Math.abs(r2(data.expectDeposit) - r2(deposit)) > 0.005) throw new AdminError("aborted", "stale_total");
      const collected = collectedOf(r);
      if (collected > 0 && !wallet) throw new AdminError("failed-precondition", "wallet_required");
      if (wallet && !allowed.has(wallet)) throw new AdminError("invalid-argument", "bad_wallet");
      const txRef = db.doc(`walletTx/order-final-${orderId}`);
      const txSnap = collected > 0 ? await tx.get(txRef) : null;

      const at = now().toISOString();
      const patch = { paid: true, remain: 0, paidAt: at, closed: true, closedAt: at, closeWallet: wallet, closedByTech: uid };
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
        status: r.status || "", total: r2(r.total), deposit: r2(r.deposit), collected: r.paid ? collectedOf(r) : 0, wallet: String(r.closeWallet || ""), closedAt: iso(r.closedAt || r.paidAt), byTech: r.closedByTech === target };
    });

    const eSnap = await db.collection("techExpenses").where("techId", "==", target).get();
    const expenses = eSnap.docs.map((d) => { const x = d.data() || {}; return { id: d.id, amount: r2(x.amount), note: String(x.note || ""), status: String(x.status || ""), orderNo: String(x.orderNo || ""), at: iso(x.at), decisionNote: String(x.decisionNote || "") }; })
      .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 80);

    const month = cairoParts(now()).date.slice(0, 7);
    const inMonth = (v) => { const s = iso(v); if (!s) return false; return cairoParts(new Date(s)).date.slice(0, 7) === month; };
    const monthClosed = closed.filter((r) => inMonth(r.closedAt || r.paidAt));
    const stats = {
      open: open.length, closedTotal: closed.length, closedMonth: monthClosed.length,
      collectedMonth: r2(monthClosed.reduce((a, r) => a + (r.paid ? collectedOf(r) : 0), 0)),
      laborMonth: r2(monthClosed.reduce((a, r) => a + num(r.labor), 0)),
      pendingExpenses: r2(expenses.filter((e) => e.status === "pending").reduce((a, e) => a + e.amount, 0))
    };
    return { uid: target, name: String(staff.name || ""), wallet, balance, entries, history, expenses, stats, healed: healed.length, at: now().toISOString() };
  }

  return { closeOrder, account, _cairoParts: cairoParts };
}

module.exports = { createTechLedger };
