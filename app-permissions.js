/* app-permissions.js — تطبيق الأدوار والصلاحيات في الواجهة (المرحلة 1).

   بيعمل 5 حاجات من غير ما أي صفحة تتعدّل يدويًا:
   1) حراسة الصفحات: لو الصفحة محتاجة صلاحية عرض والمستخدم معندوش، بتظهر رسالة بدل المحتوى.
   2) إخفاء أي رابط لصفحة مش مسموحة (كروت الرئيسية، الشريط السفلي، روابط التعديل ?edit= والإضافة ?add=).
   3) حراسة النماذج (عميل/جهاز/أمر/صنف/كود عطل) حسب إضافة أو تعديل.
   4) حراسة الدوال الحساسة بالاسم (الجدول في roles-core.js) — حذف، مالية، إعدادات، نسخ احتياطي...
   5) عناصر فيها data-perm="مفتاح" (أو "مفتاح1,مفتاح2" = أي واحد) أو data-owner-only بتتخفى للي مالوش صلاحية.

   مهم: ده «تنظيم للواجهة» مش حماية للبيانات. الحماية الفعلية على السيرفر (قواعد Firestore حسب الصلاحية) هي المرحلة 2.
   لو بيانات الدور مش متحمّلة لسه (أول مرة / من غير نت) بيتصرف زي الموظف القديم (كل شيء متاح) لحد ما تتحمّل. */
