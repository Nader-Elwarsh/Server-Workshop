/* white-label.js — محرك هوية النظام (White-Label).

   بيتحمّل في <head> كل صفحة قبل أي شيء تاني، ويتحكم من الإعدادات (من غير ما تلمس كود) في:
   - اسم النظام/الورشة في كل مكان (العناوين، الفوتر، التبويب، الإيصالات، رسائل الواتساب، شاشة الدخول والبوابة).
   - الشعار والأيقونة (عن طريق branding.js) + اسم وألوان التطبيق المثبّت (manifest ديناميكي).
   - ألوان الواجهة كلها (فاتح/داكن)، شكل الزوايا، الخط، شكل الشعار وحجمه، شكل الهيدر.
   - استبدالات نصية إضافية (أي كلمة ← كلمة تانية) في كل الصفحات.

   مصادر الإعدادات بالترتيب (الأحدث بيغلب):
     1) white-label-config.js  ← هوية النسخة الثابتة (للبيع/التأجير)
     2) localStorage (wf_wl_v1) ← اللي اتضبط من لوحة «هوية النظام» على الجهاز
     3) السحابة portal/branding ← لو اتنشرت من لوحة الهوية، بتنزل لكل الأجهزة والعملاء

   لو مفيش أي إعداد: المحرك مابيعملش حاجة خالص والنظام يفضل بشكله الأصلي. */
