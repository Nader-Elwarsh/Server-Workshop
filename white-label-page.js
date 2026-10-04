/* white-label-page.js — واجهة لوحة «هوية النظام» (white-label.html).
   كل التعديلات بتتحفظ على الجهاز فورًا وبتظهر في كل الصفحات (عن طريق white-label.js).
   «نشر الهوية» بينزّلها على كل الأجهزة والعملاء، و«تصدير ملف إعداد النسخة» بيجهّز نسخة لعميل. */
(function () {
  "use strict";
  var WL = window.WL;
  if (!WL) return;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  /* الاسم الأصلي بمسافة صفرية العرض عشان محرك الاستبدال مايغيّرهوش في الشرح */
  var DEFN = WL.DEF_NAME.replace(" ", "\u200b ");
  var DEFT = WL.DEF_TAG.replace(" ", "\u200b ");

  var mode = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

  /* ---------- إشعار صغير ---------- */
  var toastT = null;
  function toast(t, bad) {
    var el = $("wlToast");
    if (!el) {
      el = document.createElement("div"); el.id = "wlToast"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
      el.style.cssText = "position:fixed;left:50%;bottom:78px;transform:translateX(-50%);max-width:92vw;padding:10px 16px;border-radius:12px;font-weight:700;z-index:99999;box-shadow:0 6px 24px rgba(0,0,0,.3);display:none;text-align:center";
      document.body.appendChild(el);
    }
    el.textContent = t;
    el.style.background = bad ? "#b3261e" : "#18794e"; el.style.color = "#fff"; el.style.display = "block";
    clearTimeout(toastT); toastT = setTimeout(function () { el.style.display = "none"; }, bad ? 6000 : 3200);
  }
  function download(name, blob) {
    var a = document.createElement("a"), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); if (a.parentNode) a.parentNode.removeChild(a); }, 3000);
  }

  /* ---------- CSS اللوحة ---------- */
  var css = document.createElement("style");
  css.textContent =
    ".wl-row{display:flex;align-items:center;gap:8px;margin:8px 0;flex-wrap:wrap}" +
    ".wl-row>span.wl-lbl{flex:1 1 170px;font-weight:700}" +
    ".wl-row input[type=color]{width:52px;height:40px;padding:2px;margin:0;border-radius:8px;cursor:pointer}" +
    ".wl-row input.wl-hex{width:100px;margin:0;direction:ltr;text-align:center;font-family:monospace}" +
    ".wl-row input[type=text],.wl-row select{flex:1 1 150px;margin:0}" +
    ".wl-fld{display:block;margin:10px 0;font-weight:700}.wl-fld input,.wl-fld select{display:block;width:100%;margin-top:4px;font-weight:400}" +
    ".wl-btns{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}" +
    ".wl-chips{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}" +
    ".wl-chip{display:flex;align-items:center;gap:7px;padding:8px 12px;border-radius:999px;border:1px solid var(--border);background:var(--bg-elevated);color:var(--text);font-weight:700;cursor:pointer;font-family:inherit}" +
    ".wl-chip i{display:inline-block;width:22px;height:22px;border-radius:50%;border:2px solid var(--bg-elevated);box-shadow:0 0 0 1px var(--border)}" +
    ".wl-seg{display:flex;gap:6px;margin:10px 0}.wl-seg button{flex:1}" +
    ".wl-seg button.on{background:var(--wl-primary,#17324d);color:var(--wl-on-primary,#fff)}" +
    ".wl-warn{background:rgba(224,179,74,.16);border:1px solid var(--warn-text);color:var(--warn-text);border-radius:10px;padding:8px 10px;margin:6px 0;font-size:13px}" +
    ".wl-prev{border:1px solid var(--border);border-radius:14px;overflow:hidden;background:var(--bg)}" +
    ".wl-prev-head{display:flex;align-items:center;gap:12px;padding:14px;background:linear-gradient(135deg,var(--header-grad-1),var(--header-grad-2));color:#fff}" +
    ".wl-prev-head img{width:46px;height:46px;border-radius:22%;object-fit:contain;background:rgba(255,255,255,.12)}" +
    ".wl-prev-head h3{margin:0;font-size:20px;color:#fff}.wl-prev-head p{margin:2px 0 0;font-size:13px;opacity:.9;color:#fff}" +
    ".wl-prev-body{padding:14px}" +
    ".wl-prev-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}" +
    ".wl-prev-logo{background:#fff;border:1px solid var(--border);border-radius:12px;padding:8px 12px;display:inline-block;margin:6px 0}.wl-prev-logo img{display:block;height:54px;width:auto;max-width:240px}" +
    ".wl-code{direction:ltr;text-align:left;white-space:pre-wrap;background:var(--bg-sunken);border:1px solid var(--border);border-radius:10px;padding:10px;font-family:monospace;font-size:12px;overflow:auto}" +
    ".wl-badge{display:inline-block;font-size:11px;padding:1px 8px;border-radius:999px;background:var(--wl-accent,#f2a93b);color:#111;margin-inline-start:6px;vertical-align:middle}";
  document.head.appendChild(css);

  /* =========================================================
     الاسم والنصوص
     ========================================================= */
  function replaceRows(list) {
    return list.map(function (p, i) {
      return '<div class="wl-row" data-wlrr="' + i + '"><input type="text" data-wlrf="0" value="' + esc(p[0]) + '" placeholder="الكلمة/الجملة الحالية" aria-label="الكلمة الحالية">' +
        '<span aria-hidden="true">←</span><input type="text" data-wlrf="1" value="' + esc(p[1]) + '" placeholder="تتحول لإيه" aria-label="تتحول لإيه">' +
        '<button type="button" class="secondary" data-wla="rm-rep" data-wli="' + i + '" aria-label="حذف">🗑️</button></div>';
    }).join("");
  }
  var repDraft = null; // صفوف الاستبدال أثناء التحرير (بتشمل الصف الفاضي اللي لسه بيتكتب)
  function renderNames() {
    var l = WL.localCfg(), e = WL.cfg();
    $("wlNames").innerHTML =
      '<label class="wl-fld">اسم النظام / الورشة<input type="text" data-wlf="name" maxlength="80" value="' + esc(l.name || "") + '" placeholder="' + esc(DEFN) + '"></label>' +
      '<p class="hint">بيتغيّر تلقائيًا في كل مكان: عناوين الصفحات، التبويب، شاشة الدخول وبوابة العملاء، الفوتر، الشروط والخصوصية، الإيصالات، ورسائل الواتساب الجاهزة. سيبه فاضي لو عايز الاسم الأصلي.</p>' +
      '<label class="wl-fld">الوصف تحت الاسم (الشعار النصي)<input type="text" data-wlf="tagline" maxlength="120" value="' + esc(l.tagline || "") + '" placeholder="' + esc(DEFT) + '"></label>' +
      '<label class="wl-fld">الاسم المختصر (تحت أيقونة التطبيق على الموبايل)<input type="text" data-wlf="shortName" maxlength="24" value="' + esc(l.shortName || "") + '" placeholder="' + esc(DEFN) + '"></label>' +
      '<h3>🔁 استبدالات نصية إضافية</h3>' +
      '<p class="hint">أي كلمة أو جملة تتغيّر لكلمة تانية في كل صفحات النظام. مثال: «الورشة» ← «المركز». الاستبدال بيتطبق بعد الاسم والوصف، وبيشتغل على النصوص الظاهرة فقط (مش على بيانات العملاء المخزّنة).</p>' +
      '<div id="wlRepList">' + replaceRows(repDraft !== null ? repDraft : (l.replace || [])) + '</div>' +
      '<div class="wl-btns"><button type="button" class="secondary" data-wla="add-rep">➕ إضافة استبدال</button></div>' +
      '<p class="hint">الاسم الحالي المعروض: <b id="wlCurName">' + esc(e.name || DEFN) + '</b></p>' +
      '<p class="hint">ملاحظة: «اسم الورشة» جوه إعدادات النظام ← إعدادات الإيصال لو اتكتب بيغلب على الإيصالات فقط. سيبه فاضي عشان الإيصال ياخد اسم النظام من هنا.</p>';
  }
  function collectReplace() {
    var rows = document.querySelectorAll("#wlRepList [data-wlrr]"), out = [];
    for (var i = 0; i < rows.length; i++) {
      var a = rows[i].querySelector('[data-wlrf="0"]').value, b = rows[i].querySelector('[data-wlrf="1"]').value;
      out.push([a, b]);
    }
    return out;
  }

  /* =========================================================
     الألوان
     ========================================================= */
  function shown(k) {
    var e = WL.cfg().colors[mode], d = null, i;
    if (e[k]) return e[k];
    var defs = WL.COLOR_DEFS; for (i = 0; i < defs.length; i++) if (defs[i].k === k) d = defs[i][mode];
    var base = e.primary || (mode === "dark" ? WL.cfg().colors.light.primary : "") || "";
    if (k === "link" && base) return mode === "dark" ? WL.mix(base, "#ffffff", 0.6) : base;
    if (k === "primary" && !e.primary && mode === "dark" && base) return base;
    if (k === "primary2" && base) return WL.mix(base, "#ffffff", 0.16);
    return d;
  }
  function colorRows() {
    var l = WL.localCfg().colors[mode] || {}, e = WL.cfg().colors[mode] || {};
    return WL.COLOR_DEFS.map(function (d) {
      var v = shown(d.k), custom = !!e[d.k];
      return '<div class="wl-row" data-wlck="' + d.k + '"><span class="wl-lbl">' + esc(d.label) + (custom ? '<span class="wl-badge">معدّل</span>' : "") + '</span>' +
        '<input type="color" data-wlc="' + d.k + '" value="' + esc(v) + '" aria-label="' + esc(d.label) + '">' +
        '<input type="text" class="wl-hex" data-wlh="' + d.k + '" value="' + esc(v.toUpperCase()) + '" maxlength="7" aria-label="كود ' + esc(d.label) + '">' +
        '<button type="button" class="secondary" data-wla="reset-color" data-wlk="' + d.k + '"' + (custom ? "" : " disabled") + ' aria-label="رجوع للأصلي">↩️</button></div>';
    }).join("");
  }
  function warnings() {
    var w = [], bg = shown("bg"), sf = shown("surface"), tx = shown("text"), mu = shown("muted"), lk = shown("link");
    function chk(a, b, msg, min) { var r = WL.contrast(a, b); if (r < (min || 4.5)) w.push("⚠️ " + msg + " (نسبة التباين " + r.toFixed(1) + " من 4.5) — ممكن القراءة تتعب."); }
    chk(tx, bg, "النص على خلفية الصفحة");
    chk(tx, sf, "النص على خلفية البطاقات");
    chk(mu, sf, "النص الثانوي على البطاقات", 3);
    chk(lk, sf, "لون الروابط على البطاقات", 3);
    var pr = shown("primary"); chk(WL.onColor(pr), pr, "كتابة الأزرار على اللون الأساسي", 3);
    return w.map(function (t) { return '<div class="wl-warn">' + esc(t) + "</div>"; }).join("");
  }
  function renderColors() {
    var chips = WL.PRESETS.map(function (p) {
      var c = p.c ? p.c.primary : "#17324d", c2 = p.c ? p.c.accent : "#f2a93b";
      return '<button type="button" class="wl-chip" data-wla="preset" data-wlp="' + p.id + '"><i style="background:linear-gradient(135deg,' + c + ' 55%,' + c2 + ' 55%)"></i>' + esc(p.name) + "</button>";
    }).join("");
    $("wlColors").innerHTML =
      '<h3>🎯 ثيمات جاهزة</h3><p class="hint">اختار ثيم بضغطة واحدة (بيغيّر الأساسي والثانوي والمميز والروابط، والثيمات «الكاملة» بتغيّر كمان الخلفيات والنصوص والحدود للوضع الفاتح)، وبعدها تقدر تعدّل أي لون لوحده.</p><div class="wl-chips">' + chips + "</div>" +
      '<h3>🎨 ألوان تفصيلية</h3>' +
      '<div class="wl-seg" role="group" aria-label="الوضع"><button type="button" class="secondary' + (mode === "light" ? " on" : "") + '" data-wla="mode" data-wlm="light">☀️ الوضع الفاتح</button><button type="button" class="secondary' + (mode === "dark" ? " on" : "") + '" data-wla="mode" data-wlm="dark">🌙 الوضع الداكن</button></div>' +
      '<p class="hint">بتعدّل ألوان الوضع المختار (والصفحة بتتحوّل له عشان تشوف النتيجة فورًا). اللي ماتعدّلش بيفضل بلونه الأصلي.</p>' +
      '<div id="wlColorRows">' + colorRows() + "</div>" +
      '<div id="wlWarn">' + warnings() + "</div>" +
      '<div class="wl-btns"><button type="button" class="secondary" data-wla="reset-mode">↩️ رجوع لألوان الوضع ده الأصلية</button><button type="button" class="secondary" data-wla="reset-colors">↩️ رجوع لكل الألوان الأصلية</button></div>';
  }
  function setColor(k, v) {
    WL.mutate(function (l) { l.colors = l.colors || { light: {}, dark: {} }; l.colors[mode] = l.colors[mode] || {}; l.colors[mode][k] = v; });
  }
  function refreshColorRows(keepFocus) {
    var rows = $("wlColorRows"); if (!rows) return;
    var e = WL.cfg().colors[mode] || {};
    WL.COLOR_DEFS.forEach(function (d) {
      var row = rows.querySelector('[data-wlck="' + d.k + '"]'); if (!row) return;
      var v = shown(d.k), custom = !!e[d.k];
      var c = row.querySelector("[data-wlc]"), h = row.querySelector("[data-wlh]"), b = row.querySelector("[data-wla=reset-color]"), lb = row.querySelector(".wl-lbl");
      if (!(keepFocus && document.activeElement === c)) c.value = v;
      if (!(keepFocus && document.activeElement === h)) h.value = v.toUpperCase();
      b.disabled = !custom;
      var bd = lb.querySelector(".wl-badge");
      if (custom && !bd) lb.insertAdjacentHTML("beforeend", '<span class="wl-badge">معدّل</span>');
      if (!custom && bd) bd.parentNode.removeChild(bd);
    });
    var w = $("wlWarn"); if (w) w.innerHTML = warnings();
  }

  /* =========================================================
     الشكل
     ========================================================= */
  var RADIUS_LBL = { "default": "الأصلي", sharp: "حاد", soft: "ناعم قليلًا", round: "مستدير", pill: "مستدير جدًا" };
  var LOGO_LBL = { "default": "الأصلي", circle: "دائري", square: "مربع", soft: "ناعم", round: "مستدير" };
  function opts(map, cur, labelFn) {
    return Object.keys(map).map(function (k) { return '<option value="' + k + '"' + (k === cur ? " selected" : "") + ">" + esc(labelFn(k)) + "</option>"; }).join("");
  }
  function renderShape() {
    var s = WL.cfg().shape;
    $("wlShape").innerHTML =
      '<div class="wl-row"><span class="wl-lbl">استدارة زوايا الأزرار والبطاقات: <b id="wlRadiusV">' + (typeof s.radius === "number" ? s.radius + " px" : "الأصلي") + '</b></span><input type="range" min="0" max="28" step="1" data-wls="radius" value="' + (typeof s.radius === "number" ? s.radius : 12) + '" style="flex:1 1 160px"><button type="button" class="secondary" data-wla="reset-radius" aria-label="رجوع للأصلي">↩️</button></div>' +
      '<label class="wl-fld">الخط<select data-wls="font">' + opts(WL.FONTS, s.font || "default", function (k) { return WL.FONTS[k].label; }) + "</select></label>" +
      '<p class="hint">الخطوط المكتوب جنبها «أونلاين» بتتحمّل من Google Fonts لما يكون فيه نت، ولو مفيش نت بيستخدم النظام خط بديل تلقائيًا.</p>' +
      '<label class="wl-fld">شكل الهيدر (الشريط العلوي)<select data-wls="header"><option value="default"' + (s.header ? "" : " selected") + '>تدرج لوني (الأصلي)</option><option value="solid"' + (s.header === "solid" ? " selected" : "") + ">لون واحد ثابت</option></select></label>" +
      '<label class="wl-fld">شكل الشعار/الأيقونة في الهيدر<select data-wls="logoShape">' + opts(WL.LOGO_SHAPES, s.logoShape || "default", function (k) { return LOGO_LBL[k]; }) + "</select></label>" +
      '<div class="wl-row"><span class="wl-lbl">حجم الشعار في الهيدر: <b id="wlLogoSz">' + (s.logoSize || 46) + '</b> px</span><input type="range" min="28" max="120" step="2" data-wls="logoSize" value="' + (s.logoSize || 46) + '" style="flex:1 1 160px"><button type="button" class="secondary" data-wla="reset-logosize">↩️</button></div>' +
      '<div class="wl-btns"><button type="button" class="secondary" data-wla="reset-shape">↩️ رجوع للشكل الأصلي</button></div>';
  }

  /* =========================================================
     التطبيق المثبّت
     ========================================================= */
  function renderApp() {
    var e = WL.cfg();
    $("wlApp").innerHTML =
      '<p class="hint">اسم التطبيق ولونه على الموبايل بيتاخدوا من «اسم النظام» و«الاسم المختصر» و«اللون الأساسي». النظام بيولّد ملف التثبيت (manifest) تلقائيًا بالقيم دي.</p>' +
      '<div class="wl-prev-body" style="border:1px solid var(--border);border-radius:12px">' +
      "<div>الاسم الكامل: <b>" + esc(WL.cfg().name ? WL.cfg().name + (e.tagline ? " - " + e.tagline : "") : DEFN) + "</b></div>" +
      "<div>الاسم تحت الأيقونة: <b>" + esc(WL.shortName()) + "</b></div>" +
      '<div>لون شريط المتصفح: <b style="direction:ltr;display:inline-block">' + esc((e.colors.light.primary || "#001B4D").toUpperCase()) + "</b></div></div>" +
      '<p class="hint">⚠️ الموبايل بيحفظ اسم وأيقونة التطبيق وقت التثبيت. بعد تغيير الاسم أو الأيقونة: احذف التطبيق من الشاشة الرئيسية وثبّته من جديد. أيقونة الشاشة الرئيسية بتتغير بملفات الأيقونات (زر التنزيل تحت).</p>' +
      '<div class="wl-btns"><button type="button" data-wla="dl-icons">⬇️ تنزيل ملفات الأيقونات بالشعار الحالي</button></div>' +
      '<p class="hint">انسخ الملفات اللي نزلت فوق ملفات المشروع (icon-192-v13.png وicon-512-v13.png وicon-maskable-512-v13.png وapple-touch-icon-v13.png وapp-icon.svg) وارفع المشروع. للنسخ اللي بتتسلّم لعميل: ده الأفضل.</p>';
  }

  /* =========================================================
     النسخ والتصدير
     ========================================================= */
  var RULE = "match /portal/{doc} {\n  allow read: if signedIn() || doc == 'branding';\n  allow write: if isStaff();\n}";
  function renderSync() {
    $("wlSync").innerHTML =
      "<h3>☁️ مزامنة الهوية</h3>" +
      '<p class="hint">«نشر الهوية» بيرفع الاسم والألوان والشكل والشعار على السحابة، وكل جهاز (موظفين وعملاء) بياخدها لوحده عند الفتح. لازم تكون أونلاين ومسجّل دخول.</p>' +
      '<div class="wl-btns"><button type="button" class="primary" data-wla="push">☁️ نشر الهوية على كل الأجهزة</button><button type="button" class="secondary" data-wla="pull">⬇️ سحب آخر نسخة من السحابة</button></div>' +
      '<details><summary>🔐 عشان شاشة الدخول عند العملاء تشوف الهوية قبل تسجيل الدخول</summary><p class="hint">قواعد Firestore بتسمح بالقراءة بعد تسجيل الدخول فقط. لو عايز الهوية تظهر قبله كمان، حدّث القاعدة دي (موجودة جاهزة في ملف firestore.rules) وانشرها من Firebase Console. المستند ده فيه الاسم والألوان والشعار بس، مفيش فيه بيانات خاصة:</p><div class="wl-code">' + esc(RULE) + "</div></details>" +
      "<h3>📦 تجهيز نسخة لعميل (بيع / تأجير)</h3>" +
      '<p class="hint">بعد ما تضبط الهوية، اضغط «تصدير ملف إعداد النسخة» ونزّل الملف، واستبدل بيه <b>white-label-config.js</b> في المشروع قبل الرفع. أي جهاز بيفتح النسخة بيشوف هوية العميل من أول لحظة حتى قبل الدخول.</p>' +
      '<div class="wl-btns"><button type="button" class="primary" data-wla="export-cfg">📦 تصدير ملف إعداد النسخة</button></div>' +
      '<p class="hint">لو عايز لوحة الهوية تطلب كود قبل التعديل (عشان المستأجر مايغيّرش الهوية)، افتح الملف المصدّر وضيف السطر: <span style="direction:ltr;display:inline-block">lock: { code: "1234" }</span> جوه الكائن.</p>' +
      "<h3>💾 نسخة احتياطية للهوية</h3>" +
      '<div class="wl-btns"><button type="button" class="secondary" data-wla="export-json">⬇️ تصدير الهوية (JSON)</button><button type="button" class="secondary" data-wla="import-json">⬆️ استيراد هوية</button><button type="button" class="secondary" data-wla="reset-all" style="border-color:var(--danger-text);color:var(--danger-text)">🧹 إعادة ضبط كل شيء</button></div>' +
      '<input type="file" id="wlImport" accept="application/json,.json" hidden>';
  }

  /* =========================================================
     المعاينة
     ========================================================= */
  function renderPreview() {
    $("wlPreview").innerHTML =
      '<div class="wl-prev"><div class="wl-prev-head"><img class="brand-logo" src="app-icon.svg" alt=""><div><h3>' + "الورشة الفنية" + "</h3><p>" + "نظام إدارة الورشة المصغر" + "</p></div></div>" +
      '<div class="wl-prev-body"><div class="wl-prev-logo"><img data-wf-brand="logo" src="workshop-logo.svg" alt=""></div>' +
      '<div class="wl-btns"><button type="button" class="primary">زر أساسي</button><button type="button" class="secondary">زر ثانوي</button><button type="button" class="danger-btn">حذف</button></div>' +
      '<div class="wl-prev-stats"><div class="stat"><b>12</b><span>أوامر شغل</span></div><div class="stat"><b>5</b><span>عملاء</span></div><div class="stat"><b>3</b><span>مهام</span></div></div>' +
      '<p>نص عادي، <a href="#" onclick="return false">رابط</a>، <span style="color:var(--text-muted)">نص ثانوي</span></p>' +
      '<p><span style="color:var(--success-text)">✔ نجاح</span> · <span style="color:var(--warn-text)">⚠ تحذير</span> · <span style="color:var(--danger-text)">✖ خطأ</span></p></div></div>';
  }

  /* =========================================================
     البوابة (كود القفل)
     ========================================================= */
  function gate() {
    var code = WL.lock(), ok = false;
    try { ok = sessionStorage.getItem("wf_wl_unlocked") === "1"; } catch (e) {}
    var g = $("wlGate"), st = $("wlGateCss");
    if (!code || ok) { if (g) g.innerHTML = ""; if (st) st.parentNode.removeChild(st); return true; }
    if (!st) { st = document.createElement("style"); st.id = "wlGateCss"; st.textContent = "main.page section.panel,.st-nav{display:none!important}"; document.head.appendChild(st); }
    g.innerHTML = '<div class="wl-gate" style="border:1px solid var(--border);border-radius:14px;padding:14px;background:var(--bg-elevated)"><h2>🔒 لوحة الهوية مقفولة</h2><p class="hint">اكتب كود فتح اللوحة اللي اتسلّمتلك من مزوّد النظام.</p><div class="wl-row"><input type="password" id="wlCode" autocomplete="off" aria-label="كود الفتح"><button type="button" class="primary" data-wla="unlock">فتح</button></div></div>';
    return false;
  }

  /* =========================================================
     الأحداث
     ========================================================= */
  var root = document.querySelector("main.page");
  var debounce = null;
  function later(fn) { clearTimeout(debounce); debounce = setTimeout(fn, 60); }

  root.addEventListener("input", function (e) {
    var t = e.target;
    if (t.hasAttribute("data-wlf")) {
      var f = t.getAttribute("data-wlf"), v = t.value;
      WL.mutate(function (l) { l[f] = v; });
      return;
    }
    if (t.hasAttribute("data-wlrf")) { repDraft = collectReplace(); var rows = repDraft; WL.mutate(function (l) { l.replace = rows; }); return; }
    if (t.hasAttribute("data-wlc")) {
      var k = t.getAttribute("data-wlc"), h = root.querySelector('[data-wlh="' + k + '"]'); if (h) h.value = t.value.toUpperCase();
      later(function () { setColor(k, t.value); refreshColorRows(true); });
      return;
    }
    if (t.getAttribute("data-wls") === "radius") {
      var rv = $("wlRadiusV"); if (rv) rv.textContent = t.value + " px";
      later(function () { WL.mutate(function (l) { l.shape = l.shape || {}; l.shape.radius = Number(t.value); }); });
      return;
    }
    if (t.getAttribute("data-wls") === "logoSize") {
      var z = $("wlLogoSz"); if (z) z.textContent = t.value;
      later(function () { WL.mutate(function (l) { l.shape = l.shape || {}; l.shape.logoSize = Number(t.value); }); });
    }
  });
  root.addEventListener("change", function (e) {
    var t = e.target;
    if (t.hasAttribute("data-wlh")) {
      var k = t.getAttribute("data-wlh"), v = ("#" + t.value.replace(/[^0-9a-f]/gi, "")).slice(0, 7);
      if (!/^#[0-9a-f]{6}$/i.test(v)) { toast("اكتب كود لون صحيح من 6 خانات، مثال: #17324D", true); refreshColorRows(); return; }
      setColor(k, v.toLowerCase()); refreshColorRows(); return;
    }
    var s = t.getAttribute && t.getAttribute("data-wls");
    if (s && s !== "logoSize" && s !== "radius") { WL.mutate(function (l) { l.shape = l.shape || {}; l.shape[s] = t.value; }); return; }
    if (t.id === "wlImport") {
      var file = t.files && t.files[0]; if (!file) return;
      var fr = new FileReader();
      fr.onload = function () {
        var o; try { o = JSON.parse(String(fr.result)); } catch (er) { return toast("الملف ده مش JSON صالح", true); }
        WL.importJson(o).then(function () { renderAll(); toast("✅ تم استيراد الهوية"); })["catch"](function (er) { toast(er.message || "تعذر الاستيراد", true); });
      };
      fr.readAsText(file); t.value = "";
    }
  });
  root.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-wla]") : null;
    if (!b || b.disabled) return;
    var a = b.getAttribute("data-wla");
    if (a === "unlock") {
      var inp = $("wlCode");
      if (inp && inp.value === WL.lock()) { try { sessionStorage.setItem("wf_wl_unlocked", "1"); } catch (er) {} gate(); setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 50); }
      else toast("الكود غلط", true);
    } else if (a === "add-rep") {
      repDraft = collectReplace(); repDraft.push(["", ""]); renderNames();
      var last = document.querySelectorAll('#wlRepList [data-wlrf="0"]'); if (last.length) last[last.length - 1].focus();
    } else if (a === "rm-rep") {
      var i = Number(b.getAttribute("data-wli")), rows = collectReplace(); rows.splice(i, 1); repDraft = rows;
      WL.mutate(function (l) { l.replace = rows; }); renderNames();
    } else if (a === "preset") {
      var p = WL.PRESETS.filter(function (x) { return x.id === b.getAttribute("data-wlp"); })[0];
      WL.mutate(function (l) {
        l.colors = l.colors || { light: {}, dark: {} };
        var wipe = ["primary", "primary2", "accent", "link"].concat(p && p.c ? Object.keys(p.c) : []);
        ["light", "dark"].forEach(function (m) { l.colors[m] = l.colors[m] || {}; wipe.forEach(function (k) { delete l.colors[m][k]; }); });
        if (p && p.c) Object.keys(p.c).forEach(function (k) { l.colors.light[k] = p.c[k]; });
      });
      renderColors(); renderApp(); toast("✅ تم تطبيق ثيم «" + (p ? p.name : "") + "»");
    } else if (a === "mode") {
      var dark = b.getAttribute("data-wlm") === "dark";
      if (typeof wfApplyDark === "function") wfApplyDark(dark); else if (dark) document.documentElement.setAttribute("data-theme", "dark"); else document.documentElement.removeAttribute("data-theme");
      if (typeof updateThemeToggleIcons === "function") updateThemeToggleIcons();
    } else if (a === "reset-color") {
      var k = b.getAttribute("data-wlk");
      WL.mutate(function (l) { if (l.colors && l.colors[mode]) delete l.colors[mode][k]; });
      refreshColorRows();
    } else if (a === "reset-mode") {
      WL.mutate(function (l) { if (l.colors) l.colors[mode] = {}; }); renderColors();
    } else if (a === "reset-colors") {
      WL.mutate(function (l) { l.colors = { light: {}, dark: {} }; }); renderColors(); renderApp();
    } else if (a === "reset-radius") {
      WL.mutate(function (l) { if (l.shape) delete l.shape.radius; }); renderShape();
    } else if (a === "reset-logosize") {
      WL.mutate(function (l) { if (l.shape) delete l.shape.logoSize; }); renderShape();
    } else if (a === "reset-shape") {
      WL.mutate(function (l) { l.shape = {}; }); renderShape(); toast("تم الرجوع للشكل الأصلي");
    } else if (a === "dl-icons") {
      if (!window.WFBrand) return toast("ملف الشعار لسه بيتحمّل — جرّب بعد ثواني", true);
      toast("جاري تجهيز الملفات… لو المتصفح سأل عن تنزيل ملفات متعددة اسمح بيه.");
      WFBrand.downloadIcons().then(function () { toast("✅ تم تنزيل الأيقونات"); })["catch"](function () { toast("تعذر تجهيز الأيقونات", true); });
    } else if (a === "push") {
      b.disabled = true;
      WL.cloudPush().then(function (r) { b.disabled = false; toast(r && r.warn ? "✅ اتنشرت — " + r.warn : "✅ اتنشرت الهوية على كل الأجهزة", !!(r && r.warn)); })
        ["catch"](function (er) { b.disabled = false; toast("❌ " + (er && er.code === "permission-denied" ? "الحساب ده مش مصرّح له بالنشر" : (er && er.message) || "تعذر النشر"), true); });
    } else if (a === "pull") {
      b.disabled = true;
      WL.cloudPull({ force: true, wait: 6000 }).then(function (r) { b.disabled = false; renderAll(); toast(r.exists ? "✅ تم سحب الهوية من السحابة" : "مفيش هوية منشورة على السحابة لسه", !r.exists); })
        ["catch"](function (er) { b.disabled = false; toast("❌ " + (er && er.code === "permission-denied" ? "مفيش صلاحية قراءة (سجّل الدخول)" : (er && er.message) || "تعذر السحب"), true); });
    } else if (a === "export-cfg") {
      WL.exportConfigFile().then(function (txt) { download("white-label-config.js", new Blob([txt], { type: "text/javascript" })); toast("✅ نزل white-label-config.js — استبدل بيه الملف في المشروع"); })
        ["catch"](function () { toast("تعذر التصدير", true); });
    } else if (a === "export-json") {
      WL.exportJson().then(function (o) { download("workshop-whitelabel.json", new Blob([JSON.stringify(o)], { type: "application/json" })); toast("✅ تم تصدير الهوية"); });
    } else if (a === "import-json") {
      $("wlImport").click();
    } else if (a === "reset-all") {
      if (!confirm("الرجوع للهوية الأصلية بالكامل (الاسم والألوان والشكل)؟\nالشعار والأيقونة بيتم إرجاعهم من قسم «الشعار والأيقونة».")) return;
      WL.reset(); renderAll(); toast("تم الرجوع للهوية الأصلية");
    }
  });

  function renderAll() {
    repDraft = null;
    renderNames(); renderColors(); renderShape(); renderApp(); renderSync(); renderPreview();
  }
  gate();
  renderAll();
  var bs = $("brandingSettings");
  if (bs && bs.parentNode) bs.insertAdjacentHTML("beforebegin", '<p class="hint">الصور بتتحفظ على الجهاز ده فورًا. عشان تنزل على كل الأجهزة والعملاء اضغط «نشر الهوية» من قسم «النسخ والتصدير».</p>');

  /* تحويل الصفحة فاتح/داكن (من الزرار فوق أو من أزرار الألوان) بيغيّر وضع التعديل */
  new MutationObserver(function () {
    var m = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    if (m !== mode) { mode = m; renderColors(); }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  WL.onChange(function (c) {
    var n = $("wlCurName"); if (n) n.textContent = c.name || DEFN;
    renderApp();
  });
})();
