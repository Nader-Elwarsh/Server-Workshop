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
    last_owner: "مينفعش تشيل آخر مالك في النظام.", cannot_disable_self: "مينفعش توقف حسابك أنت.", cannot_delete_self: "مينفعش تمسح حسابك أنت.", no_such_user: "المستخدم مش موجود.",
    nothing_to_update: "مفيش تغيير للحفظ.", bad_wallet: "اسم المحفظة طويل (حتى 40 حرف).", wallet_taken: "المحفظة دي متحددة لموظف تاني. كل فني ليه محفظة عهدة لوحده.", bad_config: "إعداد الأدوار غير صالح.", not_staff: "حسابك مش موظف مفعّل.", sign_in_required: "سجّل الدخول الأول."
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
    injectMatrixStyle();
    var wrap = h("div", { class: "perm-matrix" });
    R.GROUPS.forEach(function (g) {
      var inputs = [], count = h("span", { class: "pm-count" });
      function recount() { var n = inputs.filter(function (c) { return c.checked; }).length; count.textContent = n + " من " + inputs.length; count.className = "pm-count" + (n === inputs.length ? " pm-all" : n ? " pm-some" : ""); }
      var det = h("details", { class: "pm-group" }, [h("summary", {}, [h("span", { text: g.label }), count])]);
      var grid = h("div", { class: "pm-grid" });
      g.perms.forEach(function (p) {
        var cb = h("input", { type: "checkbox", "data-key": p[0], disabled: locked });
        cb.checked = !!checked[p[0]];
        cb.addEventListener("change", function () { onToggle(p[0], cb.checked); recount(); });
        inputs.push(cb);
        grid.appendChild(h("label", { class: "pm-item" }, [cb, h("span", { text: p[1] })]));
      });
      if (!locked) {
        var all = h("button", { type: "button", class: "pm-mini", text: "✔ تحديد الكل", on: { click: function () { inputs.forEach(function (c) { if (!c.checked) { c.checked = true; onToggle(c.getAttribute("data-key"), true); } }); recount(); } } });
        var none = h("button", { type: "button", class: "pm-mini", text: "✖ إلغاء الكل", on: { click: function () { inputs.forEach(function (c) { if (c.checked) { c.checked = false; onToggle(c.getAttribute("data-key"), false); } }); recount(); } } });
        det.appendChild(h("div", { class: "pm-tools" }, [all, none]));
      }
      recount();
      det.appendChild(grid); wrap.appendChild(det);
    });
    return wrap;
  }
  function injectMatrixStyle() {
    if (document.getElementById("pmStyle")) return;
    var st = document.createElement("style"); st.id = "pmStyle";
    st.textContent = ".perm-matrix{display:grid;gap:8px;margin:8px 0}" +
      ".pm-group{border:1px solid var(--border,#dde3ec);border-radius:12px;background:var(--bg-elevated,#fff);overflow:hidden}" +
      ".pm-group>summary{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 14px;cursor:pointer;font-weight:800;list-style-position:inside}" +
      ".pm-group[open]>summary{border-bottom:1px solid var(--border,#dde3ec);background:var(--bg-sunken,#f3f5f9)}" +
      ".pm-count{font-size:12px;font-weight:800;padding:2px 9px;border-radius:99px;background:var(--bg-sunken,#eef1f6);color:var(--text-muted,#667085)}" +
      ".pm-count.pm-all{background:#dcfce7;color:#166534}.pm-count.pm-some{background:#e0ecff;color:#1d4ed8}" +
      "[data-theme=dark] .pm-count.pm-all{background:#14532d;color:#dcfce7}[data-theme=dark] .pm-count.pm-some{background:#1e3a8a;color:#dbeafe}" +
      ".pm-tools{display:flex;gap:6px;padding:10px 14px 0;flex-wrap:wrap}" +
      ".pm-mini{width:auto;min-height:32px;padding:5px 12px;border-radius:99px;border:1px solid var(--border,#dde3ec);background:var(--bg-sunken,#f3f5f9);color:inherit;font:inherit;font-size:13px;cursor:pointer}" +
      ".pm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:2px 14px;padding:8px 14px 12px}" +
      ".pm-item{display:flex!important;align-items:center;gap:10px;padding:9px 2px;font-weight:400!important;font-size:15px;border-bottom:1px dashed var(--border,#e5e9f0);cursor:pointer}" +
      ".pm-item span{flex:1;line-height:1.4}";
    document.head.appendChild(st);
  }
  function setOf(list) { var s = {}; (list || []).forEach(function (k) { s[k] = 1; }); return s; }

  /* محافظ الورشة (من الإعدادات) + إضافة محفظة عهدة جديدة للقائمة لو مش موجودة. */
  function settingsObj() { try { var raw = window.WFStorage && window.WFStorage.getItem("wf_s"); return raw ? (JSON.parse(raw) || {}) : {}; } catch (e) { return {}; } }
  function walletNames() { var w = settingsObj().wallets; return Array.isArray(w) ? w.map(function (x) { return String(x || "").trim(); }).filter(Boolean) : []; }
  function ensureWallet(name) {
    name = String(name || "").replace(/\s+/g, " ").trim(); if (!name) return;
    try {
      var o = settingsObj(), list = Array.isArray(o.wallets) ? o.wallets.slice() : [];
      if (list.map(function (x) { return String(x || "").trim(); }).indexOf(name) >= 0) return;
      list.push(name); o.wallets = list; window.WFStorage.setItem("wf_s", JSON.stringify(o));
    } catch (e) {}
  }
  /* حساب «أوامره المعيّنة فقط» بيشتغل ببياناته هو بس، فالسيرفر مش بيقبل منه غير شغل أوامره: دي الصلاحيات اللي بتشتغل فعلًا. */
  var SCOPED_OK = ["requests.view", "requests.edit", "requests.close", "customers.view", "devices.view", "route.view"];
  function scopedNote(perms) {
    var on = SCOPED_OK.filter(function (k) { return perms[k]; }).map(function (k) { return R.LABELS[k] || k; });
    return h("p", { class: "hint", style: "border-inline-start:4px solid #1d4ed8;padding:6px 10px;background:var(--bg-sunken,#eef2f8);border-radius:8px", text: "👷 بنطاق «الأوامر المعيّنة له فقط» الصلاحيات اللي بتشتغل فعلًا: " + (on.join("، ") || "ولا حاجة") + ". أي صلاحية تانية (إضافة/حذف، مخزن، محافظ، إعدادات) مالهاش أثر لأنه مش شايف بيانات الورشة. حساباته بتبقى في «عهدتي» ببوابة الفني." });
  }
  var SCOPE_LABEL = { all: "كل بيانات الورشة", assigned: "الأوامر المعيّنة له فقط (وعملاؤها وأجهزتها)" };

  /* ---------- قائمة المستخدمين ---------- */
  function userCard(u) {
    var badges = [h("span", { style: "padding:2px 10px;border-radius:999px;background:var(--bg-soft,#e8edf3);font-size:12px;font-weight:700;", text: roleName(u.role) })];
    if (u.disabled) badges.push(h("span", { style: "padding:2px 10px;border-radius:999px;background:var(--bg-soft,#e8edf3);font-size:12px;font-weight:700;background:#b3261e;color:#fff", text: "موقوف" }));
    if (u.legacy) badges.push(h("span", { style: "padding:2px 10px;border-radius:999px;background:var(--bg-soft,#e8edf3);font-size:12px;font-weight:700;", text: "حساب قديم = مالك" }));
    if (u.effectiveScope === "assigned") badges.push(h("span", { style: "padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;background:#1d4ed8;color:#fff", text: "👷 أوامره المعيّنة فقط" }));
    if (u.effectiveScope === "assigned" && !u.wallet) badges.push(h("span", { style: "padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;background:#b45309;color:#fff", text: "⚠️ مالوش محفظة عهدة" }));
    if (u.wallet) badges.push(h("span", { style: "padding:2px 10px;border-radius:999px;background:var(--bg-soft,#e8edf3);font-size:12px;font-weight:700;", text: "💼 " + u.wallet }));
    if (u.isSelf) badges.push(h("span", { style: "padding:2px 10px;border-radius:999px;background:var(--bg-soft,#e8edf3);font-size:12px;font-weight:700;", text: "أنت" }));
    var info = h("div", {}, [
      h("div", { style: "font-weight:700;font-size:16px", text: u.name || "(بدون اسم)" }),
      h("div", { dir: "ltr", style: "text-align:right;opacity:.8", text: u.email || u.uid }),
      h("div", { class: "hint", text: "آخر دخول: " + fmtDate(u.lastSignIn) }),
      h("div", { style: "display:flex;gap:6px;flex-wrap:wrap;margin-top:4px" }, badges)
    ]);
    var btns = h("div", { style: "display:flex;gap:6px;flex-wrap:wrap;margin-top:10px" });
    var edit = h("button", { type: "button", class: "secondary mini-action", text: state.editUid === u.uid ? "إغلاق" : "✏️ تعديل", on: { click: function () { state.editUid = state.editUid === u.uid ? null : u.uid; render(); } } });
    var reset = h("button", { type: "button", class: "secondary mini-action", text: "🔑 كلمة سر جديدة", on: { click: function (ev) { resetPassword(u, ev.currentTarget); } } });
    btns.appendChild(edit); btns.appendChild(reset);
    if (!u.isSelf) {
      btns.appendChild(h("button", { type: "button", class: "secondary mini-action" + (u.disabled ? "" : " danger-btn"), text: u.disabled ? "▶️ تفعيل" : "⏸️ إيقاف", on: { click: function (ev) { toggleDisabled(u, ev.currentTarget); } } }));
      btns.appendChild(h("button", { type: "button", class: "secondary mini-action danger-btn", text: "🗑️ حذف نهائي", on: { click: function (ev) { deleteUser(u, ev.currentTarget); } } }));
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
      var sc = scopeSel ? scopeSel.value : (u.scope || "");
      var effScope = sc || ((state.config.roles[roleSel.value] || {}).scope || "all");
      if (!locked && effScope === "assigned") holder.appendChild(scopedNote(current));
      holder.appendChild(matrix(eff, locked, function (k, on) { if (on) current[k] = 1; else delete current[k]; }));
      if (locked) holder.appendChild(h("p", { class: "hint", text: "المالك بكل الصلاحيات دايمًا." }));
    }
    var scopeSel = null;
    roleSel.addEventListener("change", function () { loadFor(roleSel.value, false); drawMatrix(); });
    drawMatrix();
    scopeSel = h("select", { "aria-label": "نطاق البيانات" }, [["", "يتبع نطاق الدور"], ["all", SCOPE_LABEL.all], ["assigned", SCOPE_LABEL.assigned]].map(function (p) { var o = h("option", { value: p[0], text: p[1] }); if ((u.scope || "") === p[0]) o.selected = true; return o; }));
    scopeSel.addEventListener("change", drawMatrix); drawMatrix();
    var dl = h("datalist", { id: "walletList_" + u.uid }, walletNames().map(function (n) { return h("option", { value: n }); }));
    var walletIn = h("input", { type: "text", value: u.wallet || "", maxlength: "40", list: "walletList_" + u.uid, placeholder: "مثال: عهدة أحمد", "aria-label": "محفظة العهدة" });
    var save = h("button", { type: "button", class: "primary", text: "💾 حفظ التعديل", on: { click: function () {
      var rid = roleSel.value, base = setOf(state.config.roles[rid] ? state.config.roles[rid].perms : []);
      var allow = [], deny = [];
      if (rid !== "owner") R.KEYS.forEach(function (k) { if (current[k] && !base[k]) allow.push(k); if (!current[k] && base[k]) deny.push(k); });
      var nw = String(walletIn.value || "").replace(/\s+/g, " ").trim(), ow = String(u.wallet || "").trim();
      if (ow && nw !== ow) { // تغيير محفظة العهدة: الرصيد القديم والأوامر المفتوحة بيفضلوا على المحفظة القديمة
        var ob = walletBal(ow), oo = openOrdersOf(u.uid).length;
        if ((ob || oo) && !window.confirm("محفظة " + (u.name || "") + " هتتغير من «" + ow + "» لـ «" + (nw || "بدون محفظة") + "».\n" + (ob ? "• فيها رصيد " + ob.toFixed(2) + " ج هيفضل في المحفظة القديمة — سوّيه الأول من «الفنيين والعهدة».\n" : "") + (oo ? "• معاه " + oo + " أمر مفتوح متسجل عليه المحفظة القديمة (هتتحدث لو عيّنتهم تاني).\n" : "") + "تكمل؟")) return;
      }
      busy(save, true);
      P.call("staffUpdate", { uid: u.uid, name: nameIn.value, role: rid, allow: allow, deny: deny, scope: scopeSel.value, wallet: walletIn.value }).then(function () { ensureWallet(walletIn.value); /* بعد ما السيرفر يقبل بس */ say("تم حفظ بيانات " + (nameIn.value || "المستخدم") + ".", false); state.editUid = null; return load(); }, function (e) { say(explain(e), true); }).then(function () { busy(save, false); });
    } } });
    return h("div", { style: "margin-top:10px;border-top:1px solid var(--border,#ddd);padding-top:10px" }, [
      h("label", {}, ["الاسم", nameIn]), h("label", {}, ["الدور", roleSel]),
      h("label", {}, ["نطاق البيانات لهذا الشخص", scopeSel]),
      h("label", {}, ["محفظة العهدة (اختياري)", walletIn]), dl,
      h("p", { class: "hint", text: "المحفظة دي بتتسجّل فيها تحصيلات وعربونات ومصروفات الفني. لو مش موجودة بتتضاف لمحافظ الورشة تلقائيًا." }),
      h("p", { class: "hint", text: "غيّر أي صلاحية هنا لو عايز استثناء للشخص ده بس (من غير ما تغيّر الدور كله)." }),
      holder, h("div", { class: "actions" }, [save])
    ]);
  }
  /* الصفحة دي مش محمّل فيها باقي النظام: بنقرا الأوامر والحركات من تخزين الجهاز مباشرة */
  function stored(k) { try { var v = JSON.parse(window.WFStorage.getItem(k) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function walletBal(w) { return Math.round(stored("wf_wallet_tx").reduce(function (a, x) { return a + (x && !x.deleted && String(x.wallet || "").trim() === w ? (x.type === "in" ? +x.amount || 0 : -(+x.amount || 0)) : 0); }, 0) * 100) / 100; }
  function openOrdersOf(uid) { try { return stored("wf_r").filter(function (r) { return r && r.techId === uid && !r.closed && !r.paid && r.status !== "ملغي"; }); } catch (e) { return []; } }
  /* حذف نهائي: حساب الدخول ومستند الموظف بيتمسحوا. شغله القديم (أوامر، حركات، عهدة) بيفضل في البيانات باسمه. */
  function deleteUser(u, btn) {
    var who = u.name || u.email || "", oo = openOrdersOf(u.uid).length, bal = u.wallet ? walletBal(String(u.wallet).trim()) : 0;
    var warn = (oo ? "\n⚠️ معاه " + oo + " أمر مفتوح — وزّعهم الأول من «توزيع الأوامر»." : "") + (bal ? "\n⚠️ محفظة عهدته «" + u.wallet + "» فيها " + bal.toFixed(2) + " ج — سوّيها الأول من «الفنيين والعهدة»." : "");
    if (!window.confirm("حذف «" + who + "» نهائيًا؟\n• مش هيقدر يدخل تاني بالإيميل ده (لو رجع لازم تعمله حساب جديد).\n• أوامره وحركاته القديمة هتفضل زي ما هي." + warn + "\n\nلو عايز توقفه مؤقتًا استخدم «⏸️ إيقاف» بدل الحذف.")) return;
    var typed = window.prompt("للتأكيد اكتب اسمه زي ما هو: " + who);
    if (typed === null) return;
    if (String(typed).trim() !== String(who).trim()) { say("الاسم مش مطابق — ماتمسحش حاجة.", true); return; }
    busy(btn, true);
    P.call("staffDelete", { uid: u.uid }).then(function () { say("تم حذف " + who + " نهائيًا.", false); state.editUid = null; return load(); }, function (e) { say(explain(e), true); }).then(function () { busy(btn, false); });
  }
  function toggleDisabled(u, btn) {
    var to = !u.disabled, oo = to ? openOrdersOf(u.uid).length : 0;
    if (!window.confirm(to ? "إيقاف " + (u.name || u.email) + "؟ هيتقفل عليه الدخول فورًا." + (oo ? "\n\n⚠️ معاه " + oo + " أمر مفتوح — وزّعهم على فني تاني من «توزيع الأوامر» عشان مايقفوش." : "") : "تفعيل " + (u.name || u.email) + " تاني؟")) return;
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
    var scope = h("select", {}, [["", "يتبع نطاق الدور"], ["all", SCOPE_LABEL.all], ["assigned", SCOPE_LABEL.assigned]].map(function (p) { return h("option", { value: p[0], text: p[1] }); }));
    var wallet = h("input", { type: "text", maxlength: "40", list: "walletList_new", placeholder: "مثال: عهدة أحمد (للفني)" });
    var wdl = h("datalist", { id: "walletList_new" }, walletNames().map(function (n) { return h("option", { value: n }); }));
    var add = h("button", { type: "button", class: "primary", text: "➕ إضافة المستخدم", on: { click: function () {
      var secret = pw.value;
      busy(add, true);
      var wv = wallet.value;
      P.call("staffCreate", { email: email.value, name: name.value, password: secret, role: role.value, scope: scope.value, wallet: wallet.value }).then(function (r) {
        if (String(wv || "").trim()) ensureWallet(wv); // بعد ما الحساب يتعمل (لو اترفض مثلًا «المحفظة متحددة لموظف تاني» ماتتضافش)
        showSecret("تم إنشاء حساب " + r.name + " — الإيميل: " + r.email, secret);
        email.value = ""; name.value = ""; pw.value = ""; wallet.value = ""; scope.value = ""; return load();
      }, function (e) { say(explain(e), true); }).then(function () { busy(add, false); });
    } } });
    return h("section", { class: "panel" }, [h("h2", { text: "➕ إضافة مستخدم" }), h("div", { class: "form-grid" }, [h("label", {}, ["الإيميل (للدخول)", email]), h("label", {}, ["الاسم", name]), h("label", {}, ["كلمة السر", h("div", { class: "select-add" }, [pw, gen])]), h("label", {}, ["الدور", role]), h("label", {}, ["نطاق البيانات", scope]), h("label", {}, ["محفظة العهدة (اختياري)", wallet]), wdl]), h("div", { class: "actions" }, [add]),
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
    var scopeSel = h("select", { "aria-label": "نطاق بيانات الدور", disabled: locked }, [["all", SCOPE_LABEL.all], ["assigned", SCOPE_LABEL.assigned]].map(function (p) { var o = h("option", { value: p[0], text: p[1] }); if ((role.scope || "all") === p[0]) o.selected = true; return o; }));
    scopeSel.addEventListener("change", function () { role.scope = scopeSel.value; render(); });
    var cur = setOf(role.perms);
    var mx = matrix(locked ? setOf(R.KEYS) : cur, locked, function (k, on) { if (on) cur[k] = 1; else delete cur[k]; role.perms = R.KEYS.filter(function (x) { return cur[x]; }); });
    var newName = h("input", { type: "text", maxlength: "40", placeholder: "اسم دور جديد (مثال: فني أول)" });
    var addRole = h("button", { type: "button", class: "secondary mini-action", text: "➕ دور جديد", on: { click: function () {
      var nm = newName.value.replace(/\s+/g, " ").trim(); if (!nm) return say("اكتب اسم الدور الأول.", true);
      var id = "r_" + Date.now().toString(36); d.roles[id] = { name: nm, perms: role.perms.slice(), scope: role.scope || "all" }; d.order.push(id); state.roleId = id; render();
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
      h("div", { class: "form-grid" }, [h("label", {}, ["الدور", sel]), h("label", {}, ["اسم الدور", nameIn]), h("label", {}, ["نطاق البيانات", scopeSel])]),
      h("p", { class: "hint", text: "«الأوامر المعيّنة له فقط»: الشخص ده هيشوف الأوامر اللي بتعيّنها له من «توزيع الأوامر» وعملاءها وأجهزتها، ومن غير باقي الورشة." }), (role.scope === "assigned" && !locked) ? scopedNote(cur) : null, mx,
      h("div", { class: "form-grid", style: "margin-top:8px" }, [h("label", {}, ["دور جديد (بينسخ صلاحيات الدور الحالي)", newName])]),
      h("div", { class: "actions", style: "gap:6px;flex-wrap:wrap" }, [addRole, del, save])]);
  }

  /* ---------- سجل المراجعة ---------- */
  var ACTION_AR = { create_user: "إضافة مستخدم", update_user: "تعديل مستخدم", reset_password: "كلمة سر جديدة", delete_user: "حذف مستخدم نهائيًا", save_roles: "حفظ الأدوار", migrate_legacy_owner: "ترقية حساب قديم لمالك" };
  function auditPanel() {
    var names = {}; state.users.forEach(function (u) { names[u.uid] = u.name || u.email || u.uid; });
    var rows = state.audit.map(function (a) { return h("li", { text: fmtDate(a.at) + " — " + (names[a.by] || a.by) + ": " + (ACTION_AR[a.action] || a.action) + (a.target ? " ← " + (names[a.target] || a.target) : "") }); });
    var det = h("details", {}, [h("summary", { text: "📜 آخر العمليات (سجل المراجعة)" }), state.auditLoaded ? (rows.length ? h("ul", { style: "padding-inline-start:18px" }, rows) : h("p", { class: "hint", text: "لسه مفيش عمليات مسجّلة." })) : h("p", { class: "hint", text: "⏳ جارٍ التحميل…" })]);
    // السجل بيتحمّل لما تفتحه بس (كان بيأخر فتح الصفحة كلها)
    det.addEventListener("toggle", function () { if (det.open && !state.auditLoaded) loadAudit().then(function () { var sec = $("usersAudit"); if (sec) { var n = auditPanel(); sec.parentNode.replaceChild(n, sec); n.querySelector("details").open = true; } }); });
    return h("section", { class: "panel", id: "usersAudit" }, [det]);
  }

  function render() {
    var root = $("usersRoot"); root.textContent = "";
    if (!state.config) return;
    if (state.stale) root.appendChild(h("p", { class: "hint", style: "margin:0 0 6px", text: "⏳ دي آخر نسخة محفوظة — بتتحدّث من السيرفر…" }));
    root.appendChild(h("h2", { text: "👤 المستخدمون (" + state.users.length + ")" }));
    state.users.forEach(function (u) { root.appendChild(userCard(u)); });
    root.appendChild(addPanel()); root.appendChild(rolesPanel()); root.appendChild(auditPanel());
  }
  function loadAudit() {
    try {
      return window.firebase.firestore().collection("staffAudit").orderBy("at", "desc").limit(40).get().then(function (s) { state.audit = s.docs.map(function (d) { return d.data(); }); state.auditLoaded = true; }, function () { state.audit = []; state.auditLoaded = true; });
    } catch (e) { state.audit = []; state.auditLoaded = true; return Promise.resolve(); }
  }
  /* آخر قايمة اتحمّلت بتتحفظ على جهاز المالك: الصفحة بتفتح بيها فورًا، والتحديث من السيرفر بيكمّل في الخلفية
     (دالة السيرفر ممكن تاخد ثواني لو كانت نايمة). */
  var CACHE = "wf_users_cache";
  function myUid() { try { return window.firebase.auth().currentUser.uid; } catch (e) { return ""; } }
  function fromCache() {
    try { var c = JSON.parse(window.WFStorage.getItem(CACHE) || "null"); if (!c || !c.config || c.uid !== myUid()) return false; state.users = c.users || []; state.config = R.normalizeConfig(c.config); state.draft = JSON.parse(JSON.stringify(state.config)); state.stale = true; render(); return true; } catch (e) { return false; }
  }
  function load() {
    var wasStale = state.stale;
    return P.call("staffList", {}).then(function (r) {
      state.users = r.users || []; state.config = R.normalizeConfig(r.config); state.stale = false;
      state.draft = JSON.parse(JSON.stringify(state.config)); state.auditLoaded = false;
      try { window.WFStorage.setItem(CACHE, JSON.stringify({ uid: myUid(), users: state.users, config: r.config, at: Date.now() })); } catch (e) {}
      if (state.editUid && wasStale) { var n = document.querySelector("#usersRoot > p.hint"); if (n) n.textContent = "✅ اتحدّثت من السيرفر"; return; } // ماتمسحش تعديل بتكتبه
      render();
    }, function (e) { if (!state.config) $("usersRoot").textContent = ""; state.stale = false; say(explain(e), true); });
  }

  function whenSignedIn(fn) {
    function go() {
      var done = false;
      window.firebase.auth().onAuthStateChanged(function (u) { if (u && !done) { done = true; fn(); } });
    }
    if (window.firebase && window.firebase.auth) go(); else window.addEventListener("load", function () { if (window.firebase && window.firebase.auth) go(); });
  }
  function boot() { fromCache(); load(); }
  Promise.resolve(window.WFStorageReady).then(function () { whenSignedIn(boot); }, function () { whenSignedIn(boot); });
  }
  waitForPerm();
})();
