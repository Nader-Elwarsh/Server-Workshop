/* branding.js — الهوية البصرية للورشة (شعار الورشة + أيقونة التطبيق + الألوان).

   إيه اللي بيعمله:
   - بيطبّق ألوان الشعار والأيقونة اللي اخترتها من الإعدادات على كل صفحات النظام.
   - بيبدّل أي صورة شعار/أيقونة في الصفحات (img.brand-logo / img.wf-logo / img[data-wf-brand]).
   - بيحدّث أيقونة التبويب (favicon) وأيقونة آيفون (apple-touch-icon) بالألوان الحالية.
   - بيرسم قسم «🎨 الهوية والشعار» جوه الإعدادات (داخل <div id="brandingSettings">).

   مصادر الصور الافتراضية (تقدر تستبدل الملفات نفسها من غير أي تعديل في الكود):
     branding/logo.svg  ← شعار الورشة الأفقي
     app-icon.svg       ← أيقونة التطبيق
   الملفين دول فيهم 3 ألوان ثابتة بتتبدّل لحظيًا: الأساسي #082A54 / المميز #FAA822 / الفاتح #FFFFFF.
   (لو استبدلت الملفات بتصميم تاني ملوّن بغير الألوان دي هيظهر زي ما هو من غير تغيير ألوان.)

   التخزين: الإعدادات الصغيرة في localStorage (مفتاح wf_branding_v1)، والصور المرفوعة في IndexedDB
   (قاعدة wfBrandingDB) عشان ما تزاحمش مساحة بيانات النظام الأساسية في localStorage. */
