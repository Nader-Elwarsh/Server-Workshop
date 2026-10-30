"use strict";
/*
  فحص قبل نشر الدوال (بيشتغل تلقائيًا من firebase.json ← functions.predeploy).
  السبب: مشغّلات Firestore (الإشعارات، تحويل طلبات البوابة، ختم المزامنة، نسخ العرض، الأرشيف) لازم تتنشر
  في نفس منطقة قاعدة البيانات. المنطقة بتتقري من NOTIFY_REGION، وقيمتها الافتراضية في الكود us-central1،
  بينما التوثيق بيقول إن قاعدة الإنتاج في me-central1. لو النشر حصل من غير ما المتغير يتحدد، المشغّلات
  يا إما النشر يفشل، يا إما تتنشر في منطقة غلط ومش هتشتغل — من غير أي تنبيه.
  الفحص ده مابيغيّرش أي منطقة؛ بيوقف النشر بس لو القيمة مش متحددة صراحة أو شكلها غلط أو مخالفة لـ FIRESTORE_LOCATION.

  اكتب في functions/.env (أو functions/.env.<project-id> لكل مشروع، زي .env.elwarsha-staging):
      NOTIFY_REGION=me-central1
  وللتأكد من منطقة القاعدة الفعلية:
      gcloud firestore databases describe --database="(default)" --format="value(locationId)"
  ولو عايز الفحص يقارن بيها تلقائيًا ضيف في نفس الملف: FIRESTORE_LOCATION=me-central1
*/
const fs = require("node:fs");
const path = require("node:path");

const REGION_RE = /^[a-z]+-[a-z]+[0-9]$/; // us-central1, me-central1, europe-west3 ...
const MULTI = { nam5: "us-central1", eur3: "europe-west1" }; // مواقع متعددة المناطق ← المنطقة المناسبة للمشغّلات

function parseEnv(text) {
  const out = {};
  String(text || "").split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) return;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  });
  return out;
}

function loadEnv(dir, projectId) {
  const read = (f) => { try { return parseEnv(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { return {}; } };
  return Object.assign({}, read(".env"), projectId ? read(`.env.${projectId}`) : {});
}

function check(env, projectId) {
  const errors = [], notes = [];
  const region = String(env.NOTIFY_REGION || "").trim();
  const where = projectId ? `functions/.env أو functions/.env.${projectId}` : "functions/.env";
  if (!region) {
    errors.push(`NOTIFY_REGION مش متحدد في ${where}. المشغّلات هتتنشر في us-central1 (القيمة الافتراضية) وده غالبًا غلط لو القاعدة في me-central1.\n   اكتب السطر ده: NOTIFY_REGION=me-central1  (أو منطقة قاعدتك الفعلية)`);
  } else if (!REGION_RE.test(region)) {
    errors.push(`NOTIFY_REGION="${region}" مش شكل منطقة صحيح (مثال: me-central1).`);
  }
  const loc = String(env.FIRESTORE_LOCATION || "").trim().toLowerCase();
  if (loc && region) {
    const expect = MULTI[loc] || loc;
    if (expect !== region) errors.push(`NOTIFY_REGION="${region}" مختلف عن منطقة القاعدة FIRESTORE_LOCATION="${loc}" (المفروض ${expect}).`);
  } else if (region) {
    notes.push(`المشغّلات هتتنشر في ${region}. اتأكد إنها نفس منطقة القاعدة: gcloud firestore databases describe --database="(default)" --format="value(locationId)"`);
  }
  if (!String(env.UPLOAD_ALLOWED_ORIGINS || "").trim()) notes.push("UPLOAD_ALLOWED_ORIGINS مش في ملف .env — Firebase هيسألك عليه وقت النشر (دومين الموقع والبوابة، مفصولين بفاصلة).");
  return { ok: errors.length === 0, errors, notes, region };
}

module.exports = { parseEnv, loadEnv, check };

if (require.main === module) {
  const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || process.argv[2] || "";
  if (process.env.WF_SKIP_DEPLOY_CHECK === "1") { console.warn("⚠️ فحص ما قبل النشر اتخطّى (WF_SKIP_DEPLOY_CHECK=1)."); process.exit(0); }
  const r = check(loadEnv(__dirname, projectId), projectId);
  r.notes.forEach((n) => console.log("ℹ️ " + n));
  if (!r.ok) {
    r.errors.forEach((e) => console.error("❌ " + e));
    console.error("النشر اتوقف قبل ما يبدأ (مفيش أي حاجة اتغيرت على السيرفر). صحّح الملف وجرب تاني.");
    process.exit(1);
  }
  console.log(`✅ فحص إعدادات النشر تمام (${projectId || "المشروع الحالي"}: المشغّلات في ${r.region}).`);
}
