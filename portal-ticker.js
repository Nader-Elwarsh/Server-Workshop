/* =========================================================
   portal-ticker.js — شريط الإعلانات (زي شريط الأخبار) لبوابة العملاء
   =========================================================
   ملف مشترك بين:
   - portal.html        : عرض الشريط للعميل (زائر أو مسجّل).
   - portal-admin.html  : المعاينة الحية أثناء التعديل.

   مكان تخزين الإعدادات: settings().portalTicker على جهاز الورشة، وبتتنشر
   تلقائيًا جوه مستند portal/config (نفس آلية publishPortalConfig في
   firebase-sync.js) فمفيش كولكشن جديد ولا قواعد جديدة محتاجة.

   الجزء المنطقي (sanitize / isLive / visible / buildHtml) من غير DOM
   وبيتختبر في Node (portal-ticker-tests.js). الجزء الخاص بالعرض (mount)
   بيتعامل مع DOM بس، ولو حصل فيه أي خطأ البوابة نفسها بتكمّل شغل عادي.
   ========================================================= */
(function (root) {
  "use strict";

  var TYPES = {
    info: { label: "معلومة", icon: "ℹ️" },
    welcome: { label: "ترحيب", icon: "👋" },
    offer: { label: "عرض", icon: "🎁" },
    alert: { label: "تنبيه", icon: "⚠️" }
  };
  var AUDIENCES = { all: "الكل (زوار ومسجّلين)", guest: "الزوار قبل الدخول فقط", member: "العملاء بعد الدخول فقط" };
  var SPEEDS = { slow: 35, normal: 60, fast: 95 }; // بكسل في الثانية
  var TABS = ["home", "shop", "mine", "devices", "ask", "learn", "me"];
  var MAX_ITEMS = 20, MAX_TEXT = 220, MAX_LINK = 300;

  function str(v, n) { return String(v == null ? "" : v).replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, n); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function cleanDate(v) { v = String(v || "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ""; }
  function firstChars(s, n) { return Array.from(String(s || "")).slice(0, n).join(""); }

  // الروابط المسموحة فقط: signup (تسجيل الزوار) / tab:<صفحة> / https:// / tel:
  function cleanLink(v) {
    v = String(v || "").trim();
    if (!v) return "";
    if (v === "signup") return v;
    if (v.indexOf("tab:") === 0) return TABS.indexOf(v.slice(4)) > -1 ? v : "";
    if (v.length > MAX_LINK) return "";
    if (/^https:\/\/[^\s<>"']+$/i.test(v)) return v;
    if (/^tel:\+?\d{5,15}$/.test(v)) return v;
    return "";
  }

  function sanitize(t) {
    if (!t || typeof t !== "object") return null;
    var items = (Array.isArray(t.items) ? t.items : []).slice(0, MAX_ITEMS).map(function (x, i) {
      x = x && typeof x === "object" ? x : {};
      var type = TYPES[x.type] ? x.type : "info";
      return {
        id: str(x.id, 40) || ("i" + i),
        text: str(x.text, MAX_TEXT),
        icon: firstChars(str(x.icon, 12), 2),
        type: type,
        enabled: x.enabled !== false,
        audience: AUDIENCES[x.audience] ? x.audience : "all",
        start: cleanDate(x.start),
        end: cleanDate(x.end),
        link: cleanLink(x.link)
      };
    }).filter(function (x) { return x.text; });
    return {
      enabled: t.enabled === true, // الافتراضي: مخفي لحد ما تشغّله بنفسك
      mode: t.mode === "rotate" ? "rotate" : "scroll",
      speed: SPEEDS[t.speed] ? t.speed : "normal",
      dismissible: t.dismissible === true,
      rev: Number(t.rev) || 0,
      items: items
    };
  }

  function dayKey(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }

  // هل الرسالة تظهر دلوقتي لهذا الجمهور؟ (تاريخ البداية والنهاية شاملين)
  function isLive(item, ctx) {
    ctx = ctx || {};
    if (!item || item.enabled === false || !item.text) return false;
    var member = !!ctx.member;
    if (item.audience === "guest" && member) return false;
    if (item.audience === "member" && !member) return false;
    var today = ctx.today || dayKey(ctx.now);
    if (item.start && today < item.start) return false;
    if (item.end && today > item.end) return false;
    return true;
  }

  function visible(t, ctx) {
    var c = sanitize(t);
    if (!c || !c.enabled) return [];
    return c.items.filter(function (i) { return isLive(i, ctx); });
  }

  // بصمة المحتوى: لو ماتغيّرتش مانعيدش رسم الشريط (عشان الحركة ماتتقطعش)
  function signature(c, items) {
    return JSON.stringify([c.mode, c.speed, c.dismissible, c.rev, items.map(function (i) { return [i.text, i.icon, i.type, i.link]; })]);
  }

  function chipHtml(it, o) {
    var meta = TYPES[it.type] || TYPES.info, icon = it.icon || meta.icon;
    var inner = '<span class="tk-ic" aria-hidden="true">' + esc(icon) + '</span><span class="tk-tx">' + esc(it.text) + "</span>";
    if (it.link && o.clickable) {
      return '<button type="button" class="tk-i tk-t-' + it.type + ' tk-lk" data-l="' + esc(it.link) + '"' + (o.copy ? ' tabindex="-1"' : "") + ">" + inner + "</button>";
    }
    return '<span class="tk-i tk-t-' + it.type + '">' + inner + "</span>";
  }

  // HTML الشريط (نقي بدون DOM) — mode: scroll | rotate
  function buildHtml(c, items, o) {
    o = o || {};
    var x = o.dismissible ? '<button type="button" class="tk-x" aria-label="إخفاء الشريط">✕</button>' : "";
    if (c.mode === "rotate") {
      return '<div class="tk tk-rot" role="region" aria-label="إعلانات الورشة"><div class="tk-view" aria-live="polite">' +
        chipHtml(items[0], { clickable: o.clickable }) + "</div>" + x + "</div>";
    }
    var set = function (copy) {
      return '<span class="tk-set"' + (copy ? ' aria-hidden="true"' : "") + ">" + items.map(function (i) {
        return chipHtml(i, { clickable: o.clickable, copy: copy }) + '<span class="tk-sep" aria-hidden="true">✦</span>';
      }).join("") + "</span>";
    };
    return '<div class="tk" role="region" aria-label="إعلانات الورشة"><div class="tk-view"><div class="tk-track">' + set(false) + set(true) + "</div></div>" + x + "</div>";
  }

  var CSS = ".tk{--tk-bg:#fff;--tk-tx:#14213d;--tk-bd:#dde3ee;display:flex;align-items:center;gap:6px;background:var(--tk-bg);color:var(--tk-tx);border-bottom:1px solid var(--tk-bd);font:600 14px/1.4 system-ui,Tahoma,Arial,sans-serif;position:relative}" +
    "@media(prefers-color-scheme:dark){.tk{--tk-bg:#1b1f27;--tk-tx:#e9edf2;--tk-bd:#2c3340}}[data-theme=dark] .tk{--tk-bg:#1b1f27;--tk-tx:#e9edf2;--tk-bd:#2c3340}" +
    ".tk-view{flex:1;min-width:0;overflow:hidden;direction:ltr;padding:7px 0}.tk-track{display:inline-flex;white-space:nowrap;will-change:transform;animation:tkmove linear infinite}" +
    ".tk-view:hover .tk-track,.tk-view:focus-within .tk-track,.tk-view:active .tk-track{animation-play-state:paused}" +
    ".tk-set{display:inline-flex;flex:0 0 auto;align-items:center;direction:rtl}@keyframes tkmove{from{transform:translateX(calc(var(--tk-w,50%) * -1))}to{transform:translateX(0)}}" +
    ".tk-i{display:inline-flex;align-items:center;gap:6px;padding:3px 12px;border-radius:14px;font:inherit;border:0;margin:0 6px;direction:rtl}button.tk-lk{cursor:pointer;text-decoration:underline;text-underline-offset:3px}" +
    ".tk-sep{opacity:.35;font-size:11px}.tk-rot .tk-view{direction:rtl;text-align:center;padding:7px 8px}.tk-rot .tk-i{white-space:normal;text-align:right;animation:tkfade .5s}@keyframes tkfade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}" +
    ".tk-t-info{background:#dbeafe;color:#0b3d91}.tk-t-welcome{background:#dcfce7;color:#14532d}.tk-t-offer{background:#fef3c7;color:#7c2d12}.tk-t-alert{background:#fee2e2;color:#7f1d1d}" +
    "@media(prefers-color-scheme:dark){.tk-t-info{background:#1e3a8a;color:#dbeafe}.tk-t-welcome{background:#14532d;color:#dcfce7}.tk-t-offer{background:#78350f;color:#fef3c7}.tk-t-alert{background:#7f1d1d;color:#fee2e2}}" +
    "[data-theme=dark] .tk-t-info{background:#1e3a8a;color:#dbeafe}[data-theme=dark] .tk-t-welcome{background:#14532d;color:#dcfce7}[data-theme=dark] .tk-t-offer{background:#78350f;color:#fef3c7}[data-theme=dark] .tk-t-alert{background:#7f1d1d;color:#fee2e2}" +
    ".tk-x{flex:0 0 auto;background:transparent;color:inherit;border:0;font-size:16px;line-height:1;padding:8px 12px;cursor:pointer;opacity:.7}" +
    "@media(prefers-reduced-motion:reduce){.tk-track{animation:none}.tk-rot .tk-i{animation:none}}";

  function injectCss() {
    var d = root.document;
    if (!d || d.getElementById("tk-css")) return;
    var s = d.createElement("style");
    s.id = "tk-css"; s.textContent = CSS;
    (d.head || d.documentElement).appendChild(s);
  }

  function store(k, v) {
    try { if (v === undefined) return root.sessionStorage.getItem(k); root.sessionStorage.setItem(k, v); } catch (e) { return null; }
  }

  function teardown(el) {
    if (el._tkTimer) { clearInterval(el._tkTimer); el._tkTimer = null; }
    if (el._tkRz) { root.removeEventListener("resize", el._tkRz); el._tkRz = null; }
    el.onclick = null; el.onmouseenter = null; el.onmouseleave = null;
  }

  function layoutScroll(el, c) {
    var track = el.querySelector(".tk-track"), view = el.querySelector(".tk-view");
    if (!track || !view || !track.firstChild) return;
    var set = track.firstChild, w = set.getBoundingClientRect().width, vw = view.clientWidth;
    if (!w || !vw) return;
    var copies = Math.ceil(vw / w) + 1;
    while (track.children.length < copies) {
      var n = set.cloneNode(true); n.setAttribute("aria-hidden", "true");
      Array.prototype.forEach.call(n.querySelectorAll("button"), function (b) { b.setAttribute("tabindex", "-1"); });
      track.appendChild(n);
    }
    track.style.setProperty("--tk-w", w + "px");
    track.style.animationDuration = Math.max(6, w / SPEEDS[c.speed]).toFixed(2) + "s";
  }

  /* mount(el, tickerConfig, ctx)
     ctx: { member:boolean, onLink:function(link), preview:boolean, force:boolean } */
  function mount(el, t, ctx) {
    if (!el) return;
    ctx = ctx || {};
    var c = sanitize(t) || { enabled: false, mode: "scroll", speed: "normal", dismissible: false, rev: 0, items: [] };
    var items = ctx.forceShow ? c.items.filter(function (i) { return i.enabled !== false && i.text; }) : (c.enabled ? c.items.filter(function (i) { return isLive(i, ctx); }) : []);
    var reduce = false;
    try { reduce = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}
    var eff = { mode: (reduce && c.mode === "scroll") ? "rotate" : c.mode, speed: c.speed, dismissible: c.dismissible, rev: c.rev };
    var sig = signature(eff, items) + (ctx.preview ? "|p" : "");
    if (el._tkSig === sig && !ctx.force) return;
    teardown(el);
    el._tkSig = sig;
    var dismissible = c.dismissible && !ctx.preview;
    if (!items.length || (dismissible && store("wf_tk_hide") === sig)) { el.innerHTML = ""; el.style.display = "none"; return; }
    injectCss();
    el.style.display = "";
    var clickable = typeof ctx.onLink === "function";
    el.innerHTML = buildHtml(eff, items, { clickable: clickable, dismissible: dismissible });
    el.onclick = function (e) {
      var tg = e.target && e.target.closest ? e.target : null; if (!tg) return;
      var x = tg.closest(".tk-x");
      if (x) { store("wf_tk_hide", sig); teardown(el); el.innerHTML = ""; el.style.display = "none"; return; }
      var b = tg.closest("[data-l]");
      if (b && clickable) { try { ctx.onLink(b.getAttribute("data-l")); } catch (err) {} }
    };
    if (eff.mode === "rotate") {
      if (items.length > 1) {
        var idx = 0, paused = false, view = el.querySelector(".tk-view");
        el.onmouseenter = function () { paused = true; }; el.onmouseleave = function () { paused = false; };
        el._tkTimer = setInterval(function () {
          if (paused) return;
          idx = (idx + 1) % items.length;
          view.innerHTML = chipHtml(items[idx], { clickable: clickable });
        }, reduce ? 8000 : 5000);
      }
    } else {
      layoutScroll(el, eff);
      el._tkRz = function () { clearTimeout(el._tkRzT); el._tkRzT = setTimeout(function () { layoutScroll(el, eff); }, 200); };
      root.addEventListener("resize", el._tkRz);
      try { if (root.document && root.document.fonts && root.document.fonts.ready) root.document.fonts.ready.then(function () { if (el._tkSig === sig) layoutScroll(el, eff); }); } catch (e) {}
    }
  }

  var API = { TYPES: TYPES, AUDIENCES: AUDIENCES, SPEEDS: SPEEDS, TABS: TABS, MAX_ITEMS: MAX_ITEMS, MAX_TEXT: MAX_TEXT,
    sanitize: sanitize, cleanLink: cleanLink, dayKey: dayKey, isLive: isLive, visible: visible, signature: signature, buildHtml: buildHtml, mount: mount };
  root.PortalTicker = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
