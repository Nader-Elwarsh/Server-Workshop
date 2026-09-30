/* wf-session.js — الحفاظ على تسجيل الدخول لحد ما المستخدم يضغط «خروج» بنفسه.
   Firebase Auth بيحفظ الجلسة محليًا (LOCAL) لكن المتصفحات ممكن تمسح تخزين الموقع (قلة مساحة/عدم استخدام).
   فبنعمل طبقتين إضافيتين:
   1) persist(): نطلب من المتصفح تخزين «دائم» عشان مايتمسحش.
   2) remember/silent/forget: نحفظ بيانات الدخول في مدير كلمات المرور بتاع المتصفح (Credential Management API،
      مش في تخزين الموقع)، ولو الجلسة اتمسحت نرجّع الدخول بصمت. «خروج» بيوقف الدخول الصامت.
   المتصفحات اللي ماتدعمش الـ API (زي سفاري) بتفضل على تخزين Firebase العادي. */
(function (root) {
  "use strict";
  var nav = root.navigator || {}, tried = false;
  var S = {
    persistence: function (auth) {
      try { return auth.setPersistence(root.firebase.auth.Auth.Persistence.LOCAL).catch(function () {}); } catch (e) { return Promise.resolve(); }
    },
    persist: function () { try { if (nav.storage && nav.storage.persist) nav.storage.persist().catch(function () {}); } catch (e) {} },
    remember: function (id, pw) {
      try { if (root.PasswordCredential && nav.credentials && id && pw) nav.credentials.store(new root.PasswordCredential({ id: id, password: pw })).catch(function () {}); } catch (e) {}
    },
    forget: function () { try { if (nav.credentials && nav.credentials.preventSilentAccess) nav.credentials.preventSilentAccess().catch(function () {}); } catch (e) {} },
    silent: function (auth) {
      if (tried || !root.PasswordCredential || !nav.credentials) return Promise.resolve(null);
      tried = true; // مرة واحدة لكل تحميل صفحة (منع أي لوب)
      return nav.credentials.get({ password: true, mediation: "silent" }).then(function (c) {
        if (!c || !c.id || !c.password) return null;
        return auth.signInWithEmailAndPassword(c.id, c.password).then(function (r) { return r.user; });
      }).catch(function () { return null; });
    }
  };
  root.WfSession = S;
})(typeof window !== "undefined" ? window : this);
