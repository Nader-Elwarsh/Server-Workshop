/* منطق دعوات بوابة العملاء — مصدر واحد لحالة الاعتماد (credential state) ونصوص واتساب.
   دوال صافية (مفيش تخزين ولا تسجيل): الكلمة المؤقتة بتعدّي كوسيط بس ومابتتحفظش ولا بتتطبع هنا.
   بيستخدمها: portal-admin.html (لوحة البوابة) و firebase-sync.js (دعوة/إعادة تعيين من صفحة العميل)
   و app-requests.js (رسالة أمر الشغل). */
(function (g) {
  "use strict";
  var AR = /[٠-٩]/g, FA = /[۰-۹]/g;
  function normPhone(s) {
    var d = String(s == null ? "" : s).replace(AR, function (x) { return x.charCodeAt(0) - 1632; }).replace(FA, function (x) { return x.charCodeAt(0) - 1776; }).replace(/\D/g, "");
    if (d.indexOf("0020") === 0) d = d.slice(4);
    if (d.length === 12 && d.indexOf("20") === 0) d = "0" + d.slice(2);
    if (d.length === 10 && d[0] === "1") d = "0" + d;
    return /^01[0125]\d{8}$/.test(d) ? d : "";
  }
  // رقم الدخول المعروض للعميل (مطبّع زي حساب البوابة؛ رقم غلط = فاضي بدل رقم مضلّل)
  function loginPhone(s) { return normPhone(s); }
  // بيانات رابط الحساب (portalLinks) بشكل ثابت — بيحافظ على pwKind و disabled
  function linkInfo(uid, data) {
    var x = data || {};
    return { uid: uid, customerId: x.customerId || "", mustChange: x.mustChange !== false, pwKind: x.pwKind ? String(x.pwKind) : "", disabled: x.disabled === true };
  }
  /* none: مفيش حساب | disabled: حساب معطّل (اتبدّل) | active: العميل غيّر كلمته |
     temp: كلمة مؤقتة عشوائية متاحة دلوقتي (لسه ما اتقفلتش الصفحة) |
     temp-lost: كلمة مؤقتة عشوائية اتبعتت قبل كده ومش متاحة (محتاج إعادة تعيين لو ضاعت) |
     legacy: حساب قديم (من غير pwKind) كلمته المبدئية نفس رقم التليفون */
  function credState(link, temp) {
    if (!link) return "none";
    if (link.disabled) return "disabled";
    if (link.mustChange === false) return "active";
    if (temp) return "temp";
    return link.pwKind ? "temp-lost" : "legacy";
  }
  var CHANGE = " (هتطلب منك تغييرها أول دخول).";
  function pwLine(state, temp) {
    if (state === "temp") return "كلمة المرور المؤقتة: " + temp + CHANGE;
    if (state === "legacy") return "كلمة المرور المبدئية: نفس رقم تليفونك" + CHANGE;
    if (state === "temp-lost") return "كلمة المرور المؤقتة اتبعتتلك قبل كده. لو ضاعت، اطلب من الورشة تعمل لك كلمة جديدة.";
    return "";
  }
  function defaultTpl(wlName) {
    return "أهلاً {الاسم} 👋\nتقدر تتابع أجهزتك وأوامر الصيانة وتسأل الورشة من بوابة " + (wlName || "الورشة الفنية") + ":\n{الرابط}\n\nالدخول برقم تليفونك: {الرقم}\n{كلمة_المرور}";
  }
  // o: {tpl,name,url,phone,wlName,link:<linkInfo|null>,temp}
  function inviteMessage(o) {
    o = o || {};
    var p = normPhone(o.phone), state = credState(o.link, o.temp), tpl = o.tpl || defaultTpl(o.wlName);
    var res = { state: state, needsReset: state === "temp-lost", text: "" };
    if (!p || state === "none" || state === "disabled") return res;
    var line = pwLine(state, o.temp);
    // قالب مخصص من غير {كلمة_المرور}: ماتضيعش الكلمة المؤقتة على العميل
    if (state === "temp" && tpl.indexOf("{كلمة_المرور}") < 0) tpl += "\n{كلمة_المرور}";
    res.text = tpl.replace(/\{الاسم\}/g, o.name || "").replace(/\{الرابط\}/g, o.url || "").replace(/\{الرقم\}/g, p).replace(/\{كلمة_المرور\}/g, line).trim();
    return res;
  }
  function resetMessage(o) {
    o = o || {};
    var p = normPhone(o.phone);
    if (!p || !o.temp) return "";
    return "أهلاً " + (o.name || "") + " 👋\nتم إعادة تعيين كلمة مرورك في بوابة " + (o.wlName || "الورشة الفنية") + ".\n" + (o.url || "") + "\nالدخول برقم تليفونك: " + p + "\nكلمة المرور المؤقتة: " + o.temp + "\n(هتطلب منك تغييرها أول دخول)";
  }
  // قالب أمر الشغل: رابط المتابعة لوحده مايفعّل حساب؛ الحساب بيتفعّل بدعوة من الورشة
  var WORK_ORDER_TPL = "مرحباً {اسم_العميل}، أمرك رقم {رقم_الأمر} ({اسم_الجهاز}) حالته: {الحالة}.\nتقدر تتابعه من بوابة الورشة:\n{رابط_البوابة}\nالدخول برقم تليفونك: {رقم_الدخول}\n(لو لسه ما فعّلتش حسابك، اطلب من الورشة دعوة الدخول.)";
  var api = { normPhone: normPhone, loginPhone: loginPhone, linkInfo: linkInfo, credState: credState, inviteMessage: inviteMessage, resetMessage: resetMessage, defaultTpl: defaultTpl, WORK_ORDER_TPL: WORK_ORDER_TPL };
  g.WFPortalInvite = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
