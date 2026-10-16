"use strict";
/* notify.js — الإشعارات الداخلية للنظام (للفني، للإدارة، وللعميل في البوابة).
   كل إشعار بيتولّد على السيرفر من التغيير نفسه في البيانات (Firestore triggers في index.js)،
   فمحدش يقدر يزوّر إشعار، والإشعار بيوصل حتى لو الجهاز اللي عمل الحركة قفل على طول.
   - التخزين: inbox/{uid}/items/{id} — صندوق لكل مستخدم (موظف أو عميل). الإعلانات العامة للعملاء: inbox/_customers/items.
   - التكرار: معرّف الإشعار ثابت من الحدث نفسه (الـ trigger ممكن يتنفّذ مرتين) فمابيتكررش.
   - الكتم: notifPrefs/{uid}.mute = أنواع المستخدم قافلها.
   - الدفع (Push): بعد الكتابة بنبعت إشعار للموبايل/الكمبيوتر على كل اشتراكات المستخدم (pushSubs) لو مفعّلة.
   منطق صرف من غير firebase-functions عشان يتختبر بـ mock. */
const core = require("./roles-core");

const MAX_ITEMS = 150, BROADCAST = "_customers";

/* أنواع الإشعارات: aud = لمين (tech فني / admin إدارة / customer عميل). label بيظهر في إعدادات الإشعارات. */
const KINDS = {
  assigned: { aud: "tech", label: "اتعين ليك أمر جديد" },
  unassigned: { aud: "tech", label: "أمر اتنقل من عندك" },
  visit_changed: { aud: "tech", label: "ميعاد أمر بتاعك اتغيّر" },
  order_cancelled: { aud: "tech", label: "أمر بتاعك اتلغى" },
  expense_decided: { aud: "tech", label: "مصروفك اتوافق عليه / اترفض" },
  custody: { aud: "tech", label: "عهدتك: إيداع أو تسوية" },
  pay_paid: { aud: "tech", label: "اتصرفلك أجرة" },
  tech_closed: { aud: "admin", perm: "requests.assign", label: "فني قفل أمر" },
  tech_status: { aud: "admin", perm: "requests.assign", label: "فني غيّر حالة أمر" },
  tech_deposit: { aud: "admin", perm: "requests.assign", label: "فني استلم عربون / دفعة" },
  tech_part: { aud: "admin", perm: "inventory.view", label: "فني صرف / رجّع قطعة من المخزن" },
  pay_due: { aud: "admin", perm: "techpay.manage", label: "مستحقات فني على أمر" },
  expense_new: { aud: "admin", perm: "custody.approve", label: "فني طلب اعتماد مصروف" },
  low_stock: { aud: "admin", perm: "inventory.add", label: "صنف وصل للحد الأدنى" },
  portal_request: { aud: "admin", perm: "portal.manage", label: "طلب صيانة جديد من البوابة" },
  guest_request: { aud: "admin", perm: "portal.manage", label: "طلب من زائر" },
  complaint_new: { aud: "admin", perm: "portal.manage", label: "شكوى جديدة" },
  question_new: { aud: "admin", perm: "portal.manage", label: "سؤال جديد من عميل" },
  c_status: { aud: "customer", label: "حالة طلبك اتغيّرت" },
  c_visit: { aud: "customer", label: "ميعاد الزيارة" },
  c_tech: { aud: "customer", label: "الفني اللي هيتابع طلبك" },
  c_reply: { aud: "customer", label: "رد على شكوتك" },
  c_answer: { aud: "customer", label: "رد على سؤالك" },
  c_post: { aud: "customer", label: "مقالات وعروض جديدة" },
  // مجدولة (بتتبعت في ميعاد) + رسائل الإدارة
  visit_reminder: { aud: "tech", label: "تذكير قبل ميعاد الزيارة" },
  visit_missed: { aud: "tech", label: "أمر بتاعك عدّى ميعاده ولسه مفتوح" },
  admin_msg: { aud: "staff", label: "رسالة من الإدارة", noMute: true },
  overdue_order: { aud: "admin", perm: "requests.assign", label: "أمر عدّى ميعاده ولسه ماتقفلش" },
  morning_digest: { aud: "admin", perm: "requests.view", label: "ملخص الصبح" },
  custody_high: { aud: "admin", perm: "custody.settle", label: "عهدة فني عدّت الحد" },
  usage_high: { aud: "admin", perm: "__owner__", label: "الاستهلاك قرّب من الحد المجاني" },
  c_feedback: { aud: "customer", label: "رأيك بعد التصليح" },
  c_warranty: { aud: "customer", label: "الضمان قرب يخلص" }
};
/* إعدادات المالك للنظام كله (notifConfig/global): off = أنواع مقفولة لكل الناس + أرقام التذكيرات */
const CONFIG_DEFAULTS = { off: [], remindMin: 60, overdueHours: 3, digestHour: 8, custodyMax: 5000, feedbackDays: 2, warrantyDays: 3 };
function cleanConfig(c) {
  c = c && typeof c === "object" ? c : {};
  const n = (v, lo, hi, def) => { v = Math.round(+v); return isFinite(v) && v >= lo && v <= hi ? v : def; };
  return {
    off: (Array.isArray(c.off) ? c.off : []).filter((k) => KINDS[k]),
    remindMin: n(c.remindMin, 10, 1440, CONFIG_DEFAULTS.remindMin), overdueHours: n(c.overdueHours, 1, 72, CONFIG_DEFAULTS.overdueHours),
    digestHour: n(c.digestHour, 0, 23, CONFIG_DEFAULTS.digestHour), custodyMax: n(c.custodyMax, 0, 100000000, CONFIG_DEFAULTS.custodyMax),
    feedbackDays: n(c.feedbackDays, 1, 30, CONFIG_DEFAULTS.feedbackDays), warrantyDays: n(c.warrantyDays, 1, 60, CONFIG_DEFAULTS.warrantyDays)
  };
}
/* وقت مصر «YYYY-MM-DDTHH:mm» (نفس شكل ميعاد الزيارة المتخزن) */
function cairoLocal(d) {
  try {
    const p = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).forEach((x) => { p[x.type] = x.value; });
    return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
  } catch (e) { return d.toISOString().slice(0, 16); }
}

