/* WFBACK — زر الرجوع في الموبايل يقفل اللي مفتوح فوق الصفحة الأول (نافذة، قايمة، نموذج، قسم إعدادات...)
   بدل ما يخرج من الصفحة كلها. أي نافذة بتغطي الشاشة (position:fixed) أو نموذج بيتفتح بإزالة class="hidden"
   بيتسجل لوحده كخطوة في سجل الرجوع؛ والقفل من زرار الواجهة بيشيل الخطوة دي من غير ما الصفحة تتحرك. */
(function (w) {
  "use strict";
  if (!w.document || w.WFBack) return;
  var d = w.document, H = w.history, stack = [], seq = 0, ignore = 0, ready = false;
  function idx(id) { for (var i = 0; i < stack.length; i++) if (stack[i].id === id) return i; return -1; }
  function open(close, el) {
    var e = { id: ++seq, close: close, el: el || null };
    stack.push(e);
    try { var s = H.state && typeof H.state === "object" ? Object.assign({}, H.state) : {}; s.wfBk = e.id; H.pushState(s, "", location.href); } catch (x) {}
    return e.id;
  }
  /* اتقفلت من الواجهة: نشيل خطوتها (وأي خطوة اتفتحت بعدها) من السجل */
  function close(id) {
    var i = idx(id); if (i < 0) return;
    var n = stack.length - i; stack.splice(i, n);
    ignore++;
    try { if (n === 1) H.back(); else H.go(-n); } catch (x) { ignore--; }
  }
  /* بنسيب الصفحة (فتح رابط): نشيلها من غير ما نرجع في السجل */
  function drop(id) { var i = idx(id); if (i > -1) stack.splice(i, 1); }
  w.addEventListener("popstate", function (ev) {
    if (ignore > 0) { ignore--; ev.stopImmediatePropagation(); return; }
    if (!stack.length) return;
    var e = stack.pop(); ev.stopImmediatePropagation();
    try { e.close(); } catch (x) {}
  }, true);

  /* ---------- الاكتشاف التلقائي ---------- */
  var tracked = new Map(); // element → id
  var FORM_SEL = "section.quick-add, .form, #invoicesBox, #restockBox, #bulkPriceBox, #partForm, #quickAddPartBox, [data-wf-back]";
  function isOverlay(el) {
    if (!el || el.nodeType !== 1 || /^(SCRIPT|STYLE|LINK|NAV)$/.test(el.tagName) || el.id === "wfEnvBanner" || el.classList.contains("wf-nc-toasts") || el.classList.contains("wf-sh")) return false;
    var cs = w.getComputedStyle(el); if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden") return false;
    var r = el.getBoundingClientRect();
    return r.width >= (w.innerWidth || 0) * 0.85 && r.height >= (w.innerHeight || 0) * 0.6;
  }
  function isOpenForm(el) { return el && el.matches && el.matches(FORM_SEL) && !el.classList.contains("hidden") && el.getClientRects().length > 0; }
  function closeBtn(el) {
    var bs = el.querySelectorAll("button, [role=button]");
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i], t = (b.textContent || "").replace(/\s+/g, " ").trim(), al = b.getAttribute("aria-label") || "";
      if (/^(✕|×|✖|❌)?\s*(إلغاء|إغلاق|قفل|رجوع|✕|×|✖)$/.test(t) || /إغلاق|قفل/.test(al) || b.getAttribute("data-a") === "x") return b;
    }
    return null;
  }
  function autoClose(el, isForm) {
    return function () {
      tracked.delete(el);
      if (typeof el.__wfBackClose === "function") { el.__wfBackClose(); return; }
      var b = closeBtn(el); if (b) { b.click(); return; }
      if (isForm || el.id === "gsOverlay") el.classList.add("hidden"); else el.remove();
    };
  }
  function check(el, isForm) {
    var open = isForm ? isOpenForm(el) : (el.isConnected && isOverlay(el));
    var id = tracked.get(el);
    if (open && !id) tracked.set(el, open && open !== false ? WFBack.open(autoClose(el, isForm), el) : 0);
    else if (!open && id) { tracked.delete(el); close(id); }
  }
  function scan() {
    if (!ready) return;
    for (var i = 0; i < d.body.children.length; i++) { var c = d.body.children[i]; if (tracked.has(c) || isOverlay(c)) check(c, false); }
    tracked.forEach(function (id, el) { if (!el.isConnected) { tracked.delete(el); close(id); } });
  }
  var pend = false;
  function soon() { if (pend) return; pend = true; setTimeout(function () { pend = false; scan(); }, 30); }
  function start() {
    ready = true;
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        if (m.type === "childList" && m.target === d.body) { soon(); return; }
        if (m.type === "attributes") {
          var t = m.target;
          if (t.parentNode === d.body) soon();
          if (t.matches && t.matches(FORM_SEL)) setTimeout(function () { check(t, true); }, 0);
        }
      });
    }).observe(d.body, { childList: true, attributes: true, attributeFilter: ["class", "style", "hidden"], subtree: true });
  }
  /* العنصر ده هيتقفل عشان هنفتح صفحة تانية: نشيل خطوته (وخطوات اللي جواه) من غير رجوع */
  function forget(el) { var id = tracked.get(el); if (!id) return; tracked.delete(el); var i = idx(id); if (i > -1) stack.splice(i); }
  /* مستمعين popstate اتسجّلوا قبل الملف ده (زي سكريبت البوابة اللي جوه الصفحة) بيشتغلوا قبلنا مهما كان capture،
     فبيسألوا owns() الأول: لو الرجوع ده بتاعنا (قفل نافذة) يسيبوه وما يغيّروش الصفحة. */
  function owns() { return ignore > 0 || stack.length > 0; }
  w.WFBack = { open: open, close: close, drop: drop, forget: forget, owns: owns, size: function () { return stack.length; } };
  // بعد ما الصفحة تخلص تحميل (النماذج اللي بتتفتح مع التحميل زي «تعديل» مش خطوة رجوع)
  w.addEventListener("load", function () { setTimeout(start, 600); });
})(window);

