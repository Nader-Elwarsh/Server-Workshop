/* wl-content-page.js — محرر «النصوص والصفحات» و«بيانات الورشة» في لوحة هوية النظام (white-label.html).
   بيكتب في نفس إعدادات الهوية (WL.mutate) فبيتحفظ على الجهاز فورًا، ولما تضغط «نشر الهوية» بيوصل لكل الأجهزة والزوّار.
   كل خانة فاضية = النص الأصلي. الحقول المسموحة ومواصفاتها بتتنظّف في white-label.js (clean) قبل أي حفظ. */
(function () {
  "use strict";
  if (!window.WL || !document.getElementById("wlContent")) return;
  var WL = window.WL;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var DEF_DOCS = {"privacy": "## إحنا مين\n\nالورشة الفنية نظام لإدارة ورش صيانة الأجهزة المنزلية: العملاء والأجهزة وأوامر الشغل والحسابات. الموقع بيخدم فريق الورشة (موظفين ومديرين) وعملاء الورشة من خلال بوابة العملاء.\n\n## البيانات اللي بنجمعها\n\n- **بيانات الموظفين:** البريد الإلكتروني وكلمة المرور لتسجيل الدخول. كلمة المرور بتتعالج من خدمة Firebase Authentication التابعة لجوجل، ومبنشوفهاش ولا بنخزنها بشكل مقروء.\n- **بيانات العملاء:** الاسم ورقم التليفون والعنوان، وبيانات الأجهزة وطلبات الصيانة والشكاوى والأسئلة اللي العميل بيبعتها.\n- **طلب الصيانة السريع (من غير حساب):** الاسم ورقم التليفون والعنوان ونوع الجهاز ووصف العطل اللي بتكتبهم في النموذج، بنستخدمهم للتواصل معاك وتنفيذ الطلب بس.\n- **بيانات التشغيل:** أوامر الشغل وقطع الغيار والمدفوعات والعربون، لأغراض متابعة الشغل والحسابات.\n\n## إزاي بنستخدمها\n\n- تنفيذ الصيانة ومتابعة حالة الجهاز والتواصل مع العميل.\n- حساب التكلفة والتحصيل وسجل الضمان.\n- حماية الحسابات ومنع الدخول غير المصرح به.\n\nمبنبيعش بياناتك ومبنشاركهاش لأغراض إعلانية.\n\n## فين بتتخزن\n\nالتطبيق بيحفظ نسخة من بيانات التشغيل على جهاز المستخدم (تخزين المتصفح)، وبيزامنها مع قاعدة بيانات سحابية على Firebase عشان تتشارك بين أجهزة الفريق وتظهر للعميل في بوابته. الوصول للبيانات محكوم بقواعد أمان: الموظف المصرح له بس يشوف بيانات الورشة، والعميل يشوف بياناته هو بس.\n\n## حقوقك\n\nتقدر تطلب من إدارة الورشة تصحيح بياناتك أو حذفها. الحذف ممكن يتأجل لو في التزام محاسبي أو ضمان ساري على الجهاز.\n\n## تحديث السياسة\n\nممكن نعدّل السياسة دي مع تطوير النظام، وآخر نسخة دايمًا هتكون على الصفحة دي.\n", "terms": "## الغرض من النظام\n\nالورشة الفنية نظام لإدارة ورش الصيانة. الدخول من صفحة الموظفين مقصور على الموظفين والمديرين المصرح لهم من إدارة الورشة. العملاء بيستخدموا بوابة العملاء لمتابعة أجهزتهم وإرسال الطلبات.\n\n## مسؤولية الحساب\n\n- كل مستخدم مسؤول عن سرية بريده وكلمة مروره، ومينفعش يشاركها مع حد.\n- لو حسيت إن حد دخل على حسابك، غيّر كلمة المرور فورًا وبلّغ الإدارة.\n\n## الاستخدام المقبول\n\n- الدخول بحساب غيرك أو محاولة تخطي صلاحياتك ممنوع.\n- إدخال بيانات غير صحيحة أو تعمّد تعديل السجلات المالية ممنوع.\n- أي محاولة لتعطيل النظام أو الوصول لبيانات غير مصرح بيها هتؤدي لإيقاف الحساب.\n\n## البيانات والنسخ الاحتياطي\n\nبنحاول نحافظ على البيانات، لكن المزامنة مش بديل للنسخ الاحتياطي. على الموظف المسؤول يعمل تصدير دوري للبيانات من إعدادات النظام.\n\n## إيقاف الحساب\n\nمن حق الإدارة تعطّل أو تحذف أي حساب في أي وقت، خصوصًا لو انتهت علاقة العمل أو حصل استخدام مخالف.\n\n## التعديلات\n\nممكن نعدّل الشروط دي مع تطوير النظام، واستمرارك في الاستخدام معناه موافقتك على النسخة المحدّثة.\n"};
  var DEF = {
    staffLoginTitle: "أهلاً بيك في الورشة الفنية",
    staffLoginIntro: "نظام إدارة ورش صيانة الأجهزة المنزلية. الصفحة دي لدخول الموظفين والمديرين.",
    staffLoginListTitle: "بعد الدخول هتقدر",
    staffLoginList: "تتابع العملاء والأجهزة وأوامر الشغل.\nتدير المخزن وقطع الغيار والخزنة.\nتراجع الحسابات والتقارير والمتابعة اليومية.\nتسجّل الضمان وتستقبل طلبات بوابة العملاء.",
    staffLoginFormTitle: "تسجيل الدخول",
    customerLoginTitle: "أهلاً بيك في الورشة الفنية",
    customerLoginIntro: "سجّل جهازك، ابعت طلب صيانة، وتابع حالته من موبايلك.",
    customerStepsTitle: "إزاي تبدأ؟",
    customerSteps: "سجّل حساب برقم تليفونك.\nضيف جهازك (النوع والماركة والموديل وصورة لو تحب).\nابعت طلب صيانة واكتب العطل بالتفصيل.\nتابع حالة الأمر، ولما يخلص تقدر تسجّل شكوى لو محتاج.",
    guestTitle: "🛠️ طلب صيانة سريع (من غير تسجيل)",
    guestIntro: "مش عايز تعمل حساب؟ سيب بياناتك وعطل جهازك والورشة هتتصل بيك.",
    guestThanks: "اتبعت طلبك ✅ الورشة هتتصل بيك في أقرب وقت.",
    privacy: DEF_DOCS.privacy,
    terms: DEF_DOCS.terms
  };
  var mine = false; // التعديل جاي من الخانات دي (ماتعيدش الرسم عشان الكتابة ماتتقطعش)

  function fld(k, label, multi, rows) {
    var v = (WL.localCfg().content || {})[k] || "", ph = DEF[k] || "", max = WL.CONTENT_MAX[k] || 200;
    return '<label class="wl-fld">' + esc(label) + (multi
      ? '<textarea data-wlk="' + k + '" rows="' + (rows || 4) + '" maxlength="' + max + '" placeholder="' + esc(ph) + '">' + esc(v) + "</textarea>"
      : '<input type="text" data-wlk="' + k + '" maxlength="' + max + '" value="' + esc(v) + '" placeholder="' + esc(ph) + '">') + "</label>";
  }
  function docFld(k, label, page) {
    return "<h3>" + esc(label) + '</h3><p class="hint">سيب الخانة فاضية = النص الأصلي. الصيغة: <b>## عنوان</b> — <b>- نقطة</b> — <b>**نص عريض**</b> — <b>[نص الرابط](https://...)</b> — سطر فاضي بين الفقرات. بتتشاف في صفحة <a href="' + page + '" target="_blank" rel="noopener">' + page + "</a>.</p>" +
      fld(k, label, true, 14) +
      '<div class="wl-btns"><button type="button" class="secondary" data-wlb="load" data-k="' + k + '">📥 حمّل النص الحالي للتعديل</button><button type="button" class="secondary" data-wlb="clear" data-k="' + k + '">↩️ رجّع الأصلي</button></div>';
  }
  function renderContent() {
    var guestOn = WL.cfg().guest !== "off";
    $("wlContent").innerHTML =
      '<p class="hint">كل نص هنا بيحل محل النص الأصلي في الصفحة. الخانة الفاضية بتسيب النص الأصلي. بعد التعديل اضغط «نشر الهوية» (قسم النسخ والتصدير) عشان يظهر على كل الأجهزة والزوّار.</p>' +
      "<h3>🔐 صفحة دخول الموظفين</h3>" +
      fld("staffLoginTitle", "العنوان الرئيسي") + fld("staffLoginIntro", "الجملة تحت العنوان", true, 2) +
      fld("staffLoginListTitle", "عنوان القائمة") + fld("staffLoginList", "القائمة (كل سطر نقطة)", true, 4) + fld("staffLoginFormTitle", "عنوان نموذج الدخول") +
      "<h3>👥 صفحة دخول العميل (البوابة)</h3>" +
      fld("customerLoginTitle", "العنوان الرئيسي") + fld("customerLoginIntro", "الجملة تحت العنوان", true, 2) +
      fld("customerStepsTitle", "عنوان الخطوات") + fld("customerSteps", "الخطوات (كل سطر خطوة)", true, 4) +
      "<h3>🛠️ طلب الصيانة السريع للزائر</h3>" +
      '<label class="wl-fld" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-wlg="1" style="width:auto;margin:0"' + (guestOn ? " checked" : "") + '> تفعيل «طلب صيانة سريع» لغير المسجّلين في بوابة العملاء</label>' +
      fld("guestTitle", "عنوان الكارت") + fld("guestIntro", "الجملة تحت العنوان", true, 2) + fld("guestThanks", "رسالة الشكر بعد الإرسال", true, 2) +
      docFld("privacy", "🛡️ سياسة الخصوصية", "privacy.html") + docFld("terms", "📜 شروط الاستخدام", "terms.html");
  }

  function wsv(k) { return (WL.localCfg().workshop || {})[k] || ""; }
  function wf(k, label, ph, ltr) {
    return '<label class="wl-fld">' + esc(label) + '<input type="text" data-wsk="' + k + '" value="' + esc(wsv(k)) + '" placeholder="' + esc(ph || "") + '"' + (ltr ? ' dir="ltr" style="text-align:left"' : "") + "></label>";
  }
  function renderWorkshop() {
    var l = WL.localCfg().workshop || {}, ph = l.phones || [], rows = "";
    for (var i = 0; i < 4; i++) {
      var p = ph[i] || {};
      rows += '<div class="wl-row" data-wsrow="' + i + '"><input type="text" data-wsp="label" value="' + esc(p.label || "") + '" placeholder="الاسم (مثال: الإدارة)" aria-label="اسم الرقم ' + (i + 1) + '" style="flex:1 1 120px">' +
        '<input type="text" data-wsp="number" dir="ltr" value="' + esc(p.number || "") + '" placeholder="01xxxxxxxxx" inputmode="tel" aria-label="رقم التليفون ' + (i + 1) + '" style="flex:1 1 150px;text-align:left"></div>';
    }
    $("wlWorkshop").innerHTML =
      '<p class="hint">كارت بيظهر للعملاء في صفحة دخول البوابة وفي «ملفي» بعد الدخول: أرقام اتصال وواتساب وعنوان ومواعيد وروابط السوشيال واليوتيوب. سيب أي خانة فاضية وماتظهرش. روابط السوشيال لازم تبدأ بـ https://</p>' +
      wf("title", "عنوان الكارت", "بيانات الورشة") +
      '<label class="wl-fld">نبذة قصيرة / دعاية<textarea data-wsk="about" rows="3" maxlength="500" placeholder="مثال: صيانة غسالات وثلاجات وتكييفات بخبرة أكتر من 10 سنين — ضمان على القطع.">' + esc(wsv("about")) + "</textarea></label>" +
      "<h3>📞 أرقام الاتصال</h3>" + rows +
      wf("whatsapp", "رقم واتساب", "01xxxxxxxxx", true) + wf("email", "الإيميل", "name@example.com", true) +
      wf("address", "العنوان", "مطاي - شارع ...") + wf("hours", "مواعيد العمل", "يوميًا من 9 ص إلى 9 م — الجمعة إجازة") +
      "<h3>🔗 الروابط</h3>" +
      wf("mapUrl", "الموقع على الخريطة (رابط)", "https://maps.google.com/...", true) + wf("facebook", "فيسبوك", "https://facebook.com/...", true) + wf("instagram", "إنستجرام", "https://instagram.com/...", true) +
      wf("youtube", "يوتيوب", "https://youtube.com/@...", true) + wf("tiktok", "تيك توك", "https://tiktok.com/@...", true) + wf("website", "موقع إلكتروني", "https://...", true) +
      '<label class="wl-fld" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-wshide="1" style="width:auto;margin:0"' + (l.hide ? " checked" : "") + "> إخفاء الكارت عن العملاء</label>" +
      "<h3>👁️ معاينة</h3><div data-wl-info></div>";
    WL.applyContent();
  }
  function renderAll() { renderContent(); renderWorkshop(); }

  function set(fn) { mine = true; try { WL.mutate(fn); } finally { mine = false; } }
  var root = document.querySelector("main.page");
  root.addEventListener("input", function (e) {
    var t = e.target;
    if (t.hasAttribute("data-wlk")) { var k = t.getAttribute("data-wlk"), v = t.value; set(function (l) { l.content = l.content || {}; if (v.trim()) l.content[k] = v; else delete l.content[k]; }); return; }
    if (t.hasAttribute("data-wsk")) { var wk = t.getAttribute("data-wsk"), wv = t.value; set(function (l) { l.workshop = l.workshop || {}; if (wv.trim()) l.workshop[wk] = wv; else delete l.workshop[wk]; }); refreshInfo(); return; }
    if (t.hasAttribute("data-wsp")) {
      var rows = document.querySelectorAll("#wlWorkshop [data-wsrow]"), out = [];
      for (var i = 0; i < rows.length; i++) out.push({ label: rows[i].querySelector('[data-wsp="label"]').value, number: rows[i].querySelector('[data-wsp="number"]').value });
      set(function (l) { l.workshop = l.workshop || {}; l.workshop.phones = out; }); refreshInfo();
    }
  });
  root.addEventListener("change", function (e) {
    var t = e.target;
    if (t.hasAttribute("data-wlg")) { var on = t.checked; set(function (l) { l.guest = on ? "on" : "off"; }); }
    else if (t.hasAttribute("data-wshide")) { var h = t.checked; set(function (l) { l.workshop = l.workshop || {}; if (h) l.workshop.hide = true; else delete l.workshop.hide; }); refreshInfo(); }
  });
  root.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-wlb]");
    if (!b) return;
    var k = b.getAttribute("data-k"), ta = document.querySelector('textarea[data-wlk="' + k + '"]');
    if (!ta) return;
    if (b.getAttribute("data-wlb") === "load") {
      if (ta.value.trim() && !confirm("هيتم استبدال النص الحالي بالنص الأصلي للتعديل عليه. متأكد؟")) return;
      ta.value = DEF[k]; set(function (l) { l.content = l.content || {}; l.content[k] = DEF[k]; });
    } else {
      if (ta.value.trim() && !confirm("الرجوع للنص الأصلي؟ التعديلات هتتمسح من الجهاز ده.")) return;
      ta.value = ""; set(function (l) { l.content = l.content || {}; delete l.content[k]; });
    }
  });
  function refreshInfo() { WL.applyContent(); }

  renderAll();
  window.addEventListener("wl:change", function () { if (!mine) renderAll(); }); // استيراد/سحب من السحابة/إعادة ضبط من أقسام تانية
})();
