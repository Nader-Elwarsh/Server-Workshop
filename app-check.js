/* app-check.js — Firebase App Check + نداء دوال Firebase (callable) من غير SDK إضافي.

   App Check بيثبت إن الطلب جاي من تطبيقك الحقيقي (مش سكربت خارجي)، وبيتفعّل بس لو ضبطت المفتاح تحت.
   لو SITE_KEY فاضي: الملف ده مابيغيّرش أي سلوك (النظام شغال زي ما هو)، ودالة call بتشتغل من غير توكن.

   خطوات التفعيل (تفاصيلها في PHONE-INDEX-APP-CHECK-ROLLOUT.md):
     1) Firebase Console ← App Check ← سجّل تطبيق الويب بـ reCAPTCHA v3 (أو Enterprise) وخد مفتاح الموقع.
     2) حط المفتاح في SITE_KEY، وانزّل firebase-app-check-compat.js (نفس إصدار باقي ملفات vendor) في مجلد vendor.
     3) راقب «طلبات معتمدة / غير معتمدة» في الـConsole أيام، وبعدها فعّل الإلزام.
*/
(function (w) {
  "use strict";
  var SITE_KEY = "";          // مفتاح الموقع (reCAPTCHA) — فاضي = App Check متوقف
  var PROVIDER = "v3";        // "v3" أو "enterprise"
  var DEBUG_TOKEN = "";       // للتجربة المحلية فقط (توكن debug من الـConsole). سيبه فاضي في الإنتاج.
  var LIB = "./vendor/firebase-app-check-compat.js";
  var TOKEN_TIMEOUT = 5000, CALL_TIMEOUT = 12000;

  var pending = [], libPromise = null, enabled = false, activated = [];

  function loadLib() {
    if (libPromise) return libPromise;
    libPromise = new Promise(function (resolve, reject) {
      if (w.firebase && w.firebase.appCheck) return resolve();
      var s = document.createElement("script");
      s.src = LIB; s.async = true;
      s.onload = function () { (w.firebase && w.firebase.appCheck) ? resolve() : reject(new Error("app-check lib invalid")); };
      s.onerror = function () { reject(new Error("app-check lib missing: " + LIB)); };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  function activate(app) {
    if (activated.indexOf(app) > -1) return;
    if (DEBUG_TOKEN) w.FIREBASE_APPCHECK_DEBUG_TOKEN = DEBUG_TOKEN;
    var ns = w.firebase.appCheck;
    var provider = PROVIDER === "enterprise" ? new ns.ReCaptchaEnterpriseProvider(SITE_KEY) : new ns.ReCaptchaV3Provider(SITE_KEY);
    app.appCheck().activate(provider, true);
    activated.push(app);
    enabled = true;
  }

  // بيتنادى بعد كل firebase.initializeApp (التطبيق الأساسي والثانوي). مفيش خطأ بيتسرّب للنظام لو حصلت مشكلة.
  function attach(app) {
    if (!SITE_KEY || !app) return Promise.resolve(false);
    if (pending.indexOf(app) < 0) pending.push(app);
    return loadLib().then(function () {
      pending.forEach(function (a) { try { activate(a); } catch (e) { warn("activate failed", e); } });
      return enabled;
    }).catch(function (e) { warn("disabled", e); return false; });
  }

  function warn(msg, e) { try { console.warn("[app-check] " + msg, e && e.message ? e.message : e || ""); } catch (_) {} }

  function withTimeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error("timeout")); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  // هيدر X-Firebase-AppCheck للطلبات المباشرة (دوال callable). فاضي لو App Check متوقف أو التوكن مش متاح.
  function headers() {
    if (!SITE_KEY || !w.firebase || !w.firebase.apps || !w.firebase.apps.length) return Promise.resolve({});
    return (libPromise || Promise.resolve()).then(function () {
      if (!enabled) return {};
      return withTimeout(w.firebase.app().appCheck().getToken(false), TOKEN_TIMEOUT).then(function (t) {
        return t && t.token ? { "X-Firebase-AppCheck": t.token } : {};
      });
    }).catch(function () { return {}; });
  }

  /* نداء دالة callable بالـHTTP مباشرة (نفس بروتوكول httpsCallable):
     بيرمي { code: "fn/<status>", status, fallback } — fallback=true يعني الدالة مش متاحة (مش منشورة/النت/خطأ سيرفر)،
     فالواجهة تقدر ترجع للمسار القديم؛ وغير كده الرفض نهائي (حد طلبات/بيانات غلط). */
  function call(name, data) {
    var pid = w.firebase && w.firebase.apps && w.firebase.apps.length ? w.firebase.app().options.projectId : "";
    if (!pid) return Promise.reject({ code: "fn/no-project", status: 0, fallback: true });
    var url = "https://us-central1-" + encodeURIComponent(pid) + ".cloudfunctions.net/" + encodeURIComponent(name);
    return headers().then(function (h) {
      var ctl = typeof AbortController === "function" ? new AbortController() : null;
      var timer = ctl ? setTimeout(function () { ctl.abort(); }, CALL_TIMEOUT) : null;
      var hdr = { "Content-Type": "application/json" };
      Object.keys(h).forEach(function (k) { hdr[k] = h[k]; });
      return fetch(url, { method: "POST", headers: hdr, body: JSON.stringify({ data: data || {} }), signal: ctl ? ctl.signal : undefined })
        .then(function (r) {
          if (timer) clearTimeout(timer);
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (r.ok && j && j.result !== undefined) return j.result;
            var st = String((j && j.error && j.error.status) || "").toLowerCase();
            throw { code: "fn/" + (st || r.status), status: r.status, fallback: r.status === 404 || r.status >= 500 || st === "internal" || st === "unavailable" || st === "not_found" || st === "deadline_exceeded" };
          });
        }, function () { if (timer) clearTimeout(timer); throw { code: "fn/network", status: 0, fallback: true }; });
    });
  }

  w.WFAppCheck = { attach: attach, headers: headers, call: call, isConfigured: function () { return !!SITE_KEY; } };
})(window);
