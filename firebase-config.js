/* firebase-config.js — المكان الوحيد لإعدادات Firebase، وبيختار المشروع حسب دومين الموقع.
   - الإنتاج: أي دومين عادي ← مشروع elwarsha-elfanya (زي ما كان بالظبط).
   - التجريبي: دومين فيه كلمة staging (مثل staging.example.com أو staging-workshop.xxx.workers.dev)
     أو دومين مكتوب في STAGING_HOSTS ← مشروع Firebase التجريبي (STAGING تحت).
   - أمان: لو الدومين تجريبي والإعدادات لسه فاضية، مفيش اتصال بأي مشروع (مش هيكتب على بيانات الإنتاج أبدًا)
     وبيظهر شريط أحمر. وفي التجريبي المجهّز بيظهر شريط برتقالي «🧪 بيئة تجريبية». */
(function (w) {
  "use strict";
  var PROD = { apiKey: "AIzaSyAISlRIHOVKhupLS8l2hG_QwY6Wkchq9W8", authDomain: "elwarsha-elfanya.firebaseapp.com", projectId: "elwarsha-elfanya", storageBucket: "elwarsha-elfanya.firebasestorage.app", messagingSenderId: "916075814550", appId: "1:916075814550:web:90e6b0c01b58abc614ecb7" };
  // الصق هنا إعدادات تطبيق الويب بتاع المشروع التجريبي (Firebase Console ← Project settings ← Your apps ← Config).
  var STAGING = { apiKey: "AIzaSyDJQr58rGVO6A5AAPNup4dgmiTCImBc08w", authDomain: "elwarsha-staging.firebaseapp.com", projectId: "elwarsha-staging", storageBucket: "elwarsha-staging.firebasestorage.app", messagingSenderId: "746270137332", appId: "1:746270137332:web:f554ba86e5d33bf98df7a1" };
  // دومينات تجريبية إضافية (اسم الدومين بالظبط، من غير https://) لو مش فيها كلمة staging.
  var STAGING_HOSTS = [];

  var host = ""; try { host = String(w.location.hostname || "").toLowerCase(); } catch (_) {}
  var isStaging = STAGING_HOSTS.indexOf(host) > -1 || /(^|[.-])staging([.-]|$)/.test(host);
  var stagingReady = !!(STAGING.apiKey && STAGING.projectId && STAGING.appId);
  var cfg = isStaging ? (stagingReady ? STAGING : null) : PROD;

  w.WF_ENV = { name: isStaging ? "staging" : "production", isStaging: isStaging, configured: !!cfg, projectId: cfg ? cfg.projectId : "" };
  w.WF_FIREBASE_CONFIG = cfg;
  // تهيئة Firebase مرة واحدة بإعدادات البيئة الحالية. بترجّع التطبيق أو null لو مفيش إعدادات.
  w.wfFirebaseInit = function () {
    if (!cfg || !w.firebase || !w.firebase.initializeApp) return null;
    if (!w.firebase.apps || !w.firebase.apps.length) w.firebase.initializeApp(cfg);
    return w.firebase.app();
  };

  if (isStaging) {
    var show = function () {
      try {
        if (!w.document || !w.document.body || w.document.getElementById("wfEnvBanner")) return;
        var b = w.document.createElement("div"); b.id = "wfEnvBanner";
        b.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:2147483000;padding:5px 8px;text-align:center;font:700 12px sans-serif;direction:rtl;color:#fff;pointer-events:none;background:" + (cfg ? "#c2570c" : "#b00020");
        b.textContent = cfg ? "🧪 بيئة تجريبية — بيانات وهمية (" + cfg.projectId + ")" : "⛔ بيئة تجريبية غير مجهّزة — لم يتم الاتصال بأي بيانات";
        w.document.body.appendChild(b);
      } catch (_) {}
    };
    if (w.document && w.document.readyState === "loading") w.document.addEventListener("DOMContentLoaded", show); else show();
  }
})(window);
