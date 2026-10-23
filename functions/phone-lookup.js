"use strict";

/*
  منطق البحث عن حساب البوابة بالتليفون (من غير الاعتماد على قراءة phoneIndex من المتصفح).
  - ملف نقي (من غير استدعاء Firebase مباشرة) عشان يتختبر بسهولة: db بيتحقن من index.js.
  - lookup:    phone -> { email } للدخول بالرقم/استرجاع كلمة المرور.
  - available: phone -> { available } لفحص التسجيل الجديد قبل إنشاء الحساب.
  - كل استدعاء محدود بعدد مرات (لكل IP ولكل رقم) لمنع تخمين الأرقام.
*/

const crypto = require("node:crypto");

const PHONE_RE = /^01[0125]\d{8}$/;
const HOUR = 60 * 60 * 1000;
const DEFAULT_LIMITS = {
  lookupPerIp: { limit: 60, windowMs: HOUR },
  lookupPerPhone: { limit: 12, windowMs: HOUR },
  availablePerIp: { limit: 30, windowMs: HOUR },
  guestPerIp: { limit: 6, windowMs: HOUR },
  guestPerPhone: { limit: 3, windowMs: 24 * HOUR }
};
const GUEST_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

class PhoneError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

// نفس منطق normPhone في portal.html: يقبل أرقام عربية/فارسية و +20 و 0020.
function normalizePhone(input) {
  let d = String(input == null ? "" : input)
    .replace(/[٠-٩]/g, (x) => String(x.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (x) => String(x.charCodeAt(0) - 1776))
    .replace(/\D/g, "");
  if (d.indexOf("0020") === 0) d = d.slice(4);
  if (d.length === 12 && d.indexOf("20") === 0) d = "0" + d.slice(2);
  if (d.length === 10 && d[0] === "1") d = "0" + d;
  return PHONE_RE.test(d) ? d : "";
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 32);
}

// عدّاد بسيط داخل Firestore (معاملة واحدة). بيرجّع true لو لسه مسموح.
async function takeToken(db, bucket, rawKey, rule, now) {
  const ref = db.collection("rateLimits").doc(`${bucket}_${digest(rawKey)}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? snap.data() : null;
    if (!cur || typeof cur.resetAt !== "number" || now >= cur.resetAt) {
      tx.set(ref, { count: 1, resetAt: now + rule.windowMs, expireAt: new Date(now + rule.windowMs + HOUR) });
      return true;
    }
    if (cur.count >= rule.limit) return false;
    tx.update(ref, { count: cur.count + 1 });
    return true;
  });
}

function createPhoneHandlers(deps) {
  const db = deps.db;
  const now = deps.now || (() => Date.now());
  const limits = Object.assign({}, DEFAULT_LIMITS, deps.limits || {});
  const enforceAppCheck = deps.enforceAppCheck || (() => false);
  const allowedOrigins = deps.allowedOrigins || (() => []);
  const log = deps.log || (() => {});

  function guard(req) {
    const origins = allowedOrigins();
    if (origins.length && !origins.includes(req.origin || "")) throw new PhoneError("permission-denied", "origin_not_allowed");
    if (enforceAppCheck() && !req.appVerified) throw new PhoneError("failed-precondition", "app_check_required");
    const phone = normalizePhone(req.data && req.data.phone);
    if (!phone) throw new PhoneError("invalid-argument", "bad_phone");
    return phone;
  }

  async function limit(bucket, key, rule) {
    let ok = true;
    try { ok = await takeToken(db, bucket, key, rule, now()); }
    catch (e) { log("rate-limit store failed (allowing)", e && e.message); return; } // عطل مؤقت في التخزين ما يوقفش الدخول
    if (!ok) throw new PhoneError("resource-exhausted", "rate_limited");
  }

  async function readIndex(phone) {
    const snap = await db.collection("phoneIndex").doc(phone).get();
    return snap.exists ? snap.data() : null;
  }

  return {
    async lookup(req) {
      const phone = guard(req);
      await limit("lk-ip", req.ip || "unknown", limits.lookupPerIp);
      await limit("lk-ph", phone, limits.lookupPerPhone);
      const idx = await readIndex(phone);
      const email = idx && typeof idx.email === "string" && idx.email.includes("@") ? idx.email : null;
      return { email };
    },
    /* طلب صيانة سريع من زائر: بقى من السيرفر بس (القواعد بتمنع الكتابة المباشرة) عشان يتحدد عدد مرات لكل IP ولكل رقم */
    async guest(req) {
      const phone = guard(req);
      const d = req.data || {};
      const s = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
      const doc = { name: s(d.name, 80), phone, center: s(d.center, 80), village: s(d.village, 80), street: s(d.street, 200), deviceType: s(d.deviceType, 60), fault: s(d.fault, 1000), handled: false, guest: true };
      if (doc.name.length < 2 || !doc.center || doc.street.length < 3 || doc.fault.length < 3) throw new PhoneError("invalid-argument", "bad_fields");
      const l = d.loc;
      if (l && typeof l === "object") {
        if (typeof l.url === "string" && /^https:\/\/\S+$/.test(l.url) && l.url.length <= 300) doc.loc = { url: l.url };
        else if (isFinite(+l.lat) && isFinite(+l.lng) && Math.abs(+l.lat) <= 90 && Math.abs(+l.lng) <= 180) doc.loc = { lat: +l.lat, lng: +l.lng, acc: isFinite(+l.acc) ? Math.min(100000, Math.max(0, +l.acc)) : 0 };
      }
      await limit("gr-ip", req.ip || "unknown", limits.guestPerIp);
      await limit("gr-ph", phone, limits.guestPerPhone);
      for (let i = 0; i < 5; i++) {
        let ref = "G-"; for (let k = 0; k < 6; k++) ref += GUEST_ABC[crypto.randomInt(GUEST_ABC.length)];
        const dref = db.collection("guestRequests").doc(ref);
        const made = await db.runTransaction(async (tx) => { const snap = await tx.get(dref); if (snap.exists) return false; tx.set(dref, Object.assign({ ref }, doc, { createdAt: deps.serverTime ? deps.serverTime() : new Date() })); return true; });
        if (made) return { ref };
      }
      throw new PhoneError("unavailable", "try_again");
    },
    async available(req) {
      const phone = guard(req);
      await limit("av-ip", req.ip || "unknown", limits.availablePerIp);
      return { available: !(await readIndex(phone)) };
    }
  };
}

module.exports = { createPhoneHandlers, normalizePhone, takeToken, PhoneError, DEFAULT_LIMITS, PHONE_RE };