(function () {
  "use strict";
  if (window.WFBrand) return;

  var KEY = "wf_branding_v1";
  var DEF = { primary: "#082A54", accent: "#FAA822", light: "#FFFFFF" };
  var SRC = { logo: "branding/logo.svg", icon: "app-icon.svg" };
  var HEX = /^#[0-9a-f]{6}$/i;

  /* ---------- الإعدادات ---------- */
  function loadSettings() {
    var st = { primary: DEF.primary, accent: DEF.accent, light: DEF.light, applyHeader: false, hasLogo: false, hasIcon: false };
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
      ["primary", "accent", "light"].forEach(function (k) { if (HEX.test(o[k] || "")) st[k] = String(o[k]).toUpperCase(); });
      st.applyHeader = !!o.applyHeader; st.hasLogo = !!o.hasLogo; st.hasIcon = !!o.hasIcon;
    } catch (e) {}
    return st;
  }
  var st = loadSettings();
  function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(st)); return true; } catch (e) { return false; } }
  function colorsDefault() { return st.primary === DEF.primary && st.accent === DEF.accent && st.light === DEF.light; }
  function customized() { return !colorsDefault() || st.hasLogo || st.hasIcon || st.applyHeader; }

  /* ---------- ألوان ---------- */
  function rgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function hex(a) { return "#" + a.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? "0" : "") + v.toString(16); }).join("").toUpperCase(); }
  function mix(h1, h2, t) { var a = rgb(h1), b = rgb(h2); return hex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }

  /* ---------- هيدر التطبيق + theme-color (بيتطبقوا فورًا) ---------- */
  function headerCss() {
    var base = "img.brand-logo,img.wf-logo{object-fit:contain}"; // صور مرفوعة بأبعاد مختلفة ماتتمطش
    if (!st.applyHeader) return base;
    var g1 = st.primary, g2 = mix(st.primary, "#FFFFFF", 0.16);
    var d1 = mix(st.primary, "#000000", 0.55), d2 = mix(st.primary, "#000000", 0.38);
    return base + ":root{--header-grad-1:" + g1 + ";--header-grad-2:" + g2 + ";--navy1:" + g1 + ";--navy2:" + g2 + "}" +
      "[data-theme=\"dark\"]{--header-grad-1:" + d1 + ";--header-grad-2:" + d2 + "}";
  }
  function applyHeaderAndTheme() {
    var s = document.getElementById("wfb-style");
    if (!s) { s = document.createElement("style"); s.id = "wfb-style"; (document.head || document.documentElement).appendChild(s); }
    s.textContent = headerCss();
    if (st.applyHeader) {
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute("content", st.primary);
    }
  }

  /* ---------- تخزين الصور المرفوعة (IndexedDB) ---------- */
  function idb() {
    return new Promise(function (res, rej) {
      try {
        var r = indexedDB.open("wfBrandingDB", 1);
        r.onupgradeneeded = function () { r.result.createObjectStore("files"); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      } catch (e) { rej(e); }
    });
  }
  function idbOp(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction("files", mode), out = fn(tx.objectStore("files"));
        tx.oncomplete = function () { res(out && out.result); };
        tx.onerror = tx.onabort = function () { rej(tx.error); };
      });
    });
  }
  function idbGet(k) { return idbOp("readonly", function (s) { return s.get(k); }); }
  function idbSet(k, v) { return idbOp("readwrite", function (s) { return s.put(v, k); }); }
  function idbDel(k) { return idbOp("readwrite", function (s) { return s["delete"](k); }); }

  /* ---------- تلوين ملفات SVG الافتراضية ---------- */
  var srcCache = {};
  function fetchText(url) {
    if (!srcCache[url]) {
      srcCache[url] = fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
        .catch(function (e) { delete srcCache[url]; throw e; });
    }
    return srcCache[url];
  }
  function recolor(svg) {
    return svg.replace(/fill="#([0-9A-Fa-f]{6})"/g, function (m, h) {
      h = h.toUpperCase();
      if (h === "082A54") return 'fill="' + st.primary + '"';
      if (h === "FAA822") return 'fill="' + st.accent + '"';
      if (h === "FFFFFF") return 'fill="' + st.light + '"';
      return m;
    });
  }
  function svgUrl(t) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(t); }

  var urls = null, urlsP = null;
  function buildUrl(kind) {
    var custom = kind === "logo" ? st.hasLogo : st.hasIcon;
    if (custom) {
      return idbGet(kind).then(function (v) { return v || SRC[kind]; }).catch(function () { return SRC[kind]; });
    }
    if (colorsDefault()) return Promise.resolve(SRC[kind]);
    return fetchText(SRC[kind]).then(function (t) { return svgUrl(recolor(t)); }).catch(function () { return SRC[kind]; });
  }
  function ensureUrls() {
    if (urls) return Promise.resolve(urls);
    if (!urlsP) {
      urlsP = Promise.all([buildUrl("logo"), buildUrl("icon")]).then(function (a) { urls = { logo: a[0], icon: a[1] }; urlsP = null; return urls; });
    }
    return urlsP;
  }
  function invalidate() { urls = null; urlsP = null; }

  /* ---------- تطبيق الصور على الصفحة ---------- */
  var ICON_SEL = "img.brand-logo, img.wf-logo, img[data-wf-brand=\"icon\"]";
  var LOGO_SEL = "img[data-wf-brand=\"logo\"]";
  function setSrc(list, url) {
    for (var i = 0; i < list.length; i++) if (list[i].getAttribute("src") !== url) list[i].setAttribute("src", url);
  }
  function applyImages(root) {
    if (!urls) return;
    root = root || document;
    setSrc(root.querySelectorAll(ICON_SEL), urls.icon);
    setSrc(root.querySelectorAll(LOGO_SEL), urls.logo);
  }
  function setLinks() {
    if (!customized() || !document.head) return;
    ensureUrls().then(function (u) {
      if (!colorsDefault() || st.hasIcon) {
        var olds = document.querySelectorAll('link[rel~="icon"]');
        for (var i = 0; i < olds.length; i++) olds[i].parentNode.removeChild(olds[i]);
        var l = document.createElement("link");
        l.rel = "icon"; l.href = u.icon;
        l.type = /^data:image\/svg/.test(u.icon) || /\.svg$/.test(u.icon) ? "image/svg+xml" : "image/png";
        document.head.appendChild(l);
        iconPng(180, "apple").then(function (c) {
          var a = document.querySelector('link[rel="apple-touch-icon"]');
          if (!a) { a = document.createElement("link"); a.rel = "apple-touch-icon"; document.head.appendChild(a); }
          a.href = c.toDataURL("image/png");
        })["catch"](function () {});
      }
    });
  }
  function refresh() {
    applyHeaderAndTheme();
    return ensureUrls().then(function (u) { applyImages(); document.documentElement.classList.remove("wfb-pending"); return u; });
  }

  /* ---------- رسم أيقونات PNG (للتبويب وآيفون وللتنزيل) ---------- */
  function loadImg(url) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error("img")); };
      im.src = url;
    });
  }
  function iconPng(size, mode) { // mode: any | maskable | apple
    return ensureUrls().then(function (u) {
      return loadImg(u.icon).then(function (im) {
        var c = document.createElement("canvas"); c.width = c.height = size;
        var x = c.getContext("2d");
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
        var iw = im.naturalWidth || im.width || 512, ih = im.naturalHeight || im.height || 512;
        var k = 1;
        if (mode !== "any") { x.fillStyle = st.primary; x.fillRect(0, 0, size, size); k = mode === "maskable" ? 0.8 : 0.92; }
        var box = size * k, s = Math.min(box / iw, box / ih), w = iw * s, h = ih * s;
        x.drawImage(im, (size - w) / 2, (size - h) / 2, w, h);
        return c;
      });
    });
  }
  function download(name, blob) {
    var a = document.createElement("a"), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); if (a.parentNode) a.parentNode.removeChild(a); }, 3000);
  }
  function downloadIcons() {
    var jobs = [["icon-192-v13.png", 192, "any"], ["icon-512-v13.png", 512, "any"], ["icon-maskable-512-v13.png", 512, "maskable"], ["apple-touch-icon-v13.png", 180, "apple"]];
    var chain = Promise.resolve();
    jobs.forEach(function (j) {
      chain = chain.then(function () { return iconPng(j[1], j[2]); }).then(function (c) {
        return new Promise(function (res) { c.toBlob(function (b) { if (b) download(j[0], b); setTimeout(res, 600); }, "image/png"); });
      });
    });
    if (!st.hasIcon) {
      chain = chain.then(function () { return fetchText(SRC.icon); }).then(function (t) { download("app-icon.svg", new Blob([recolor(t)], { type: "image/svg+xml" })); });
    }
    return chain;
  }

  /* ---------- رفع الصور ---------- */
  function readImage(file, kind) {
    return new Promise(function (res, rej) {
      if (!file) return rej(new Error("مفيش ملف"));
      if (file.size > 8 * 1024 * 1024) return rej(new Error("حجم الصورة كبير (الحد الأقصى 8 ميجا)"));
      var fr = new FileReader();
      if (/svg/i.test(file.type) || /\.svg$/i.test(file.name)) {
        fr.onload = function () {
          var t = String(fr.result);
          if (!/<svg[\s>]/i.test(t)) return rej(new Error("ملف SVG غير صالح"));
          if (/<script|\son\w+\s*=|javascript:/i.test(t)) return rej(new Error("ملف SVG فيه كود مش مسموح بيه"));
          res(svgUrl(t));
        };
        fr.onerror = function () { rej(new Error("تعذر قراءة الملف")); };
        fr.readAsText(file);
      } else {
        fr.onload = function () {
          loadImg(fr.result).then(function (im) {
            var max = kind === "icon" ? 512 : 900, s = Math.min(1, max / Math.max(im.width, im.height));
            var c = document.createElement("canvas");
            c.width = Math.max(1, Math.round(im.width * s)); c.height = Math.max(1, Math.round(im.height * s));
            c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
            res(c.toDataURL("image/png"));
          })["catch"](function () { rej(new Error("مش قادر أقرأ الصورة دي — جرّب PNG أو JPG أو SVG")); });
        };
        fr.onerror = function () { rej(new Error("تعذر قراءة الملف")); };
        fr.readAsDataURL(file);
      }
    });
  }
  function setCustom(kind, dataUrl) {
    var flag = kind === "logo" ? "hasLogo" : "hasIcon";
    return idbSet(kind, dataUrl).then(function () { st[flag] = true; saveSettings(); invalidate(); return refresh().then(function () { setLinks(); }); });
  }
  function clearCustom(kind) {
    var flag = kind === "logo" ? "hasLogo" : "hasIcon";
    return idbDel(kind)["catch"](function () {}).then(function () { st[flag] = false; saveSettings(); invalidate(); return refresh(); });
  }

  /* ---------- واجهة API ---------- */
  function setColors(p) {
    ["primary", "accent", "light"].forEach(function (k) { if (p && HEX.test(p[k] || "")) st[k] = String(p[k]).toUpperCase(); });
    if (p && typeof p.applyHeader === "boolean") st.applyHeader = p.applyHeader;
    saveSettings(); invalidate();
    return refresh().then(function () { setLinks(); });
  }
  function resetColors() {
    st.primary = DEF.primary; st.accent = DEF.accent; st.light = DEF.light; st.applyHeader = false;
    saveSettings(); invalidate();
    return refresh();
  }
  function resetAll() {
    return Promise.all([idbDel("logo")["catch"](function () {}), idbDel("icon")["catch"](function () {})]).then(function () {
      st = { primary: DEF.primary, accent: DEF.accent, light: DEF.light, applyHeader: false, hasLogo: false, hasIcon: false };
      try { localStorage.removeItem(KEY); } catch (e) {}
      invalidate(); return refresh();
    });
  }
  function exportData() {
    return Promise.all([st.hasLogo ? idbGet("logo") : null, st.hasIcon ? idbGet("icon") : null]).then(function (a) {
      return { app: "workshop-branding", version: 1, settings: JSON.parse(JSON.stringify(st)), logo: a[0] || null, icon: a[1] || null };
    });
  }
  function importData(o) {
    if (!o || o.app !== "workshop-branding" || !o.settings) return Promise.reject(new Error("الملف ده مش ملف هوية صالح"));
    var s = o.settings, ops = [];
    ["primary", "accent", "light"].forEach(function (k) { if (HEX.test(s[k] || "")) st[k] = String(s[k]).toUpperCase(); });
    st.applyHeader = !!s.applyHeader;
    var okData = function (v) { return typeof v === "string" && /^data:image\/(png|jpeg|webp|svg\+xml)[;,]/.test(v); };
    if (okData(o.logo)) { ops.push(idbSet("logo", o.logo)); st.hasLogo = true; } else { ops.push(idbDel("logo")["catch"](function () {})); st.hasLogo = false; }
    if (okData(o.icon)) { ops.push(idbSet("icon", o.icon)); st.hasIcon = true; } else { ops.push(idbDel("icon")["catch"](function () {})); st.hasIcon = false; }
    return Promise.all(ops).then(function () { saveSettings(); invalidate(); return refresh().then(function () { setLinks(); }); });
  }

  /* ---------- قسم الإعدادات ---------- */
  function injectPanelCss() {
    if (document.getElementById("wfb-panel-css")) return;
    var s = document.createElement("style"); s.id = "wfb-panel-css";
    s.textContent =
      ".wfb h3{margin:16px 0 6px;font-size:16px}" +
      ".wfb-prev{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:10px 0}" +
      ".wfb-logo-box{background:#fff;border:1px solid var(--border,#ddd);border-radius:12px;padding:10px 14px}" +
      ".wfb-logo-box img{display:block;height:64px;width:auto;max-width:220px}" +
      ".wfb-icon-box img{display:block;width:72px;height:72px;border-radius:22%;object-fit:contain}" +
      ".wfb-row{display:flex;align-items:center;gap:10px;margin:8px 0;flex-wrap:wrap}" +
      ".wfb-row>span{flex:1 1 150px;font-weight:700}" +
      ".wfb .wfb-color{width:56px;height:40px;padding:2px;margin:0;border-radius:8px;cursor:pointer}" +
      ".wfb .wfb-hex{width:104px;margin:0;direction:ltr;text-align:center;font-family:monospace}" +
      ".wfb .wfb-btns{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}" +
      ".wfb label.wfb-chk{display:flex;gap:8px;align-items:center;margin:10px 0;font-weight:700}" +
      ".wfb label.wfb-chk input{width:auto;margin:0}" +
      ".wfb .wfb-msg{min-height:20px;font-size:13px;color:var(--success-text,#18794e)}";
    document.head.appendChild(s);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function colorRow(k, label) {
    return '<div class="wfb-row"><span>' + label + '</span><input type="color" class="wfb-color" data-k="' + k + '" value="' + esc(st[k].toLowerCase()) + '" aria-label="' + label + '">' +
      '<input type="text" class="wfb-hex" data-h="' + k + '" value="' + esc(st[k]) + '" maxlength="7" aria-label="كود ' + label + '"></div>';
  }
  var box = null;
  function msg(t, bad) {
    var m = box && box.querySelector(".wfb-msg");
    if (m) { m.textContent = t || ""; m.style.color = bad ? "var(--danger-text,#a11)" : ""; }
  }
  function renderPanel() {
    box = document.getElementById("brandingSettings");
    if (!box) return;
    injectPanelCss();
    box.className = "wfb";
    box.innerHTML =
      '<p class="hint">تحكّم كامل في شعار الورشة وأيقونة التطبيق: غيّر الألوان أو ارفع صورك بنفسك من غير ما تلمس الكود. التغييرات بتتحفظ على الجهاز ده وبتظهر في كل صفحات النظام فورًا.</p>' +
      '<div class="wfb-prev"><div class="wfb-logo-box"><img data-wf-brand="logo" src="' + SRC.logo + '" alt="معاينة شعار الورشة"></div>' +
      '<div class="wfb-icon-box"><img data-wf-brand="icon" src="' + SRC.icon + '" alt="معاينة أيقونة التطبيق"></div></div>' +
      '<h3>🎨 ألوان الشعار والأيقونة</h3>' +
      colorRow("primary", "اللون الأساسي (الكحلي)") + colorRow("accent", "اللون المميز (الأصفر)") + colorRow("light", "اللون الفاتح (الأبيض)") +
      '<label class="wfb-chk"><input type="checkbox" id="wfbHeader"' + (st.applyHeader ? " checked" : "") + '> طبّق اللون الأساسي على شريط العنوان (الهيدر) في التطبيق</label>' +
      '<div class="wfb-btns"><button type="button" class="secondary" data-a="reset-colors">↩️ رجوع للألوان الأصلية</button></div>' +
      '<h3>🖼️ الصور</h3>' +
      '<p class="hint">ارفع شعار أو أيقونة تانية (PNG أو JPG أو SVG). الصورة المرفوعة بتظهر زي ما هي، وألوان القسم اللي فوق مابتأثرش عليها.</p>' +
      '<div class="wfb-btns"><button type="button" data-a="pick-logo">📁 تغيير شعار الورشة</button><button type="button" class="secondary" data-a="clear-logo"' + (st.hasLogo ? "" : " disabled") + '>↩️ الشعار الأصلي</button></div>' +
      '<div class="wfb-btns"><button type="button" data-a="pick-icon">📁 تغيير أيقونة التطبيق</button><button type="button" class="secondary" data-a="clear-icon"' + (st.hasIcon ? "" : " disabled") + '>↩️ الأيقونة الأصلية</button></div>' +
      '<input type="file" id="wfbFileLogo" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>' +
      '<input type="file" id="wfbFileIcon" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>' +
      '<h3>📲 أيقونة التثبيت على الموبايل</h3>' +
      '<p class="hint">أيقونة التطبيق على شاشة الموبايل بتتاخد من ملفات الأيقونات وقت التثبيت، فمش بتتغير لوحدها. نزّل الأيقونات بالألوان الحالية، وانسخها فوق ملفات المشروع (نفس الأسماء)، ثم ثبّت التطبيق من جديد.</p>' +
      '<div class="wfb-btns"><button type="button" data-a="dl-icons">⬇️ تنزيل ملفات الأيقونات</button></div>' +
      '<h3>💾 نسخة الهوية</h3>' +
      '<p class="hint">احفظ الألوان والصور في ملف تقدر ترجّعه على أي جهاز تاني.</p>' +
      '<div class="wfb-btns"><button type="button" class="secondary" data-a="export">⬇️ تصدير الهوية</button><button type="button" class="secondary" data-a="import">⬆️ استيراد هوية</button><button type="button" class="secondary" data-a="reset-all">🗑️ رجوع للهوية الأصلية بالكامل</button></div>' +
      '<input type="file" id="wfbFileImport" accept="application/json,.json" hidden>' +
      '<div class="wfb-msg" role="status" aria-live="polite"></div>';
    ensureUrls().then(function () { applyImages(box); });
    if (box._wfbBound) return;
    box._wfbBound = true;

    var colorTimer = null;
    function pushColors(p) { clearTimeout(colorTimer); colorTimer = setTimeout(function () { setColors(p); }, 80); }
    box.addEventListener("input", function (e) {
      var t = e.target;
      if (t.classList && t.classList.contains("wfb-color")) {
        var k = t.getAttribute("data-k"), h = box.querySelector('[data-h="' + k + '"]');
        if (h) h.value = t.value.toUpperCase();
        var p = {}; p[k] = t.value; pushColors(p);
      }
    });
    box.addEventListener("change", function (e) {
      var t = e.target;
      if (t.classList && t.classList.contains("wfb-hex")) {
        var k = t.getAttribute("data-h"), v = ("#" + t.value.replace(/[^0-9a-f]/gi, "")).slice(0, 7);
        if (!HEX.test(v)) { t.value = st[k]; return msg("اكتب كود لون صحيح من 6 خانات، مثال: #082A54", true); }
        t.value = v.toUpperCase();
        var c = box.querySelector('[data-k="' + k + '"]'); if (c) c.value = v.toLowerCase();
        var p = {}; p[k] = v; pushColors(p); return;
      }
      if (t.id === "wfbHeader") { setColors({ applyHeader: t.checked }); return; }
      var file = t.files && t.files[0];
      if (!file) return;
      if (t.id === "wfbFileLogo" || t.id === "wfbFileIcon") {
        var kind = t.id === "wfbFileLogo" ? "logo" : "icon";
        readImage(file, kind).then(function (d) { return setCustom(kind, d); })
          .then(function () { renderPanel(); msg("✅ تم تغيير " + (kind === "logo" ? "شعار الورشة" : "أيقونة التطبيق")); })
          ["catch"](function (er) { msg("❌ " + (er && er.message ? er.message : "تعذر رفع الصورة"), true); });
      } else if (t.id === "wfbFileImport") {
        var fr = new FileReader();
        fr.onload = function () {
          var o; try { o = JSON.parse(String(fr.result)); } catch (er) { return msg("❌ الملف ده مش JSON صالح", true); }
          importData(o).then(function () { renderPanel(); msg("✅ تم استيراد الهوية"); })["catch"](function (er) { msg("❌ " + er.message, true); });
        };
        fr.readAsText(file);
      }
      t.value = "";
    });
    box.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-a]") : null;
      if (!b || b.disabled) return;
      var a = b.getAttribute("data-a");
      if (a === "pick-logo") box.querySelector("#wfbFileLogo").click();
      else if (a === "pick-icon") box.querySelector("#wfbFileIcon").click();
      else if (a === "import") box.querySelector("#wfbFileImport").click();
      else if (a === "clear-logo") clearCustom("logo").then(function () { renderPanel(); msg("تم الرجوع للشعار الأصلي"); });
      else if (a === "clear-icon") clearCustom("icon").then(function () { renderPanel(); msg("تم الرجوع للأيقونة الأصلية"); });
      else if (a === "reset-colors") resetColors().then(function () { renderPanel(); msg("تم الرجوع للألوان الأصلية"); });
      else if (a === "reset-all") { if (confirm("الرجوع للهوية الأصلية بالكامل (الألوان والصور)؟")) resetAll().then(function () { renderPanel(); msg("تم الرجوع للهوية الأصلية"); }); }
      else if (a === "dl-icons") { msg("جاري تجهيز الملفات… لو المتصفح سأل عن تنزيل ملفات متعددة اسمح بيه."); downloadIcons().then(function () { msg("✅ تم تنزيل الأيقونات"); })["catch"](function () { msg("❌ تعذر تجهيز الأيقونات", true); }); }
      else if (a === "export") exportData().then(function (o) { download("workshop-branding.json", new Blob([JSON.stringify(o)], { type: "application/json" })); msg("✅ تم تصدير الهوية"); });
    });
  }

  /* ---------- تشغيل ---------- */
  window.WFBrand = {
    get: function () { return JSON.parse(JSON.stringify(st)); },
    setColors: setColors, resetColors: resetColors, resetAll: resetAll,
    setLogo: function (dataUrl) { return setCustom("logo", dataUrl); },
    setIcon: function (dataUrl) { return setCustom("icon", dataUrl); },
    refresh: refresh, exportData: exportData, importData: importData, downloadIcons: downloadIcons
  };

  applyHeaderAndTheme();
  if (customized() && (st.hasLogo || st.hasIcon || !colorsDefault())) {
    // نخفي الصور الافتراضية لحظات لحد ما النسخة الملوّنة تجهز عشان ما يحصلش وميض
    document.documentElement.classList.add("wfb-pending");
    var pst = document.createElement("style");
    pst.textContent = "html.wfb-pending img.brand-logo,html.wfb-pending img.wf-logo,html.wfb-pending img[data-wf-brand]{visibility:hidden}";
    (document.head || document.documentElement).appendChild(pst);
    setTimeout(function () { document.documentElement.classList.remove("wfb-pending"); }, 2500);
  }
  function ready() {
    refresh().then(function () { setLinks(); });
    renderPanel();
    if (window.MutationObserver) {
      new MutationObserver(function (list) {
        if (!urls) return;
        for (var i = 0; i < list.length; i++) {
          var n = list[i].addedNodes;
          for (var j = 0; j < n.length; j++) if (n[j].nodeType === 1) { if (n[j].matches && n[j].matches(ICON_SEL + "," + LOGO_SEL)) applyImages(n[j].parentNode || document); else if (n[j].querySelector) applyImages(n[j]); }
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
})();
