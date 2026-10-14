/* white-label-page.js — واجهة لوحة «هوية النظام» (white-label.html).
   كل التعديلات بتتحفظ على الجهاز فورًا وبتظهر في كل الصفحات (عن طريق white-label.js).
   أي تعديل بيتنشر لوحده على كل الأجهزة والعملاء، و«تصدير ملف إعداد النسخة» بيجهّز نسخة لعميل. */
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
      '<p class="hint">اسم النظام والوصف والاسم اللي تحت الأيقونة بتتعدّل من الكارت اللي فوق. هنا تقدر تغيّر أي كلمة تانية في النظام.</p>' +
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
     كارت الهوية (زي صفحة البروفايل): صورة التطبيق + الاسم + اللون + شكلها على الموبايل
     ========================================================= */
  css.textContent +=
    ".wl-hero{grid-column:1/-1;border:1px solid var(--border);border-radius:20px;background:var(--bg-elevated);padding:16px;margin:4px 0 10px;box-shadow:0 2px 12px rgba(0,0,0,.05)}" +
    ".wl-hero-top{display:flex;gap:14px;align-items:center}" +
    ".wl-hero-pic{position:relative;flex:0 0 auto;width:96px;height:96px;padding:0;border:0;background:none;cursor:pointer;border-radius:24px}" +
    ".wl-hero-pic img{width:96px;height:96px;border-radius:24px;object-fit:cover;display:block;box-shadow:0 3px 14px rgba(0,0,0,.22);background:var(--bg-sunken)}" +
    ".wl-hero-pic span{position:absolute;bottom:-6px;inset-inline-end:-6px;width:36px;height:36px;border-radius:50%;background:var(--wl-primary,#17324d);color:var(--wl-on-primary,#fff);display:flex;align-items:center;justify-content:center;font-size:17px;border:3px solid var(--bg-elevated);box-shadow:0 1px 4px rgba(0,0,0,.25)}" +
    ".wl-hero-names{flex:1;min-width:0}" +
    ".wl-hero-names input{display:block;width:100%;margin:0;border:1px solid transparent;background:transparent;padding:4px 6px;border-radius:10px;color:var(--text);font-family:inherit}" +
    ".wl-hero-names input:hover,.wl-hero-names input:focus{border-color:var(--border);background:var(--bg-sunken)}" +
    ".wl-hero-names .wl-n{font-size:21px;font-weight:800}.wl-hero-names .wl-t{font-size:14px;color:var(--text-muted)}" +
    ".wl-hero-names small{display:block;padding:0 6px;font-size:11px;color:var(--text-muted)}" +
    ".wl-hero-acts{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 4px}.wl-hero-acts button{flex:1 1 auto;min-height:42px}" +
    ".wl-hero h4{margin:14px 0 6px;font-size:14px}" +
    ".wl-dots{display:flex;gap:10px;flex-wrap:wrap;align-items:center}" +
    ".wl-dot{width:40px;height:40px;border-radius:50%;padding:0;border:3px solid var(--bg-elevated);box-shadow:0 0 0 1px var(--border);cursor:pointer}" +
    ".wl-dot.on{box-shadow:0 0 0 3px var(--text)}" +
    ".wl-dot-custom{position:relative;overflow:hidden;background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)}" +
    ".wl-dot-custom input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;margin:0;padding:0;border:0}" +
    ".wl-phone{display:flex;gap:14px;align-items:flex-start;justify-content:center;padding:14px 10px 10px;border-radius:16px;background:linear-gradient(160deg,#3a4a6b,#1d2638 60%,#2f2140)}" +
    ".wl-app{width:68px;text-align:center;color:#fff;font-size:11.5px;line-height:1.3}" +
    ".wl-app i{display:block;width:56px;height:56px;margin:0 auto 5px;border-radius:16px;background:rgba(255,255,255,.18)}" +
    ".wl-app img{display:block;width:56px;height:56px;margin:0 auto 5px;border-radius:50%;object-fit:cover;box-shadow:0 2px 8px rgba(0,0,0,.4)}" +
    ".wl-app b{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:600}" +
    ".wl-short{display:flex;gap:8px;align-items:center;margin-top:8px}.wl-short input{flex:1;margin:0}" +
    ".wl-status{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px;font-size:13px;font-weight:700;padding:8px 10px;border-radius:12px;background:var(--bg-sunken)}" +
    ".wl-status.ok{color:var(--success-text)}.wl-status.bad{color:var(--danger-text)}.wl-status.wait{color:var(--text-muted)}" +
    ".wl-status button{margin:0;min-height:32px;padding:4px 12px}" +
    "main.page.st-on>.page-topbar{order:-30}main.page.st-on>h1{order:-20}main.page.st-on>.wl-hero{order:-10}";
  function currentPreset() {
    var c = WL.cfg().colors.light || {};
    if (!c.primary) return "navy";
    for (var i = 0; i < WL.PRESETS.length; i++) { var p = WL.PRESETS[i]; if (p.c && p.c.primary === c.primary && (p.c.accent || "") === (c.accent || "")) return p.id; }
    return "custom";
  }
  function renderHero() {
    var h = $("wlHero"); if (!h) return;
    var l = WL.localCfg(), cur = currentPreset(), prim = (WL.cfg().colors.light.primary || "#17324d");
    var dots = WL.PRESETS.map(function (p) {
      var c = p.c ? p.c.primary : "#17324d", c2 = p.c ? p.c.accent : "#f2a93b";
      return '<button type="button" class="wl-dot' + (cur === p.id ? " on" : "") + '" data-wla="preset" data-wlp="' + p.id + '" title="' + esc(p.name) + '" aria-label="لون ' + esc(p.name) + '" aria-pressed="' + (cur === p.id) + '" style="background:linear-gradient(135deg,' + c + ' 58%,' + c2 + ' 58%)"></button>';
    }).join("");
    var promo = WL.activeSchedule();
    h.innerHTML =
      (promo ? '<div class="wl-promo"><span>🎉 عرض «' + esc(promo.name) + "» شغال لحد " + esc(fmtDay(promo.to)) + " — بعدها النظام بيرجع لوحده للهوية العادية. أي تعديل هنا دلوقتي بيتحفظ على العرض.</span>" +
        '<button type="button" data-wla="plan-del" data-wls="' + esc(promo.id) + '">⏹️ أوقفه</button></div>' : "") +
      '<div class="wl-hero-top">' +
      '<button type="button" class="wl-hero-pic" data-wla="pick-icon" aria-label="تغيير صورة التطبيق"><img data-wf-brand="icon" src="app-icon.svg" alt="صورة التطبيق"><span aria-hidden="true">📷</span></button>' +
      '<div class="wl-hero-names">' +
      '<input class="wl-n" type="text" data-wlf="name" maxlength="80" value="' + esc(l.name || WL.DEF_NAME) + '" placeholder="اسم الورشة" aria-label="اسم النظام / الورشة">' +
      '<input class="wl-t" type="text" data-wlf="tagline" maxlength="120" value="' + esc(l.tagline || WL.DEF_TAG) + '" placeholder="وصف قصير (اختياري)" aria-label="الوصف تحت الاسم">' +
      "<small>✏️ اضغط على الاسم أو الوصف عشان تعدّلهم</small></div></div>" +
      '<div class="wl-hero-acts"><button type="button" class="primary" data-wla="pick-icon">📷 غيّر صورة التطبيق</button>' +
      (window.WFBrand && WFBrand.isIconCustom && WFBrand.isIconCustom() ? '<button type="button" class="secondary" data-wla="clear-icon">↩️ الصورة الأصلية</button>' : "") +
      '<button type="button" class="secondary" data-wla="open-sets">🗂️ هوياتي المحفوظة <b id="wlSetsCount">' + (sets.items.filter(function (x) { return x.id !== PREV_ID; }).length || "") + "</b></button></div>" +
      "<h4>🎨 لون النظام</h4>" +
      '<div class="wl-dots" role="group" aria-label="لون النظام">' + dots +
      '<label class="wl-dot wl-dot-custom' + (cur === "custom" ? " on" : "") + '" title="لون تاني"><input type="color" data-wlhero="color" value="' + esc(prim) + '" aria-label="اختار لون تاني"></label></div>' +
      "<h4>📲 شكلها على الموبايل</h4>" +
      '<div class="wl-phone" aria-hidden="true"><div class="wl-app"><i></i><b>الكاميرا</b></div><div class="wl-app"><img data-wf-brand="icon" src="app-icon.svg" alt=""><b id="wlShortPrev">' + esc(WL.shortName()) + '</b></div><div class="wl-app"><i></i><b>واتساب</b></div></div>' +
      '<label class="wl-short"><span>الاسم تحت الأيقونة</span><input type="text" data-wlf="shortName" maxlength="24" value="' + esc(l.shortName || "") + '" placeholder="' + esc(WL.name()) + '"></label>' +
      '<div class="wl-status" id="wlStatus" role="status" aria-live="polite"></div>';
    if (window.WFBrand && WFBrand.refresh) WFBrand.refresh();
    renderStatus();
  }
  var STATUS = {
    pending: ["wait", "✏️ بيتحفظ…"],
    busy: ["wait", "☁️ بيتنشر على كل الأجهزة…"],
    ok: ["ok", "✅ اتحفظ واتنشر على كل الأجهزة"],
    warn: ["bad", "⚠️ اتنشر جزئيًا"],
    offline: ["wait", "📴 اتحفظ على الجهاز ده — هيتنشر لوحده أول ما النت يرجع"],
    fail: ["bad", "⚠️ اتحفظ هنا بس ماتنشرش"]
  };
  var lastInfo = "";
  function renderStatus(state, info) {
    var el = $("wlStatus"); if (!el) return;
    if (info !== undefined) lastInfo = info || "";
    state = state || WL.pushState() || (WL.hasPending() ? "offline" : "");
    var d = STATUS[state] || ["ok", "✅ كل الأجهزة عليها نفس الهوية"];
    el.className = "wl-status " + d[0];
    el.textContent = d[1] + (lastInfo && (state === "fail" || state === "warn") ? " — " + lastInfo : "");
    if (state === "fail" || state === "offline") {
      var b = document.createElement("button"); b.type = "button"; b.className = "secondary"; b.textContent = "🔄 حاول تاني"; b.setAttribute("data-wla", "push"); el.appendChild(b);
    }
  }
  WL.onPushState(function (st2, info) { renderStatus(st2, info); });
  function setPrimary(v) {
    WL.mutate(function (l) {
      l.colors = l.colors || { light: {}, dark: {} }; l.colors.light = l.colors.light || {}; l.colors.dark = l.colors.dark || {};
      l.colors.light.primary = v; delete l.colors.light.primary2; delete l.colors.light.link;
      delete l.colors.dark.primary; delete l.colors.dark.primary2; delete l.colors.dark.link;
    });
  }
  var heroColorT = null;
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-wlhero") === "color") {
      clearTimeout(heroColorT); var v = t.value;
      heroColorT = setTimeout(function () { setPrimary(v.toLowerCase()); var on = document.querySelectorAll("#wlHero .wl-dot"); for (var i = 0; i < on.length; i++) on[i].classList.toggle("on", on[i].classList.contains("wl-dot-custom")); if ($("wlColors")) renderColors(); }, 120);
    }
    if (t && t.getAttribute && t.getAttribute("data-wlf")) {
      // نفس الحقل ممكن يكون في مكانين: نحدّث التاني من غير ما نلمس اللي بيتكتب فيه
      var f = t.getAttribute("data-wlf"), all = document.querySelectorAll('[data-wlf="' + f + '"]');
      for (var i = 0; i < all.length; i++) if (all[i] !== t) all[i].value = t.value;
      var sp = $("wlShortPrev"); if (sp) setTimeout(function () { sp.textContent = WL.shortName(); }, 0);
    }
  }, true);


  /* =========================================================
     هوياتي المحفوظة: احفظ الهوية الحالية باسم (عرض الصيف، موسم السخانات…) وارجع لها بضغطة.
     كل هوية = الاسم والنصوص والألوان والشكل + صورة التطبيق والشعار. محفوظة على السحابة (portal/brandset_*)
     فبتبان على أي جهاز إدارة. «الأساسية» = اللي زرار «ارجع للأساسية» بيرجّعلها (لو مفيش: هوية المصنع).
     قبل أي تطبيق، الهوية اللي كانت شغالة بتتحفظ لوحدها في «آخر هوية قبل التغيير» عشان مفيش حاجة تضيع.
     ========================================================= */
  var SETS_DOC = "brandsets", PREV_ID = "auto_prev", FACTORY = "factory";
  var sets = { items: [], baseId: "", activeId: "", loaded: false, err: "" };
  css.textContent +=
    ".wl-sets{display:flex;flex-direction:column;gap:10px;margin:10px 0}" +
    ".wl-set{display:flex;gap:12px;align-items:center;border:1px solid var(--border);border-radius:14px;padding:10px;background:var(--bg-elevated)}" +
    ".wl-set.on{border-color:var(--wl-primary,#17324d);box-shadow:0 0 0 2px var(--wl-primary,#17324d) inset}" +
    ".wl-set>img,.wl-set>i{flex:0 0 auto;width:52px;height:52px;border-radius:14px;object-fit:cover;background:var(--bg-sunken);display:flex;align-items:center;justify-content:center;font-size:24px;font-style:normal}" +
    ".wl-set-main{flex:1;min-width:0}.wl-set-main b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".wl-set-main small{display:flex;gap:6px;align-items:center;flex-wrap:wrap;color:var(--text-muted);font-size:12px;margin-top:2px}" +
    ".wl-set-main small u{display:inline-block;width:14px;height:14px;border-radius:50%;text-decoration:none;box-shadow:0 0 0 1px var(--border)}" +
    ".wl-tag{display:inline-block;font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;background:var(--bg-sunken);color:var(--text)}" +
    ".wl-tag.base{background:var(--wl-accent,#f2a93b);color:#111}.wl-tag.act{background:var(--wl-primary,#17324d);color:var(--wl-on-primary,#fff)}" +
    ".wl-set-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.wl-set-acts button{margin:0;min-height:36px;padding:4px 10px;font-size:13px}" +
    ".wl-set-acts button.primary{min-width:76px}" +
    ".wl-sch{border:1px dashed var(--border);border-radius:12px;padding:10px;margin-top:8px;background:var(--bg-sunken)}" +
    ".wl-sch label{display:flex;align-items:center;gap:8px;margin:6px 0;font-weight:700;font-size:13px}.wl-sch input{flex:1;margin:0}" +
    ".wl-promo{display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-radius:14px;padding:10px 12px;margin:0 0 12px;background:var(--wl-accent,#f2a93b);color:#111;font-weight:700;font-size:13.5px}" +
    ".wl-promo span{flex:1 1 200px}.wl-promo button{margin:0;min-height:36px;background:#111;color:#fff;border-color:#111}" +
    ".wl-plan{display:flex;gap:10px;align-items:center;flex-wrap:wrap;border:1px solid var(--border);border-radius:12px;padding:8px 10px;margin:6px 0;background:var(--bg-elevated)}" +
    ".wl-plan>div{flex:1 1 180px}.wl-plan small{display:block;color:var(--text-muted)}.wl-plan button{margin:0;min-height:34px;padding:4px 10px;font-size:13px}";
  function fmtDate(t) { try { return new Date(t).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } }
  function setsIndex(db) { return db.collection("portal").doc(SETS_DOC); }
  function loadSets() {
    WL.refreshRemote().then(function () { renderSets(); renderHero(); }, function () {});
    return WL.db(10000).then(function (db) { return setsIndex(db).get(); }).then(function (d) {
      var x = d.exists ? d.data() : {};
      sets.items = Array.isArray(x.items) ? x.items : []; sets.baseId = x.baseId || ""; sets.activeId = x.activeId || ""; sets.loaded = true; sets.err = "";
    }, function (er) { sets.loaded = true; sets.err = (er && er.message) || "تعذر التحميل"; }).then(renderSets);
  }
  function saveIndex(db) { return setsIndex(db).set({ items: sets.items, baseId: sets.baseId, activeId: sets.activeId, updatedAt: Date.now() }); }
  function capture() {
    return WL.exportJson().then(function (o) {
      var b = o.brand;
      return Promise.all([b ? WL.shrinkImage(b.logo) : null, b ? WL.shrinkImage(b.icon) : null,
        window.WFBrand && WFBrand.iconPng ? WFBrand.iconPng(96, "any").then(function (c) { return c.toDataURL("image/webp", 0.8); }, function () { return ""; }) : ""])
        .then(function (a) {
          if (b) { b.logo = a[0]; b.icon = a[1]; if (!b.logo && !b.icon && !(b.settings && (b.settings.hasLogo || b.settings.hasIcon))) { /* مفيش صور مرفوعة */ } }
          var cfg = o.cfg, lc = (cfg.colors && cfg.colors.light) || {};
          return { cfg: JSON.stringify(cfg), brand: b ? JSON.stringify(b) : "", thumb: a[2] || "", primary: lc.primary || "#17324d", accent: lc.accent || "#f2a93b", sysName: cfg.name || "" };
        });
    });
  }
  function storeSet(id, name, snap) {
    if (snap.cfg.length + snap.brand.length > 900000) throw new Error("الصور كبيرة على الحفظ — صغّر صورة التطبيق أو الشعار");
    return WL.db().then(function (db) {
      var at = Date.now();
      return db.collection("portal").doc("brandset_" + id).set({ name: name, cfg: snap.cfg, brand: snap.brand, at: at }).then(function () {
        var meta = { id: id, name: name, at: at, thumb: snap.thumb, primary: snap.primary, accent: snap.accent, sysName: snap.sysName };
        var i = sets.items.map(function (x) { return x.id; }).indexOf(id);
        if (i > -1) sets.items[i] = meta; else if (id === PREV_ID) sets.items.push(meta); else sets.items.unshift(meta);
        return db;
      });
    });
  }
  function saveCurrentAs(name, id, makeActive) {
    id = id || ("s" + Date.now().toString(36));
    return capture().then(function (snap) { return storeSet(id, name, snap); }).then(function (db) { if (makeActive) sets.activeId = id; return saveIndex(db); }).then(function () { renderSets(); return id; });
  }
  function backupCurrent() { // قبل ما نطبّق هوية تانية
    return saveCurrentAs("↩️ آخر هوية قبل التغيير", PREV_ID, false)["catch"](function () {});
  }
  function applyFactory() {
    WL.reset();
    return (window.WFBrand && WFBrand.resetAll ? WFBrand.resetAll() : Promise.resolve()).then(function () { WL.schedulePublish(); });
  }
  function applySet(id) {
    if (id === FACTORY) return applyFactory();
    return WL.db().then(function (db) { return db.collection("portal").doc("brandset_" + id).get(); }).then(function (d) {
      if (!d.exists) throw new Error("الهوية دي مش موجودة على السحابة");
      var x = d.data(), cfg = {}, brand = null;
      try { cfg = JSON.parse(x.cfg || "{}"); } catch (e) {}
      try { brand = x.brand ? JSON.parse(x.brand) : null; } catch (e) {}
      return WL.importJson({ app: "workshop-whitelabel", cfg: cfg, brand: brand }).then(function () {
        if (!brand && window.WFBrand && WFBrand.resetAll) return WFBrand.resetAll(); // هوية من غير صور = الصور الأصلية
      });
    });
  }
  function nameOf(id) { if (id === FACTORY || !id) return "هوية المصنع"; var x = sets.items.filter(function (i) { return i.id === id; })[0]; return x ? x.name : ""; }
  function doApply(id) {
    var nm = nameOf(id);
    var pr = WL.activeSchedule();
    if (!confirm("تطبيق «" + nm + "» على كل الأجهزة؟\nالهوية الحالية هتتحفظ لوحدها في «آخر هوية قبل التغيير»." + (pr ? "\n\n⚠️ فيه عرض «" + pr.name + "» شغال: التطبيق هيغيّر شكل العرض لحد ما يخلص. لو عايز تغيّر الهوية العادية أوقف العرض الأول." : ""))) return;
    toast("⏳ جاري التطبيق…");
    var p = id === PREV_ID ? Promise.resolve() : backupCurrent();
    p.then(function () { return applySet(id); }).then(function () {
      sets.activeId = id === PREV_ID ? "" : id;
      return WL.db().then(saveIndex)["catch"](function () {});
    }).then(function () { renderAll(); toast("✅ اتطبقت «" + nm + "» وبتتنشر على كل الأجهزة"); })
      ["catch"](function (er) { toast("❌ " + ((er && er.message) || "تعذر التطبيق"), true); });
  }
  var schedFor = "";
  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return WL.todayKey(d); }
  function dayDiff(a) { var p = a.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]), t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((d - t) / 864e5); }
  function fmtDay(k) { var p = k.split("-"); try { return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("ar-EG", { day: "numeric", month: "long" }); } catch (e) { return k; } }
  function plansHtml() {
    var list = WL.schedules();
    if (!list.length) return "";
    return "<h3>📅 العروض المجدولة</h3>" + list.map(function (e) {
      var st = e.active ? '<span class="wl-tag act">شغال دلوقتي</span>' : (dayDiff(e.from) > 0 ? '<span class="wl-tag">يبدأ بعد ' + dayDiff(e.from) + " يوم</span>" : "");
      return '<div class="wl-plan"><div><b>🎉 ' + esc(e.name) + "</b> " + st + "<small>من " + esc(fmtDay(e.from)) + " لحد " + esc(fmtDay(e.to)) + " — بعدها بيرجع لوحده للهوية العادية</small></div>" +
        '<button type="button" class="secondary" data-wla="plan-del" data-wls="' + esc(e.id) + '">' + (e.active ? "⏹️ أوقفه" : "🗑️ إلغاء") + "</button></div>";
    }).join("");
  }
  function schedForm(x) {
    return '<div class="wl-sch"><b>📅 اعرض «' + esc(x.name) + '» في فترة محددة</b>' +
      '<label>من <input type="date" id="wlSchFrom" value="' + WL.todayKey() + '" min="' + WL.todayKey() + '"></label>' +
      '<label>لحد <input type="date" id="wlSchTo" value="' + addDays(6) + '" min="' + WL.todayKey() + '"></label>' +
      '<p class="hint">في الفترة دي كل الأجهزة والعملاء هيشوفوا الهوية دي، ولما تخلص النظام بيرجع لوحده للهوية العادية.</p>' +
      '<div class="wl-set-acts"><button type="button" class="primary" data-wla="set-sched-ok" data-wls="' + esc(x.id) + '">✔️ جدولها</button><button type="button" class="secondary" data-wla="set-sched-no">إلغاء</button></div></div>';
  }
  function setRow(x, kind) {
    var isF = kind === "factory", id = isF ? FACTORY : x.id;
    var base = isF ? !sets.baseId : sets.baseId === id, act = isF || WL.activeSchedule() ? false : sets.activeId === id;
    var pic = isF ? '<img src="app-icon.svg" alt="">' : (x.thumb ? '<img src="' + esc(x.thumb) + '" alt="">' : "<i>🎨</i>");
    var title = isF ? "🏭 هوية المصنع (الأصلية)" : esc(x.name);
    var sub = isF ? "<span>«" + esc(DEFN) + "» بالكحلي — موجودة دايمًا</span>" :
      '<u style="background:linear-gradient(135deg,' + esc(x.primary) + " 55%," + esc(x.accent) + ' 55%)"></u><span>' + esc(x.sysName || DEFN) + "</span><span>• " + esc(fmtDate(x.at)) + "</span>";
    var acts = '<button type="button" class="primary" data-wla="set-apply" data-wls="' + id + '">✔️ طبّق</button>';
    if (id !== PREV_ID) acts += '<button type="button" class="secondary" data-wla="set-base" data-wls="' + id + '"' + (base ? " disabled" : "") + ' title="اجعلها الأساسية">⭐ أساسية</button>';
    if (!isF && id !== PREV_ID) acts += '<button type="button" class="secondary" data-wla="set-update" data-wls="' + id + '" title="احفظ الهوية الحالية مكانها">🔄 حدّثها</button>' +
      '<button type="button" class="secondary" data-wla="set-sched" data-wls="' + id + '" title="اعرضها في فترة محددة">📅 جدولها</button>' +
      '<button type="button" class="secondary" data-wla="set-rename" data-wls="' + id + '" title="غيّر الاسم">✏️</button>';
    if (!isF) acts += '<button type="button" class="secondary" data-wla="set-del" data-wls="' + id + '" title="حذف" aria-label="حذف">🗑️</button>';
    return '<div class="wl-set' + (act ? " on" : "") + '">' + pic + '<div class="wl-set-main"><b>' + title + "</b><small>" +
      (base ? '<span class="wl-tag base">⭐ الأساسية</span>' : "") + (act ? '<span class="wl-tag act">شغالة دلوقتي</span>' : "") + sub +
      '</small><div class="wl-set-acts">' + acts + "</div>" + (!isF && schedFor === id ? schedForm(x) : "") + "</div></div>";
  }
  function renderSets() {
    var el = $("wlSets"); if (!el) return;
    var cnt = $("wlSetsCount"); if (cnt) cnt.textContent = sets.items.filter(function (x) { return x.id !== PREV_ID; }).length || "";
    var own = sets.items.filter(function (x) { return x.id !== PREV_ID; }), prev = sets.items.filter(function (x) { return x.id === PREV_ID; })[0];
    el.innerHTML =
      '<p class="hint">احفظ أي شكل عاجبك باسم (مثلًا «عرض الصيف — تكييفات» أو «موسم السخانات» أو «تجديد ٢٠٢٧») وارجع له بضغطة. الهوية بتشمل الاسم والوصف والألوان والشكل وصورة التطبيق والشعار والنصوص.</p>' +
      '<div class="wl-btns"><button type="button" class="primary" data-wla="set-save">💾 احفظ الهوية الحالية باسم جديد</button>' +
      (WL.activeSchedule() ? '<button type="button" class="secondary" data-wla="plan-del" data-wls="' + esc(WL.activeSchedule().id) + '">⏹️ أوقف العرض وارجع للعادية</button>' :
      '<button type="button" class="secondary" data-wla="set-apply" data-wls="' + (sets.baseId || FACTORY) + '">↩️ ارجع للأساسية (' + esc(nameOf(sets.baseId)) + ")</button>") + "</div>" + plansHtml() + "<h3>🗂️ المحفوظة</h3>" +
      (!sets.loaded ? '<p class="hint">⏳ جاري تحميل الهويات المحفوظة…</p>' : "") +
      (sets.err ? '<div class="wl-warn">⚠️ ' + esc(sets.err) + ' — <button type="button" class="secondary" data-wla="set-reload">حاول تاني</button></div>' : "") +
      '<div class="wl-sets">' + own.map(function (x) { return setRow(x); }).join("") +
      (prev ? setRow(prev) : "") + setRow(null, "factory") + "</div>" +
      (sets.loaded && !own.length && !sets.err ? '<p class="hint">لسه مفيش هويات محفوظة. ظبّط الشكل اللي يعجبك من الكارت اللي فوق واضغط «احفظ».</p>' : "");
  }
  function setsClick(a, b) {
    var id = b.getAttribute("data-wls");
    var fail = function (er) { toast("❌ " + ((er && er.message) || "حصل خطأ"), true); };
    if (a === "set-save") {
      var nm = (prompt("اسم الهوية دي؟ (مثال: عرض الصيف — تكييفات)", "") || "").trim().slice(0, 60);
      if (!nm) return;
      b.disabled = true; toast("⏳ جاري الحفظ…");
      saveCurrentAs(nm, null, true).then(function () { b.disabled = false; toast("✅ اتحفظت «" + nm + "»"); }, function (er) { b.disabled = false; fail(er); });
    } else if (a === "set-apply") doApply(id);
    else if (a === "set-base") {
      sets.baseId = id === FACTORY ? "" : id;
      WL.db().then(saveIndex).then(function () { renderSets(); toast("⭐ «" + nameOf(sets.baseId) + "» بقت الهوية الأساسية"); }, fail);
    } else if (a === "set-update") {
      if (!confirm("تحفظ الهوية اللي شغالة دلوقتي مكان «" + nameOf(id) + "»؟")) return;
      saveCurrentAs(nameOf(id), id, true).then(function () { toast("✅ اتحدّثت «" + nameOf(id) + "»"); }, fail);
    } else if (a === "set-rename") {
      var x = sets.items.filter(function (i) { return i.id === id; })[0]; if (!x) return;
      var nn = (prompt("الاسم الجديد:", x.name) || "").trim().slice(0, 60); if (!nn || nn === x.name) return;
      x.name = nn;
      WL.db().then(function (db) { return db.collection("portal").doc("brandset_" + id).set({ name: nn }, { merge: true }).then(function () { return saveIndex(db); }); }).then(renderSets, fail);
    } else if (a === "set-del") {
      if (!confirm("حذف «" + nameOf(id) + "» نهائيًا؟")) return;
      sets.items = sets.items.filter(function (i) { return i.id !== id; });
      if (sets.baseId === id) sets.baseId = ""; if (sets.activeId === id) sets.activeId = "";
      WL.db().then(function (db) { return db.collection("portal").doc("brandset_" + id)["delete"]().then(function () { return saveIndex(db); }); }).then(function () { renderSets(); toast("اتحذفت"); }, fail);
    } else if (a === "set-reload") { sets.loaded = false; renderSets(); loadSets(); }
    else if (a === "set-sched") { schedFor = schedFor === id ? "" : id; renderSets(); }
    else if (a === "set-sched-no") { schedFor = ""; renderSets(); }
    else if (a === "set-sched-ok") {
      var from = ($("wlSchFrom") || {}).value || "", to = ($("wlSchTo") || {}).value || "", today = WL.todayKey();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return toast("اختار تاريخ البداية والنهاية", true);
      if (to < from) return toast("تاريخ النهاية لازم يكون بعد البداية", true);
      if (to < today) return toast("الفترة دي خلصت خلاص", true);
      b.disabled = true; toast("⏳ جاري الجدولة…");
      var nm2 = nameOf(id);
      (WL.hasPending() ? WL.publishNow() : Promise.resolve()).then(function () { return WL.db(); })
        .then(function (db) { return db.collection("portal").doc("brandset_" + id).get(); })
        .then(function (d) {
          if (!d.exists) throw new Error("الهوية دي مش موجودة على السحابة");
          var x2 = d.data();
          return WL.scheduleSave({ id: id + "_" + from, name: nm2, from: from, to: to, cfg: x2.cfg || "{}", brand: x2.brand || "" });
        }).then(function () {
          schedFor = ""; renderAll();
          toast(from <= today ? "✅ «" + nm2 + "» شغالة دلوقتي لحد " + fmtDay(to) : "✅ «" + nm2 + "» هتبدأ لوحدها يوم " + fmtDay(from));
        }, function (er) { b.disabled = false; fail(er); });
    } else if (a === "plan-del") {
      var pl = WL.schedules().filter(function (e) { return e.id === id; })[0];
      if (!confirm(pl && pl.active ? "توقيف «" + pl.name + "» دلوقتي والرجوع للهوية العادية على كل الأجهزة؟" : "إلغاء جدولة «" + (pl ? pl.name : "") + "»؟")) return;
      WL.scheduleRemove(id).then(function () { renderAll(); toast(pl && pl.active ? "⏹️ العرض وقف ورجعت الهوية العادية" : "اتلغت الجدولة"); }, fail);
    }
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
    if (!$("wlApp")) return;
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
      "<h3>☁️ المزامنة</h3>" +
      '<p class="hint">أي تعديل هنا بيتحفظ وبيتنشر لوحده على كل الأجهزة (موظفين وعملاء) بعد ثانيتين. لو مفيش نت بيتنشر أول ما النت يرجع.</p>' +
      '<div class="wl-btns"><button type="button" class="secondary" data-wla="push">☁️ انشر دلوقتي</button><button type="button" class="secondary" data-wla="pull">⬇️ هات آخر نسخة من السحابة</button></div>' +
      '<details><summary>🔐 عشان شاشة الدخول عند العملاء تشوف الهوية قبل تسجيل الدخول</summary><p class="hint">قواعد Firestore بتسمح بالقراءة بعد تسجيل الدخول فقط. لو عايز الهوية تظهر قبله كمان، حدّث القاعدة دي (موجودة جاهزة في ملف firestore.rules) وانشرها من Firebase Console. المستند ده فيه الاسم والألوان والشعار بس، مفيش فيه بيانات خاصة:</p><div class="wl-code">' + esc(RULE) + "</div></details>" +
      "<h3>📦 تجهيز نسخة لعميل (بيع / تأجير)</h3>" +
      '<p class="hint">ملفات الأيقونات بالصورة الحالية (لو عايز تثبّتها في ملفات المشروع نفسه لنسخة العميل):</p>' +
      '<div class="wl-btns"><button type="button" class="secondary" data-wla="dl-icons">⬇️ تنزيل ملفات الأيقونات</button></div>' +
      '<p class="hint">بعد ما تضبط الهوية، اضغط «تصدير ملف إعداد النسخة» ونزّل الملف، واستبدل بيه <b>white-label-config.js</b> في المشروع قبل الرفع. أي جهاز بيفتح النسخة بيشوف هوية العميل من أول لحظة حتى قبل الدخول.</p>' +
      '<div class="wl-btns"><button type="button" class="primary" data-wla="export-cfg">📦 تصدير ملف إعداد النسخة</button></div>' +
      '<p class="hint">لو عايز لوحة الهوية تطلب كود قبل التعديل (عشان المستأجر مايغيّرش الهوية)، افتح الملف المصدّر وضيف السطر: <span style="direction:ltr;display:inline-block">lock: { code: "1234" }</span> جوه الكائن.</p>' +
      "<h3>💾 نسخة احتياطية للهوية</h3>" +
      '<div class="wl-btns"><button type="button" class="secondary" data-wla="export-json">⬇️ تصدير الهوية (JSON)</button><button type="button" class="secondary" data-wla="import-json">⬆️ استيراد هوية</button><button type="button" class="secondary" data-wla="reset-all" style="border-color:var(--danger-text);color:var(--danger-text)">🏭 رجوع لهوية المصنع</button></div>' +
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
    } else if (a.indexOf("set-") === 0 || a === "plan-del") {
      setsClick(a, b);
    } else if (a === "open-sets") {
      var tile = document.querySelector('[data-st="wl-sets"]');
      if (tile && !tile.classList.contains("on")) tile.click(); else if (tile) tile.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (a === "pick-icon") {
      if (!window.WFBrand || !WFBrand.pickIcon) return toast("لحظة… الصفحة لسه بتحمّل", true);
      WFBrand.pickIcon().then(function () { renderHero(); WL.schedulePublish(); toast("✅ اتغيرت صورة التطبيق"); }, function (er) { if (er && er.message !== "cancel") toast("❌ " + (er.message || "تعذر رفع الصورة"), true); });
    } else if (a === "clear-icon") {
      if (!window.WFBrand) return;
      WFBrand.clearIcon().then(function () { renderHero(); WL.schedulePublish(); toast("رجعت الصورة الأصلية"); });
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
      renderColors(); renderApp(); renderHero(); toast("✅ اللون: «" + (p ? p.name : "") + "»");
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
      WL.publishNow().then(function (ok) { b.disabled = false; if (ok) toast("✅ اتنشرت الهوية على كل الأجهزة"); });
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
      if (!confirm("الرجوع لهوية المصنع بالكامل (الاسم والصور والألوان والشكل) على كل الأجهزة؟\nنصيحة: احفظ الهوية الحالية الأول من «هوياتي المحفوظة».")) return;
      WL.reset();
      (window.WFBrand && WFBrand.resetAll ? WFBrand.resetAll() : Promise.resolve()).then(function () { renderAll(); WL.schedulePublish(); toast("تم الرجوع للهوية الأصلية"); });
    }
  });

  function renderAll() {
    repDraft = null;
    renderHero(); renderSets(); renderNames(); renderColors(); renderShape(); renderApp(); renderSync(); renderPreview();
  }
  gate();
  renderAll();

  /* تحويل الصفحة فاتح/داكن (من الزرار فوق أو من أزرار الألوان) بيغيّر وضع التعديل */
  new MutationObserver(function () {
    var m = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    if (m !== mode) { mode = m; renderColors(); }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  WL.onChange(function (c) {
    var n = $("wlCurName"); if (n) n.textContent = c.name || DEFN;
    var sp = $("wlShortPrev"); if (sp) sp.textContent = WL.shortName();
    renderApp();
  });
  window.addEventListener("wfbrand:change", function () {
    // صورة اتغيرت من قسم «الشعار والأيقونة» أو نزلت من السحابة: نحدّث زرار «الصورة الأصلية» في الكارت
    var h = $("wlHero"), has = !!(window.WFBrand && WFBrand.isIconCustom && WFBrand.isIconCustom());
    if (h && !!h.querySelector('[data-wla="clear-icon"]') !== has && !h.contains(document.activeElement)) renderHero();
  });
  loadSets();
  // تعديل ماتنشرش قبل كده (كان مفيش نت): ننشره دلوقتي
  setTimeout(function () { if (WL.hasPending() && !WL.pushState()) WL.publishNow(); }, 3000);
})();