function r2(n) { return Math.round((+n || 0) * 100) / 100; }
function money(n) { const v = r2(n); return (Number.isInteger(v) ? String(v) : v.toFixed(2)) + " ج"; }
function str(v, max) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max || 160); }
function keyId(k) { return String(k).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 140); }
/* ميعاد الزيارة بيتخزن «2026-10-15T14:30» (توقيت مصر من غير منطقة) */
function fmtVisit(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(v || ""));
  if (!m) return str(v, 40);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  let out;
  try { out = d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }); } catch (e) { out = `${m[3]}/${m[2]}`; }
  if (m[4] != null) { let h = +m[4]; const ap = h >= 12 ? "م" : "ص"; h = h % 12 || 12; out += ` الساعة ${h}:${m[5]} ${ap}`; }
  return out;
}
const STATUS_MSG = {
  "جاري التنفيذ": ["🔧 بدأنا الشغل على جهازك", "الفني شغال على طلبك دلوقتي."],
  "مكتمل": ["✅ طلبك خلص", "الشغل على جهازك خلص."],
  "ملغي": ["❌ الطلب اتلغى", "لو عندك أي استفسار كلّم الورشة."],
  "مجمد": ["⏸️ الطلب متوقف مؤقتًا", "هنكمّل أول ما المشكلة تتحل، وهنبلّغك."],
  "جديد": ["📝 طلبك اتسجل", "هنحدد معاك ميعاد قريب."]
};

