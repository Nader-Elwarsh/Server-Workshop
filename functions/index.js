"use strict";

const crypto = require("node:crypto");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineString, defineSecret, defineBoolean } = require("firebase-functions/params");
const { createPhoneHandlers, PhoneError, takeToken } = require("./phone-lookup");
const { createStaffAdmin, AdminError } = require("./staff-admin");
const { createTechLedger } = require("./tech-ledger");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const cloudName = defineString("CLOUDINARY_CLOUD_NAME");
const apiKey = defineString("CLOUDINARY_API_KEY");
const allowedOrigins = defineString("UPLOAD_ALLOWED_ORIGINS");
const apiSecret = defineSecret("CLOUDINARY_API_SECRET");
// فعّله (true) بعد ما تتأكد في Firebase Console إن طلبات App Check المعتمدة بقت شبه 100%.
const enforceAppCheckParam = defineBoolean("ENFORCE_APP_CHECK", { default: false });
const MAX_BYTES = 12 * 1024 * 1024;
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm"]);

function validMagic(buffer, mime) {
  if (mime === "image/jpeg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/gif") return buffer.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/);
  if (mime === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (mime === "image/heic" || mime === "image/heif") return buffer.subarray(4, 12).toString("ascii").includes("ftyp");
  if (mime === "audio/wav") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE";
  if (mime === "audio/ogg") return buffer.subarray(0, 4).toString("ascii") === "OggS";
  if (mime === "audio/webm") return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (mime === "audio/mpeg") return buffer.subarray(0, 3).toString("ascii") === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  return false;
}
function sign(params, secret) {
  const canonical = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join("&");
  return crypto.createHash("sha1").update(canonical + secret).digest("hex");
}
function json(res, status, body) { res.status(status).set("Cache-Control", "no-store").json(body); }

// مين مسموح له يرفع ملفات: موظف (staff/{uid}) أو عميل بوابة فعّال. بترجع "staff" أو "customer" أو "".
async function uploaderRole(uid) {
  const db = getFirestore();
  const staff = await db.doc(`staff/${uid}`).get();
  if (staff.exists) return (staff.data() || {}).disabled === true ? "" : "staff";
  const link = await db.doc(`portalLinks/${uid}`).get();
  if (link.exists) return link.data().disabled !== true && typeof link.data().customerId === "string" ? "customer" : "";
  // عميل سجّل بنفسه من البوابة: مفيش portalLinks، والهوية = customers/{uid} (نفس منطق قواعد Firestore own()).
  const own = await db.doc(`customers/${uid}`).get();
  return own.exists && own.data().portal === true ? "customer" : "";
}

