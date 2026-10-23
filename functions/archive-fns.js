"use strict";
/* archive-fns.js — دوال الأرشيف على Firebase (الربط بس؛ المنطق كله في archive-core.js).
   بيتضاف لـ index.js بسطر واحد في آخره:   Object.assign(exports, require("./archive-fns"));
   (index.js بيعمل initializeApp قبلها، فهنا بنستخدم getFirestore على طول.)

   - archiveNightly: كل ليلة 3:15 الفجر بتوقيت القاهرة.
   - archiveRun: «أرشف دلوقتي» من الإعدادات (المالك أو صلاحية data.backup).
   - archiveRestoreOrder: «رجّعه للشغل» لأمر متأرشف (أي موظف ليه تعديل أوامر).
   - archiveRebuild / archiveImport: إعادة حساب الملخصات، واسترجاع الأرشيف من نسخة احتياطية (المالك).
   - archiveRevive*: لو أمر/حركة متأرشفة اتعملت تاني في المجموعة الشغالة (من جهاز) → ترجع للشغل هي وحركاتها. */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineString } = require("firebase-functions/params");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const core = require("./archive-core");
const roles = require("./roles-core");

const region = defineString("NOTIFY_REGION", { default: "us-central1" }); // نفس منطقة قاعدة Firestore (زي دوال الإشعارات)
let A = null;
function archiver() {
  if (!A) A = core.createArchiver({ db: getFirestore(), stamp: () => FieldValue.serverTimestamp(), ts: (d) => Timestamp.fromDate(d), log: (...a) => console.warn("[archive]", ...a) });
  return A;
}
async function staffOf(uid) {
  const db = getFirestore();
  const [s, c] = await Promise.all([db.doc(`staff/${uid}`).get(), db.doc("accessConfig/roles").get()]);
  const staff = s.exists ? s.data() : null;
  if (!staff || staff.disabled === true) throw new HttpsError("permission-denied", "not_staff");
  const cfg = c.exists ? roles.normalizeConfig(c.data()) : roles.defaultConfig();
  const perms = {}; roles.effectivePerms(cfg, staff).forEach((k) => { perms[k] = 1; });
  return { owner: roles.isOwner(cfg, staff), perms, scoped: staff.sc === "a" };
}
function call(name, need, fn, opts) {
  return onCall(Object.assign({ region: "us-central1", cors: true, maxInstances: 3, timeoutSeconds: 60, memory: "256MiB" }, opts || {}), async (req) => {
    if (!req.auth || !req.auth.uid) throw new HttpsError("unauthenticated", "sign_in_required");
    const me = await staffOf(req.auth.uid);
    if (me.scoped || !(me.owner || need.some((k) => me.perms[k]))) throw new HttpsError("permission-denied", "no_permission");
    try { return await fn(req.data || {}, req.auth.uid, me); }
    catch (e) { if (e instanceof HttpsError) throw e; console.error(`[${name}]`, e && e.message); throw new HttpsError("internal", String((e && e.message) || "internal").slice(0, 120)); }
  });
}

exports.archiveNightly = onSchedule({ schedule: "15 3 * * *", timeZone: "Africa/Cairo", region: "us-central1", memory: "512MiB", timeoutSeconds: 540, retryCount: 0 }, async () => {
  try { const r = await archiver().run({ budgetMs: 420000, by: "nightly" }); console.log("[archive] nightly", JSON.stringify(r)); }
  catch (e) { console.error("[archive] nightly failed", e && e.message); }
});
exports.archiveRun = call("archiveRun", ["data.backup", "data.restore"], (d, uid) => archiver().run({ budgetMs: 240000, by: uid, force: d.force === true }), { timeoutSeconds: 300, memory: "512MiB" });
exports.archiveRestoreOrder = call("archiveRestoreOrder", ["requests.edit", "requests.close", "requests.add"], (d) => {
  const id = String(d.id || ""), col = d.col === "walletTx" || d.col === "treasury" ? d.col : "requests";
  if (!/^[A-Za-z0-9_~.\-]{1,200}$/.test(id)) throw new HttpsError("invalid-argument", "bad_id");
  return archiver().revive(col, id);
});
exports.archiveRepointCustomer = call("archiveRepointCustomer", ["customers.merge", "customers.edit"], (d) => archiver().repointCustomer(d.dupId, d.keepId));
exports.archiveRebuild = call("archiveRebuild", ["data.restore"], () => archiver().rebuild(), { timeoutSeconds: 540, memory: "1GiB" });
exports.archiveImport = call("archiveImport", ["data.restore"], (d) => archiver().importDocs(d), { timeoutSeconds: 300, memory: "512MiB" });

const TRIG = { region, maxInstances: 5, memory: "256MiB", timeoutSeconds: 60, retry: false };
function revOn(col) {
  return onDocumentCreated(Object.assign({ document: `${col}/{id}` }, TRIG), async (ev) => {
    const id = ev.params.id;
    if (/^archive-carry/.test(id)) return;
    try {
      const a = await getFirestore().doc(`${core.ARCH[col]}/${id}`).get(); // قراءة واحدة: أغلب المرات مش متأرشف أصلًا
      if (a.exists) { const r = await archiver().revive(col, id); console.log("[archive] revived", col, id, JSON.stringify(r)); }
    } catch (e) { console.error("[archive] revive failed", col, id, e && e.message); }
  });
}
exports.archiveReviveRequests = revOn("requests");
exports.archiveReviveWalletTx = revOn("walletTx");
exports.archiveReviveTreasury = revOn("treasury");