(function (w) {
  "use strict";
  var R = w.WFRoles;
  if (!R) return;
  var path = (w.location && w.location.pathname) || "";
  var FILE = (path.split("/").pop() || "index.html").toLowerCase();
  if (FILE === "login.html" || FILE === "portal.html") return;

  var K_PROFILE = "wf_perm_profile", K_CONFIG = "wf_perm_config", K_SYNC = "wf_perm_sync_at";
  var SYNC_EVERY = 12 * 3600 * 1000;
  var OWNER_PAGES = { "users.html": true };
  var state = { profile: null, config: null, set: null, version: 0, listeners: [] };

  function store() { return w.WFStorage || null; }
  function readJSON(k) { try { var s = store(); var v = s && s.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function writeJSON(k, v) { try { var s = store(); if (s) s.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function recompute() {
    state.version++;
    if (!state.profile) { state.set = null; return; }
    var perms = R.effectivePerms(state.config, state.profile), set = {};
    perms.forEach(function (k) { set[k] = 1; });
    state.set = set;
  }
  function can(key) { return state.set === null ? true : R.satisfies(state.set, key); }
  function isOwner() { return state.profile ? R.isOwner(state.config, state.profile) : true; }
  function denyLabel(rule) {
    var keys = typeof rule === "string" ? [rule] : (rule && (rule.all || rule.any)) || [];
    return keys.map(function (k) { return R.LABELS[k] || k; }).join(" / ");
  }
  function notify() { state.listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }

  /* ---------- 1) حراسة الصفحة ---------- */
  var overlay = null;
  function showDenied(text) {
    if (overlay || !w.document || !w.document.body) return;
    overlay = w.document.createElement("div");
    overlay.id = "wfPermDenied";
    overlay.setAttribute("role", "alertdialog");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:#001b4d;color:#fff;display:grid;place-items:center;padding:24px;text-align:center;font:600 18px system-ui";
    var box = w.document.createElement("div");
    var msg = w.document.createElement("div");
    msg.textContent = text;
    var a = w.document.createElement("a");
    a.href = "index.html"; a.textContent = "← الرجوع للرئيسية";
    a.style.cssText = "display:inline-block;margin-top:16px;padding:10px 18px;border-radius:10px;background:#2563eb;color:#fff;text-decoration:none";
    box.appendChild(msg); box.appendChild(a); overlay.appendChild(box);
    w.document.body.appendChild(overlay);
  }
  function hideDenied() { if (overlay) { try { overlay.remove(); } catch (e) {} overlay = null; } }
  function guardPage() {
    if (!w.document || !w.document.body) return;
    if (state.profile && state.profile.disabled === true) return showDenied("🔒 الحساب ده موقوف. كلّم مالك الورشة.");
    if (OWNER_PAGES[FILE] && !isOwner()) return showDenied("🔒 الصفحة دي للمالك فقط.");
    var need = R.PAGES[FILE];
    if (need && !can(need)) return showDenied("🔒 مش مصرّح لك بفتح الصفحة دي (" + (R.LABELS[need] || need) + "). كلّم مالك الورشة لو محتاجها.");
    hideDenied();
  }

  /* ---------- 2) الروابط ---------- */
  function linkNeed(a) {
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) === "#" || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
    var clean = href.split("#")[0], q = clean.indexOf("?");
    var file = (q < 0 ? clean : clean.slice(0, q)).split("/").pop().toLowerCase();
    var search = q < 0 ? "" : clean.slice(q + 1);
    if (OWNER_PAGES[file]) return { owner: true };
    var need = R.PAGES[file];
    if (!need) return null;
    var rules = [need];
    var spec = null;
    Object.keys(R.FORMS).forEach(function (id) { if (R.FORMS[id].page === file) spec = R.FORMS[id]; });
    if (spec) {
      if (/(^|&)edit=/.test(search)) rules.push(spec.edit);
      else if (/(^|&)add=/.test(search)) rules.push(spec.add);
    }
    return { all: rules };
  }
  function setHidden(el, hide) {
    if (hide) { if (el.getAttribute("data-perm-hidden") !== "1") { el.setAttribute("data-perm-hidden", "1"); el.__wfDisp = el.style.display; el.style.display = "none"; } }
    else if (el.getAttribute("data-perm-hidden") === "1") { el.removeAttribute("data-perm-hidden"); el.style.display = el.__wfDisp || ""; }
  }
  function applyLinks(root) {
    if (!w.document) return;
    var list = (root || w.document).querySelectorAll("a[href]");
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (a.__wfPv === state.version) continue;
      a.__wfPv = state.version;
      var need = linkNeed(a);
      if (!need) { setHidden(a, false); continue; }
      setHidden(a, need.owner ? !isOwner() : !can(need));
    }
    var titles = (root || w.document).querySelectorAll(".nav-section-title");
    for (var t = 0; t < titles.length; t++) {
      var title = titles[t], sib = title.nextElementSibling, anchors = 0, visible = 0;
      while (sib && !(sib.classList && sib.classList.contains("nav-section-title"))) {
        var links = sib.tagName === "A" ? [sib] : sib.querySelectorAll ? sib.querySelectorAll("a[href]") : [];
        for (var j = 0; j < links.length; j++) { anchors++; if (links[j].getAttribute("data-perm-hidden") !== "1") visible++; }
        sib = sib.nextElementSibling;
      }
      setHidden(title, anchors > 0 && visible === 0);
    }
  }
  function applyAttrs() {
    if (!w.document) return;
    var els = w.document.querySelectorAll("[data-perm],[data-owner-only]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i], rule = el.getAttribute("data-perm"), hide = false;
      if (el.hasAttribute("data-owner-only") && !isOwner()) hide = true;
      if (rule) hide = hide || !can({ any: rule.split(",").map(function (s) { return s.trim(); }).filter(Boolean) });
      setHidden(el, hide);
    }
  }

  /* ---------- 3) النماذج ---------- */
  function onSubmit(e) {
    var f = e.target, spec = f && f.id ? R.FORMS[f.id] : null;
    if (!spec) return;
    var editing = /(^|[?&])edit=/.test((w.location && w.location.search) || "");
    var key = editing ? spec.edit : spec.add;
    if (can(key)) return;
    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    w.alert("🔒 ليس لديك صلاحية: " + (R.LABELS[key] || key));
  }

  /* ---------- 4) الدوال الحساسة ---------- */
  var wrappedNames = {};
  function wrapOne(name, ruleFn) {
    var f = w[name];
    if (wrappedNames[name] || typeof f !== "function" || f.__wfPerm) return;
    var wrapped = function () {
      var rule = ruleFn(arguments);
      if (!can(rule)) {
        var ev = arguments[0];
        try { if (ev && typeof ev.preventDefault === "function") ev.preventDefault(); } catch (e) {}
        w.alert("🔒 ليس لديك صلاحية: " + denyLabel(rule));
        return undefined;
      }
      return f.apply(this, arguments);
    };
    wrapped.__wfPerm = true; wrapped.__wfOrig = f;
    try { w[name] = wrapped; wrappedNames[name] = true; } catch (e) {}
  }
  function wrapActions() {
    Object.keys(R.ACTIONS).forEach(function (n) { wrapOne(n, function () { return R.ACTIONS[n]; }); });
    Object.keys(R.SAVE_EDIT).forEach(function (n) { wrapOne(n, function (args) { return R.SAVE_EDIT[n][args[1] ? 1 : 0]; }); });
  }

  /* ---------- تطبيق الكل ---------- */
  var pending = false;
  function applyAll() {
    guardPage(); applyAttrs(); applyLinks();
  }
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(function () { pending = false; applyLinks(); applyAttrs(); }, 60);
  }

  /* ---------- التحميل من السحابة ---------- */
  function withTimeout(p, ms) {
    return new Promise(function (res, rej) { var t = setTimeout(function () { rej(new Error("timeout")); }, ms || 10000); p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); }); });
  }
  function authedCall(name, data) {
    var u = w.firebase && w.firebase.auth && w.firebase.auth().currentUser;
    if (!u) return Promise.reject({ code: "unauthenticated", message: "sign_in_required" });
    var pid = w.firebase.app().options.projectId;
    var url = "https://us-central1-" + encodeURIComponent(pid) + ".cloudfunctions.net/" + encodeURIComponent(name);
    return u.getIdToken().then(function (tok) {
      return (w.WFAppCheck ? w.WFAppCheck.headers() : Promise.resolve({})).then(function (h) {
        var hdr = { "Content-Type": "application/json", Authorization: "Bearer " + tok };
        Object.keys(h || {}).forEach(function (k) { hdr[k] = h[k]; });
        return withTimeout(fetch(url, { method: "POST", headers: hdr, body: JSON.stringify({ data: data || {} }) }), 20000).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (r.ok && j && j.result !== undefined) return j.result;
            var err = (j && j.error) || {};
            throw { code: String(err.status || r.status || "unknown").toLowerCase(), message: err.message || "", status: r.status };
          });
        });
      });
    });
  }
  function acceptProfile(p, cfg) {
    state.profile = { name: p.name || "", role: p.role == null ? "" : p.role, allow: p.allow || [], deny: p.deny || [], disabled: p.disabled === true };
    if (cfg) state.config = R.normalizeConfig(cfg);
    writeJSON(K_PROFILE, state.profile); writeJSON(K_CONFIG, state.config);
    recompute(); applyAll(); notify();
  }
  function refresh() {
    var u = w.firebase && w.firebase.auth && w.firebase.auth().currentUser;
    if (!u || (w.navigator && w.navigator.onLine === false)) return Promise.resolve(false);
    var db = w.firebase.firestore();
    return Promise.all([
      withTimeout(db.collection("staff").doc(u.uid).get()),
      withTimeout(db.collection("accessConfig").doc("roles").get()).catch(function () { return null; })
    ]).then(function (r) {
      if (!r[0].exists) return false;
      var cfg = r[1] && r[1].exists ? r[1].data() : state.config;
      acceptProfile(r[0].data(), cfg);
      return true;
    }).then(function (ok) { backgroundSync(); return ok; }).catch(function () { return false; });
  }
  /* مرة كل 12 ساعة: الدالة بتجدّد claims وبترقّي مستند الموظف القديم لدور «مالك». فشلها مش مشكلة. */
  function backgroundSync(force) {
    var last = Number((store() && store().getItem(K_SYNC)) || 0);
    if (!force && Date.now() - last < SYNC_EVERY) return Promise.resolve(false);
    return authedCall("staffSync", {}).then(function (res) {
      try { store().setItem(K_SYNC, String(Date.now())); } catch (e) {}
      if (res && res.config) acceptProfile({ name: res.name, role: res.role, allow: res.allow, deny: res.deny, disabled: res.disabled }, res.config);
      return true;
    }).catch(function () { return false; });
  }

  var started = false;
  function start() {
    if (started) return; started = true;
    var cp = readJSON(K_PROFILE), cc = readJSON(K_CONFIG);
    if (cp) { state.profile = cp; state.config = cc ? R.normalizeConfig(cc) : R.defaultConfig(); recompute(); }
    applyAll();
    w.document.addEventListener("submit", onSubmit, true);
    wrapActions();
    w.addEventListener("load", function () { wrapActions(); applyAll(); });
    setTimeout(function () { wrapActions(); applyAll(); }, 1200);
    try { new w.MutationObserver(function (list) { for (var i = 0; i < list.length; i++) if (list[i].addedNodes && list[i].addedNodes.length) return schedule(); }).observe(w.document.body, { childList: true, subtree: true }); } catch (e) {}
    try { w.firebase.auth().onAuthStateChanged(function (u) { if (u) refresh(); }); } catch (e) {}
  }
  function boot() {
    Promise.resolve(w.WFStorageReady).then(start, start);
  }
  if (w.document.readyState === "loading") w.document.addEventListener("DOMContentLoaded", boot); else boot();

  w.WFPerm = {
    can: can, isOwner: isOwner, refresh: refresh, call: authedCall, sync: backgroundSync,
    profile: function () { return state.profile; }, config: function () { return state.config || R.defaultConfig(); },
    perms: function () { return state.set ? Object.keys(state.set) : R.KEYS.slice(); },
    onChange: function (fn) { state.listeners.push(fn); },
    _applyAll: applyAll, _wrapActions: wrapActions, _state: state
  };
})(window);
