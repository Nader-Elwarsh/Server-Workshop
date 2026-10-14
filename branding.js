/* branding.js — الهوية البصرية للورشة (شعار الورشة + أيقونة التطبيق + الألوان).

   إيه اللي بيعمله:
   - بيطبّق ألوان الشعار والأيقونة اللي اخترتها من الإعدادات على كل صفحات النظام.
   - بيبدّل أي صورة شعار/أيقونة في الصفحات (img.brand-logo / img.wf-logo / img[data-wf-brand]).
   - بيحدّث أيقونة التبويب (favicon) وأيقونة آيفون (apple-touch-icon) بالألوان الحالية.
   - بيرسم قسم «🎨 الهوية والشعار» جوه الإعدادات (داخل <div id="brandingSettings">).

   مصادر الصور الافتراضية (تقدر تستبدل الملفات نفسها من غير أي تعديل في الكود):
     workshop-logo.svg  ← شعار الورشة الأفقي
     app-icon.svg       ← أيقونة التطبيق
   الملفين دول فيهم 3 ألوان ثابتة بتتبدّل لحظيًا: الأساسي #082A54 / المميز #FAA822 / الفاتح #FFFFFF.
   (لو استبدلت الملفات بتصميم تاني ملوّن بغير الألوان دي هيظهر زي ما هو من غير تغيير ألوان.)

   التخزين: الإعدادات الصغيرة في WFStorage (مفتاح wf_branding_v1)، والصور المرفوعة في IndexedDB
   (قاعدة wfBrandingDB) عشان ما تزاحمش مساحة بيانات النظام الأساسية في WFStorage. */
