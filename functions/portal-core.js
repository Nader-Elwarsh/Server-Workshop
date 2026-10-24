"use strict";
/* portal-core.js — تحويل طلب البوابة لأمر شغل (منطق نقي، نفس convertPortal في firebase-sync.js):
   - رقم الأمر = id الطلب (ثابت): أي جهاز/السيرفر يحوّل نفس الطلب = نفس الأمر، مفيش تكرار.
   - 🛡️ السبام: العميل عنده أمرين مفتوحين من البوابة أو أكتر، أو 5 طلبات اتحولت في آخر 24 ساعة → الطلب يستنى موافقتك (hold). */
const SAFE_ID = /^[A-Za-z0-9_~.\-]{1,120}$/;
const VISIT_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;
const MEDIA_RE = /^https:\/\/res\.cloudinary\.com\/[^\s"'<>]+$/;

function sanitize(o) {
  if (typeof o === "string") return o.replace(/[<>]/g, "");
  if (Array.isArray(o)) return o.map(sanitize);
  if (o && typeof o === "object") { const r = {}; Object.keys(o).forEach((k) => { r[k] = sanitize(o[k]); }); return r; }
  return o;
}

/* قرار الطلب: { action: "reject" | "wait" | "hold" | "dupe" | "convert" | "mark", ... } */
function decide(id, raw, ctx) {
  const p = sanitize(raw || {});
  if (!SAFE_ID.test(id) || (p.deviceId && !SAFE_ID.test(String(p.deviceId)))) return { action: "reject", patch: { handled: true, rejected: true, rejectReason: "bad_id" } };
  if (p.handled === true) return { action: "none" };
  if (p.hold === true && p.approved !== true) return { action: "wait" };
  const { customer, device, existing, openByCustomer = 0, lastDay = 0 } = ctx;
  if (!customer || !device) return { action: "wait" };
  if (device.customerId !== p.customerId) return { action: "reject", patch: { handled: true, rejected: true } };
  if (existing) return { action: "mark", patch: { handled: true, orderId: id, orderNo: existing.no || "" } };
  if (p.approved !== true && (openByCustomer >= 2 || lastDay >= 5)) return { action: "hold", patch: { hold: true, holdReason: openByCustomer >= 2 ? "customer_open" : "daily_limit" } };
  return { action: "convert", p };
}

/* أمر الشغل من الطلب. settings = settings/global */
function orderFromRequest(id, p, { no, now, settings = {} }) {
  const visit = VISIT_RE.test(String(p.visit || "")) ? String(p.visit) : "";
  const cut = (v, n) => String(v == null ? "" : v).slice(0, n);
  const r = {
    id, portalRequestId: id, no, customerId: p.customerId, deviceId: p.deviceId, addressKey: "main", visit, status: "جديد",
    executionPlace: cut(p.executionPlace, 60) || (settings.executionPlaces || [])[0] || "عند العميل",
    workshopStatus: (settings.workshopStatuses || [])[0] || "غير مطلوب", partsWaiting: false, tag: "", fault: cut(p.fault, 1000), work: "",
    labor: 0, parts: [], partsTotal: 0, partsCost: 0, total: 0, deposit: 0, remain: 0, closed: false, source: "portal", customerNote: cut(p.note, 1000),
    createdAt: now, statusHistory: [{ from: "", to: "جديد", at: now, note: "" }]
  };
  const media = (Array.isArray(p.media) ? p.media : []).filter((m) => m && MEDIA_RE.test(String(m.url || "")) && ["video", "audio", "image"].includes(m.kind)).slice(0, 6)
    .map((m) => ({ url: m.url, kind: m.kind, dur: +m.dur || 0, bytes: +m.bytes || 0, at: String(m.at || "").slice(0, 40), by: "العميل" }));
  if (media.length) r.media = media;
  if (p.loc && typeof p.loc === "object" && ((isFinite(+p.loc.lat) && isFinite(+p.loc.lng)) || typeof p.loc.url === "string")) r.loc = p.loc.url ? { url: String(p.loc.url).slice(0, 300) } : { lat: +p.loc.lat, lng: +p.loc.lng, acc: +p.loc.acc || 0 };
  return r;
}

/* رقم الأمر: W26-10-24-<المسلسل> بتوقيت القاهرة، بعد أكبر رقم موجود اليوم ده (الحالي + الأرشيف) */
function dayPrefix(date) {
  const p = {}; new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).forEach((x) => { p[x.type] = x.value; });
  return `W${p.year.slice(2)}-${+p.month}-${+p.day}-`;
}
function nextNo(prefix, nos, archMax) {
  let max = Math.max(0, +archMax || 0);
  (nos || []).forEach((no) => { const m = /^(.*-)(\d+)$/.exec(String(no || "")); if (m && m[1] === prefix && +m[2] > max) max = +m[2]; });
  return prefix + (max + 1);
}

module.exports = { decide, orderFromRequest, dayPrefix, nextNo, sanitize, SAFE_ID };
