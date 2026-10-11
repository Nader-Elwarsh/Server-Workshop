/* users-page.js — شاشة «المستخدمون والصلاحيات» (users.html). للمالك فقط.
   كل العمليات بتتنفّذ عبر دوال السيرفر (staffList / staffCreate / staffUpdate / staffResetPassword / rolesSave)،
   والواجهة هنا مجرد عرض وإدخال. مفيش innerHTML بأي نص جاي من المستخدمين (كله textContent). */
(function () {
  "use strict";
  /* الصلاحيات بتتحمّل من firebase-sync.js بعد بدء الصفحة، فنستنى لحد ما تجهز (حد أقصى 15 ثانية). */
  var R, P, waited = 0;
  function waitForPerm() {
    R = window.WFRoles; P = window.WFPerm;
    if (R && P) return start();
    if ((waited += 50) > 15000) { var m = document.getElementById("usersRoot"); if (m) m.textContent = "تعذّر تحميل وحدة الصلاحيات. حدّث الصفحة."; return; }
    setTimeout(waitForPerm, 50);
  }
  function start() {

  var ERR = {
    owner_only: "العملية دي للمالك فقط.", bad_email: "الإيميل غير صحيح.", bad_name: "الاسم مطلوب (حتى 60 حرف).",
    bad_password: "كلمة السر لازم تكون من 8 إلى 64 حرف.", bad_role: "الدور غير موجود.", email_exists: "الإيميل ده مستخدم بالفعل.",
    last_owner: "مينفعش تشيل آخر مالك في النظام.", cannot_disable_self: "مينفعش توقف حسابك أنت.", no_such_user: "المستخدم مش موجود.",
    nothing_to_update: "مفيش تغيير للحفظ.", bad_config: "إعداد الأدوار غير صالح.", not_staff: "حسابك مش موظف مفعّل.", sign_in_required: "سجّل الدخول الأول."
  };
  var state = { users: [], config: null, draft: null, roleId: "owner", editUid: null, audit: [] };

  function $(id) { return document.getElementById(id); }
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") el.textContent = attrs[k];
      else if (k === "on") Object.keys(attrs.on).forEach(function (ev) { el.addEventListener(ev, attrs.on[ev]); });
      else if (k === "style") el.style.cssText = attrs[k];
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  function explain(e) {
    var m = String((e && e.message) || ""), code = String((e && e.code) || "");
    if (m.indexOf("role_in_use:") === 0) return "في موظفين لسه على أدوار هتتشال: " + m.split(":")[1] + ". غيّر دورهم الأول.";
    if (ERR[m]) return ERR[m];
    if (code === "permission-denied" || code === "permission_denied") return "مفيش صلاحية: العملية دي للمالك فقط.";
    if (code === "not_found" || code === "unavailable" || code === "internal" || code === "404") return "الدوال على السيرفر مش جاهزة. لازم تنشر دوال الأدوار (firebase deploy --only functions) الأول.";
    if (code === "unauthenticated") return "سجّل الدخول من جديد.";
    return "حصل خطأ (" + (code || "غير معروف") + "). جرّب تاني.";
  }
  function say(text, bad) {
    var box = $("usersMsg"); box.textContent = "";
    if (!text) return;
    box.appendChild(h("div", { class: "panel", role: bad ? "alert" : "status", style: "border-inline-start:5px solid " + (bad ? "#b3261e" : "#18794e") + ";font-weight:700", text: text }));
    try { box.scrollIntoView({ block: "nearest" }); } catch (e) {}
  }
  function busy(btn, on) { if (btn) { btn.disabled = on; btn.style.opacity = on ? ".6" : ""; } }
  function fmtDate(v) { if (!v) return "—"; var d = new Date(v); return isNaN(d) ? "—" : d.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }); }
  function roleName(id) { var r = state.config && state.config.roles[id]; return r ? r.name : id; }

  /* ---------- مصفوفة الصلاحيات (checkboxes مجمّعة) ---------- */
  function matrix(checked, locked, onToggle) {
    var wrap = h("div", { class: "perm-matrix" });
    R.GROUPS.forEach(function (g) {
      var det = h("details", { open: false }, [h("summary", { text: g.label, style: "cursor:pointer;font-weight:700;padding:6px 0" })]);
      var inputs = [];
      var grid = h("div", { style: "display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px 12px;padding:4px 0 10px" });
      g.perms.forEach(function (p) {
        var cb = h("input", { type: "checkbox", "data-key": p[0], disabled: locked });
        cb.checked = !!checked[p[0]];
        cb.addEventListener("change", function () { onToggle(p[0], cb.checked); });
        inputs.push(cb);
        grid.appendChild(h("label", { style: "display:flex;gap:6px;align-items:center" }, [cb, h("span", { text: p[1] })]));
      });
      if (!locked) {
        var all = h("button", { type: "button", class: "secondary mini-action", text: "تحديد الكل", on: { click: function () { inputs.forEach(function (c) { if (!c.checked) { c.checked = true; onToggle(c.getAttribute("data-key"), true); } }); } } });
        var none = h("button", { type: "button", class: "secondary mini-action", text: "إلغاء الكل", on: { click: function () { inputs.forEach(function (c) { if (c.checked) { c.checked = false; onToggle(c.getAttribute("data-key"), false); } }); } } });
        det.appendChild(h("div", { class: "actions", style: "gap:6px;margin-bottom:4px" }, [all, none]));
      }
      det.appendChild(grid); wrap.appendChild(det);
    });
    return wrap;
  }
  function setOf(list) { var s = {}; (list || []).forEach(function (k) { s[k] = 1; }); return s; }

  /* ---------- قائمة المستخدمين ---------- */
  function userCard(u) {
    var badges = [h("span", { style: "padding:2px 10px;border-radius:999px;background:var(--bg-soft,#e8edf3);font-size:12px;font-weight:700;", text: roleName(u.role) })];
    if (u.disabled) badges.push(h("span", { style: "padding:2px 10px;border-radius:999px;background:var(--bg-soft,#e8edf3);font-size:12px;font-weight:700;background:#b3261e;color:#fff", text: "موقوف" }));
    if (u.legacy) badges.push(h("span", { style: "padding:2px 10px;border-radius:999px;background:var(--bg-soft,#e8edf3);font-size:12px;font-weight:700;", text: "حساب قديم = مالك" }));
    if (u.isSelf) badges.push(h("span", { style: "padding:2px 10px;border-radius:999px;background:var(--bg-soft,#e8edf3);font-size:12px;font-weight:700;", text: "أنت" }));
    var info = h("div", {}, [
      h("div", { style: "font-weight:700;font-size:16px", text: u.name || "(بدون اسم)" }),
      h("div", { dir: "ltr", style: "text-align:right;opacity:.8", text: u.email || u.uid }),
      h("div", { class: "hint", text: "آخر دخول: " + fmtDate(u.lastSignIn) }),
      h("div", { style: "display:flex;gap:6px;flex-wrap:wrap;margin-top:4px" }, badges)
    ]);
    var btns = h("div", { class: "actions", style: "gap:6px;flex-wrap:wrap;margin-top:8px" });
    var edit = h("button", { type: "button", class: "secondary mini-action", text: state.editUid === u.uid ? "إغلاق" : "✏️ تعديل", on: { click: function () { state.editUid = state.editUid === u.uid ? null : u.uid; render(); } } });
    var reset = h("button", { type: "button", class: "secondary mini-action", text: "🔑 كلمة سر جديدة", on: { click: function (ev) { resetPassword(u, ev.currentTarget); } } });
    btns.appendChild(edit); btns.appendChild(reset);
    if (!u.isSelf) {
      btns.appendChild(h("button", { type: "button", class: "secondary mini-action" + (u.disabled ? "" : " danger-btn"), text: u.disabled ? "▶️ تفعيل" : "⏸️ إيقاف", on: { click: function (ev) { toggleDisabled(u, ev.currentTarget); } } }));
    }
    var card = h("section", { class: "panel", style: "margin:8px 0" }, [info, btns]);
    if (state.editUid === u.uid) card.appendChild(editor(u));
    return card;
  }
  function editor(u) {
    var nameIn = h("input", { type: "text", value: u.name || "", maxlength: "60", "aria-label": "الاسم" });
    var roleSel = h("select", { "aria-label": "الدور" }, state.config.order.map(function (id) { var o = h("option", { value: id, text: roleName(id) }); if (id === u.role) o.selected = true; return o; }));
    var current = {};
    function loadFor(roleId, withOverrides) {
      current = setOf(state.config.roles[roleId] ? state.config.roles[roleId].perms : []);
      if (withOverrides) { (u.allow || []).forEach(function (k) { current[k] = 1; }); (u.deny || []).forEach(function (k) { delete current[k]; }); }
    }
    loadFor(u.role, true);
    var holder = h("div");
    function drawMatrix() {
      holder.textContent = "";
      var locked = roleSel.value === "owner";
      var eff = locked ? setOf(R.KEYS) : current;
      holder.appendChild(matrix(eff, locked, function (k, on) { if (on) current[k] = 1; else delete current[k]; }));
      if (locked) holder.appendChild(h("p", { class: "hint", text: "المالك بكل الصلاحيات دايمًا." }));
    }
    roleSel.addEventListener("change", function () { loadFor(roleSel.value, false); drawMatrix(); });
    drawMatrix();
    var save = h("button", { type: "button", class: "primary", text: "💾 حفظ التعديل", on: { click: function () {
      var rid = roleSel.value, base = setOf(state.config.roles[rid] ? state.config.roles[rid].perms : []);
      var allow = [], deny = [];
      if (rid !== "owner") R.KEYS.forEach(function (k) { if (current[k] && !base[k]) allow.push(k); if (!current[k] && base[k]) deny.push(k); });
      busy(save, true);
      P.call("staffUpdate", { uid: u.uid, name: nameIn.value, role: rid, allow: allow, deny: deny }).then(function () { say("تم حفظ بيانات " + (nameIn.value || "المستخدم") + ".", false); state.editUid = null; return load(); }, function (e) { say(explain(e), true); }).then(function () { busy(save, false); });
    } } });
    return h("div", { style: "margin-top:10px;border-top:1px solid var(--border,#ddd);padding-top:10px" }, [
      h("label", {}, ["الاسم", nameIn]), h("label", {}, ["الدور", roleSel]),
      h("p", { class: "hint", text: "غيّر أي صلاحية هنا لو عايز استثناء للشخص ده بس (من غير ما تغيّر الدور كله)." }),
      holder, h("div", { class: "actions" }, [save])
    ]);
  }
  function toggleDisabled(u, btn) {
    var to = !u.disabled;
    if (!window.confirm(to ? "إيقاف " + (u.name || u.email) + "؟ هيتقفل عليه الدخول فورًا." : "تفعيل " + (u.name || u.email) + " تاني؟")) return;
    busy(btn, true);
    P.call("staffUpdate", { uid: u.uid, disabled: to }).then(function () { say(to ? "تم إيقاف الحساب." : "تم تفعيل الحساب.", false); return load(); }, function (e) { say(explain(e), true); }).then(function () { busy(btn, false); });
  }
  function resetPassword(u, btn) {
    if (!window.confirm("إنشاء كلمة سر جديدة لـ " + (u.name || u.email) + "؟ هيتسجّل خروجه من كل الأجهزة.")) return;
    busy(btn, true);
    P.call("staffResetPassword", { uid: u.uid }).then(function (r) { showSecret("كلمة السر الجديدة لـ " + (u.name || u.email), r.password); }, function (e) { say(explain(e), true); }).then(function () { busy(btn, false); });
  }
  function showSecret(title, secret) {
    var box = $("usersMsg"); box.textContent = "";
    var input = h("input", { type: "text", readonly: true, value: secret, dir: "ltr", style: "font-size:18px;font-weight:700;text-align:center", "aria-label": "كلمة السر" });
    var copy = h("button", { type: "button", class: "secondary mini-action", text: "نسخ", on: { click: function () { try { input.select(); navigator.clipboard.writeText(secret); copy.textContent = "اتنسخت ✅"; } catch (e) { input.select(); } } } });
    box.appendChild(h("div", { class: "panel", style: "border-inline-start:5px solid #18794e" }, [h("div", { style: "font-weight:700", text: title }), input, h("div", { class: "actions" }, [copy]), h("p", { class: "hint", text: "انسخها وابعتها له. مش هتظهر تاني، ولو ضاعت اعمل كلمة سر جديدة." })]));
    try { box.scrollIntoView({ block: "nearest" }); } catch (e) {}
  }

  /* ---------- إضافة مستخدم ---------- */
  function addPanel() {
    var email = h("input", { type: "email", dir: "ltr", placeholder: "name@example.com", autocomplete: "off" });
    var name = h("input", { type: "text", maxlength: "60", placeholder: "اسم الموظف" });
    var pw = h("input", { type: "text", dir: "ltr", placeholder: "8 حروف على الأقل", autocomplete: "off" });
    var role = h("select", {}, state.config.order.filter(function (id) { return id !== "owner"; }).concat(["owner"]).map(function (id) { return h("option", { value: id, text: roleName(id) }); }));
    var gen = h("button", { type: "button", class: "secondary mini-action", text: "🎲 توليد", on: { click: function () { var a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = "", b = new Uint32Array(12); (window.crypto || window.msCrypto).getRandomValues(b); for (var i = 0; i < 12; i++) s += a[b[i] % a.length]; pw.value = s; } } });
    var add = h("button", { type: "button", class: "primary", text: "➕ إضافة المستخدم", on: { click: function () {
      var secret = pw.value;
      busy(add, true);
      P.call("staffCreate", { email: email.value, name: name.value, password: secret, role: role.value }).then(function (r) {
        showSecret("تم إنشاء حساب " + r.name + " — الإيميل: " + r.email, secret);
        email.value = ""; name.value = ""; pw.value = ""; return load();
      }, function (e) { say(explain(e), true); }).then(function () { busy(add, false); });
    } } });
    return h("section", { class: "panel" }, [h("h2", { text: "➕ إضافة مستخدم" }), h("div", { class: "form-grid" }, [h("label", {}, ["الإيميل (للدخول)", email]), h("label", {}, ["الاسم", name]), h("label", {}, ["كلمة السر", h("div", { class: "select-add" }, [pw, gen])]), h("label", {}, ["الدور", role])]), h("div", { class: "actions" }, [add]),
      h("p", { class: "hint", text: "الموظف بيدخل من صفحة الدخول العادية بالإيميل وكلمة السر دي." })]);
  }

  /* ---------- محرر الأدوار ---------- */
  function rolesPanel() {
    var d = state.draft;
    if (!d.roles[state.roleId]) state.roleId = "owner";
    var role = d.roles[state.roleId], locked = !!role.locked;
    var sel = h("select", { "aria-label": "الدور" }, d.order.map(function (id) { var o = h("option", { value: id, text: d.roles[id].name }); if (id === state.roleId) o.selected = true; return o; }));
    sel.addEventListener("change", function () { state.roleId = sel.value; render(); });
    var nameIn = h("input", { type: "text", value: role.name, maxlength: "40", disabled: locked, "aria-label": "اسم الدور" });
    nameIn.addEventListener("input", function () { role.name = nameIn.value; });
    var cur = setOf(role.perms);
    var mx = matrix(locked ? setOf(R.KEYS) : cur, locked, function (k, on) { if (on) cur[k] = 1; else delete cur[k]; role.perms = R.KEYS.filter(function (x) { return cur[x]; }); });
    var newName = h("input", { type: "text", maxlength: "40", placeholder: "اسم دور جديد (مثال: فني أول)" });
    var addRole = h("button", { type: "button", class: "secondary mini-action", text: "➕ دور جديد", on: { click: function () {
      var nm = newName.value.replace(/\s+/g, " ").trim(); if (!nm) return say("اكتب اسم الدور الأول.", true);
      var id = "r_" + Date.now().toString(36); d.roles[id] = { name: nm, perms: role.perms.slice() }; d.order.push(id); state.roleId = id; render();
    } } });
    var del = h("button", { type: "button", class: "secondary mini-action danger-btn", text: "🗑️ حذف الدور", disabled: locked, on: { click: function () {
      if (!window.confirm("حذف دور «" + role.name + "»؟")) return;
      delete d.roles[state.roleId]; d.order = d.order.filter(function (x) { return x !== state.roleId; }); state.roleId = "owner"; render();
    } } });
    var save = h("button", { type: "button", class: "primary", text: "💾 حفظ الأدوار", on: { click: function () {
      busy(save, true);
      P.call("rolesSave", { config: d }).then(function (r) { say("تم حفظ الأدوار والصلاحيات." + (r.claimFailures && r.claimFailures.length ? " (تنبيه: " + r.claimFailures.length + " حساب هيتحدّث عند دخوله)" : ""), false); return load(); }, function (e) { say(explain(e), true); }).then(function () { busy(save, false); });
    } } });
    return h("section", { class: "panel" }, [h("h2", { text: "🛡️ الأدوار والصلاحيات" }),
      h("p", { class: "hint", text: "اختار دور وعدّل صلاحياته. التعديل بيسري على كل اللي على الدور ده بعد الحفظ." }),
      h("div", { class: "form-grid" }, [h("label", {}, ["الدور", sel]), h("label", {}, ["اسم الدور", nameIn])]), mx,
      h("div", { class: "form-grid", style: "margin-top:8px" }, [h("label", {}, ["دور جديد (بينسخ صلاحيات الدور الحالي)", newName])]),
      h("div", { class: "actions", style: "gap:6px;flex-wrap:wrap" }, [addRole, del, save])]);
  }

  /* ---------- سجل المراجعة ---------- */
  var ACTION_AR = { create_user: "إضافة مستخدم", update_user: "تعديل مستخدم", reset_password: "كلمة سر جديدة", save_roles: "حفظ الأدوار", migrate_legacy_owner: "ترقية حساب قديم لمالك" };
  function auditPanel() {
    var names = {}; state.users.forEach(function (u) { names[u.uid] = u.name || u.email || u.uid; });
    var rows = state.audit.map(function (a) { return h("li", { text: fmtDate(a.at) + " — " + (names[a.by] || a.by) + ": " + (ACTION_AR[a.action] || a.action) + (a.target ? " ← " + (names[a.target] || a.target) : "") }); });
    return h("section", { class: "panel" }, [h("details", {}, [h("summary", { text: "📜 آخر العمليات (سجل المراجعة)" }), rows.length ? h("ul", { style: "padding-inline-start:18px" }, rows) : h("p", { class: "hint", text: "لسه مفيش عمليات مسجّلة." })])]);
  }

  function render() {
    var root = $("usersRoot"); root.textContent = "";
    if (!state.config) return;
    root.appendChild(h("h2", { text: "👤 المستخدمون (" + state.users.length + ")" }));
    state.users.forEach(function (u) { root.appendChild(userCard(u)); });
    root.appendChild(addPanel()); root.appendChild(rolesPanel()); root.appendChild(auditPanel());
  }
  function loadAudit() {
    try {
      return window.firebase.firestore().collection("staffAudit").orderBy("at", "desc").limit(40).get().then(function (s) { state.audit = s.docs.map(function (d) { return d.data(); }); }, function () { state.audit = []; });
    } catch (e) { state.audit = []; return Promise.resolve(); }
  }
  function load() {
    return P.call("staffList", {}).then(function (r) {
      state.users = r.users || []; state.config = R.normalizeConfig(r.config);
      state.draft = JSON.parse(JSON.stringify(state.config));
      return loadAudit();
    }).then(render, function (e) { $("usersRoot").textContent = ""; say(explain(e), true); });
  }

  function whenSignedIn(fn) {
    function go() {
      var done = false;
      window.firebase.auth().onAuthStateChanged(function (u) { if (u && !done) { done = true; fn(); } });
    }
    if (window.firebase && window.firebase.auth) go(); else window.addEventListener("load", function () { if (window.firebase && window.firebase.auth) go(); });
  }
  Promise.resolve(window.WFStorageReady).then(function () { whenSignedIn(load); }, function () { whenSignedIn(load); });
  }
  waitForPerm();
})();
