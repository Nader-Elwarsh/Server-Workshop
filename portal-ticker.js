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
      dismissible: t.dismissible !== false, // الافتراضي: العميل يقدر يقفله
      controls: t.controls !== false, // إظهار أزرار التوقيف/الأسهم افتراضيًا
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
  function signature(c, items, simple) {
    return JSON.stringify([!!simple, c.mode, c.speed, c.dismissible, c.controls, c.rev, items.map(function (i) { return [i.text, i.icon, i.type, i.link]; })]);
  }

  function chipHtml(it, o) {
    var meta = TYPES[it.type] || TYPES.info, icon = it.icon || meta.icon;
    var inner = '<span class="tk-ic" aria-hidden="true">' + esc(icon) + '</span><span class="tk-tx">' + esc(it.text) + "</span>";
    if (it.link && o.clickable) {
      return '<button type="button" class="tk-i tk-t-' + it.type + ' tk-lk" data-l="' + esc(it.link) + '"' + (o.copy ? ' tabindex="-1"' : "") + ">" + inner + "</button>";
    }
    return '<span class="tk-i tk-t-' + it.type + '">' + inner + "</span>";
  }

  // simple=true (واجهة العميل): زر الإغلاق ✕ فقط، من غير إيقاف مؤقت ولا أسهم
  function ctlHtml(mode, n, dismissible, controls, simple) {
    if (!controls) return "";
    var b = simple ? "" : '<button type="button" class="tk-b" data-a="pp" aria-pressed="false" aria-label="إيقاف مؤقت للقراءة">⏸</button>';
    if (!simple && (mode === "scroll" || n > 1)) {
      b += '<button type="button" class="tk-b" data-a="next" aria-label="التالي">‹</button><button type="button" class="tk-b" data-a="prev" aria-label="السابق">›</button>';
    }
    if (dismissible) b += '<button type="button" class="tk-b tk-x" data-a="x" aria-label="إخفاء الشريط">✕</button>';
    return '<div class="tk-ctl">' + b + "</div>";
  }

  // HTML الشريط (نقي بدون DOM) — mode: scroll | rotate
  function buildHtml(c, items, o) {
    o = o || {};
    var ctl = ctlHtml(c.mode, items.length, !!o.dismissible, o.controls !== false, !!o.simple);
    if (c.mode === "rotate") {
      return '<div class="tk tk-rot" role="region" aria-label="إعلانات الورشة"><div class="tk-view" aria-live="polite">' +
        chipHtml(items[0], { clickable: o.clickable }) + "</div>" + ctl + "</div>";
    }
    var set = function (copy) {
      return '<span class="tk-set"' + (copy ? ' aria-hidden="true"' : "") + ">" + items.map(function (i) {
        return chipHtml(i, { clickable: o.clickable, copy: copy }) + '<span class="tk-sep" aria-hidden="true">✦</span>';
      }).join("") + "</span>";
    };
    return '<div class="tk" role="region" aria-label="إعلانات الورشة"><div class="tk-view"><div class="tk-track">' + set(false) + set(true) + "</div></div>" + ctl + "</div>";
  }

  var CSS = ".tk{--tk-bg:#fff;--tk-tx:#14213d;--tk-bd:#dde3ee;display:flex;align-items:center;background:var(--tk-bg);color:var(--tk-tx);border-bottom:1px solid var(--tk-bd);font:600 14px/1.4 system-ui,Tahoma,Arial,sans-serif;position:relative;-webkit-user-select:none;user-select:none}" +
    "@media(prefers-color-scheme:dark){.tk{--tk-bg:#1b1f27;--tk-tx:#e9edf2;--tk-bd:#2c3340}}[data-theme=dark] .tk{--tk-bg:#1b1f27;--tk-tx:#e9edf2;--tk-bd:#2c3340}" +
    ".tk-view{flex:1;min-width:0;overflow:hidden;direction:ltr;padding:7px 0;touch-action:pan-y;cursor:grab}.tk-track{display:inline-flex;white-space:nowrap;will-change:transform}" +
    ".tk-set{display:inline-flex;flex:0 0 auto;align-items:center;direction:rtl}" +
    ".tk-i{display:inline-flex;align-items:center;gap:6px;padding:3px 12px;border-radius:14px;font:inherit;border:0;margin:0 6px;direction:rtl}button.tk-lk{cursor:pointer;text-decoration:underline;text-underline-offset:3px}" +
    ".tk-sep{opacity:.35;font-size:11px}.tk-rot .tk-view{direction:rtl;text-align:center;padding:7px 8px}.tk-rot .tk-i{white-space:normal;text-align:right;animation:tkfade .5s}@keyframes tkfade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}" +
    ".tk-t-info{background:#dbeafe;color:#0b3d91}.tk-t-welcome{background:#dcfce7;color:#14532d}.tk-t-offer{background:#fef3c7;color:#7c2d12}.tk-t-alert{background:#fee2e2;color:#7f1d1d}" +
    "@media(prefers-color-scheme:dark){.tk-t-info{background:#1e3a8a;color:#dbeafe}.tk-t-welcome{background:#14532d;color:#dcfce7}.tk-t-offer{background:#78350f;color:#fef3c7}.tk-t-alert{background:#7f1d1d;color:#fee2e2}}" +
    "[data-theme=dark] .tk-t-info{background:#1e3a8a;color:#dbeafe}[data-theme=dark] .tk-t-welcome{background:#14532d;color:#dcfce7}[data-theme=dark] .tk-t-offer{background:#78350f;color:#fef3c7}[data-theme=dark] .tk-t-alert{background:#7f1d1d;color:#fee2e2}" +
    ".tk-ctl{display:flex;flex:0 0 auto;align-items:center;direction:ltr}.tk-b{background:transparent;color:inherit;border:0;min-width:34px;height:36px;font-size:16px;line-height:1;padding:0 4px;cursor:pointer;opacity:.75;font-family:inherit}.tk-b:hover,.tk-b:focus-visible{opacity:1}" +
    ".tk-paused .tk-view{cursor:default}";

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
    if (el._tk && el._tk.raf) { try { root.cancelAnimationFrame(el._tk.raf); } catch (e) {} }
    el._tk = null;
    el.onclick = null;
  }

  var STEP = 160, GRACE = 3000, SWIPE = 40, MOVE = 6;

  function setPaused(el, v) {
    var st = el._tk; if (!st) return;
    st.manual = v;
    el.classList.toggle("tk-paused", v);
    var pp = el.querySelector('[data-a="pp"]');
    if (pp) { pp.textContent = v ? "▶" : "⏸"; pp.setAttribute("aria-pressed", v ? "true" : "false"); pp.setAttribute("aria-label", v ? "متابعة الحركة" : "إيقاف مؤقت للقراءة"); }
  }

  function layoutScroll(el) {
    var st = el._tk, track = el.querySelector(".tk-track"), view = el.querySelector(".tk-view");
    if (!st || !track || !view || !track.firstChild) return;
    var set = track.firstChild, w = set.getBoundingClientRect().width, vw = view.clientWidth;
    if (!w || !vw) return;
    var copies = Math.ceil(vw / w) + 1;
    while (track.children.length < copies) {
      var n = set.cloneNode(true); n.setAttribute("aria-hidden", "true");
      Array.prototype.forEach.call(n.querySelectorAll("button"), function (b) { b.setAttribute("tabindex", "-1"); });
      track.appendChild(n);
    }
    st.w = w;
  }

  function startScroll(el, c, simple) {
    var view = el.querySelector(".tk-view"), track = el.querySelector(".tk-track");
    var st = el._tk = { x: 0, w: 0, manual: false, hover: false, drag: null, until: 0, last: 0, raf: 0, suppress: false, speed: SPEEDS[c.speed] || SPEEDS.normal, mode: "scroll", simple: !!simple };
    function wrap() { if (st.w) { st.x = st.x % st.w; if (st.x > 0) st.x -= st.w; } }
    function apply() { track.style.transform = "translate3d(" + st.x.toFixed(1) + "px,0,0)"; }
    function frame(ts) {
      if (!el.isConnected || el._tk !== st) return;
      var dt = Math.min(0.1, Math.max(0, (ts - st.last) / 1000)); st.last = ts;
      if (!st.manual && !st.hover && !st.drag && ts >= st.until && st.w) { st.x += st.speed * dt; wrap(); }
      apply();
      st.raf = root.requestAnimationFrame(frame);
    }
    function nudge(dir) { st.x += dir * STEP; wrap(); apply(); st.until = (root.performance ? root.performance.now() : 0) + GRACE; }
    st.nudge = nudge;
    view.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse" && e.button !== 0) return; st.drag = { id: e.pointerId, sx: e.clientX, x0: st.x, moved: false }; });
    view.addEventListener("pointermove", function (e) {
      var d = st.drag; if (!d || d.id !== e.pointerId) return;
      var dx = e.clientX - d.sx;
      if (!d.moved && Math.abs(dx) > MOVE) { d.moved = true; try { view.setPointerCapture(d.id); } catch (err) {} }
      if (d.moved) { st.x = d.x0 + dx; wrap(); apply(); }
    });
    function end(e) {
      var d = st.drag; if (!d || d.id !== e.pointerId) return; st.drag = null;
      if (d.moved) { st.suppress = true; setTimeout(function () { st.suppress = false; }, 60); st.until = (root.performance ? root.performance.now() : 0) + GRACE; }
      else if (!st.simple && e.type === "pointerup" && !(e.target.closest && e.target.closest("button"))) setPaused(el, !st.manual); // ضغطة على الشريط = إيقاف/متابعة
    }
    view.addEventListener("pointerup", end); view.addEventListener("pointercancel", end);
    el.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") st.hover = true; });
    el.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") st.hover = false; });
    layoutScroll(el);
    el._tkRz = function () { clearTimeout(el._tkRzT); el._tkRzT = setTimeout(function () { layoutScroll(el); }, 200); };
    root.addEventListener("resize", el._tkRz);
    try { if (root.document && root.document.fonts && root.document.fonts.ready) root.document.fonts.ready.then(function () { if (el._tk === st) layoutScroll(el); }); } catch (e) {}
    st.raf = root.requestAnimationFrame(frame);
  }

  function startRotate(el, items, clickable, slow, simple) {
    var view = el.querySelector(".tk-view");
    var st = el._tk = { idx: 0, manual: false, hover: false, drag: null, raf: 0, mode: "rotate", simple: !!simple };
    function show(i) { st.idx = (i + items.length) % items.length; view.innerHTML = chipHtml(items[st.idx], { clickable: clickable }); }
    st.nudge = function (dir) { if (items.length > 1) show(st.idx + (dir > 0 ? 1 : -1)); };
    view.addEventListener("pointerdown", function (e) { st.drag = { id: e.pointerId, sx: e.clientX }; });
    function end(e) {
      var d = st.drag; if (!d || d.id !== e.pointerId) return; st.drag = null;
      var dx = e.clientX - d.sx;
      if (e.type === "pointerup" && Math.abs(dx) > SWIPE) { st.suppress = true; setTimeout(function () { st.suppress = false; }, 60); st.nudge(dx < 0 ? 1 : -1); }
      else if (!st.simple && e.type === "pointerup" && Math.abs(dx) <= MOVE && !(e.target.closest && e.target.closest("button"))) setPaused(el, !st.manual);
    }
    view.addEventListener("pointerup", end); view.addEventListener("pointercancel", end);
    el.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") st.hover = true; });
    el.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") st.hover = false; });
    if (items.length > 1) el._tkTimer = setInterval(function () { if (!st.manual && !st.hover && !st.drag) show(st.idx + 1); }, slow ? 8000 : 5000);
  }

  /* mount(el, tickerConfig, ctx)
     ctx: { member:boolean, onLink:function(link), preview:boolean, force:boolean, forceShow:boolean } */
  function mount(el, t, ctx) {
    if (!el) return;
    ctx = ctx || {};
    var c = sanitize(t) || { enabled: false, mode: "scroll", speed: "normal", dismissible: true, controls: true, rev: 0, items: [] };
    var items = ctx.forceShow ? c.items.filter(function (i) { return i.enabled !== false && i.text; }) : (c.enabled ? c.items.filter(function (i) { return isLive(i, ctx); }) : []);
    var reduce = false;
    try { reduce = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}
    var eff = { mode: (reduce && c.mode === "scroll") ? "rotate" : c.mode, speed: c.speed, dismissible: c.dismissible, controls: c.controls, rev: c.rev };
    var simple = ctx.simple !== false; // الافتراضي: واجهة العميل بدون إيقاف/أسهم (ctx.simple=false بس لو احتجنا التحكم الكامل)
    var sig = signature(eff, items, simple) + (ctx.preview ? "|p" : "");
    if (el._tkSig === sig && !ctx.force) return;
    teardown(el);
    el._tkSig = sig;
    var dismissible = c.dismissible && !ctx.preview;
    if (!items.length || (dismissible && store("wf_tk_hide") === sig)) { el.innerHTML = ""; el.style.display = "none"; return; }
    injectCss();
    el.style.display = ""; el.classList.remove("tk-paused");
    var clickable = typeof ctx.onLink === "function";
    el.innerHTML = buildHtml(eff, items, { clickable: clickable, dismissible: dismissible, simple: simple });
    if (eff.mode === "rotate") startRotate(el, items, clickable, reduce, simple); else startScroll(el, eff, simple);
    el.onclick = function (e) {
      var tg = e.target && e.target.closest ? e.target : null; if (!tg || !el._tk) return;
      var st = el._tk, a = tg.closest("[data-a]");
      if (a) {
        var act = a.getAttribute("data-a");
        if (act === "x") { store("wf_tk_hide", sig); teardown(el); el.innerHTML = ""; el.style.display = "none"; }
        else if (act === "pp") setPaused(el, !st.manual);
        else if (act === "next") st.nudge(-1);
        else if (act === "prev") st.nudge(1);
        return;
      }
      if (st.suppress) return;
      var b = tg.closest("[data-l]");
      if (b && clickable) { try { ctx.onLink(b.getAttribute("data-l")); } catch (err) {} }
    };
  }

  var API = { TYPES: TYPES, AUDIENCES: AUDIENCES, SPEEDS: SPEEDS, TABS: TABS, MAX_ITEMS: MAX_ITEMS, MAX_TEXT: MAX_TEXT,
    sanitize: sanitize, cleanLink: cleanLink, dayKey: dayKey, isLive: isLive, visible: visible, signature: signature, buildHtml: buildHtml, mount: mount };
  root.PortalTicker = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