exports.uploadImage = onRequest({ region: "us-central1", secrets: [apiSecret], timeoutSeconds: 120, memory: "512MiB" }, async (req, res) => {
  const origins = allowedOrigins.value().split(",").map((x) => x.trim()).filter(Boolean);
  const origin = req.get("origin") || "";
  if (!origins.includes(origin)) return json(res, 403, { error: "origin_not_allowed" });
  res.set("Access-Control-Allow-Origin", origin).set("Vary", "Origin").set("Access-Control-Allow-Headers", "Authorization, Content-Type").set("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  try {
    const authorization = req.get("authorization") || "";
    const match = authorization.match(/^Bearer (.+)$/i);
    if (!match) return json(res, 401, { error: "authentication_required" });
    const decoded = await getAuth().verifyIdToken(match[1]);
    const upRole = await uploaderRole(decoded.uid);
    if (!upRole) return json(res, 403, { error: "upload_not_authorized" });
    /* حد عدد مرات: الموظف 150 صورة/ساعة، والعميل 20 في اليوم (عشان حساب عميل مايستهلكش مساحة Cloudinary) */
    try {
      const rule = upRole === "staff" ? { limit: 150, windowMs: 3600000 } : { limit: 20, windowMs: 86400000 };
      const fs = getFirestore();
      if (!(await takeToken({ collection: (p) => fs.collection(p), runTransaction: (fn) => fs.runTransaction(fn) }, "up-" + upRole, decoded.uid, rule, Date.now()))) return json(res, 429, { error: "upload_rate_limited" });
    } catch (e) { console.warn("upload rate-limit store failed (allowing)", e && e.message); }
    const mime = String(req.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const file = req.rawBody;
    if (!MIME_TYPES.has(mime)) return json(res, 415, { error: "file_type_not_allowed" });
    if (!Buffer.isBuffer(file) || !file.length || file.length > MAX_BYTES) return json(res, 413, { error: "file_size_limit_12mb" });
    if (!validMagic(file, mime)) return json(res, 415, { error: "file_signature_invalid" });

    const cloud = cloudName.value();
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "workshop-secure";
    const signature = sign({ folder, timestamp }, apiSecret.value());
    const resource = mime.startsWith("audio/") ? "video" : "image";
    const form = new FormData();
    form.append("file", new Blob([file], { type: mime }), "upload");
    form.append("api_key", apiKey.value());
    form.append("timestamp", String(timestamp));
    form.append("folder", folder);
    form.append("signature", signature);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/${resource}/upload`, { method: "POST", body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.secure_url) {
      console.error("Cloudinary upload rejected", response.status, result.error && result.error.message);
      return json(res, 502, { error: "cloud_upload_failed" });
    }
    return json(res, 200, { secure_url: result.secure_url, bytes: result.bytes, format: result.format });
  } catch (error) {
    console.error("Authenticated upload failed", error && error.message);
    return json(res, 500, { error: "upload_failed" });
  }
});

/* ---------------------------------------------------------------------
   مرفقات العطل — صور/فيديو/صوت (functions/media.js): الملفات بتترفع من المتصفح
   لـ Cloudinary مباشرة بتوقيع من هنا (لحد 100 ميجا من غير ما تعدي على الدالة)،
   وكل ملف بيتسجّل في mediaFiles عشان نقدر نمسحه من السحابة أو نلاقيه لو يتيم.
   --------------------------------------------------------------------- */
const { createMedia, MediaError } = require("./media");
const rolesCore = require("./roles-core");
async function mediaActor(uid) {
  const role = await uploaderRole(uid);
  if (role !== "staff") return { role, perms: {}, owner: false };
  const db = getFirestore();
  const [st, cfgSnap] = await Promise.all([db.doc(`staff/${uid}`).get(), db.doc("accessConfig/roles").get()]);
  const staff = st.data() || {};
  if (staff.disabled === true) return { role: "", perms: {}, owner: false };
  const cfg = cfgSnap.exists ? rolesCore.normalizeConfig(cfgSnap.data()) : rolesCore.defaultConfig();
  const perms = {}; rolesCore.effectivePerms(cfg, staff).forEach((k) => { perms[k] = 1; });
  return { role, perms, owner: rolesCore.isOwner(cfg, staff) };
}
const media = createMedia({
  db: { collection: (p) => getFirestore().collection(p), runTransaction: (fn) => getFirestore().runTransaction(fn) },
  creds: () => ({ cloud: cloudName.value(), apiKey: apiKey.value(), secret: apiSecret.value() }),
  actor: mediaActor,
  log: (...a) => console.warn("[media]", ...a)
});
function mediaCallable(name, handler, opts) {
  // invoker: "public" = أي حد يقدر «يوصل» للدالة (زي باقي دوال Firebase)، والتحقق من الحساب والصلاحية جوه الدالة نفسها.
  // من غيره Cloud Run بيرفض طلب الـ CORS اللي المتصفح بيبعته قبل الطلب الحقيقي، والموبايل يقول «Failed to fetch».
  return onCall(Object.assign({ region: "us-central1", cors: true, invoker: "public", maxInstances: 10, timeoutSeconds: 30, memory: "256MiB", secrets: [apiSecret] }, opts || {}), async (request) => {
    if (!request.auth || !request.auth.uid) throw new HttpsError("unauthenticated", "sign_in_required");
    try { return await handler(request.auth.uid, request.data || {}); }
    catch (e) {
      if (e instanceof MediaError) throw new HttpsError(e.code, e.message);
      console.error(`[${name}]`, e && e.message);
      throw new HttpsError("internal", "internal");
    }
  });
}
exports.mediaSign = mediaCallable("mediaSign", (uid, d) => media.sign(uid, d));
exports.mediaDelete = mediaCallable("mediaDelete", (uid, d) => media.remove(uid, d), { timeoutSeconds: 120 });
exports.mediaUsage = mediaCallable("mediaUsage", (uid) => media.usage(uid));
exports.mediaCleanup = mediaCallable("mediaCleanup", (uid, d) => media.orphans(uid, d), { timeoutSeconds: 300, memory: "512MiB" });

/* ---------------------------------------------------------------------
   البحث عن حساب البوابة بالتليفون (بديل قراءة phoneIndex المباشرة من المتصفح).
   - بتتحقق من Origin المسموح (نفس UPLOAD_ALLOWED_ORIGINS) وApp Check (لو ENFORCE_APP_CHECK=true).
   - عدد الطلبات محدود لكل IP ولكل رقم (مجموعة rateLimits).
   --------------------------------------------------------------------- */
const phoneHandlers = createPhoneHandlers({
  db: { collection: (...a) => getFirestore().collection(...a), runTransaction: (...a) => getFirestore().runTransaction(...a) },
  enforceAppCheck: () => enforceAppCheckParam.value(),
  allowedOrigins: () => allowedOrigins.value().split(",").map((x) => x.trim()).filter(Boolean),
  serverTime: () => FieldValue.serverTimestamp(),
  log: (...a) => console.warn("[phone-lookup]", ...a)
});
function callable(name, handler) {
  return onCall({ region: "us-central1", cors: true, maxInstances: 10, timeoutSeconds: 15, memory: "256MiB" }, async (request) => {
    try {
      const raw = request.rawRequest;
      return await handler({
        data: request.data,
        appVerified: !!request.app,
        origin: (raw && raw.get && raw.get("origin")) || "",
        ip: (raw && raw.ip) || ""
      });
    } catch (e) {
      if (e instanceof PhoneError) throw new HttpsError(e.code, e.message);
      console.error(`[${name}]`, e && e.message);
      throw new HttpsError("internal", "internal");
    }
  });
}
exports.portalLoginLookup = callable("portalLoginLookup", phoneHandlers.lookup);
exports.portalPhoneAvailable = callable("portalPhoneAvailable", phoneHandlers.available);
exports.portalGuestRequest = callable("portalGuestRequest", phoneHandlers.guest);

/* ---------------------------------------------------------------------
   إدارة المستخدمين والأدوار (للمالك فقط، ما عدا staffSync اللي أي موظف بيناديه لنفسه).
   كل الدوال بتتحقق من مستند staff/{uid} على السيرفر؛ مفيش ثقة في أي بيانات جاية من المتصفح.
   --------------------------------------------------------------------- */
const staffAdmin = createStaffAdmin({
  auth: getAuth(),
  db: { doc: (p) => getFirestore().doc(p), collection: (p) => getFirestore().collection(p) },
  randomInt: (n) => crypto.randomInt(n),
  log: (...a) => console.warn("[staff-admin]", ...a)
});
function adminCallable(name, handler) {
  return onCall({ region: "us-central1", cors: true, maxInstances: 5, timeoutSeconds: 30, memory: "256MiB" }, async (request) => {
    if (!request.auth || !request.auth.uid) throw new HttpsError("unauthenticated", "sign_in_required");
    try { return await handler(request.auth.uid, request.data || {}); }
    catch (e) {
      if (e instanceof AdminError) throw new HttpsError(e.code, e.message);
      console.error(`[${name}]`, e && e.message);
      throw new HttpsError("internal", "internal");
    }
  });
}
exports.staffSync = adminCallable("staffSync", (uid) => staffAdmin.sync(uid));
exports.staffList = adminCallable("staffList", (uid) => staffAdmin.list(uid));
exports.staffDirectory = adminCallable("staffDirectory", (uid) => staffAdmin.directory(uid));
exports.staffCreate = adminCallable("staffCreate", (uid, d) => staffAdmin.create(uid, d));
exports.staffUpdate = adminCallable("staffUpdate", (uid, d) => staffAdmin.update(uid, d));
exports.staffResetPassword = adminCallable("staffResetPassword", (uid, d) => staffAdmin.resetPassword(uid, d));
exports.staffDelete = adminCallable("staffDelete", (uid, d) => staffAdmin.remove(uid, d));
exports.rolesSave = adminCallable("rolesSave", (uid, d) => staffAdmin.saveRoles(uid, d));

/* ---------------------------------------------------------------------
   حساب الفني على السيرفر: قفل أمره (الأمر + حركة التحصيل في معاملة واحدة) وقراءة عهدته وسجل أوامره.
   --------------------------------------------------------------------- */
const techLedger = createTechLedger({
  db: getFirestore(),
  ts: (d) => Timestamp.fromDate(d),
  stamp: () => FieldValue.serverTimestamp(),
  log: (...a) => console.log("[tech-ledger]", ...a)
});
exports.techCloseOrder = adminCallable("techCloseOrder", (uid, d) => techLedger.closeOrder(uid, d));
exports.techAccount = adminCallable("techAccount", (uid, d) => techLedger.account(uid, d));
exports.techCollectDeposit = adminCallable("techCollectDeposit", (uid, d) => techLedger.collectDeposit(uid, d));
exports.techPartsCatalog = adminCallable("techPartsCatalog", (uid) => techLedger.partsCatalog(uid));
exports.techUsePart = adminCallable("techUsePart", (uid, d) => techLedger.usePart(uid, d));
exports.techReturnPart = adminCallable("techReturnPart", (uid, d) => techLedger.returnPart(uid, d));

/* ---------------------------------------------------------------------
   الإشعارات الداخلية (notify.js): بتتولّد هنا من التغيير نفسه في البيانات، لكل الأطراف (فني / إدارة / عميل).
   + إشعارات الموبايل/الكمبيوتر (Web Push): مفاتيح VAPID بتتولّد لوحدها أول مرة وبتتحفظ في serverConfig/push
     (محدش يقرأها من المتصفح)، والمتصفح بياخد المفتاح العام من pushKey ويسجّل اشتراكه بـ pushSubscribe.
   منطقة الـ triggers لازم تبقى نفس منطقة قاعدة Firestore: لو قاعدتك مش us-central1/nam5 اكتب منطقتها في NOTIFY_REGION.
   --------------------------------------------------------------------- */
const { onDocumentWritten, onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { createNotifier } = require("./notify");
let webpush = null; try { webpush = require("web-push"); } catch (e) { console.warn("[notify] web-push غير متاح — الإشعارات هتفضل داخل التطبيق بس"); }
const notifyRegion = defineString("NOTIFY_REGION", { default: "us-central1" });
const fdb = getFirestore();
let vapidCache = null;
async function vapidKeys() {
  if (vapidCache) return vapidCache;
  if (!webpush) return null;
  const ref = fdb.doc("serverConfig/push");
  vapidCache = await fdb.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (s.exists && s.data().publicKey && s.data().privateKey) return s.data();
    const k = webpush.generateVAPIDKeys();
    const v = { publicKey: k.publicKey, privateKey: k.privateKey, createdAt: FieldValue.serverTimestamp() };
    tx.set(ref, v);
    return v;
  });
  return vapidCache;
}
async function sendPush(uid, payload) {
  if (!webpush) return;
  const subs = await fdb.collection("pushSubs").where("uid", "==", uid).get();
  if (subs.empty) return;
  const keys = await vapidKeys(); if (!keys) return;
  const body = JSON.stringify(payload);
  await Promise.all(subs.docs.map(async (d) => {
    const sub = (d.data() || {}).sub;
    try {
      await webpush.sendNotification(sub, body, { TTL: 86400, urgency: "high", vapidDetails: { subject: "mailto:notifications@workshop.app", publicKey: keys.publicKey, privateKey: keys.privateKey } });
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await d.ref.delete().catch(() => {}); // الاشتراك انتهى (اتشال التطبيق أو اتقفلت الإشعارات)
      else console.warn("[notify] push", e && (e.statusCode || e.message));
    }
  }));
}
/* ---------------------------------------------------------------------
   الاستهلاك والمساحة (functions/usage.js) — للمالك: تقرير + تنبيه يومي لو حاجة قربت تعدّي المجاني.
   --------------------------------------------------------------------- */
const { createUsage, parseBudgetMessage } = require("./usage");
const { applicationDefault } = require("firebase-admin/app");
const adc = applicationDefault();
const usage = createUsage({
  getToken: async () => (await adc.getAccessToken()).access_token,
  projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "",
  db: { doc: (p) => getFirestore().doc(p) },
  cloudinary: () => ({ cloud: cloudName.value(), apiKey: apiKey.value(), secret: apiSecret.value() }),
  countUsers: async () => { let n = 0, token; for (let i = 0; i < 20; i++) { const r = await getAuth().listUsers(1000, token); n += r.users.length; token = r.pageToken; if (!token) break; } return n; },
  regions: () => ["us-central1", notifyRegion.value()],
  log: (...a) => console.warn("[usage]", ...a)
});
exports.usageReport = mediaCallable("usageReport", async (uid, d) => {
  const a = await mediaActor(uid);
  if (!a.owner) throw new MediaError("permission-denied", "owner_only");
  return usage.report(!!(d && d.refresh));
}, { timeoutSeconds: 60 });

/* ---------------------------------------------------------------------
   الذكاء الاصطناعي (functions/ai.js): Gemini على Vertex AI بنفس حساب الخدمة — مفيش مفتاح.
   أول مرة: فعّل Vertex AI API على المشروع (الأوامر في الإعدادات ← 🤖 الذكاء الاصطناعي).
   --------------------------------------------------------------------- */
const { createAI, AIError } = require("./ai");
const ai = createAI({
  db: { doc: (p) => getFirestore().doc(p) },
  getToken: async () => (await adc.getAccessToken()).access_token,
  projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "",
  actor: mediaActor,
  inc: (n) => FieldValue.increment(n),
  // المخزن من السيرفر (بيشتغل للفني كمان حتى لو جهازه مش شايف المخزن) — متخزن في الذاكرة 10 دقايق.
  listParts: async () => (await getFirestore().collection("parts").get()).docs.map((d) => { const x = d.data() || {}; return { id: d.id, name: String(x.name || ""), qty: +x.qty || 0, category: String(x.category || ""), buy: +x.buy || 0, archived: x.archived === true || x.deleted === true }; }),
  log: (...a) => console.warn("[ai]", ...a)
});
function aiCallable(name, handler, opts) {
  return onCall(Object.assign({ region: "us-central1", cors: true, invoker: "public", maxInstances: 5, timeoutSeconds: 60, memory: "256MiB" }, opts || {}), async (request) => {
    if (!request.auth || !request.auth.uid) throw new HttpsError("unauthenticated", "sign_in_required");
    try { return await handler(request.auth.uid, request.data || {}); }
    catch (e) {
      if (e instanceof AIError) throw new HttpsError(e.code, e.message);
      console.error(`[${name}]`, e && e.message);
      throw new HttpsError("internal", "internal");
    }
  });
}
exports.aiConfig = aiCallable("aiConfig", (uid) => ai.config(uid), { timeoutSeconds: 20 });
exports.aiConfigSave = aiCallable("aiConfigSave", (uid, d) => ai.saveConfig(uid, d), { timeoutSeconds: 20 });
exports.aiDiagnose = aiCallable("aiDiagnose", (uid, d) => ai.diagnose(uid, d), { timeoutSeconds: 90 });
// الكتب والفواتير والمكالمات بالموديل القوي ممكن تاخد كذا دقيقة — الحد 9 دقايق (قبل كده دقيقتين فكان بيقطع).
exports.aiTask = aiCallable("aiTask", (uid, d) => ai.task(uid, d), { timeoutSeconds: 540, memory: "1GiB" });

/* الفاتورة الحقيقية: ميزانية Google Cloud بتبعت المصروف لموضوع Pub/Sub اسمه billing-alerts كذا مرة في اليوم،
   والدالة دي بتحفظه عشان شاشة «الاستهلاك والمساحة» تعرض نفس رقم صفحة الفواتير بالظبط. */
const { onMessagePublished } = require("firebase-functions/v2/pubsub");
exports.billingWatch = onMessagePublished({ topic: "billing-alerts", region: "us-central1", memory: "256MiB", retry: false }, async (event) => {
  try {
    const m = event.data && event.data.message;
    const json = m && m.json ? m.json : JSON.parse(Buffer.from((m && m.data) || "", "base64").toString("utf8") || "null");
    const doc = parseBudgetMessage(json, m && m.attributes, Date.now());
    if (doc) await getFirestore().doc("serverConfig/billing").set(doc);
  } catch (e) { console.error("[billingWatch]", e && e.message); }
});

const notifier = createNotifier({ db: fdb, push: sendPush, log: (...a) => console.log("[notify]", ...a),
  usageAlerts: async () => usage.alerts(await usage.report(false)) });
const TRIG = { region: notifyRegion, maxInstances: 10, memory: "256MiB", timeoutSeconds: 60, retry: false };
function data(snap) { return snap && snap.exists ? snap.data() : null; }
function guard(name, fn) { return async (event) => { try { await fn(event); } catch (e) { console.error(`[notify:${name}]`, e && e.message); } }; }
const { guardTechEdit } = require("./order-guard");
exports.notifyRequests = onDocumentWritten(Object.assign({ document: "requests/{id}" }, TRIG), guard("requests", async (ev) => {
  const a = data(ev.data && ev.data.after), b = data(ev.data && ev.data.before);
  // حارس تعديلات الفني: قطع المخزن والإجماليات (والمصنعية لو مقفولة من الإعدادات) — التصحيح بيتكتب باسم السيرفر
  try {
    if (a && b && a._by && a._by !== "srv" && a.techId && a._by === a.techId) {
      const g = await getFirestore().doc("settings/global").get();
      const fix = guardTechEdit(b, a, { laborLocked: !!(g.exists && g.data().techLaborLocked === true) });
      if (fix) {
        await ev.data.after.ref.update(Object.assign({}, fix.patch, { _by: "srv", _ts: FieldValue.serverTimestamp(), guardFixAt: new Date().toISOString(), guardFix: fix.why.join("، ") }));
        console.warn("[order-guard]", ev.params.id, fix.why.join(","));
      }
    }
  } catch (e) { console.error("[order-guard]", e && e.message); }
  return notifier.onRequestWrite(ev.params.id, b, a, (a && a._by) || "");
}));
/* ختم _ts على عملاء/أجهزة البوابة (مايقدروش يكتبوه بنفسهم) عشان المزامنة بالتغييرات تسحبهم على كل الأجهزة. */
const { needsStamp } = require("./portal-stamp-core");
function portalStamp(name) {
  return guard(name, async (ev) => {
    const a = data(ev.data && ev.data.after), b = data(ev.data && ev.data.before);
    if (!needsStamp(b, a)) return;
    await ev.data.after.ref.update({ _ts: FieldValue.serverTimestamp(), _by: "portal" });
  });
}
exports.portalStampCustomer = onDocumentWritten(Object.assign({ document: "customers/{id}" }, TRIG), portalStamp("stampCustomer"));
exports.portalStampDevice = onDocumentWritten(Object.assign({ document: "devices/{id}" }, TRIG), portalStamp("stampDevice"));
exports.notifyExpenses = onDocumentWritten(Object.assign({ document: "techExpenses/{id}" }, TRIG), guard("expenses", (ev) => notifier.onExpenseWrite(ev.params.id, data(ev.data.before), data(ev.data.after))));
exports.notifyWalletTx = onDocumentCreated(Object.assign({ document: "walletTx/{id}" }, TRIG), guard("walletTx", (ev) => notifier.onWalletTxCreate(ev.params.id, data(ev.data))));
exports.notifyPartMoves = onDocumentCreated(Object.assign({ document: "partMoves/{id}" }, TRIG), guard("partMoves", (ev) => notifier.onPartMoveCreate(ev.params.id, data(ev.data))));
exports.notifyParts = onDocumentUpdated(Object.assign({ document: "parts/{id}" }, TRIG), guard("parts", (ev) => notifier.onPartUpdate(ev.params.id, data(ev.data.before), data(ev.data.after))));
exports.notifyPortalRequests = onDocumentCreated(Object.assign({ document: "portalRequests/{id}" }, TRIG), guard("portalRequests", (ev) => notifier.onPortalRequestCreate(ev.params.id, data(ev.data))));
exports.notifyGuestRequests = onDocumentCreated(Object.assign({ document: "guestRequests/{id}" }, TRIG), guard("guestRequests", (ev) => notifier.onGuestRequestCreate(ev.params.id, data(ev.data))));
exports.notifyComplaints = onDocumentWritten(Object.assign({ document: "portalComplaints/{id}" }, TRIG), guard("complaints", (ev) => notifier.onComplaintWrite(ev.params.id, data(ev.data.before), data(ev.data.after))));
exports.notifyQuestions = onDocumentWritten(Object.assign({ document: "portalQuestions/{id}" }, TRIG), guard("questions", (ev) => notifier.onQuestionWrite(ev.params.id, data(ev.data.before), data(ev.data.after))));
exports.notifyPosts = onDocumentWritten(Object.assign({ document: "portalPosts/{id}" }, TRIG), guard("posts", (ev) => notifier.onPostWrite(ev.params.id, data(ev.data.before), data(ev.data.after))));

/* اشتراك الجهاز في إشعارات الموبايل/الكمبيوتر — لأي حد مسجّل دخول (موظف أو عميل). الاشتراك بيتربط بالمستخدم الحالي. */
function cleanSub(sub) {
  if (!sub || typeof sub !== "object") return null;
  const endpoint = String(sub.endpoint || ""), keys = sub.keys || {};
  if (!/^https:\/\/[^\s]{10,800}$/.test(endpoint) || typeof keys.p256dh !== "string" || typeof keys.auth !== "string" || keys.p256dh.length > 200 || keys.auth.length > 100) return null;
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}
exports.pushKey = adminCallable("pushKey", async () => { const k = await vapidKeys(); return { publicKey: k ? k.publicKey : "" }; });
exports.pushSubscribe = adminCallable("pushSubscribe", async (uid, d) => {
  const sub = cleanSub(d && d.sub);
  if (!sub) throw new AdminError("invalid-argument", "bad_subscription");
  const id = crypto.createHash("sha256").update(sub.endpoint).digest("hex");
  await fdb.doc(`pushSubs/${id}`).set({ uid, sub, ua: String((d && d.ua) || "").slice(0, 160), at: FieldValue.serverTimestamp() });
  return { ok: true };
});
exports.pushUnsubscribe = adminCallable("pushUnsubscribe", async (uid, d) => {
  const endpoint = String((d && d.endpoint) || "");
  if (!endpoint) return { ok: true };
  const ref = fdb.doc(`pushSubs/${crypto.createHash("sha256").update(endpoint).digest("hex")}`);
  const s = await ref.get();
  if (s.exists && s.data().uid === uid) await ref.delete();
  return { ok: true };
});
/* زرار «جرّب الإشعار»: بيبعت إشعار تجريبي لنفس المستخدم (داخل التطبيق + الموبايل) */
exports.pushTest = adminCallable("pushTest", async (uid) => {
  const sent = await notifier.deliver([uid], { kind: "test", key: `test-${uid}-${Date.now()}`, title: "🔔 تجربة الإشعارات", body: "لو شايف ده يبقى الإشعارات شغالة على الجهاز ده 👌", link: "" });
  return { ok: sent.length > 0 };
});

/* المجدولة: كل ربع ساعة (تذكير قبل الزيارة، الأوامر المتأخرة، وفي الساعة اللي المالك حددها: ملخص الصبح + رأي العميل + الضمان) */
const { onSchedule } = require("firebase-functions/v2/scheduler");
exports.notifyTick = onSchedule({ schedule: "every 15 minutes", timeZone: "Africa/Cairo", region: "us-central1", memory: "256MiB", timeoutSeconds: 120, retryCount: 0, secrets: [apiSecret] }, async () => {
  try { const r = await notifier.tick(); console.log("[notify:tick]", JSON.stringify(r)); } catch (e) { console.error("[notify:tick]", e && e.message); }
});
/* رسالة من الإدارة (لفني / لكل الفنيين / لكل الموظفين) — لصاحب صلاحية تعيين الفنيين أو المالك */
exports.notifySend = adminCallable("notifySend", async (uid, d) => {
  try { return await notifier.sendMessage(uid, d); }
  catch (e) { if (e && e.code && /permission|invalid|not-found/.test(e.code)) throw new AdminError(e.code, e.message); throw e; }
});
Object.assign(exports, require("./archive-fns"));
Object.assign(exports, require("./projections"));
Object.assign(exports, require("./portal-convert"));
