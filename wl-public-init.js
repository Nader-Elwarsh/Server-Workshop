/* wl-public-init.js — تهيئة Firebase خفيفة للصفحات العامة (الخصوصية والشروط) من غير ما تطلب تسجيل دخول.
   الغرض الوحيد: إن white-label.js يقدر يسحب النصوص وبيانات الورشة المنشورة (portal/branding، قراءة عامة) للزائر.
   مفيش مزامنة بيانات ولا تحويل لصفحة الدخول هنا — ده بعكس firebase-sync.js اللي للموظفين بس. */
(function () {
  try {
    if (window.firebase && firebase.initializeApp && !(firebase.apps && firebase.apps.length)) firebase.initializeApp({apiKey:"AIzaSyAISlRIHOVKhupLS8l2hG_QwY6Wkchq9W8",authDomain:"elwarsha-elfanya.firebaseapp.com",projectId:"elwarsha-elfanya",storageBucket:"elwarsha-elfanya.firebasestorage.app",messagingSenderId:"916075814550",appId:"1:916075814550:web:90e6b0c01b58abc614ecb7"});
    if (window.WFAppCheck && window.firebase && firebase.apps && firebase.apps.length) WFAppCheck.attach(firebase.app());
  } catch (e) {}
})();