/* notif-center.js — مركز الإشعارات (🔔) في كل صفحات النظام: الإدارة، بوابة الفني، وبوابة العملاء.
   - الإشعارات بتتولّد على السيرفر (functions/notify.js) وبتتحط في صندوق المستخدم inbox/{uid}/items.
   - هنا: جرس عليه عدد غير المقروء، قايمة الإشعارات، تنبيه فوري لما يوصل جديد والتطبيق مفتوح،
     إعدادات (تكتم أنواع معيّنة)، وتفعيل إشعارات الموبايل/الكمبيوتر حتى والتطبيق مقفول (Web Push). */
(function (w) {
  "use strict";
  if (!w.document || w.__wfNotifCenter) return;
  w.__wfNotifCenter = true;
  var d = w.document;

  /* نفس قايمة functions/notify.js (اختبار notify-tests بيتأكد إنهم متطابقين) */
  var KINDS = {
    assigned: ["tech", "🛠️", "اتعين ليك أمر جديد"], unassigned: ["tech", "↩️", "أمر اتنقل من عندك"], visit_changed: ["tech", "📅", "ميعاد أمر بتاعك اتغيّر"],
    order_cancelled: ["tech", "❌", "أمر بتاعك اتلغى"], expense_decided: ["tech", "🧾", "مصروفك اتوافق عليه / اترفض"], custody: ["tech", "💵", "عهدتك: إيداع أو تسوية"], pay_paid: ["tech", "💰", "اتصرفلك أجرة"],
    tech_closed: ["admin", "✅", "فني قفل أمر", "requests.assign"], tech_status: ["admin", "🔧", "فني غيّر حالة أمر", "requests.assign"], tech_deposit: ["admin", "💵", "فني استلم عربون / دفعة", "requests.assign"],
    tech_part: ["admin", "🔩", "فني صرف / رجّع قطعة من المخزن", "inventory.view"], pay_due: ["admin", "💰", "مستحقات فني على أمر", "techpay.manage"], expense_new: ["admin", "🧾", "فني طلب اعتماد مصروف", "custody.approve"],
    low_stock: ["admin", "📉", "صنف وصل للحد الأدنى", "inventory.add"], portal_request: ["admin", "📥", "طلب صيانة جديد من البوابة", "portal.manage"], guest_request: ["admin", "📥", "طلب من زائر", "portal.manage"],
    complaint_new: ["admin", "⚠️", "شكوى جديدة", "portal.manage"], question_new: ["admin", "❓", "سؤال جديد من عميل", "portal.manage"],
    c_status: ["customer", "🔧", "حالة طلبك اتغيّرت"], c_visit: ["customer", "📅", "ميعاد الزيارة"], c_tech: ["customer", "👷", "الفني اللي هيتابع طلبك"],
    c_reply: ["customer", "💬", "رد على شكوتك"], c_answer: ["customer", "💬", "رد على سؤالك"], c_post: ["customer", "📰", "مقالات وعروض جديدة"],
    visit_reminder: ["tech", "⏰", "تذكير قبل ميعاد الزيارة"], visit_missed: ["tech", "⏳", "أمر بتاعك عدّى ميعاده ولسه مفتوح"], admin_msg: ["staff", "✉️", "رسالة من الإدارة"],
    overdue_order: ["admin", "⏳", "أمر عدّى ميعاده ولسه ماتقفلش", "requests.assign"], morning_digest: ["admin", "☀️", "ملخص الصبح", "requests.view"], custody_high: ["admin", "💼", "عهدة فني عدّت الحد", "custody.settle"], usage_high: ["admin", "☁️", "الاستهلاك قرّب من الحد المجاني", "__owner__"],
    c_feedback: ["customer", "🙏", "رأيك بعد التصليح"], c_warranty: ["customer", "🛡️", "الضمان قرب يخلص"]
  };
  var AUD_LBL = { tech: "👷 للفنيين", admin: "🏢 للإدارة", customer: "👤 للعملاء (البوابة)", staff: "✉️ رسائل الإدارة" };
  var CFG_DEF = { off: [], remindMin: 60, overdueHours: 3, digestHour: 8, custodyMax: 5000, feedbackDays: 2, warrantyDays: 3 };
  w.WF_NOTIF_KINDS = KINDS;
  var IS_PORTAL = /portal\.html$/.test(location.pathname) || !!d.querySelector(".wf-head-in");
  var st = { uid: "", items: [], bcast: [], unsubs: [], baseline: null, bell: null, panel: null, view: "list", prefs: [], prefsLoaded: false, toastBox: null, gcfg: Object.assign({}, CFG_DEF), staffDir: null };
  function isOwner() { return !IS_PORTAL && !!(w.WFPerm && typeof w.WFPerm.isOwner === "function" && w.WFPerm.isOwner()); }
  function canMsg() { return !IS_PORTAL && !!(w.WFPerm && (isOwner() || (typeof w.WFPerm.can === "function" && w.WFPerm.can("requests.assign") && (typeof w.WFPerm.scope !== "function" || w.WFPerm.scope() !== "assigned")))); }

  /* ---------- أدوات ---------- */
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function store() { return w.WFStorage || null; }
  function sget(k) { try { var s = store(); return s ? s.getItem(k) : (st.mem || {})[k] || null; } catch (e) { return null; } }
  function sset(k, v) { try { var s = store(); if (s) s.setItem(k, v); else (st.mem = st.mem || {})[k] = v; } catch (e) {} }
  function fb() { try { return w.firebase && w.firebase.apps && w.firebase.apps.length ? w.firebase : null; } catch (e) { return null; } }
  function db() { return fb().firestore(); }
  function ago(ms) {
    var s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return "دلوقتي";
    if (s < 3600) { var m = Math.round(s / 60); return "من " + (m === 1 ? "دقيقة" : m === 2 ? "دقيقتين" : m + " دقايق"); }
    if (s < 86400) { var h = Math.round(s / 3600); return "من " + (h === 1 ? "ساعة" : h === 2 ? "ساعتين" : h + " ساعات"); }
    var dt = new Date(ms); try { return dt.toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" }) + " " + dt.toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" }); } catch (e) { return dt.getDate() + "/" + (dt.getMonth() + 1); }
  }
  function dayGroup(ms) {
    var t = new Date(); t.setHours(0, 0, 0, 0);
    if (ms >= t.getTime()) return "النهارده";
    if (ms >= t.getTime() - 86400000) return "امبارح";
    return "أقدم";
  }
  function callFn(name, data) {
    if (w.WFPerm && typeof w.WFPerm.call === "function" && !IS_PORTAL) return w.WFPerm.call(name, data);
    var f = fb(), u = f && f.auth().currentUser;
    if (!u) return Promise.reject(new Error("sign_in_required"));
    var url = "https://us-central1-" + encodeURIComponent(f.app().options.projectId) + ".cloudfunctions.net/" + encodeURIComponent(name);
    return u.getIdToken().then(function (tok) {
      return (w.WFAppCheck ? w.WFAppCheck.headers() : Promise.resolve({})).then(function (h) {
        var hdr = { "Content-Type": "application/json", Authorization: "Bearer " + tok };
        Object.keys(h || {}).forEach(function (k) { hdr[k] = h[k]; });
        return fetch(url, { method: "POST", headers: hdr, body: JSON.stringify({ data: data || {} }) }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) { if (r.ok && j && j.result !== undefined) return j.result; throw new Error((j && j.error && j.error.message) || ("HTTP " + r.status)); });
        });
      });
    });
  }

  /* ---------- الشكل ---------- */
  function css() {
    if (d.getElementById("wfNcCss")) return;
    var s = d.createElement("style"); s.id = "wfNcCss";
    s.textContent =
      ".wf-nc-bell{position:relative;border:0;border-radius:50%;width:42px;height:42px;font-size:20px;line-height:1;cursor:pointer;background:var(--bg-sunken,rgba(127,127,127,.12));color:var(--text,#111);box-shadow:0 1px 4px rgba(0,0,0,.08);display:inline-flex;align-items:center;justify-content:center;padding:0;flex:0 0 auto}" +
      ".wf-head-in .wf-nc-bell{background:rgba(255,255,255,.18);color:inherit}" +
      ".wf-nc-badge{position:absolute;top:-3px;inset-inline-end:-3px;min-width:19px;height:19px;padding:0 5px;border-radius:10px;background:#dc2626;color:#fff;font:700 11px/19px system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px var(--bg,#fff)}" +
      ".wf-nc-bell.ring{animation:wfNcRing .9s ease 2}@keyframes wfNcRing{0%,100%{transform:rotate(0)}20%{transform:rotate(16deg)}40%{transform:rotate(-14deg)}60%{transform:rotate(10deg)}80%{transform:rotate(-6deg)}}" +
      "@media (prefers-reduced-motion:reduce){.wf-nc-bell.ring{animation:none}}" +
      ".wf-nc-ov{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;justify-content:center;align-items:flex-start;padding:max(10px,env(safe-area-inset-top)) 10px 10px}" +
      ".wf-nc-card{background:var(--bg-elevated,#fff);color:var(--text,#111);width:100%;max-width:480px;max-height:calc(100vh - 20px);border-radius:18px;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.35);overflow:hidden}" +
      ".wf-nc-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--border,#e5e7eb)}.wf-nc-head b{flex:1;font-size:17px}" +
      ".wf-nc-head button{border:0;background:var(--bg-sunken,rgba(127,127,127,.12));color:inherit;border-radius:10px;padding:7px 10px;font:inherit;font-size:13px;cursor:pointer}" +
      ".wf-nc-body{overflow:auto;flex:1;padding:4px 0 10px}" +
      ".wf-nc-g{padding:10px 14px 4px;font-size:12px;font-weight:700;color:var(--text-muted,#666)}" +
      ".wf-nc-it{display:flex;gap:10px;width:100%;text-align:start;border:0;background:none;color:inherit;padding:10px 14px;cursor:pointer;font:inherit;position:relative}" +
      ".wf-nc-it:hover{background:var(--surface-2,rgba(127,127,127,.08))}" +
      ".wf-nc-it.unread{background:color-mix(in srgb,var(--wl-primary,#17324d) 8%,transparent)}" +
      ".wf-nc-it.unread::after{content:'';position:absolute;inset-inline-end:12px;top:16px;width:9px;height:9px;border-radius:50%;background:var(--wl-primary,#2563eb)}" +
      ".wf-nc-ic{flex:0 0 38px;height:38px;border-radius:12px;background:var(--bg-sunken,rgba(127,127,127,.12));display:flex;align-items:center;justify-content:center;font-size:19px}" +
      ".wf-nc-tx{flex:1;min-width:0;padding-inline-end:14px}.wf-nc-tx b{display:block;font-size:14px;line-height:1.4}.wf-nc-it.unread .wf-nc-tx b{font-weight:800}" +
      ".wf-nc-tx span{display:block;font-size:13px;color:var(--text-muted,#555);line-height:1.45;margin-top:2px}.wf-nc-tx small{display:block;font-size:11px;color:var(--text-muted,#888);margin-top:3px}" +
      ".wf-nc-empty{text-align:center;color:var(--text-muted,#666);padding:40px 16px;line-height:1.8}" +
      ".wf-nc-set{padding:12px 14px}.wf-nc-set h4{margin:14px 0 6px;font-size:14px}.wf-nc-set .hint{font-size:12px;color:var(--text-muted,#666);line-height:1.6}" +
      ".wf-nc-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--border,#f0f0f0);font-size:14px}" +
      ".wf-nc-row input{width:20px;height:20px;flex:0 0 auto}" +
      ".wf-nc-push{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.wf-nc-push button{flex:1 1 auto;min-height:42px}" +
      ".wf-nc-st{font-size:13px;padding:8px 10px;border-radius:10px;background:var(--bg-sunken,rgba(127,127,127,.1))}" +
      ".wf-nc-toasts{position:fixed;top:max(12px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:100001;display:flex;flex-direction:column;gap:8px;width:min(440px,calc(100vw - 20px));pointer-events:none}" +
      ".wf-nc-toast{pointer-events:auto;display:flex;gap:10px;align-items:flex-start;background:var(--bg-elevated,#fff);color:var(--text,#111);border-radius:14px;padding:12px 14px;box-shadow:0 10px 30px rgba(0,0,0,.25);border-inline-start:4px solid var(--wl-primary,#2563eb);cursor:pointer;animation:wfNcIn .25s ease}" +
      "@keyframes wfNcIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}" +
      ".wf-nc-toast b{display:block;font-size:14px}.wf-nc-toast span{display:block;font-size:12px;color:var(--text-muted,#555);margin-top:2px}";
    (d.head || d.documentElement).appendChild(s);
  }
  function ensureBell() {
    if (st.bell && d.body.contains(st.bell)) return st.bell;
    var anchor = IS_PORTAL ? d.getElementById("outBtn") : d.querySelector(".theme-toggle-btn");
    var host = IS_PORTAL ? d.querySelector(".wf-head-in") : anchor && anchor.parentNode;
    if (!host) return null;
    css();
    var b = d.createElement("button"); b.type = "button"; b.className = "wf-nc-bell no-print"; b.setAttribute("aria-label", "الإشعارات"); b.title = "الإشعارات";
    b.innerHTML = '🔔<span class="wf-nc-badge" hidden></span>';
    b.addEventListener("click", function () { openPanel("list"); });
    if (anchor && anchor.parentNode === host) host.insertBefore(b, anchor); else host.appendChild(b);
    if (IS_PORTAL) { var row = d.createElement("div"); row.style.cssText = "display:flex;align-items:center;gap:8px"; host.insertBefore(row, b); row.appendChild(b); if (anchor) row.appendChild(anchor); }
    st.bell = b; return b;
  }
  function allItems() {
    var seenB = sget("wf_nc_bseen_" + st.uid) || "0";
    var b = st.bcast.map(function (x) { return Object.assign({}, x, { _b: true, read: x.read || x.at <= +seenB }); });
    return st.items.concat(b).sort(function (a, c) { return c.at - a.at; });
  }
  function unreadCount() { return allItems().filter(function (x) { return !x.read; }).length; }
  function paintBadge() {
    var b = ensureBell(); if (!b) return;
    var n = unreadCount(), el = b.querySelector(".wf-nc-badge");
    el.hidden = !n; el.textContent = n > 99 ? "99+" : String(n);
    b.setAttribute("aria-label", n ? "الإشعارات — " + n + " جديد" : "الإشعارات");
    try { if (navigator.setAppBadge) { if (n) navigator.setAppBadge(n); else navigator.clearAppBadge(); } } catch (e) {}
  }

  /* ---------- القايمة ---------- */
  function openPanel(view) {
    css(); closePanel(); st.view = view || "list";
    var ov = d.createElement("div"); ov.className = "wf-nc-ov"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "الإشعارات");
    ov.innerHTML = '<div class="wf-nc-card"><div class="wf-nc-head"></div><div class="wf-nc-body"></div></div>';
    ov.addEventListener("click", function (e) { if (e.target === ov) closePanel(); });
    ov.__wfBackClose = closePanel; st.vstack = [];
    d.body.appendChild(ov); st.panel = ov;
    d.addEventListener("keydown", escKey);
    renderPanel();
  }
  function escKey(e) { if (e.key === "Escape") closePanel(); }
  function closePanel() { if (st.panel) { st.panel.remove(); st.panel = null; d.removeEventListener("keydown", escKey); } }
  function renderPanel() {
    if (!st.panel) return;
    var head = st.panel.querySelector(".wf-nc-head"), body = st.panel.querySelector(".wf-nc-body");
    if (st.view === "settings") {
      head.innerHTML = '<button type="button" data-a="back">→ رجوع</button><b>⚙️ إعدادات الإشعارات</b>';
      body.innerHTML = settingsHtml(); wireSettings(body);
    } else if (st.view === "owner") {
      head.innerHTML = '<button type="button" data-a="back">→ رجوع</button><b>🛠️ إشعارات النظام كله</b>';
      body.innerHTML = ownerHtml(); wireOwner(body);
    } else if (st.view === "msg") {
      head.innerHTML = '<button type="button" data-a="back">→ رجوع</button><b>✉️ رسالة للفنيين</b>';
      body.innerHTML = msgHtml(); wireMsg(body);
    } else {
      var items = allItems(), n = items.filter(function (x) { return !x.read; }).length;
      head.innerHTML = '<b>🔔 الإشعارات' + (n ? " (" + n + ")" : "") + '</b>' + (n ? '<button type="button" data-a="all">✔️ قريت الكل</button>' : "") + (canMsg() ? '<button type="button" data-a="msg" aria-label="ابعت رسالة">✉️</button>' : "") + '<button type="button" data-a="set" aria-label="الإعدادات">⚙️</button><button type="button" data-a="x" aria-label="قفل">✕</button>';
      var g = "", html = "";
      items.forEach(function (x, i) {
        var k = KINDS[x.kind] || ["", "🔔", ""], grp = dayGroup(x.at);
        if (grp !== g) { g = grp; html += '<div class="wf-nc-g">' + grp + "</div>"; }
        html += '<button type="button" class="wf-nc-it' + (x.read ? "" : " unread") + '" data-i="' + i + '"><span class="wf-nc-ic">' + k[1] + '</span><span class="wf-nc-tx"><b>' + esc(x.title) + "</b>" + (x.body ? "<span>" + esc(x.body) + "</span>" : "") + "<small>" + esc(ago(x.at)) + "</small></span></button>";
      });
      body.innerHTML = html || '<div class="wf-nc-empty">مفيش إشعارات لسه 👌<br><small>أي حاجة تخصك (أوامر، عهدة، طلبات…) هتوصلك هنا.</small></div>' +
        (pushState() !== "on" && pushSupported() ? '<div style="padding:0 16px 16px"><button type="button" class="primary" data-a="set" style="width:100%;min-height:44px">📲 فعّل إشعارات الموبايل</button></div>' : "");
      body.querySelectorAll("[data-i]").forEach(function (el) { el.addEventListener("click", function () { var x = items[+el.getAttribute("data-i")]; openItem(x); }); });
    }
    head.querySelectorAll("[data-a]").forEach(bindAct); body.querySelectorAll("button[data-a]").forEach(bindAct);
  }
  /* الشاشات جوه النافذة (إعدادات/تحكم المالك/رسالة): كل واحدة خطوة رجوع لوحدها */
  function viewFwd(v) {
    if (!st.panel || st.view === v) return;
    var e = { prev: st.view };
    e.id = w.WFBack ? w.WFBack.open(function () { st.vstack = (st.vstack || []).filter(function (x) { return x !== e; }); st.view = e.prev; renderPanel(); }) : 0;
    (st.vstack = st.vstack || []).push(e); st.view = v; renderPanel();
  }
  function viewBack() {
    var e = (st.vstack || []).pop();
    if (!e) { st.view = "list"; renderPanel(); return; }
    st.view = e.prev; renderPanel();
    if (w.WFBack && e.id) w.WFBack.close(e.id);
  }
  function bindAct(el) {
    el.addEventListener("click", function () {
      var a = el.getAttribute("data-a");
      if (a === "x") closePanel(); else if (a === "set") viewFwd("settings"); else if (a === "back") viewBack(); else if (a === "all") markAll(); else if (a === "owner") viewFwd("owner"); else if (a === "msg") viewFwd("msg");
    });
  }
  function markRead(x) {
    if (!x || x.read) return Promise.resolve();
    if (x._b) { var cur = +(sget("wf_nc_bseen_" + st.uid) || 0); if (x.at > cur) sset("wf_nc_bseen_" + st.uid, String(x.at)); x.read = true; paintBadge(); return Promise.resolve(); }
    x.read = true; paintBadge(); ncPersist();
    return db().collection("inbox").doc(st.uid).collection("items").doc(x.id).update({ read: true }).catch(function () {});
  }
  function markAll() {
    var list = allItems().filter(function (x) { return !x.read; });
    var maxB = 0; list.forEach(function (x) { if (x._b) maxB = Math.max(maxB, x.at); });
    if (maxB) sset("wf_nc_bseen_" + st.uid, String(maxB));
    var own = list.filter(function (x) { return !x._b; });
    own.forEach(function (x) { x.read = true; });
    st.bcast.forEach(function (x) { if (x.at <= maxB) x.read = true; });
    paintBadge(); renderPanel(); ncPersist();
    if (!own.length) return;
    try { var bt = db().batch(); own.slice(0, 450).forEach(function (x) { bt.update(db().collection("inbox").doc(st.uid).collection("items").doc(x.id), { read: true }); }); bt.commit().catch(function () {}); } catch (e) {}
  }
  function go(link) {
    if (!link) return;
    var u; try { u = new URL(link, location.href); } catch (e) { return; }
    var samePage = u.pathname === location.pathname;
    if (IS_PORTAL && samePage) { if (portalDeepLink(u)) return; }
    if (samePage && u.search === location.search && u.hash === location.hash) { location.reload(); return; }
    location.href = u.href;
  }
  function openItem(x) { if (x.link && st.panel && w.WFBack) w.WFBack.forget(st.panel); closePanel(); markRead(x).then(function () { go(x.link); }); }

  /* بوابة العملاء: ?o=رقم الأمر يفتح الأمر، #tips يفتح المقالات */
  function portalDeepLink(u) {
    var o = u.searchParams.get("o"), tips = u.hash === "#tips";
    if (!o && !tips) return false;
    var tries = 0;
    (function tryOpen() {
      if (tips && typeof w.goTips === "function" && w.me) { w.goTips(); return; }
      if (o && typeof w.openOrder === "function" && w.me && Array.isArray(w.orders) && w.orders.some(function (r) { return r && String(r.id) === o; })) { w.openOrder(o); return; }
      if (++tries < 40) setTimeout(tryOpen, 250);
    })();
    return true;
  }

  /* ---------- الإعدادات ---------- */
  function myKinds() {
    var aud = IS_PORTAL ? "customer" : (w.WFPerm && typeof w.WFPerm.scope === "function" && w.WFPerm.scope() === "assigned" ? "tech" : "admin");
    return Object.keys(KINDS).filter(function (k) {
      var x = KINDS[k];
      if (x[0] !== aud || st.gcfg.off.indexOf(k) > -1) return false;
      if (aud === "admin" && x[3] && w.WFPerm && typeof w.WFPerm.can === "function") return w.WFPerm.can(x[3]);
      return true;
    });
  }
  function settingsHtml() {
    var ps = pushState(), sup = pushSupported();
    var pushBox = !sup ? '<div class="wf-nc-st">⚠️ المتصفح ده مش بيدعم إشعارات الموبايل. على الآيفون لازم تضيف التطبيق للشاشة الرئيسية الأول (مشاركة ← «إضافة إلى الشاشة الرئيسية») وتفتحه من هناك.</div>'
      : ps === "denied" ? '<div class="wf-nc-st">🚫 الإشعارات مقفولة للموقع ده من إعدادات المتصفح. افتح إعدادات الموقع (القفل 🔒 جنب العنوان) ← الإشعارات ← سماح، وبعدين ارجع هنا.</div>'
      : ps === "on" ? '<div class="wf-nc-st">✅ إشعارات الموبايل شغالة على الجهاز ده — هيوصلك الإشعار حتى والتطبيق مقفول.</div><div class="wf-nc-push"><button type="button" class="secondary" data-p="test">🧪 جرّب إشعار</button><button type="button" class="secondary" data-p="off">🔕 إيقاف على الجهاز ده</button></div>'
      : '<div class="wf-nc-st">الإشعارات بتظهر هنا جوه التطبيق. عشان توصلك على الموبايل حتى والتطبيق مقفول فعّلها:</div><div class="wf-nc-push"><button type="button" class="primary" data-p="on">📲 فعّل إشعارات الموبايل على الجهاز ده</button></div>';
    var ks = myKinds();
    return '<div class="wf-nc-set"><h4>📲 إشعارات الموبايل / الكمبيوتر</h4>' + pushBox + '<div class="hint" data-p-msg></div>' +
      (ks.length ? '<h4>📋 عايز توصلك إشعارات عن إيه؟</h4><div class="hint">شيل العلامة من أي نوع مش عايزه (بيسري على كل أجهزتك).</div>' +
        ks.map(function (k) { return '<label class="wf-nc-row"><span>' + KINDS[k][1] + " " + esc(KINDS[k][2]) + '</span><input type="checkbox" data-k="' + k + '"' + (st.prefs.indexOf(k) > -1 ? "" : " checked") + "></label>"; }).join("") : "") +
      (isOwner() ? '<h4>🛠️ للمالك</h4><button type="button" class="primary" data-a="owner" style="width:100%;min-height:44px">🛠️ شغّل / وقّف أي نوع للنظام كله + المواعيد</button>' : "") + "</div>";
  }
  function wireSettings(body) {
    var msg = body.querySelector("[data-p-msg]");
    function say(t) { if (msg) msg.textContent = t || ""; }
    body.querySelectorAll("[data-p]").forEach(function (b) {
      b.addEventListener("click", function () {
        var a = b.getAttribute("data-p"); b.disabled = true; say("⏳ ...");
        var p = a === "on" ? enablePush() : a === "off" ? disablePush() : callFn("pushTest", {}).then(function (r) { return r && r.ok ? "✅ اتبعت — لو مظهرش خلال ثواني، اتأكد إن إشعارات المتصفح/الموبايل مش مكتومة." : "تمام."; });
        p.then(function (t) { if (st.view === "settings") renderPanel(); say(t || ""); }, function (e) { b.disabled = false; say("❌ " + (e && e.message ? e.message : "تعذّر — جرّب تاني")); });
      });
    });
    body.querySelectorAll("[data-k]").forEach(function (c) {
      c.addEventListener("change", function () {
        var k = c.getAttribute("data-k"), m = st.prefs.filter(function (x) { return x !== k; });
        if (!c.checked) m.push(k);
        st.prefs = m;
        db().collection("notifPrefs").doc(st.uid).set({ mute: m, at: Date.now() }).catch(function () { say("❌ تعذّر حفظ الإعداد — اتأكد من النت."); });
      });
    });
  }

  /* ---------- تحكم المالك: أنواع الإشعارات للنظام كله + مواعيد التذكيرات ---------- */
  var PARAMS = [
    ["remindMin", "⏰ التذكير قبل الزيارة بـ (دقيقة)", 10, 1440, "visit_reminder"], ["overdueHours", "⏳ الأمر يعتبر متأخر بعد ميعاده بـ (ساعة)", 1, 72, "overdue_order"],
    ["digestHour", "☀️ ميعاد ملخص الصبح (الساعة 0-23)", 0, 23, "morning_digest"], ["custodyMax", "💼 حد العهدة للتنبيه (جنيه)", 0, 100000000, "custody_high"],
    ["feedbackDays", "🙏 رسالة رأي العميل بعد التصليح بـ (يوم)", 1, 30, "c_feedback"], ["warrantyDays", "🛡️ تنبيه الضمان قبل ما يخلص بـ (يوم)", 1, 60, "c_warranty"]
  ];
  function ownerHtml() {
    var g = st.gcfg, html = '<div class="wf-nc-set"><div class="hint">العلامة = النوع شغّال لكل الناس. شيلها توقفه للنظام كله (محدش هيوصله). كل موظف وعميل يقدر كمان يقفل اللي مش عايزه لنفسه من ⚙️.</div>';
    ["tech", "admin", "customer", "staff"].forEach(function (aud) {
      html += "<h4>" + AUD_LBL[aud] + "</h4>";
      Object.keys(KINDS).forEach(function (k) {
        if (KINDS[k][0] !== aud) return;
        html += '<label class="wf-nc-row"><span>' + KINDS[k][1] + " " + esc(KINDS[k][2]) + '</span><input type="checkbox" data-gk="' + k + '"' + (g.off.indexOf(k) > -1 ? "" : " checked") + "></label>";
      });
    });
    html += "<h4>⏱️ المواعيد والحدود</h4>" + PARAMS.map(function (p) { return '<label class="wf-nc-row"><span>' + esc(p[1]) + '</span><input type="number" inputmode="numeric" data-gp="' + p[0] + '" min="' + p[2] + '" max="' + p[3] + '" value="' + esc(g[p[0]]) + '" style="width:96px;height:auto;padding:6px;text-align:center"></label>'; }).join("");
    return html + '<div class="wf-nc-push"><button type="button" class="primary" data-gsave="1">💾 حفظ</button></div><div class="hint" data-g-msg></div></div>';
  }
  function wireOwner(body) {
    var msg = body.querySelector("[data-g-msg]");
    body.querySelector("[data-gsave]").addEventListener("click", function () {
      var off = [], v = { at: Date.now(), by: st.uid };
      body.querySelectorAll("[data-gk]").forEach(function (c) { if (!c.checked) off.push(c.getAttribute("data-gk")); });
      v.off = off;
      var bad = "";
      PARAMS.forEach(function (p) { var el = body.querySelector('[data-gp="' + p[0] + '"]'), n = Math.round(+el.value); if (!isFinite(n) || n < p[2] || n > p[3]) bad = bad || p[1]; v[p[0]] = n; });
      if (bad) { msg.textContent = "❌ رقم مش مظبوط في: " + bad; return; }
      msg.textContent = "⏳ ...";
      db().collection("notifConfig").doc("global").set(v).then(function () { st.gcfg = Object.assign({}, CFG_DEF, v); msg.textContent = "✅ اتحفظ — بيسري على الكل خلال دقيقة."; }, function () { msg.textContent = "❌ تعذّر الحفظ (المالك بس يقدر يغيّر الإعدادات دي)."; });
    });
  }
  /* ---------- رسالة من الإدارة ---------- */
  function msgHtml() {
    var users = st.staffDir || [];
    var opts = '<option value="techs">👷 كل الفنيين</option><option value="staff">👥 كل الموظفين</option>' + users.filter(function (u) { return u.uid !== st.uid; }).map(function (u) { return '<option value="' + esc(u.uid) + '">' + (u.scope === "assigned" ? "👷 " : "👤 ") + esc(u.name || u.uid) + "</option>"; }).join("");
    return '<div class="wf-nc-set"><label class="wf-nc-row" style="display:block"><span>لمين</span><select data-m="to" style="width:100%;margin-top:6px">' + opts + "</select></label>" +
      (st.staffDir ? "" : '<div class="hint">⏳ بحمّل أسماء الموظفين...</div>') +
      '<label style="display:block;margin-top:10px">العنوان<input data-m="title" maxlength="80" placeholder="مثلًا: اجتماع بكرة" style="width:100%;margin-top:6px"></label>' +
      '<label style="display:block;margin-top:10px">الرسالة<textarea data-m="body" rows="4" maxlength="400" style="width:100%;margin-top:6px" placeholder="اكتب رسالتك..."></textarea></label>' +
      '<div class="wf-nc-push"><button type="button" class="primary" data-msend="1">📤 ابعت</button></div><div class="hint" data-m-msg></div><div class="hint">الرسالة بتوصل في الجرس وعلى الموبايل (لو مفعّل)، ومحدش يقدر يقفلها لنفسه.</div></div>';
  }
  function wireMsg(body) {
    if (!st.staffDir && w.WFPerm && typeof w.WFPerm.call === "function") {
      w.WFPerm.call("staffDirectory", {}).then(function (r) { st.staffDir = (r && r.users) || []; if (st.view === "msg") renderPanel(); }, function () { st.staffDir = []; });
    }
    var out = body.querySelector("[data-m-msg]");
    body.querySelector("[data-msend]").addEventListener("click", function () {
      var b = this, to = body.querySelector('[data-m="to"]').value, title = body.querySelector('[data-m="title"]').value.trim(), text = body.querySelector('[data-m="body"]').value.trim();
      if (!title && !text) { out.textContent = "اكتب الرسالة الأول."; return; }
      b.disabled = true; out.textContent = "⏳ ...";
      callFn("notifySend", { to: to, title: title, body: text }).then(function (r) { out.textContent = "✅ اتبعتت لـ " + ((r && r.sent) || 0) + " شخص."; body.querySelector('[data-m="title"]').value = ""; body.querySelector('[data-m="body"]').value = ""; b.disabled = false; },
        function (e) { b.disabled = false; out.textContent = "❌ تعذّر الإرسال" + (e && e.message ? " (" + e.message + ")" : ""); });
    });
  }

  /* ---------- إشعارات الموبايل (Web Push) ---------- */
  function pushSupported() { return "serviceWorker" in navigator && "PushManager" in w && "Notification" in w; }
  function pushState() {
    if (!pushSupported()) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    return Notification.permission === "granted" && sget("wf_push_on") === st.uid ? "on" : "off";
  }
  function swReg() {
    var scope = IS_PORTAL ? "./portal.html" : "./";
    return navigator.serviceWorker.getRegistration(scope).then(function (r) { return r || navigator.serviceWorker.ready; });
  }
  function b64ToBytes(b64) { var p = "=".repeat((4 - b64.length % 4) % 4), s = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/")), out = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
  function enablePush() {
    if (!pushSupported()) return Promise.reject(new Error("المتصفح مش بيدعم الإشعارات"));
    return Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") throw new Error("لازم تسمح بالإشعارات لما المتصفح يسألك.");
      return Promise.all([swReg(), callFn("pushKey", {})]);
    }).then(function (res) {
      var reg = res[0], key = res[1] && res[1].publicKey;
      if (!key) throw new Error("السيرفر لسه مش جاهز للإشعارات (محتاج تحديث الدوال).");
      return reg.pushManager.getSubscription().then(function (old) {
        // مفتاح مختلف (اشتراك قديم) لازم يتلغي الأول
        return old ? old.unsubscribe().catch(function () {}) : null;
      }).then(function () { return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }); });
    }).then(function (sub) {
      return callFn("pushSubscribe", { sub: sub.toJSON(), ua: navigator.userAgent.slice(0, 150) });
    }).then(function () { sset("wf_push_on", st.uid); sset("wf_push_sync", String(Date.now())); return "✅ اتفعّلت! هيوصلك إشعار حتى والتطبيق مقفول."; });
  }
  function disablePush() {
    return swReg().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      sset("wf_push_on", "");
      if (!sub) return "اتوقفت.";
      var ep = sub.endpoint;
      return sub.unsubscribe().catch(function () {}).then(function () { return callFn("pushUnsubscribe", { endpoint: ep }).catch(function () {}); }).then(function () { return "🔕 اتوقفت على الجهاز ده."; });
    });
  }
  /* الاشتراك بيتجدد في الخلفية مرة في اليوم (ولو حساب تاني دخل على نفس الجهاز بيتنقل له) */
  function resyncPush() {
    if (!pushSupported() || Notification.permission !== "granted") return;
    var on = sget("wf_push_on");
    if (!on) return;
    var last = +(sget("wf_push_sync") || 0);
    if (on === st.uid && Date.now() - last < 86400000) return;
    swReg().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) { sset("wf_push_on", ""); return; }
      return callFn("pushSubscribe", { sub: sub.toJSON(), ua: navigator.userAgent.slice(0, 150) }).then(function () { sset("wf_push_on", st.uid); sset("wf_push_sync", String(Date.now())); });
    }).catch(function () {});
  }

  /* ---------- تنبيه فوري لما يوصل جديد والتطبيق مفتوح ---------- */
  function toast(x) {
    css();
    if (!st.toastBox || !d.body.contains(st.toastBox)) { st.toastBox = d.createElement("div"); st.toastBox.className = "wf-nc-toasts"; st.toastBox.setAttribute("aria-live", "polite"); d.body.appendChild(st.toastBox); }
    var k = KINDS[x.kind] || ["", "🔔"], t = d.createElement("div"); t.className = "wf-nc-toast"; t.setAttribute("role", "status");
    t.innerHTML = '<span style="font-size:20px">' + k[1] + '</span><div><b>' + esc(x.title) + "</b>" + (x.body ? "<span>" + esc(x.body) + "</span>" : "") + "</div>";
    t.addEventListener("click", function () { t.remove(); openItem(x); });
    st.toastBox.appendChild(t);
    while (st.toastBox.children.length > 3) st.toastBox.firstChild.remove();
    setTimeout(function () { t.remove(); }, 7000);
  }
  function arrived(list) {
    if (!list.length) return;
    if (st.bell) { st.bell.classList.remove("ring"); void st.bell.offsetWidth; st.bell.classList.add("ring"); }
    if (d.hidden) {
      // التطبيق في الخلفية: لو إشعارات الموبايل مش متفعّلة، نطلع إشعار نظام من هنا (لو مسموح)
      if (pushState() !== "on" && pushSupported() && Notification.permission === "granted") {
        swReg().then(function (reg) { list.slice(0, 3).forEach(function (x) { reg.showNotification(x.title, { body: x.body || "", icon: "./icon-192-v13.png", tag: "wf-" + x.id, data: { url: x.link ? new URL(x.link, location.href).href : location.href } }); }); }).catch(function () {});
      }
      return;
    }
    list.slice(0, 3).forEach(toast);
  }
  function toRows(snap) { return snap.docs.map(function (doc) { var x = doc.data() || {}; return { id: doc.id, kind: x.kind, title: x.title || "", body: x.body || "", link: x.link || "", at: +x.at || 0, read: !!x.read }; }); }
  /* توفير قراءات: الإشعارات بتتحفظ على الجهاز، ومع كل فتحة صفحة بنقرا بس اللي وصل بعد آخر إشعار عندنا
     (بدل آخر 60 إشعار كل مرة). كل 20 دقيقة بنقرا القايمة كاملة تاني عشان «اتقرا» من جهاز تاني يظهر. */
  var NC_FULL_MS = 20 * 60000;
  function ncKey(kind) { return "wf_nc_cache_" + kind + "_" + st.uid; }
  function ncSave(kind, rows, t) { try { sset(ncKey(kind), JSON.stringify({ t: t, rows: rows })); } catch (e) {} }
  function ncPersist() { var c = st.ncT || {}; if (c.own) ncSave("own", st.items, c.own); if (c.b) ncSave("b", st.bcast, c.b); }
  function listen(kind, base, lim) {
    var c = null; try { c = JSON.parse(sget(ncKey(kind)) || "null"); } catch (e) {}
    st.ncT = st.ncT || {};
    if (!c || !Array.isArray(c.rows) || !(Date.now() - (+c.t || 0) < NC_FULL_MS)) {
      return base.limit(lim).onSnapshot(function (s) { var rows = toRows(s), t = st.ncT[kind] || Date.now(); st.ncT[kind] = t; ncSave(kind, rows, t); onItems(kind, rows); }, function () {});
    }
    var cached = c.rows, top = 0; cached.forEach(function (x) { if (+x.at > top) top = +x.at; });
    st.ncT[kind] = +c.t; onItems(kind, cached.slice());
    return base.where("at", ">", top).limit(lim).onSnapshot(function (s) {
      var m = {}; cached.forEach(function (x) { m[x.id] = x; }); toRows(s).forEach(function (x) { m[x.id] = x; });
      var rows = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.at - a.at; }).slice(0, lim);
      ncSave(kind, rows, +c.t); onItems(kind, rows);
    }, function () {});
  }
  function onItems(kind, rows) {
    var key = kind === "own" ? "items" : "bcast", prev = st[key];
    st[key] = rows;
    if (st.baseline && st.baseline[kind]) {
      var known = {}; prev.forEach(function (x) { known[x.id] = 1; });
      var fresh = rows.filter(function (x) { return !known[x.id] && !x.read && x.at > Date.now() - 10 * 60000; });
      arrived(fresh);
    }
    (st.baseline = st.baseline || {})[kind] = true;
    paintBadge();
    if (st.panel && st.view === "list") renderPanel();
  }

  /* ---------- التشغيل ---------- */
  function stop() { st.unsubs.forEach(function (f) { try { f(); } catch (e) {} }); st.unsubs = []; st.items = []; st.bcast = []; st.baseline = null; }
  function start(user) {
    stop();
    st.uid = user ? user.uid : "";
    if (!user) { if (st.bell) st.bell.remove(); st.bell = null; return; }
    if (!ensureBell()) { var tries = 0; (function again() { if (!ensureBell() && ++tries < 20) setTimeout(again, 500); else paintBadge(); })(); }
    var inbox = function (u) { return db().collection("inbox").doc(u).collection("items").orderBy("at", "desc"); };
    st.ncT = {};
    st.unsubs.push(listen("own", inbox(st.uid), 60));
    if (IS_PORTAL) st.unsubs.push(listen("b", db().collection("inbox").doc("_customers").collection("items").orderBy("at", "desc"), 15));
    db().collection("notifConfig").doc("global").get().then(function (s) { if (s.exists) st.gcfg = Object.assign({}, CFG_DEF, s.data() || {}); if (!Array.isArray(st.gcfg.off)) st.gcfg.off = []; }).catch(function () {});
    db().collection("notifPrefs").doc(st.uid).get().then(function (s) { st.prefs = s.exists && Array.isArray((s.data() || {}).mute) ? s.data().mute : []; }).catch(function () {});
    resyncPush();
    if (IS_PORTAL) { try { portalDeepLink(new URL(location.href)); } catch (e) {} }
  }
  function boot() {
    var tries = 0;
    (function wait() {
      var f = fb();
      if (f && f.auth && f.firestore) { f.auth().onAuthStateChanged(start); return; }
      if (++tries < 120) setTimeout(wait, 500);
    })();
  }
  // فتح الإشعار من الموبايل والبوابة مفتوحة (portal-sw بيبعت GO_TO). صفحات الإدارة بتتعامل معاه في app-notifications-bootstrap.js
  try { if (IS_PORTAL && navigator.serviceWorker) navigator.serviceWorker.addEventListener("message", function (e) { if (e.data && e.data.type === "GO_TO" && e.data.url) go(e.data.url); }); } catch (e) {}
  w.WFNotifCenter = { open: openPanel, enablePush: enablePush, disablePush: disablePush, state: function () { return st; }, kinds: KINDS };
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot); else boot();
})(window);