(function () {
  "use strict";
  if (window.WL) return;

  var KEY = "wf_wl_v1";
  var DEF_NAME = "الورشة الفنية";
  var DEF_TAG = "نظام إدارة الورشة المصغر";
  var HEX = /^#[0-9a-f]{6}$/i;

  /* قيم الألوان الأصلية (للعرض في اللوحة فقط — مابتتكتبش في الـ CSS إلا لو اتغيّرت) */
  var COLOR_DEFS = [
    { k: "primary", label: "اللون الأساسي (الأزرار والتحديد)", light: "#17324d", dark: "#17324d" },
    { k: "primary2", label: "اللون الثانوي (نهاية تدرج الهيدر)", light: "#245a7a", dark: "#245a7a" },
    { k: "accent", label: "اللون المميز (إبراز وتنبيه)", light: "#f2a93b", dark: "#f2a93b" },
    { k: "link", label: "لون الروابط والعناوين", light: "#17324d", dark: "#5fb0ff" },
    { k: "bg", label: "خلفية الصفحة", light: "#f5f7fa", dark: "#0f1115" },
    { k: "surface", label: "خلفية البطاقات والأقسام", light: "#ffffff", dark: "#1b1f27" },
    { k: "sunken", label: "خلفية الحقول والمربعات الداخلية", light: "#f2f5f8", dark: "#232833" },
    { k: "border", label: "لون الحدود", light: "#e2e6eb", dark: "#2c3340" },
    { k: "text", label: "لون النص", light: "#18212b", dark: "#e9edf2" },
    { k: "muted", label: "لون النص الثانوي", light: "#687583", dark: "#9aa5b1" },
    { k: "success", label: "لون النجاح", light: "#18794e", dark: "#4ade80" },
    { k: "danger", label: "لون الخطأ والحذف", light: "#aa1111", dark: "#ff6b6b" },
    { k: "warn", label: "لون التحذير", light: "#8a6116", dark: "#e0b34a" }
  ];
  var COLOR_KEYS = COLOR_DEFS.map(function (d) { return d.k; });

  var FONTS = {
    "default": { label: "الخط الأصلي", stack: "" },
    system: { label: "خط النظام", stack: 'system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Arabic",sans-serif' },
    tahoma: { label: "Tahoma", stack: 'Tahoma,"Segoe UI",sans-serif' },
    arial: { label: "Arial", stack: "Arial,Helvetica,sans-serif" },
    serif: { label: "خط بسيط بزوائد (Serif)", stack: '"Traditional Arabic","Times New Roman",serif' },
    cairo: { label: "Cairo (أونلاين)", gf: "Cairo", stack: '"Cairo",system-ui,Tahoma,sans-serif' },
    tajawal: { label: "Tajawal (أونلاين)", gf: "Tajawal", stack: '"Tajawal",system-ui,Tahoma,sans-serif' },
    almarai: { label: "Almarai (أونلاين)", gf: "Almarai", stack: '"Almarai",system-ui,Tahoma,sans-serif' },
    ibm: { label: "IBM Plex Sans Arabic (أونلاين)", gf: "IBM Plex Sans Arabic", stack: '"IBM Plex Sans Arabic",system-ui,Tahoma,sans-serif' },
    kufi: { label: "Noto Kufi Arabic (أونلاين)", gf: "Noto Kufi Arabic", stack: '"Noto Kufi Arabic",system-ui,Tahoma,sans-serif' },
    changa: { label: "Changa (أونلاين)", gf: "Changa", stack: '"Changa",system-ui,Tahoma,sans-serif' },
    messiri: { label: "El Messiri (أونلاين)", gf: "El Messiri", stack: '"El Messiri",system-ui,Tahoma,sans-serif' }
  };
  var RADII = { "default": 0, sharp: 3, soft: 8, round: 18, pill: 26 };
  var LOGO_SHAPES = { "default": "", circle: "50%", square: "0", soft: "12px", round: "30%" };

  var PRESETS = [
    { id: "navy", name: "الأصلي (كحلي)", c: null },
    { id: "royal", name: "أزرق ملكي", c: { primary: "#1e4fa3", primary2: "#3a7bd5", accent: "#f5a623", link: "#1e4fa3" } },
    { id: "green", name: "أخضر", c: { primary: "#1b5e3a", primary2: "#2e8b57", accent: "#f2c94c", link: "#1b5e3a" } },
    { id: "teal", name: "فيروزي", c: { primary: "#0e5a63", primary2: "#16a085", accent: "#f2a93b", link: "#0e5a63" } },
    { id: "red", name: "أحمر", c: { primary: "#8f1d2c", primary2: "#c0392b", accent: "#f39c12", link: "#8f1d2c" } },
    { id: "purple", name: "بنفسجي", c: { primary: "#4a2a7a", primary2: "#8e44ad", accent: "#f1c40f", link: "#4a2a7a" } },
    { id: "orange", name: "برتقالي", c: { primary: "#b34b16", primary2: "#e07b39", accent: "#17324d", link: "#b34b16" } },
    { id: "gold", name: "أسود وذهبي", c: { primary: "#111827", primary2: "#374151", accent: "#d4a017", link: "#111827" } },
    { id: "navyGold", name: "كحلي وذهبي (كامل)", c: { primary: "#17324d", primary2: "#245a7a", accent: "#b8903f", link: "#b8903f", bg: "#f5f7fa", surface: "#ffffff", sunken: "#f2f5f8", border: "#e2e6eb", text: "#18212b", muted: "#687583" } },
    { id: "blueTeal", name: "أزرق وبترولي (كامل)", c: { primary: "#0f6a83", primary2: "#087e8b", accent: "#f2a93b", link: "#0c7188", bg: "#f2f8fa", surface: "#ffffff", sunken: "#e8f1f4", border: "#d6e2e6", text: "#172b36", muted: "#617780" } },
    { id: "charcoalCopper", name: "فحمي ونحاسي (كامل)", c: { primary: "#42424a", primary2: "#785039", accent: "#a2542f", link: "#a2542f", bg: "#f7f5f3", surface: "#ffffff", sunken: "#f0ece8", border: "#ded9d3", text: "#222326", muted: "#6c6864" } }
  ];

  /* ---------- أدوات ألوان ---------- */
  function rgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function hex(a) { return "#" + a.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? "0" : "") + v.toString(16); }).join(""); }
  function mix(h1, h2, t) { var a = rgb(h1), b = rgb(h2); return hex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  function lum(h) {
    var c = rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { var l1 = lum(a), l2 = lum(b); if (l1 < l2) { var t = l1; l1 = l2; l2 = t; } return (l1 + 0.05) / (l2 + 0.05); }
  function onColor(bg) { return contrast(bg, "#ffffff") >= contrast(bg, "#111827") ? "#ffffff" : "#111827"; }

  /* ---------- تنظيف الإعدادات ---------- */
  function str(v, max) { return typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max || 120) : ""; }
  function clean(o) {
    o = o && typeof o === "object" ? o : {};
    var out = { name: str(o.name, 80), tagline: str(o.tagline, 120), shortName: str(o.shortName, 24), replace: [], colors: { light: {}, dark: {} }, shape: {}, updatedAt: Number(o.updatedAt) > 0 ? Number(o.updatedAt) : 0 };
    if (Array.isArray(o.replace)) {
      o.replace.forEach(function (p) {
        if (out.replace.length >= 30 || !Array.isArray(p)) return;
        var a = str(p[0], 120), b = typeof p[1] === "string" ? p[1].replace(/[\u0000-\u001f]/g, " ").slice(0, 200) : "";
        if (a) out.replace.push([a, b]);
      });
    }
    ["light", "dark"].forEach(function (m) {
      var src = o.colors && o.colors[m] ? o.colors[m] : {};
      COLOR_KEYS.forEach(function (k) { if (HEX.test(src[k] || "")) out.colors[m][k] = String(src[k]).toLowerCase(); });
    });
    var s = o.shape && typeof o.shape === "object" ? o.shape : {};
    if (s.radius !== undefined && s.radius !== null && s.radius !== "" && s.radius !== "default") {
      if (Object.prototype.hasOwnProperty.call(RADII, s.radius)) out.shape.radius = RADII[s.radius];
      else { var rn = Number(s.radius); if (isFinite(rn) && rn >= 0 && rn <= 28) out.shape.radius = Math.round(rn); }
    }
    if (s.font && Object.prototype.hasOwnProperty.call(FONTS, s.font) && s.font !== "default") out.shape.font = s.font;
    if (s.logoShape && Object.prototype.hasOwnProperty.call(LOGO_SHAPES, s.logoShape) && s.logoShape !== "default") out.shape.logoShape = s.logoShape;
    var ls = Number(s.logoSize); if (ls >= 28 && ls <= 120) out.shape.logoSize = Math.round(ls);
    if (s.header === "solid") out.shape.header = "solid";
    return out;
  }
  function merge(a, b) { // b يغلب a (على مستوى كل مفتاح)
    var o = clean(a), p = clean(b);
    ["name", "tagline", "shortName"].forEach(function (k) { if (p[k]) o[k] = p[k]; });
    if (p.replace.length) o.replace = p.replace;
    ["light", "dark"].forEach(function (m) { COLOR_KEYS.forEach(function (k) { if (p.colors[m][k]) o.colors[m][k] = p.colors[m][k]; }); });
    Object.keys(p.shape).forEach(function (k) { o.shape[k] = p.shape[k]; });
    o.updatedAt = Math.max(o.updatedAt, p.updatedAt);
    return o;
  }

  /* ---------- التخزين ---------- */
  var STATIC = window.WL_STATIC && typeof window.WL_STATIC === "object" ? window.WL_STATIC : {};
  var staticCfg = clean(STATIC.cfg);
  function loadLocal() {
    try { return clean(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { return clean({}); }
  }
  var local = loadLocal();
  var eff = merge(staticCfg, local);
  function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(local)); return true; } catch (e) { return false; } }
  function recompute() { eff = merge(staticCfg, local); }
  function dirty() { return JSON.stringify(eff) !== JSON.stringify(clean({})); }

  /* ================= 1) الثيم (ألوان + شكل) ================= */
  function modeVars(mode) {
    var c = eff.colors[mode] || {}, lc = eff.colors.light, v = {};
    function set(names, val) { names.forEach(function (n) { v[n] = val; }); }
    var base = c.primary || (mode === "dark" ? lc.primary : "") || ""; // الأساسي في الداكن يرث الفاتح لو مش متحدد
    var solid = eff.shape.header === "solid";
    if (base) { set(["--wl-primary", "--primary"], base); set(["--wl-on-primary"], onColor(base)); }
    var p2 = c.primary2 || (base ? mix(base, "#ffffff", 0.16) : "");
    if (p2) set(["--wl-primary-2"], p2);
    if (base || c.primary2 || solid) { // تدرج الهيدر
      var g1, g2;
      if (mode === "dark") {
        g1 = base ? mix(base, "#000000", 0.55) : "#0b1b2b";
        g2 = c.primary2 ? c.primary2 : (base ? mix(base, "#000000", 0.38) : "#123146");
      } else {
        g1 = base || "#17324d";
        g2 = c.primary2 || (base ? mix(base, "#ffffff", 0.16) : "#245a7a");
      }
      if (solid) g2 = g1;
      set(["--header-grad-1", "--navy1"], g1);
      set(["--header-grad-2", "--navy2"], g2);
    }
    if (c.accent) { set(["--wl-accent", "--amber"], c.accent); set(["--on-amber"], onColor(c.accent)); }
    // الرابط: لو اتحدد بنستخدمه، ولو لا بنحسبه من الأساسي (فاتح = الأساسي نفسه، داكن = نسخة أفتح منه)
    var link = c.link || (base ? (mode === "dark" ? mix(base, "#ffffff", 0.6) : base) : "");
    if (link) { set(["--accent-text", "--pri"], link); set(["--on-pri"], onColor(link)); }
    if (c.bg) set(["--bg"], c.bg);
    if (c.surface) set(["--bg-elevated", "--card"], c.surface);
    if (c.sunken) set(["--bg-sunken", "--field", "--seg"], c.sunken);
    if (c.border) set(["--border", "--bd"], c.border);
    if (c.text) set(["--text", "--tx"], c.text);
    if (c.muted) set(["--text-muted", "--mut"], c.muted);
    if (c.success) set(["--success-text", "--ok"], c.success);
    if (c.danger) set(["--danger-text", "--err"], c.danger);
    if (c.warn) set(["--warn-text"], c.warn);
    return v;
  }
  function block(sel, vars) {
    var ks = Object.keys(vars);
    if (!ks.length) return "";
    return sel + "{" + ks.map(function (k) { return k + ":" + vars[k]; }).join(";") + "}";
  }
  function themeCss() {
    var css = "";
    css += block('html:root:not([data-theme="dark"])', modeVars("light"));
    css += block('html[data-theme="dark"]', modeVars("dark"));
    var sh = eff.shape;
    if (typeof sh.radius === "number") {
      var r = sh.radius + "px";
      css += "html .panel,html .card,html .stat,html .dashboard,html .primary,html .secondary,html .danger-btn,html .btn,html input,html select,html textarea,html .quick-order-toggle,html .simple-tile,html .part-autocomplete-results{border-radius:" + r + "}";
    }
    if (sh.font && FONTS[sh.font] && FONTS[sh.font].stack) {
      var f = FONTS[sh.font].stack;
      css += "html body,html input,html select,html textarea,html button{font-family:" + f + "}";
    }
    var lr = sh.logoShape ? LOGO_SHAPES[sh.logoShape] : "", lz = sh.logoSize || 0;
    if (lr !== "" || lz) {
      css += "html img.brand-logo,html img.wf-logo{" + (lr !== "" ? "border-radius:" + lr + ";" : "") + (lz ? "width:" + lz + "px;height:" + lz + "px;" : "") + "}";
    }
    return css;
  }
  function styleEl() {
    var s = document.getElementById("wl-style");
    if (!s) { s = document.createElement("style"); s.id = "wl-style"; (document.head || document.documentElement).appendChild(s); }
    return s;
  }
  function loadFont() {
    var f = eff.shape.font && FONTS[eff.shape.font];
    var old = document.getElementById("wl-font");
    if (!f || !f.gf) { if (old) old.parentNode.removeChild(old); return; }
    var href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(f.gf).replace(/%20/g, "+") + ":wght@400;700&display=swap";
    if (old && old.getAttribute("href") === href) return;
    if (old) old.parentNode.removeChild(old);
    var l = document.createElement("link"); l.id = "wl-font"; l.rel = "stylesheet"; l.href = href;
    (document.head || document.documentElement).appendChild(l);
  }
  function applyTheme() {
    styleEl().textContent = themeCss();
    loadFont();
    var tc = document.querySelector('meta[name="theme-color"]');
    var c = eff.colors.light.primary;
    if (tc && c) { if (!tc._wlOrig) tc._wlOrig = tc.getAttribute("content"); tc.setAttribute("content", c); }
    else if (tc && tc._wlOrig) { tc.setAttribute("content", tc._wlOrig); }
  }

  /* ================= 2) استبدال النصوص ================= */
  function pairs() {
    var a = [];
    if (eff.name && eff.name !== DEF_NAME) a.push([DEF_NAME, eff.name]);
    if (eff.tagline && eff.tagline !== DEF_TAG) a.push([DEF_TAG, eff.tagline]);
    eff.replace.forEach(function (p) { a.push(p); });
    return a;
  }
  var P = [], pKey = "";
  function apply(s) {
    if (!P.length || typeof s !== "string" || !s) return s;
    for (var i = 0; i < P.length; i++) { if (s.indexOf(P[i][0]) > -1) s = s.split(P[i][0]).join(P[i][1]); }
    return s;
  }
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, TEMPLATE: 1 };
  var ATTRS = ["alt", "title", "aria-label", "placeholder"];
  var tOrig = new WeakMap(), tDone = new WeakMap(), aStore = new WeakMap();

  function procText(n) {
    var p = n.parentNode;
    if (p && (SKIP[p.nodeName] || (p.isContentEditable && p.nodeName !== "TITLE"))) return;
    var v = n.nodeValue, d = tDone.get(n), base;
    if (d !== undefined && d === v) base = tOrig.get(n); else { base = v; tOrig.set(n, v); }
    var nv = apply(base);
    if (nv !== v) n.nodeValue = nv;
    if (nv !== base) tDone.set(n, nv); else tDone.delete(n);
  }
  function procAttr(el, a) {
    var v = el.getAttribute(a); if (v === null) return;
    var st = aStore.get(el); if (!st) { st = {}; aStore.set(el, st); }
    var rec = st[a], base;
    if (rec && rec.done === v) base = rec.orig; else { base = v; rec = st[a] = { orig: v, done: null }; }
    var nv = apply(base);
    if (nv !== v) el.setAttribute(a, nv);
    rec.done = nv !== base ? nv : null;
  }
  function procEl(el) {
    if (SKIP[el.nodeName]) return;
    for (var i = 0; i < ATTRS.length; i++) if (el.hasAttribute(ATTRS[i])) procAttr(el, ATTRS[i]);
    if (el.nodeName === "META" && el.hasAttribute("content")) {
      var nm = (el.getAttribute("name") || el.getAttribute("property") || "").toLowerCase();
      if (nm === "description" || nm === "og:title" || nm === "og:description" || nm === "application-name" || nm === "apple-mobile-web-app-title") procAttr(el, "content");
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { procText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (SKIP[root.nodeName]) return; procEl(root); }
    var kids = root.childNodes;
    for (var i = 0; i < kids.length; i++) walk(kids[i]);
  }
  var obs = null, busy = false;
  function startObs() {
    if (obs || !window.MutationObserver) return;
    obs = new MutationObserver(function (list) {
      if (!P.length || busy) return;
      busy = true;
      try {
        for (var i = 0; i < list.length; i++) {
          var m = list[i];
          if (m.type === "characterData") procText(m.target);
          else if (m.type === "attributes") { if (m.attributeName === "content") { if (m.target.nodeName === "META") procEl(m.target); } else procAttr(m.target, m.attributeName); }
          else for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
        }
      } finally { busy = false; }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(["content"]) });
  }
  function refreshText(force) {
    P = pairs();
    var k = JSON.stringify(P);
    var changed = k !== pKey; pKey = k;
    if (!document.body) return; // لسه في الـ head — هنكمّل في DOMContentLoaded
    if (changed || (force && P.length)) { busy = true; try { walk(document.documentElement); } finally { busy = false; } }
    if (P.length) startObs();
  }

  /* ================= 3) manifest ديناميكي (اسم/لون التطبيق المثبّت) ================= */
  var mfCache = {};
  function abs(u, base) { try { return new URL(u, base).href; } catch (e) { return u; } }
  function applyManifest() {
    var link = document.querySelector('link[rel="manifest"]');
    if (!link || !window.fetch || !window.URL || !window.Blob) return;
    if (!link._wlOrig) link._wlOrig = link.getAttribute("href");
    var custom = (eff.name && eff.name !== DEF_NAME) || eff.shortName || eff.colors.light.primary || (eff.tagline && eff.tagline !== DEF_TAG);
    if (!custom) { if (link._wlOrig && link.getAttribute("href") !== link._wlOrig) link.setAttribute("href", link._wlOrig); return; }
    var src = abs(link._wlOrig, location.href);
    var p = mfCache[src] || (mfCache[src] = fetch(src, { cache: "force-cache" }).then(function (r) { if (!r.ok) throw new Error("manifest"); return r.json(); }));
    p.then(function (m) {
      m = JSON.parse(JSON.stringify(m));
      var baseUrl = src;
      m.name = eff.name && eff.name !== DEF_NAME ? eff.name + (eff.tagline ? " - " + eff.tagline : "") : apply(m.name);
      m.short_name = eff.shortName || (eff.name && eff.name !== DEF_NAME ? eff.name.slice(0, 12) : apply(m.short_name));
      if (m.description) m.description = apply(m.description);
      if (eff.colors.light.primary) { m.theme_color = eff.colors.light.primary; m.background_color = eff.colors.light.primary; }
      if (m.start_url) m.start_url = abs(m.start_url, baseUrl);
      if (m.scope) m.scope = abs(m.scope, baseUrl);
      if (m.id) m.id = abs(m.id, baseUrl);
      if (Array.isArray(m.icons)) m.icons.forEach(function (i) { if (i.src) i.src = abs(i.src, baseUrl); });
      if (m.share_target && m.share_target.action) m.share_target.action = abs(m.share_target.action, baseUrl);
      var url = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: "application/manifest+json" }));
      if (link._wlBlob) { try { URL.revokeObjectURL(link._wlBlob); } catch (e) {} }
      link._wlBlob = url; link.setAttribute("href", url);
    })["catch"](function () {});
    var t = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!t && document.head) { t = document.createElement("meta"); t.name = "apple-mobile-web-app-title"; document.head.appendChild(t); }
    if (t) t.setAttribute("content", eff.shortName || eff.name || DEF_NAME);
  }

  /* ================= 4) السحابة (portal/branding) ================= */
  var LAST_PULL = "wf_wl_pulled_at", APPLIED = "wf_wl_brand_applied";
  function fbReady() {
    try { return !!(window.firebase && firebase.apps && firebase.apps.some(function (a) { return a.name === "[DEFAULT]"; }) && firebase.firestore); } catch (e) { return false; }
  }
  function waitFor(test, ms) {
    return new Promise(function (res) {
      var t0 = Date.now();
      (function poll() { if (test()) return res(true); if (Date.now() - t0 > ms) return res(false); setTimeout(poll, 400); })();
    });
  }
  function ref() { return firebase.firestore().collection("portal").doc("branding"); }
  function brandReady() { return !!window.WFBrand; }
  function adoptBrand(json, stamp) {
    if (!json) return Promise.resolve(false);
    var o; try { o = JSON.parse(json); } catch (e) { return Promise.resolve(false); }
    return waitFor(brandReady, 12000).then(function (ok) {
      if (!ok || !window.WFBrand.importData) return false;
      return window.WFBrand.importData(o).then(function () { try { localStorage.setItem(APPLIED, String(stamp)); } catch (e) {} return true; });
    });
  }
  function adoptRemote(r) {
    var cfg = {}; try { cfg = JSON.parse(r.cfg || "{}"); } catch (e) {}
    local = clean(cfg); local.updatedAt = Number(r.updatedAt) || Date.now();
    saveLocal(); recompute(); render();
    return r.brand ? adoptBrand(r.brand, r.updatedAt) : Promise.resolve(false);
  }
  function cloudPull(opts) {
    opts = opts || {};
    return waitFor(fbReady, opts.wait || 20000).then(function (ok) {
      if (!ok) throw new Error("Firebase مش جاهز — لازم تكون أونلاين");
      return ref().get();
    }).then(function (d) {
      try { localStorage.setItem(LAST_PULL, String(Date.now())); } catch (e) {}
      if (!d.exists) return { exists: false, changed: false };
      var r = d.data() || {}, cur = local.updatedAt || 0;
      var brandApplied = 0; try { brandApplied = Number(localStorage.getItem(APPLIED) || 0); } catch (e) {}
      if (!opts.force && !(Number(r.updatedAt) > cur)) {
        if (r.brand && Number(r.updatedAt) > brandApplied && Number(r.updatedAt) >= cur) return adoptBrand(r.brand, r.updatedAt).then(function () { return { exists: true, changed: true }; });
        return { exists: true, changed: false };
      }
      return adoptRemote(r).then(function () { return { exists: true, changed: true }; });
    });
  }
  /* تصغير الصور النقطية (PNG/JPG) قبل رفعها للسحابة: WebP بحد أقصى ~200KB عشان مستند Firestore يفضل خفيف */
  function shrinkImage(dataUrl) {
    return new Promise(function (res) {
      if (typeof dataUrl !== "string" || !/^data:image\/(png|jpeg|webp);/.test(dataUrl) || dataUrl.length <= 200000) return res(dataUrl);
      var im = new Image();
      im.onerror = function () { res(dataUrl); };
      im.onload = function () {
        try {
          var w = im.naturalWidth || 512, h = im.naturalHeight || 512, k = Math.min(1, 640 / Math.max(w, h)), q = 0.86, out = dataUrl, c = document.createElement("canvas");
          for (var i = 0; i < 8; i++) {
            c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
            c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
            out = c.toDataURL("image/webp", q);
            if (out.length <= 200000) break;
            q = Math.max(0.5, q - 0.07); k *= 0.88;
          }
          res(/^data:image\/webp/.test(out) && out.length < dataUrl.length ? out : dataUrl);
        } catch (e) { res(dataUrl); }
      };
      im.src = dataUrl;
    });
  }
  function cloudPush() {
    return waitFor(fbReady, 8000).then(function (ok) {
      if (!ok) throw new Error("لازم تكون أونلاين");
      if (!firebase.auth().currentUser) throw new Error("سجّل الدخول الأول");
      return window.WFBrand && WFBrand.exportData ? WFBrand.exportData() : null;
    }).then(function (brand) {
      if (!brand) return brand;
      return Promise.all([shrinkImage(brand.logo), shrinkImage(brand.icon)]).then(function (a) { brand.logo = a[0]; brand.icon = a[1]; return brand; });
    }).then(function (brand) {
      var warn = "";
      var bj = brand ? JSON.stringify(brand) : "";
      if (bj.length > 850000) { // حد مستند Firestore ~1MB
        brand.logo = null; brand.icon = null; bj = JSON.stringify(brand);
        warn = "الصور كبيرة على السحابة (أكتر من 850KB) فاتنشرت الألوان والنصوص بس — صغّر الشعار/الأيقونة وجرّب تاني.";
      }
      var ts = Date.now();
      local.updatedAt = ts; saveLocal(); recompute();
      return ref().set({ cfg: JSON.stringify(clean(local)), brand: bj, updatedAt: ts }).then(function () {
        try { localStorage.setItem(APPLIED, String(ts)); } catch (e) {}
        return { warn: warn };
      });
    });
  }
  function autoPull() {
    if (!window.firebase) return; // الصفحة دي مفيهاش Firebase
    var last = 0; try { last = Number(localStorage.getItem(LAST_PULL) || 0); } catch (e) {}
    if (Date.now() - last < 5 * 60 * 1000) return; // مرة كل 5 دقايق كحد أقصى (توفير قراءات)
    cloudPull({ wait: 25000 })["catch"](function () {});
    waitFor(fbReady, 25000).then(function (ok) {
      if (!ok) return;
      try { firebase.auth().onAuthStateChanged(function (u) { if (u) { try { localStorage.removeItem(LAST_PULL); } catch (e) {} cloudPull({ wait: 3000 })["catch"](function () {}); } }); } catch (e) {}
    });
  }

  /* ================= 5) هوية النسخة الثابتة (الشعار/الأيقونة) ================= */
  function applyStaticBrand() {
    if (!STATIC.brand) return;
    var stamp = String(STATIC.version || "1"), k = "wf_wl_static_applied";
    var done = ""; try { done = localStorage.getItem(k) || ""; } catch (e) {}
    if (done === stamp) return;
    waitFor(brandReady, 12000).then(function (ok) {
      if (!ok || !window.WFBrand.importData) return;
      WFBrand.importData(STATIC.brand).then(function () { try { localStorage.setItem(k, stamp); } catch (e) {} })["catch"](function () {});
    });
  }

  /* ================= واجهة API ================= */
  var listeners = [];
  function render() {
    applyTheme(); refreshText(); applyManifest();
    for (var i = 0; i < listeners.length; i++) { try { listeners[i](eff); } catch (e) {} }
    try { window.dispatchEvent(new CustomEvent("wl:change")); } catch (e) {}
  }
  function mutate(fn) {
    fn(local);
    local = clean(local); local.updatedAt = Date.now();
    var ok = saveLocal(); recompute(); render();
    return ok;
  }
  function exportConfigFile() {
    return WFBrandExport().then(function (brand) {
      var o = { version: Date.now(), cfg: clean(eff) };
      delete o.cfg.updatedAt;
      if (brand) o.brand = brand;
      if (STATIC.lock) o.lock = STATIC.lock;
      return "/* white-label-config.js — اتولّد من لوحة «هوية النظام». استبدل بيه الملف الأصلي بنفس الاسم. */\nwindow.WL_STATIC = " + JSON.stringify(o) + ";\n";
    });
  }
  function WFBrandExport() { return window.WFBrand && WFBrand.exportData ? WFBrand.exportData() : Promise.resolve(null); }
  function exportJson() {
    return WFBrandExport().then(function (brand) { return { app: "workshop-whitelabel", version: 1, cfg: clean(eff), brand: brand || null }; });
  }
  function importJson(o) {
    if (!o || o.app !== "workshop-whitelabel" || !o.cfg) return Promise.reject(new Error("الملف ده مش ملف هوية صالح"));
    local = clean(o.cfg); local.updatedAt = Date.now(); saveLocal(); recompute(); render();
    return o.brand ? adoptBrand(JSON.stringify(o.brand), Date.now()) : Promise.resolve(true);
  }

  window.WL = {
    DEF_NAME: DEF_NAME, DEF_TAG: DEF_TAG,
    COLOR_DEFS: COLOR_DEFS, FONTS: FONTS, RADII: RADII, LOGO_SHAPES: LOGO_SHAPES, PRESETS: PRESETS,
    name: function () { return eff.name || DEF_NAME; },
    tagline: function () { return eff.tagline || DEF_TAG; },
    shortName: function () { return eff.shortName || eff.name || DEF_NAME; },
    t: apply,                       // يطبّق الاستبدالات على أي نص بيتولّد من الكود (إيصالات، رسائل واتساب...)
    cfg: function () { return JSON.parse(JSON.stringify(eff)); },
    localCfg: function () { return JSON.parse(JSON.stringify(local)); },
    staticCfg: function () { return JSON.parse(JSON.stringify(staticCfg)); },
    lock: function () { return STATIC.lock && STATIC.lock.code ? String(STATIC.lock.code) : ""; },
    isCustom: dirty,
    mutate: mutate,
    onChange: function (fn) { listeners.push(fn); },
    mix: mix, contrast: contrast, onColor: onColor,
    reset: function () { local = clean({}); try { localStorage.removeItem(KEY); } catch (e) {} recompute(); render(); },
    cloudPull: cloudPull, cloudPush: cloudPush,
    exportConfigFile: exportConfigFile, exportJson: exportJson, importJson: importJson
  };

  /* ---------- تشغيل ---------- */
  applyTheme();            // فورًا قبل رسم الصفحة (مفيش وميض)
  P = pairs(); pKey = JSON.stringify(P);
  function ready() { applyTheme(); refreshText(true); applyManifest(); applyStaticBrand(); autoPull(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready); else ready();
  window.addEventListener("storage", function (e) { // تعديل من تبويب تاني
    if (e.key === KEY) { local = loadLocal(); recompute(); render(); }
  });
})();