(function () {
  "use strict";
  if (window.WFBrand) return;

  var KEY = "wf_branding_v1";
  var DEF = { primary: "#082A54", accent: "#FAA822", light: "#FFFFFF" };
  var SRC = { logo: "workshop-logo.svg", icon: "app-icon.svg" };
  var HEX = /^#[0-9a-f]{6}$/i;

  /* ---------- الإعدادات ---------- */
  function loadSettings() {
    var st = { primary: DEF.primary, accent: DEF.accent, light: DEF.light, applyHeader: false, hasLogo: false, hasIcon: false, at: 0 };
    try {
      var o = JSON.parse(WFStorage.getItem(KEY) || "{}") || {};
      ["primary", "accent", "light"].forEach(function (k) { if (HEX.test(o[k] || "")) st[k] = String(o[k]).toUpperCase(); });
      st.applyHeader = !!o.applyHeader; st.hasLogo = !!o.hasLogo; st.hasIcon = !!o.hasIcon; st.at = Number(o.at) > 0 ? Number(o.at) : 0;
    } catch (e) {}
    return st;
  }
  var st = loadSettings();
  function saveSettings() { st.at = Date.now(); try { WFStorage.setItem(KEY, JSON.stringify(st)); return true; } catch (e) { return false; } }
  /* الألوان الفعلية للشعار/الأيقونة الافتراضيين: لون واحد للنظام كله. لو اتحدد «اللون الأساسي/المميز» من لوحة
     هوية النظام (white-label) بياخدهم، وإلا بيفضل على ألوانه القديمة (توافق مع الإعدادات اللي اتحفظت قبل كده). */
  function eff() {
    var o = { primary: st.primary, accent: st.accent, light: st.light };
    try {
      var c = window.WL && window.WL.cfg ? (window.WL.cfg().colors || {}).light || {} : {};
      if (HEX.test(c.primary || "")) o.primary = String(c.primary).toUpperCase();
      if (HEX.test(c.accent || "")) o.accent = String(c.accent).toUpperCase();
    } catch (e) {}
    return o;
  }
  function colorsDefault() { var c = eff(); return c.primary === DEF.primary && c.accent === DEF.accent && c.light === DEF.light; }
  function customized() { return !colorsDefault() || st.hasLogo || st.hasIcon || st.applyHeader; }

  /* ---------- ألوان ---------- */
  function rgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function hex(a) { return "#" + a.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? "0" : "") + v.toString(16); }).join("").toUpperCase(); }
  function mix(h1, h2, t) { var a = rgb(h1), b = rgb(h2); return hex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }

  /* ---------- هيدر التطبيق + theme-color (بيتطبقوا فورًا) ---------- */
  function headerCss() {
    var base = "img.brand-logo,img.wf-logo{object-fit:contain}" + // صور مرفوعة بأبعاد مختلفة ماتتمطش
      (st.hasIcon && iconFull ? "img.brand-logo,img.wf-logo{object-fit:cover}" : ""); // صورة بروفايل مربعة: تملا مكانها
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
    var c = eff();
    return svg.replace(/fill="#([0-9A-Fa-f]{6})"/g, function (m, h) {
      h = h.toUpperCase();
      if (h === "082A54") return 'fill="' + c.primary + '"';
      if (h === "FAA822") return 'fill="' + c.accent + '"';
      if (h === "FFFFFF") return 'fill="' + c.light + '"';
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
  /* الرجوع للأيقونة الأصلية: نشيل أيقونة التبويب/آيفون المتولّدة ونرجّع ملفات المشروع */
  function resetLinks() {
    if (!document.head || customized()) { setLinks(); return; }
    var olds = document.querySelectorAll('link[rel~="icon"]');
    for (var i = 0; i < olds.length; i++) if (/^data:/.test(olds[i].getAttribute("href") || "")) olds[i].setAttribute("href", SRC.icon);
    var a = document.querySelector('link[rel="apple-touch-icon"]');
    if (a && /^data:/.test(a.getAttribute("href") || "")) a.setAttribute("href", "apple-touch-icon-v13.png");
  }
  function emit() { try { window.dispatchEvent(new CustomEvent("wfbrand:change")); } catch (e) {} }
  function refresh() {
    applyHeaderAndTheme();
    return ensureUrls().then(function (u) {
      if (st.hasIcon) return loadImg(u.icon).then(function (im) { iconFull = opaqueCorners(im); }, function () { iconFull = false; }).then(function () { return u; });
      iconFull = false; return u;
    }).then(function (u) { applyHeaderAndTheme(); applyImages(); document.documentElement.classList.remove("wfb-pending"); return u; });
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
  /* أيقونة مرفوعة «مليانة» (أركانها مش شفافة، زي صورة بروفايل) بتترسم على المساحة كلها حتى في الأيقونة الدايرية،
     والشفافة (لوجو على خلفية فاضية) بتتحط على خلفية بلون النظام بهامش أمان. */
  var iconFull = false;
  function opaqueCorners(im) {
    try {
      var c = document.createElement("canvas"); c.width = c.height = 16;
      var x = c.getContext("2d"); x.drawImage(im, 0, 0, 16, 16);
      var d = x.getImageData(0, 0, 16, 16).data, px = [0, 15, 240, 255];
      return px.every(function (i) { return d[i * 4 + 3] > 245; });
    } catch (e) { return false; }
  }
  function iconPng(size, mode) { // mode: any | maskable | apple
    return ensureUrls().then(function (u) {
      return loadImg(u.icon).then(function (im) {
        var c = document.createElement("canvas"); c.width = c.height = size;
        var x = c.getContext("2d");
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
        var iw = im.naturalWidth || im.width || 512, ih = im.naturalHeight || im.height || 512;
        var k = 1, full = st.hasIcon && opaqueCorners(im);
        if (mode !== "any" && !full) { x.fillStyle = eff().primary; x.fillRect(0, 0, size, size); k = mode === "maskable" ? 0.8 : 0.92; }
        if (full) { var sc = Math.max(size / iw, size / ih); x.drawImage(im, (size - iw * sc) / 2, (size - ih * sc) / 2, iw * sc, ih * sc); return c; }
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
    return idbSet(kind, dataUrl).then(function () { st[flag] = true; saveSettings(); invalidate(); return refresh().then(function () { setLinks(); emit(); }); });
  }
  function clearCustom(kind) {
    var flag = kind === "logo" ? "hasLogo" : "hasIcon";
    return idbDel(kind)["catch"](function () {}).then(function () { st[flag] = false; saveSettings(); invalidate(); return refresh().then(function (u) { resetLinks(); emit(); return u; }); });
  }

  /* ---------- واجهة API ---------- */
  function setColors(p) {
    ["primary", "accent", "light"].forEach(function (k) { if (p && HEX.test(p[k] || "")) st[k] = String(p[k]).toUpperCase(); });
    if (p && typeof p.applyHeader === "boolean") st.applyHeader = p.applyHeader;
    saveSettings(); invalidate();
    return refresh().then(function () { setLinks(); emit(); });
  }
  function resetColors() {
    st.primary = DEF.primary; st.accent = DEF.accent; st.light = DEF.light; st.applyHeader = false;
    saveSettings(); invalidate();
    return refresh().then(function (u) { resetLinks(); emit(); return u; });
  }
  function resetAll() {
    return Promise.all([idbDel("logo")["catch"](function () {}), idbDel("icon")["catch"](function () {})]).then(function () {
      st = { primary: DEF.primary, accent: DEF.accent, light: DEF.light, applyHeader: false, hasLogo: false, hasIcon: false };
      try { WFStorage.removeItem(KEY); } catch (e) {}
      invalidate(); return refresh().then(function (u) { resetLinks(); emit(); return u; });
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
    return Promise.all(ops).then(function () { saveSettings(); invalidate(); return refresh().then(function () { setLinks(); emit(); }); });
  }

  /* ---------- قص الصورة (زي صورة البروفايل) ----------
     بتفتح نافذة فيها الصورة جوه إطار الأيقونة: اسحب بصباعك تحركها، وقرّب/بعّد بصباعين أو بالشريط،
     ولف 90°، واختار لون الخلفية لو الصورة صغيرة أو شفافة. الدايرة المنقطة = اللي بيظهر في الأيقونات الدايرية. */
  function cropImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error("مفيش ملف"));
      if (file.size > 15 * 1024 * 1024) return reject(new Error("حجم الصورة كبير (الحد الأقصى 15 ميجا)"));
      if (/svg/i.test(file.type) || /\.svg$/i.test(file.name)) return readImage(file, "icon").then(resolve, reject); // SVG بيتاخد زي ما هو
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error("تعذر قراءة الملف")); };
      fr.onload = function () { loadImg(fr.result).then(open, function () { reject(new Error("مش قادر أقرأ الصورة دي — جرّب PNG أو JPG")); }); };
      fr.readAsDataURL(file);

      function open(im) {
        var iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
        var V = Math.max(200, Math.min(300, (window.innerWidth || 360) - 64));
        var dpr = Math.min(3, window.devicePixelRatio || 1);
        var rot = 0, bg = "#FFFFFF", ox = 0, oy = 0;
        function dims() { return rot % 180 ? [ih, iw] : [iw, ih]; }
        function fitScale() { var d = dims(); return V / Math.min(d[0], d[1]); } // تملا الإطار
        function minScale() { var d = dims(); return V / Math.max(d[0], d[1]) * 0.6; }
        var sc = fitScale();

        var ov = document.createElement("div");
        ov.className = "wfb-crop"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "ظبط الصورة");
        ov.innerHTML =
          '<div class="wfb-crop-card"><b class="wfb-crop-t">ظبّط الصورة</b>' +
          '<p class="wfb-crop-h">اسحب الصورة عشان تحركها، وقرّب أو بعّد بصباعين أو بالشريط.</p>' +
          '<canvas class="wfb-crop-cv" width="' + Math.round(V * dpr) + '" height="' + Math.round(V * dpr) + '" style="width:' + V + 'px;height:' + V + 'px"></canvas>' +
          '<div class="wfb-crop-row"><span aria-hidden="true">➖</span><input type="range" class="wfb-crop-z" min="0" max="1000" step="1" aria-label="التكبير"><span aria-hidden="true">➕</span>' +
          '<button type="button" class="secondary wfb-crop-rot" aria-label="لف الصورة" title="لف">⟳</button></div>' +
          '<div class="wfb-crop-row wfb-crop-bgs"><span class="wfb-crop-l">الخلفية:</span>' +
          [["#FFFFFF", "أبيض"], ["primary", "لون النظام"], ["#111111", "أسود"], ["", "شفافة"]].map(function (b2, i) {
            return '<button type="button" class="wfb-crop-bg' + (i === 0 ? " on" : "") + '" data-bg="' + b2[0] + '" title="' + b2[1] + '" aria-label="خلفية ' + b2[1] + '"><i style="background:' + (b2[0] === "primary" ? eff().primary : (b2[0] || "repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0 0/10px 10px")) + '"></i></button>';
          }).join("") + "</div>" +
          '<div class="wfb-crop-row wfb-crop-acts"><button type="button" class="primary wfb-crop-ok">✔️ تمام</button><button type="button" class="secondary wfb-crop-no">إلغاء</button></div></div>';
        document.body.appendChild(ov);
        var cv = ov.querySelector("canvas"), cx = cv.getContext("2d"), zr = ov.querySelector(".wfb-crop-z");
        var prevFocus = document.activeElement;

        function bgColor() { return bg === "primary" ? eff().primary : bg; }
        function paint(ctx, size, guides) {
          var k = size / V;
          ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, size, size);
          if (bgColor()) { ctx.fillStyle = bgColor(); ctx.fillRect(0, 0, size, size); }
          else if (guides) { for (var yy = 0; yy < size; yy += 10 * k) for (var xx = 0; xx < size; xx += 10 * k) { ctx.fillStyle = ((xx + yy) / (10 * k)) % 2 ? "#ddd" : "#fff"; ctx.fillRect(xx, yy, 10 * k, 10 * k); } }
          ctx.save();
          ctx.translate(size / 2 + ox * k, size / 2 + oy * k); ctx.rotate(rot * Math.PI / 180);
          ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
          ctx.drawImage(im, -iw * sc * k / 2, -ih * sc * k / 2, iw * sc * k, ih * sc * k);
          ctx.restore();
          if (guides) {
            ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 2 * k; ctx.setLineDash([6 * k, 5 * k]);
            ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineDashOffset = 5 * k; ctx.stroke();
            ctx.setLineDash([]);
          }
        }
        function draw() { paint(cx, cv.width, true); }
        function setZoomUi() { var lo = minScale(), hi = fitScale() * 4; zr.value = String(Math.round((Math.log(sc / lo) / Math.log(hi / lo)) * 1000)); }
        function zoomTo(nsc, px, py) { // px,py: نقطة ثابتة بالنسبة لمركز الإطار
          var lo = minScale(), hi = fitScale() * 4; nsc = Math.max(lo, Math.min(hi, nsc));
          px = px || 0; py = py || 0;
          ox = px - (px - ox) * (nsc / sc); oy = py - (py - oy) * (nsc / sc); sc = nsc; draw();
        }
        zr.addEventListener("input", function () { var lo = minScale(), hi = fitScale() * 4; zoomTo(lo * Math.pow(hi / lo, Number(zr.value) / 1000)); });
        var pts = {}, last = null;
        function rel(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left - V / 2, e.clientY - r.top - V / 2]; }
        cv.style.touchAction = "none";
        cv.addEventListener("pointerdown", function (e) { cv.setPointerCapture(e.pointerId); pts[e.pointerId] = rel(e); last = null; });
        cv.addEventListener("pointermove", function (e) {
          if (!pts[e.pointerId]) return;
          var prev = pts[e.pointerId], cur = rel(e); pts[e.pointerId] = cur;
          var ids = Object.keys(pts);
          if (ids.length === 1) { ox += cur[0] - prev[0]; oy += cur[1] - prev[1]; draw(); }
          else if (ids.length === 2) {
            var a = pts[ids[0]], b2 = pts[ids[1]], d = Math.hypot(a[0] - b2[0], a[1] - b2[1]), m = [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2];
            if (last) { ox += m[0] - last.m[0]; oy += m[1] - last.m[1]; zoomTo(sc * d / (last.d || d), m[0], m[1]); setZoomUi(); }
            last = { d: d, m: m };
          }
        });
        function up(e) { delete pts[e.pointerId]; last = null; }
        cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
        cv.addEventListener("wheel", function (e) { e.preventDefault(); var p = rel(e); zoomTo(sc * (e.deltaY < 0 ? 1.08 : 1 / 1.08), p[0], p[1]); setZoomUi(); }, { passive: false });
        function close(v, err) { document.removeEventListener("keydown", onKey); if (ov.parentNode) ov.parentNode.removeChild(ov); try { prevFocus && prevFocus.focus(); } catch (e2) {} if (err) reject(err); else resolve(v); }
        function onKey(e) { if (e.key === "Escape") close(null, new Error("cancel")); }
        document.addEventListener("keydown", onKey);
        ov.addEventListener("click", function (e) {
          var t = e.target.closest ? e.target.closest("button") : null;
          if (e.target === ov) return close(null, new Error("cancel"));
          if (!t) return;
          if (t.classList.contains("wfb-crop-no")) return close(null, new Error("cancel"));
          if (t.classList.contains("wfb-crop-rot")) { rot = (rot + 90) % 360; sc = Math.max(sc, minScale()); ox = 0; oy = 0; setZoomUi(); draw(); return; }
          if (t.classList.contains("wfb-crop-bg")) {
            bg = t.getAttribute("data-bg"); var all = ov.querySelectorAll(".wfb-crop-bg");
            for (var i = 0; i < all.length; i++) all[i].classList.toggle("on", all[i] === t);
            draw(); return;
          }
          if (t.classList.contains("wfb-crop-ok")) {
            var out = document.createElement("canvas"); out.width = out.height = 512;
            paint(out.getContext("2d"), 512, false);
            close(out.toDataURL("image/png"));
          }
        });
        setZoomUi(); draw();
        setTimeout(function () { var ok = ov.querySelector(".wfb-crop-ok"); if (ok) ok.focus(); }, 30);
      }
    });
  }
  /* اختيار صورة الأيقونة (من المعرض/الكاميرا) ← قص ← حفظ. نفس الخطوات من أي مكان في النظام. */
  var pickInput = null;
  function pickIcon() {
    return new Promise(function (resolve, reject) {
      if (!pickInput) {
        pickInput = document.createElement("input"); pickInput.type = "file"; pickInput.accept = "image/*"; pickInput.hidden = true;
        document.body.appendChild(pickInput);
      }
      pickInput.value = "";
      pickInput.onchange = function () {
        var f = pickInput.files && pickInput.files[0]; if (!f) return reject(new Error("cancel"));
        cropImage(f).then(function (d) { return setCustom("icon", d); }).then(resolve, reject);
      };
      pickInput.click();
    });
  }
  function pickLogo() {
    return new Promise(function (resolve, reject) {
      var i = document.createElement("input"); i.type = "file"; i.accept = "image/png,image/jpeg,image/webp,image/svg+xml"; i.hidden = true;
      document.body.appendChild(i);
      i.onchange = function () {
        var f = i.files && i.files[0]; i.parentNode.removeChild(i); if (!f) return reject(new Error("cancel"));
        readImage(f, "logo").then(function (d) { return setCustom("logo", d); }).then(resolve, reject);
      };
      i.click();
    });
  }

  /* ---------- قسم الشعار والأيقونة (في لوحة هوية النظام) ---------- */
  function injectPanelCss() {
    if (document.getElementById("wfb-panel-css")) return;
    var s = document.createElement("style"); s.id = "wfb-panel-css";
    s.textContent =
      ".wfb-imgs{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 0}" +
      ".wfb-imgs>div{border:1px solid var(--border,#ddd);border-radius:14px;padding:12px;text-align:center;background:var(--bg-elevated,#fff)}" +
      ".wfb-imgs b{display:block;margin-bottom:8px}" +
      ".wfb-tap{display:block;margin:0 auto 8px;padding:0;border:0;background:none;cursor:pointer;position:relative}" +
      ".wfb-tap img{display:block;margin:auto;object-fit:contain}" +
      ".wfb-tap.icon img{width:88px;height:88px;border-radius:22%;box-shadow:0 2px 10px rgba(0,0,0,.18)}" +
      ".wfb-tap.logo img{height:70px;width:auto;max-width:100%;background:#fff;border-radius:10px;padding:6px}" +
      ".wfb-tap::after{content:'📷';position:absolute;bottom:-6px;inset-inline-start:calc(50% + 30px);width:30px;height:30px;line-height:30px;border-radius:50%;background:var(--wl-primary,#17324d);color:#fff;font-size:15px;box-shadow:0 1px 4px rgba(0,0,0,.3)}" +
      ".wfb-tap.logo::after{inset-inline-start:auto;inset-inline-end:-4px}" +
      ".wfb-imgs .wfb-btns{display:flex;flex-direction:column;gap:6px}" +
      ".wfb .wfb-msg{min-height:20px;font-size:13px;color:var(--success-text,#18794e)}" +
      ".wfb-crop{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:12px}" +
      ".wfb-crop-card{background:var(--bg-elevated,#fff);color:var(--text,#111);border-radius:18px;padding:16px;max-width:360px;width:100%;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.4)}" +
      ".wfb-crop-t{font-size:18px}.wfb-crop-h{font-size:13px;color:var(--text-muted,#666);margin:4px 0 10px}" +
      ".wfb-crop-cv{display:block;margin:0 auto;border-radius:22%;box-shadow:0 2px 12px rgba(0,0,0,.25);cursor:grab}" +
      ".wfb-crop-row{display:flex;align-items:center;justify-content:center;gap:8px;margin:12px 0 0}" +
      ".wfb-crop-row input[type=range]{flex:1;margin:0}" +
      ".wfb-crop-l{font-size:13px;font-weight:700}" +
      ".wfb-crop-bg{width:38px;height:38px;padding:3px;border-radius:50%;border:2px solid transparent;background:none;cursor:pointer}" +
      ".wfb-crop-bg.on{border-color:var(--wl-primary,#17324d)}" +
      ".wfb-crop-bg i{display:block;width:100%;height:100%;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.2)}" +
      ".wfb-crop-acts button{flex:1;min-height:46px}";
    document.head.appendChild(s);
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
      '<div class="wfb-imgs">' +
      '<div><b>📱 صورة التطبيق</b><button type="button" class="wfb-tap icon" data-a="pick-icon" aria-label="تغيير صورة التطبيق"><img data-wf-brand="icon" src="' + SRC.icon + '" alt=""></button>' +
      '<div class="wfb-btns"><button type="button" class="secondary" data-a="pick-icon">📷 تغيير</button>' + (st.hasIcon ? '<button type="button" class="secondary" data-a="clear-icon">↩️ الأصلية</button>' : "") + "</div></div>" +
      '<div><b>🏷️ شعار الورشة</b><button type="button" class="wfb-tap logo" data-a="pick-logo" aria-label="تغيير شعار الورشة"><img data-wf-brand="logo" src="' + SRC.logo + '" alt=""></button>' +
      '<div class="wfb-btns"><button type="button" class="secondary" data-a="pick-logo">📷 تغيير</button>' + (st.hasLogo ? '<button type="button" class="secondary" data-a="clear-logo">↩️ الأصلي</button>' : "") + "</div></div>" +
      "</div>" +
      '<p class="hint">صورة التطبيق = الأيقونة اللي على شاشة الموبايل وفي الهيدر والتبويب. شعار الورشة = اللي بيطلع في الإيصالات والطباعة. ' +
      "لو مارفعتش صور، الشعار والأيقونة الأصليين بيتلوّنوا لوحدهم بلون النظام.</p>" +
      '<div class="wfb-msg" role="status" aria-live="polite"></div>';
    ensureUrls().then(function () { applyImages(box); });
    if (box._wfbBound) return;
    box._wfbBound = true;
    box.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-a]") : null;
      if (!b || b.disabled) return;
      var a = b.getAttribute("data-a");
      var pub = function () { try { if (window.WL && window.WL.schedulePublish) window.WL.schedulePublish(); } catch (e2) {} };
      var fail = function (er) { if (er && er.message === "cancel") return; msg("❌ " + (er && er.message ? er.message : "تعذر رفع الصورة"), true); };
      if (a === "pick-icon") pickIcon().then(function () { renderPanel(); pub(); msg("✅ اتغيرت صورة التطبيق"); }, fail);
      else if (a === "pick-logo") pickLogo().then(function () { renderPanel(); pub(); msg("✅ اتغير شعار الورشة"); }, fail);
      else if (a === "clear-logo") clearCustom("logo").then(function () { renderPanel(); pub(); msg("تم الرجوع للشعار الأصلي"); });
      else if (a === "clear-icon") clearCustom("icon").then(function () { renderPanel(); pub(); msg("تم الرجوع للأيقونة الأصلية"); });
    });
  }

  /* ---------- تشغيل ---------- */
  window.WFBrand = {
    get: function () { return JSON.parse(JSON.stringify(st)); },
    setColors: setColors, resetColors: resetColors, resetAll: resetAll,
    setLogo: function (dataUrl) { return setCustom("logo", dataUrl); },
    setIcon: function (dataUrl) { return setCustom("icon", dataUrl); },
    logoDataUrl: function () {
      return ensureUrls().then(function (u) {
        if (/^data:/.test(u.logo)) return u.logo;
        return fetchText(u.logo).then(svgUrl);
      });
    },
    refresh: refresh, exportData: exportData, importData: importData, downloadIcons: downloadIcons,
    pickIcon: pickIcon, pickLogo: pickLogo, cropImage: cropImage, clearIcon: function () { return clearCustom("icon"); }, clearLogo: function () { return clearCustom("logo"); },
    iconPng: iconPng, iconUrl: function () { return ensureUrls().then(function (u) { return u.icon; }); },
    colors: eff, isIconCustom: function () { return st.hasIcon; }, isLogoCustom: function () { return st.hasLogo; },
    iconChanged: function () { return st.hasIcon || !colorsDefault(); }, stamp: function () { return st.at || 0; }
  };
  /* لون النظام اتغير من لوحة الهوية ← الشعار والأيقونة الافتراضيين يتلوّنوا بيه فورًا */
  var effKey = JSON.stringify(eff());
  function onWl() { var k = JSON.stringify(eff()); if (k === effKey) return; effKey = k; invalidate(); refresh().then(function () { setLinks(); emit(); }); }
  if (window.WL && window.WL.onChange) window.WL.onChange(onWl);

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