function createNotifier(deps) {
  const { db, now = () => new Date(), push = async () => {}, log = () => {} } = deps;

  /* ---------- المستلمين ---------- */
  let staffCache = null, staffAt = 0;
  async function staffAll() {
    const t = now().getTime();
    if (staffCache && t - staffAt < 60000) return staffCache;
    const [snap, cfgSnap] = await Promise.all([db.collection("staff").get(), db.doc("accessConfig/roles").get()]);
    const cfg = cfgSnap.exists ? core.normalizeConfig(cfgSnap.data()) : core.defaultConfig();
    const list = [];
    snap.docs.forEach((d) => {
      const s = d.data() || {};
      if (s.disabled === true) return;
      const perms = {}; core.effectivePerms(cfg, s).forEach((k) => { perms[k] = 1; });
      list.push({ uid: d.id, name: str(s.name, 60), wallet: str(s.wallet, 80), scope: s.sc === "a" ? "assigned" : core.scopeOf(cfg, s), owner: core.isOwner(cfg, s), perms });
    });
    staffCache = list; staffAt = t;
    return list;
  }
  async function admins(perm, exceptUid) {
    return (await staffAll()).filter((s) => s.scope !== "assigned" && (s.owner || !perm || s.perms[perm]) && s.uid !== exceptUid).map((s) => s.uid);
  }
  async function staffByUid(uid) { return (await staffAll()).find((s) => s.uid === uid) || null; }
  async function staffByWallet(w) { w = str(w, 80); return w ? (await staffAll()).find((s) => s.wallet === w) || null : null; }
  async function customerUids(customerId) {
    if (!customerId) return [];
    const out = new Set();
    const links = await db.collection("portalLinks").where("customerId", "==", customerId).get();
    links.docs.forEach((d) => { const x = d.data() || {}; if (x.disabled !== true) out.add(d.id); });
    if (!out.size) {
      const c = await db.doc(`customers/${customerId}`).get();
      if (c.exists && (c.data() || {}).portal === true) out.add(customerId);
    }
    return [...out];
  }
  function recent(v, hours) { const t = v && typeof v.toMillis === "function" ? v.toMillis() : Date.parse(v); return isFinite(t) && now().getTime() - t < hours * 3600000; }
  async function docData(path) { try { const s = await db.doc(path).get(); return s.exists ? (s.data() || {}) : null; } catch (e) { return null; } }
  async function custName(id) { const c = id ? await docData(`customers/${id}`) : null; return c ? str(c.name, 60) : ""; }

  /* ---------- إعدادات المالك ---------- */
  let cfgCache = null, cfgAt = 0;
  async function config() {
    const t = now().getTime();
    if (cfgCache && t - cfgAt < 60000) return cfgCache;
    cfgCache = cleanConfig(await docData("notifConfig/global")); cfgAt = t;
    return cfgCache;
  }

  /* ---------- التسليم ---------- */
  const prefsCache = new Map();
  async function muted(uid, kind) {
    if (!prefsCache.has(uid)) { const p = await docData(`notifPrefs/${uid}`); prefsCache.set(uid, p && Array.isArray(p.mute) ? p.mute : []); }
    return prefsCache.get(uid).indexOf(kind) > -1;
  }
  /* n = { kind, key, title, body, link, refId } */
  async function deliver(uids, n) {
    uids = [...new Set((uids || []).filter(Boolean))];
    const sent = [];
    if (KINDS[n.kind] && (await config()).off.indexOf(n.kind) > -1) return sent; // النوع مقفول من المالك للنظام كله
    for (const uid of uids) {
      if (uid !== BROADCAST && !(KINDS[n.kind] && KINDS[n.kind].noMute) && await muted(uid, n.kind)) continue;
      const id = keyId(n.key + (uid === BROADCAST ? "" : ""));
      const ref = db.doc(`inbox/${uid}/items/${id}`);
      const exists = await ref.get();
      if (exists.exists) continue; // نفس الحدث اتبعت قبل كده
      const item = { kind: n.kind, title: str(n.title, 120), body: str(n.body, 300), link: str(n.link, 300), refId: str(n.refId, 120), at: now().getTime(), read: false };
      await ref.set(item);
      sent.push(uid);
      if (uid !== BROADCAST) {
        try { await push(uid, { title: item.title, body: item.body, link: item.link, tag: n.kind + "-" + (item.refId || id) }); } catch (e) { log("push failed", uid, e && e.message); }
        if (Math.random() < 0.08) trim(uid).catch(() => {});
      }
    }
    return sent;
  }
  async function trim(uid) {
    const snap = await db.collection(`inbox/${uid}/items`).orderBy("at", "desc").offset(MAX_ITEMS).limit(100).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  /* ---------- أوامر الشغل ---------- */
  async function onRequestWrite(id, before, after, actor) {
    if (!after) return [];
    const b = before || {}, a = after, no = str(a.no, 30) || "بدون رقم", out = [];
    const isNew = !before;
    let cn = null; const cname = async () => (cn == null ? (cn = await custName(a.customerId)) : cn);
    const tech = a.techId ? await staffByUid(a.techId) : null, techName = str(a.techName, 60) || (tech && tech.name) || "الفني";

    // ----- للفني -----
    // أوامر قديمة بتترفع لأول مرة (أول مزامنة لجهاز) مابتعملش إشعارات: التعيين لازم يكون حديث
    const fresh = !isNew || recent(a.assignedAt || a.createdAt, 48);
    if (a.techId && a.techId !== b.techId && a.closed !== true && a.status !== "ملغي" && fresh) {
      const c = await cname();
      out.push(deliver([a.techId], { kind: "assigned", key: `assigned-${id}-${a.techId}-${str(a.assignedAt, 40)}`, refId: id, link: `tech.html?id=${encodeURIComponent(id)}`,
        title: `🛠️ اتعين ليك أمر ${no}`, body: [c, str(a.fault, 80), a.visit ? "📅 " + fmtVisit(a.visit) : ""].filter(Boolean).join(" • ") }));
    }
    if (b.techId && b.techId !== a.techId && b.closed !== true && !isNew) {
      out.push(deliver([b.techId], { kind: "unassigned", key: `unassigned-${id}-${b.techId}-${str(a.assignedAt || now().getTime(), 40)}`, refId: id, link: "tech.html",
        title: `↩️ الأمر ${no} اتنقل من عندك`, body: a.techId ? `اتعين عليه ${techName}.` : "الإدارة شالت التعيين." }));
    }
    if (!isNew && a.techId && a.techId === b.techId && a.closed !== true && a.visit && a.visit !== b.visit && actor !== a.techId) {
      out.push(deliver([a.techId], { kind: "visit_changed", key: `visit-${id}-${a.visit}`, refId: id, link: `tech.html?id=${encodeURIComponent(id)}`,
        title: `📅 ميعاد الأمر ${no} اتغيّر`, body: `الميعاد الجديد: ${fmtVisit(a.visit)}${(await cname()) ? " • " + cn : ""}` }));
    }
    if (!isNew && a.status === "ملغي" && b.status !== "ملغي" && a.techId && actor !== a.techId) {
      out.push(deliver([a.techId], { kind: "order_cancelled", key: `cancel-${id}`, refId: id, link: "tech.html",
        title: `❌ الأمر ${no} اتلغى`, body: [await cname(), str(a.cancelReason, 100)].filter(Boolean).join(" • ") }));
    }

    // ----- للإدارة -----
    if (!isNew && a.closed === true && b.closed !== true && a.closedByTech) {
      const got = Math.max(0, r2((+a.total || 0) - (+a.deposit || 0)));
      out.push(deliver(await admins(KINDS.tech_closed.perm, a.techId), { kind: "tech_closed", key: `closed-${id}`, refId: id, link: `request.html?id=${encodeURIComponent(id)}`,
        title: `✅ ${techName} قفل الأمر ${no}`, body: [await cname(), `الإجمالي ${money(a.total)}`, got ? `حصّل ${money(got)}${a.closeWallet ? " في «" + str(a.closeWallet, 40) + "»" : ""}` : ""].filter(Boolean).join(" • ") }));
      if ((+a.techPay || 0) > 0) {
        out.push(deliver(await admins(KINDS.pay_due.perm, a.techId), { kind: "pay_due", key: `paydue-${id}`, refId: id, link: `custody.html#tech-${encodeURIComponent(a.techId)}`,
          title: `💰 ${techName} ليه ${money(a.techPay)} أجرة`, body: `على الأمر ${no}${(await cname()) ? " — " + cn : ""}` }));
      }
    } else if (!isNew && a.status !== b.status && a.status !== "ملغي" && a.techId && actor === a.techId) {
      out.push(deliver(await admins(KINDS.tech_status.perm, a.techId), { kind: "tech_status", key: `status-${id}-${str(a.status, 20)}-${(Array.isArray(a.statusHistory) ? a.statusHistory.length : 0)}`, refId: id, link: `request.html?id=${encodeURIComponent(id)}`,
        title: `🔧 ${techName}: الأمر ${no} بقى «${str(a.status, 20)}»`, body: [await cname(), str(a.fault, 80)].filter(Boolean).join(" • ") }));
    }

    // ----- للعميل (لو ليه حساب على البوابة والأمر ظاهر له) -----
    if (!isNew && a.portalVis !== false && a.customerId) {
      const cust = [];
      if (a.status !== b.status && STATUS_MSG[a.status]) {
        const [t, body] = STATUS_MSG[a.status];
        cust.push({ kind: "c_status", key: `cstatus-${id}-${str(a.status, 20)}-${(Array.isArray(a.statusHistory) ? a.statusHistory.length : 0)}`, title: `${t} (${no})`, body });
      }
      if (a.visit && a.visit !== b.visit && a.closed !== true && a.status !== "ملغي") {
        cust.push({ kind: "c_visit", key: `cvisit-${id}-${a.visit}`, title: `📅 ميعاد الزيارة (${no})`, body: fmtVisit(a.visit) });
      }
      if (a.techId && a.techId !== b.techId && a.closed !== true && a.status !== "ملغي") {
        cust.push({ kind: "c_tech", key: `ctech-${id}-${a.techId}`, title: `👷 ${techName} هو اللي هيتابع طلبك (${no})`, body: "هيتواصل معاك قبل ما ييجي." });
      }
      if (cust.length) {
        const uids = await customerUids(a.customerId);
        cust.forEach((n) => out.push(deliver(uids, Object.assign({ refId: id, link: `portal.html?o=${encodeURIComponent(id)}` }, n))));
      }
    }
    return Promise.all(out);
  }

  /* ---------- مصروفات الفني ---------- */
  async function onExpenseWrite(id, before, after) {
    if (!after) return [];
    const e = after, who = str(e.techName, 60) || "فني";
    if (!before) {
      return deliver(await admins(KINDS.expense_new.perm, e.techId), { kind: "expense_new", key: `exp-${id}`, refId: id, link: `custody.html#exp-${encodeURIComponent(id)}`,
        title: `🧾 ${who} طلب اعتماد مصروف ${money(e.amount)}`, body: [str(e.note, 120), e.orderNo ? "أمر " + str(e.orderNo, 30) : ""].filter(Boolean).join(" • ") });
    }
    if (before.status === "pending" && (e.status === "approved" || e.status === "rejected") && e.techId) {
      const ok = e.status === "approved";
      return deliver([e.techId], { kind: "expense_decided", key: `expd-${id}-${e.status}`, refId: id, link: `tech.html?tab=account#exp-${encodeURIComponent(id)}`,
        title: ok ? `✅ مصروفك ${money(e.amount)} اتوافق عليه` : `❌ مصروفك ${money(e.amount)} اترفض`, body: [str(e.note, 100), e.decisionNote ? "📝 " + str(e.decisionNote, 120) : ""].filter(Boolean).join(" • ") });
    }
    return [];
  }

  /* ---------- حركات المحافظ: عهدة، أجور، عربون من الفني ---------- */
  async function onWalletTxCreate(id, t) {
    const r = await walletTxMain(id, t);
    try { await custodyCheck(t); } catch (e) { log("custody check", e && e.message); }
    return r;
  }
  /* عهدة الفني عدّت الحد اللي المالك حدده: تنبيه للإدارة (مرة في اليوم لكل فني) */
  async function custodyCheck(t) {
    if (!t || t.deleted === true || !t.wallet) return [];
    const cfg = await config();
    if (!(cfg.custodyMax > 0) || cfg.off.indexOf("custody_high") > -1) return [];
    const tech = await staffByWallet(t.wallet);
    if (!tech || tech.scope !== "assigned") return [];
    const snap = await db.collection("walletTx").where("wallet", "==", tech.wallet).get();
    let bal = 0; snap.docs.forEach((d) => { const x = d.data() || {}; if (x.deleted === true) return; bal += (x.type === "out" ? -1 : 1) * (+x.amount || 0); });
    bal = r2(bal);
    if (bal <= cfg.custodyMax) return [];
    return deliver(await admins(KINDS.custody_high.perm, tech.uid), { kind: "custody_high", key: `custodyhigh-${tech.uid}-${cairoLocal(now()).slice(0, 10)}`, refId: tech.uid, link: `custody.html#tech-${encodeURIComponent(tech.uid)}`,
      title: `💼 عهدة ${tech.name} وصلت ${money(bal)}`, body: `أكتر من الحد (${money(cfg.custodyMax)}). محتاجة تسوية.` });
  }
  async function walletTxMain(id, t) {
    if (!t || t.deleted === true) return [];
    if (t.source === "custody") {
      const tech = await staffByWallet(t.wallet);
      if (!tech) return [];
      const inn = t.type === "in";
      return deliver([tech.uid], { kind: "custody", key: `custody-${id}`, refId: id, link: `tech.html?tab=account#tx-${encodeURIComponent(id)}`,
        title: inn ? `💵 اتسلّمت عهدة ${money(t.amount)}` : `🤝 تسوية عهدة: اتسلّم منك ${money(t.amount)} للورشة`, body: str(t.note, 120) || str(t.reason, 120) });
    }
    if (t.source === "techpay" && t.techPayFor) {
      return deliver([t.techPayFor], { kind: "pay_paid", key: `paid-${id}`, refId: id, link: "tech.html?tab=account",
        title: `💰 اتصرفلك ${money(t.amount)} أجرة`, body: str(t.note, 120) || "من الورشة" });
    }
    if (t.byTech && t.orderId && t.type === "in" && t.source === "order-part") {
      const tech = await staffByUid(t.byTech);
      return deliver(await admins(KINDS.tech_deposit.perm, t.byTech), { kind: "tech_deposit", key: `dep-${id}`, refId: t.orderId, link: t.wallet ? `wallet.html?type=wallet&name=${encodeURIComponent(t.wallet)}#tx-${encodeURIComponent(id)}` : `request.html?id=${encodeURIComponent(t.orderId)}`,
        title: `💵 ${(tech && tech.name) || "فني"} استلم ${money(t.amount)}`, body: str(t.reason, 140) + (t.wallet ? ` • في «${str(t.wallet, 40)}»` : "") });
    }
    return [];
  }

  /* ---------- المخزن ---------- */
  async function onPartMoveCreate(id, m) {
    if (!m || !m.byTech || !m.partId) return [];
    const [tech, part, order] = await Promise.all([staffByUid(m.byTech), docData(`parts/${m.partId}`), m.requestId ? docData(`requests/${m.requestId}`) : null]);
    const back = /إرجاع/.test(String(m.type || ""));
    return deliver(await admins(KINDS.tech_part.perm, m.byTech), { kind: "tech_part", key: `pmove-${id}`, refId: m.partId, link: `part.html?id=${encodeURIComponent(m.partId)}`,
      title: `${back ? "↩️" : "🔩"} ${(tech && tech.name) || "فني"} ${back ? "رجّع" : "صرف"} ${+m.qty || 0} × ${(part && str(part.name, 60)) || "قطعة"}`,
      body: [order && order.no ? `أمر ${str(order.no, 30)}` : "", part ? `فاضل في المخزن ${+part.qty || 0}` : ""].filter(Boolean).join(" • ") });
  }
  async function onPartUpdate(id, before, after) {
    if (!before || !after || after.archived) return [];
    const min = +after.min || 0, bq = +before.qty || 0, aq = +after.qty || 0;
    if (!(bq > min && aq <= min)) return [];
    return deliver(await admins(KINDS.low_stock.perm), { kind: "low_stock", key: `low-${id}-${aq}-${Math.floor(now().getTime() / 3600000)}`, refId: id, link: `part.html?id=${encodeURIComponent(id)}`,
      title: aq <= 0 ? `📉 ${str(after.name, 60)} خلص من المخزن` : `📉 ${str(after.name, 60)} قرب يخلص — فاضل ${aq}`, body: `الحد الأدنى ${min}. ضيفه لطلبية المورد.` });
  }

  /* ---------- البوابة ---------- */
  async function onPortalRequestCreate(id, r) {
    const c = await custName(r && r.customerId);
    return deliver(await admins(KINDS.portal_request.perm), { kind: "portal_request", key: `preq-${id}`, refId: id, link: "portal-admin.html?tab=or",
      title: `📥 طلب صيانة جديد${c ? " من " + c : ""}`, body: [str(r && r.fault, 140), r && r.visit ? "📅 " + fmtVisit(r.visit) : ""].filter(Boolean).join(" • ") });
  }
  async function onGuestRequestCreate(id, g) {
    return deliver(await admins(KINDS.guest_request.perm), { kind: "guest_request", key: `guest-${id}`, refId: id, link: "portal-admin.html?tab=gu",
      title: `📥 طلب زائر: ${str(g && g.name, 60)}`, body: [str(g && g.deviceType, 40), str(g && g.fault, 120), str(g && g.center, 40)].filter(Boolean).join(" • ") });
  }
  async function onComplaintWrite(id, before, after) {
    if (!after) return [];
    if (!before) {
      const c = await custName(after.customerId);
      return deliver(await admins(KINDS.complaint_new.perm), { kind: "complaint_new", key: `comp-${id}`, refId: id, link: "portal-admin.html?tab=cp",
        title: `⚠️ شكوى جديدة${c ? " من " + c : ""}${after.orderNo ? " (أمر " + str(after.orderNo, 30) + ")" : ""}`, body: str(after.text, 200) });
    }
    if (!str(before.reply) && str(after.reply)) {
      return deliver(await customerUids(after.customerId), { kind: "c_reply", key: `creply-${id}`, refId: id, link: "portal.html",
        title: "💬 الورشة ردّت على شكوتك", body: str(after.reply, 200) });
    }
    return [];
  }
  async function onQuestionWrite(id, before, after) {
    if (!after) return [];
    if (!before) {
      return deliver(await admins(KINDS.question_new.perm), { kind: "question_new", key: `q-${id}`, refId: id, link: "portal-admin.html?tab=q",
        title: `❓ سؤال جديد من ${str(after.customerName, 60) || "عميل"}`, body: str(after.text, 200) });
    }
    if (!str(before.answer) && str(after.answer)) {
      return deliver(await customerUids(after.customerId), { kind: "c_answer", key: `cans-${id}`, refId: id, link: "portal.html",
        title: "💬 الورشة ردّت على سؤالك", body: str(after.answer, 200) });
    }
    return [];
  }
  async function onPostWrite(id, before, after) {
    if (!after || after.published !== true || (before && before.published === true)) return [];
    return deliver([BROADCAST], { kind: "c_post", key: `post-${id}`, refId: id, link: "portal.html#tips",
      title: `📰 ${str(after.title, 100) || "مقال جديد"}`, body: str(after.category, 40) || "من الورشة" });
  }

  /* ---------- رسالة من الإدارة لفني أو لكل الفنيين أو لكل الموظفين ---------- */
  async function sendMessage(fromUid, d) {
    const me = await staffByUid(fromUid);
    if (!me || me.scope === "assigned" || !(me.owner || me.perms["requests.assign"])) { const e = new Error("no_permission"); e.code = "permission-denied"; throw e; }
    const title = str(d && d.title, 80), body = str(d && d.body, 400), to = String((d && d.to) || "");
    if (!title && !body) { const e = new Error("empty"); e.code = "invalid-argument"; throw e; }
    const all = await staffAll();
    let uids = to === "techs" ? all.filter((s) => s.scope === "assigned").map((s) => s.uid) : to === "staff" ? all.map((s) => s.uid) : all.filter((s) => s.uid === to).map((s) => s.uid);
    uids = uids.filter((u) => u !== fromUid);
    if (!uids.length) { const e = new Error("no_recipients"); e.code = "not-found"; throw e; }
    const t = now().getTime();
    const sent = await deliver(uids, { kind: "admin_msg", key: `msg-${fromUid}-${t}`, refId: fromUid, link: "",
      title: `✉️ ${me.name || "الإدارة"}: ${title || "رسالة"}`, body });
    return { sent: sent.length };
  }

  /* ---------- المجدولة: بتشتغل كل ربع ساعة ---------- */
  async function tick() {
    const cfg = await config(), t = now(), out = { reminders: 0, overdue: 0, digest: 0, feedback: 0, warranty: 0 };
    const isOpen = (r) => r && r.closed !== true && r.status !== "ملغي" && r.status !== "مكتمل" && r.status !== "مجمد";
    const custOrders = new Map();
    // 1) تذكير الفني قبل الزيارة
    if (cfg.off.indexOf("visit_reminder") < 0) {
      const from = cairoLocal(new Date(t.getTime() + (cfg.remindMin - 15) * 60000)), to = cairoLocal(new Date(t.getTime() + cfg.remindMin * 60000));
      const snap = await db.collection("requests").where("visit", ">", from).where("visit", "<=", to).get();
      for (const doc of snap.docs) {
        const r = doc.data() || {};
        if (!isOpen(r) || !r.techId) continue;
        const c = await custName(r.customerId);
        out.reminders += (await deliver([r.techId], { kind: "visit_reminder", key: `remind-${doc.id}-${r.visit}`, refId: doc.id, link: `tech.html?id=${encodeURIComponent(doc.id)}`,
          title: `⏰ عندك زيارة ${fmtVisit(r.visit).replace(/^.*الساعة /, "الساعة ")}`, body: [c, str(r.fault, 80), `أمر ${str(r.no, 30)}`].filter(Boolean).join(" • ") })).length;
      }
    }
    // 2) أوامر عدّت ميعادها ولسه مفتوحة (آخر يومين)
    if (cfg.off.indexOf("overdue_order") < 0 || cfg.off.indexOf("visit_missed") < 0) {
      const from = cairoLocal(new Date(t.getTime() - 48 * 3600000)), to = cairoLocal(new Date(t.getTime() - cfg.overdueHours * 3600000));
      const snap = await db.collection("requests").where("visit", ">", from).where("visit", "<=", to).get();
      for (const doc of snap.docs) {
        const r = doc.data() || {};
        if (!isOpen(r)) continue;
        const c = await custName(r.customerId), who = str(r.techName, 40);
        const n = await deliver(await admins(KINDS.overdue_order.perm, r.techId), { kind: "overdue_order", key: `overdue-${doc.id}-${r.visit}`, refId: doc.id, link: `request.html?id=${encodeURIComponent(doc.id)}`,
          title: `⏳ الأمر ${str(r.no, 30)} عدّى ميعاده ولسه ماتقفلش`, body: [c, "كان " + fmtVisit(r.visit), who ? "👷 " + who : "مش متعيّن لفني"].filter(Boolean).join(" • ") });
        if (r.techId) await deliver([r.techId], { kind: "visit_missed", key: `missed-${doc.id}-${r.visit}`, refId: doc.id, link: `tech.html?id=${encodeURIComponent(doc.id)}`,
          title: `⏳ الأمر ${str(r.no, 30)} عدّى ميعاده`, body: [c, "كان " + fmtVisit(r.visit), "حدّث حالته أو كلّم الإدارة"].filter(Boolean).join(" • ") });
        out.overdue += n.length;
      }
    }
    // 2.5) استهلاك السحابة (Firestore/الدوال/Cloudinary/نسخ الدوال): بيتفحص كل 3 ساعات، والإشعار للمالك مرة واحدة في اليوم لكل بند.
    {
      const today0 = cairoLocal(t).slice(0, 10);
      const um = db.doc("serverConfig/usageCheck"), us = await um.get(), lastAt = us.exists ? +((us.data() || {}).at || 0) : 0;
      if (cfg.off.indexOf("usage_high") < 0 && typeof deps.usageAlerts === "function" && t.getTime() - lastAt >= 3 * 3600000) {
        await um.set({ at: t.getTime() });
        try {
          const list = await deps.usageAlerts();
          const owners = list && list.length ? await admins(KINDS.usage_high.perm) : [];
          for (const a of list || []) out.usage = (out.usage || 0) + (await deliver(owners, { kind: "usage_high", key: `usage-${a.id}-${today0}`, refId: a.id, link: "settings.html#media-cleanup-panel", title: a.title, body: a.body })).length;
        } catch (e) { log("usage alerts", e && e.message); }
      }
    }
    // 3) مرة في اليوم في الساعة اللي المالك حددها: ملخص الصبح + رأي العميل + الضمان
    const local = cairoLocal(t), today = local.slice(0, 10), hour = +local.slice(11, 13);
    const mark = db.doc("serverConfig/notifyDaily"), m = await mark.get();
    if (hour >= cfg.digestHour && !(m.exists && (m.data() || {}).day === today)) {
      await mark.set({ day: today, at: t.getTime() });
      if (cfg.off.indexOf("morning_digest") < 0) {
        const [open, exp, parts] = await Promise.all([db.collection("requests").where("closed", "==", false).get(), db.collection("techExpenses").where("status", "==", "pending").get(), db.collection("parts").get()]);
        let todayV = 0, late = 0, unassigned = 0, waitPay = 0;
        open.docs.forEach((doc) => {
          const r = doc.data() || {}; if (r.status === "ملغي") return;
          const v = String(r.visit || "");
          if (r.status === "مكتمل") { waitPay++; return; }
          if (v.slice(0, 10) === today) todayV++;
          else if (v && v.slice(0, 10) < today && r.status !== "مجمد") late++;
          if (!r.techId) unassigned++;
        });
        const low = parts.docs.filter((doc) => { const p = doc.data() || {}; return !p.archived && (+p.qty || 0) <= (+p.min || 0) && ((+p.min || 0) > 0 || (+p.qty || 0) <= 0); }).length;
        const lines = [`📅 زيارات النهارده: ${todayV}`, late ? `⚠️ متأخرة: ${late}` : "", unassigned ? `👷 مش متعيّنة لفني: ${unassigned}` : "", waitPay ? `💰 مكتملة ولسه ماتحصّلتش: ${waitPay}` : "", exp.size ? `🧾 مصروفات مستنية اعتماد: ${exp.size}` : "", low ? `📉 أصناف ناقصة: ${low}` : ""].filter(Boolean);
        out.digest = (await deliver(await admins(KINDS.morning_digest.perm), { kind: "morning_digest", key: `digest-${today}`, refId: today, link: "index.html",
          title: `☀️ صباح الخير — ملخص النهارده`, body: lines.join(" • ") })).length;
      }
      if (cfg.off.indexOf("c_feedback") < 0) {
        const a = new Date(t.getTime() - (cfg.feedbackDays + 1) * 86400000).toISOString(), b = new Date(t.getTime() - cfg.feedbackDays * 86400000).toISOString();
        const snap = await db.collection("requests").where("closedAt", ">=", a).where("closedAt", "<", b).get();
        for (const doc of snap.docs) {
          const r = doc.data() || {};
          if (r.closed !== true || r.status === "ملغي" || r.portalVis === false) continue;
          out.feedback += (await deliver(await customerUids(r.customerId), { kind: "c_feedback", key: `fb-${doc.id}`, refId: doc.id, link: `portal.html?o=${encodeURIComponent(doc.id)}`,
            title: `🙏 جهازك تمام بعد التصليح؟ (${str(r.no, 30)})`, body: "لو فيه أي مشكلة ابعتلنا من صفحة الطلب، ورأيك يهمنا." })).length;
        }
      }
      if (cfg.off.indexOf("c_warranty") < 0) {
        const a = new Date(t.getTime() + cfg.warrantyDays * 86400000).toISOString(), b = new Date(t.getTime() + (cfg.warrantyDays + 1) * 86400000).toISOString();
        const snap = await db.collection("requests").where("warrantyUntil", ">=", a).where("warrantyUntil", "<", b).get();
        for (const doc of snap.docs) {
          const r = doc.data() || {};
          if (r.status === "ملغي" || r.portalVis === false) continue;
          out.warranty += (await deliver(await customerUids(r.customerId), { kind: "c_warranty", key: `wr-${doc.id}`, refId: doc.id, link: `portal.html?o=${encodeURIComponent(doc.id)}`,
            title: `🛡️ ضمان طلبك ${str(r.no, 30)} فاضله ${cfg.warrantyDays} ${cfg.warrantyDays === 1 ? "يوم" : cfg.warrantyDays === 2 ? "يومين" : "أيام"}`, body: "لو الجهاز فيه أي حاجة، اطلب متابعة قبل ما الضمان يخلص." })).length;
        }
      }
    }
    return out;
  }

  return { tick, sendMessage, config, onRequestWrite, onExpenseWrite, onWalletTxCreate, onPartMoveCreate, onPartUpdate, onPortalRequestCreate, onGuestRequestCreate, onComplaintWrite, onQuestionWrite, onPostWrite, deliver, admins, customerUids, _fmtVisit: fmtVisit };
}

module.exports = { createNotifier, KINDS, BROADCAST, MAX_ITEMS, CONFIG_DEFAULTS, cleanConfig, cairoLocal };
