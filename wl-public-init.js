/* wl-public-init.js — تهيئة Firebase خفيفة للصفحات العامة (الخصوصية والشروط) من غير ما تطلب تسجيل دخول.
   الغرض الوحيد: إن white-label.js يقدر يسحب النصوص وبيانات الورشة المنشورة (portal/branding، قراءة عامة) للزائر.
   مفيش مزامنة بيانات ولا تحويل لصفحة الدخول هنا — ده بعكس firebase-sync.js اللي للموظفين بس. */
(function () {
  try {
    if (window.wfFirebaseInit) window.wfFirebaseInit();
    if (window.WFAppCheck && window.firebase && firebase.apps && firebase.apps.length) WFAppCheck.attach(firebase.app());
  } catch (e) {}
})();
