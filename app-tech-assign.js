/* app-tech-assign.js — تعيين الفني على أمر الشغل (المرحلة أ من «الفنيين والعهدة»).
   - window.WFTech: directory() يجيب قائمة الفنيين من السيرفر (staffDirectory) مع نسخة محلية للأوفلاين، و assign(ids, uid) يعيّن الأوامر.
   - في request.html: يعرض لوحة «الفني المسؤول» فوق تفاصيل الأمر (للي عنده صلاحية requests.assign تعيين/تغيير، ولغيره عرض فقط).
   الحقول المتخزنة على الأمر: techId, techName, techWallet, assignedAt, assignedBy. الأمر المقفول لا يتغيّر فنّيه.
   مهم: ده تنظيم شغل. الحماية الفعلية (الفني ميشوفش غير أوامره) بتتفعّل في المرحلة ب على السيرفر. */
(function (w) {
  "use strict";
  if (w.WFTech) return;
  var K_DIR = "wf_tech_dir";
  function store() { return w.WFStorage || null; }
  function readDir() { try { var s = store(); var v = s && s.getItem(K_DIR); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function writeDir(list) { try { var s = store(); if (s) s.setItem(K_DIR, JSON.stringify(list)); } catch (e) {} }
  function canAssign() { return !!(w.WFPerm && w.WFPerm.can("requests.assign")); }

  var dirPromise = null, lastError = "";
  /* سبب فشل تحميل القائمة بالعربي (للتشخيص): الدالة مش منشورة، مفيش صلاحية، مفيش نت... */
  function explainDir(e) {
    var c = String((e && e.code) || ""), m = String((e && e.message) || "");
    if (c === "not-found" || (e && e.status === 404)) return "دالة «staffDirectory» مش منشورة على السيرفر (انشر الـ functions للمشروع ده)";
    if (c === "permission-denied" || /cannot_assign/.test(m)) return "حسابك مالوش صلاحية «تعيين فني على أمر الشغل»";
    if (c === "unauthenticated") return "سجّل الدخول تاني";
    if (c === "failed-precondition" || /not_staff/.test(m)) return "حسابك مش موظف مفعّل";
    return "تعذّر الاتصال بالسيرفر" + (c ? " (" + c + ")" : "");
  }
  /* Firebase بيرجّع جلسة الدخول بعد تحميل الصفحة بشوية: نستنى المستخدم (حد أقصى 10 ثواني) قبل أي نداء للسيرفر. */
  function waitAuth() {
    return new Promise(function (resolve) {
      try {
        var au = w.firebase.auth();
        if (au.currentUser) return resolve();
        var done = false, off = au.onAuthStateChanged(function (u) { if (u && !done) { done = true; try { off(); } catch (e) {} resolve(); } });
        setTimeout(function () { if (!done) { done = true; try { off(); } catch (e) {} resolve(); } }, 10000);
      } catch (e) { resolve(); }
    });
  }
  function directory(force) {
    if (dirPromise && !force) return dirPromise;
    var p = new Promise(function (resolve) {
      var cached = readDir() || [];
      lastError = "";
      if (!w.WFPerm || (w.navigator && w.navigator.onLine === false)) { if (!cached.length) lastError = "مفيش نت ومفيش قائمة محفوظة"; return resolve(cached); }
      waitAuth().then(function () { return w.WFPerm.call("staffDirectory", {}); }).then(function (r) {
        var users = (r && Array.isArray(r.users)) ? r.users : cached;
        if (r && Array.isArray(r.users)) writeDir(users);
        resolve(users);
      }, function (e) { lastError = explainDir(e); resolve(cached); });
    });
    dirPromise = p;
    p.then(function (u) { if (!u || !u.length) dirPromise = null; }); // القائمة الفاضية ماتتكاشّش: المحاولة الجاية تعيد الطلب
    return p;
  }
  function techFor(users, uid) { for (var i = 0; i < users.length; i++) if (users[i].uid === uid) return users[i]; return null; }
  function myUid() { try { return w.firebase.auth().currentUser.uid; } catch (e) { return ""; } }

  /* يعيّن (أو يشيل لو uid فاضي) فني على مجموعة أوامر. بيرجع {done, skipped}. */
  async function assign(ids, uid) {
    if (!canAssign()) throw new Error("not_allowed");
    if (typeof w.updateRequestRecordAsync !== "function") throw new Error("not_ready");
    var users = await directory(), tech = uid ? techFor(users, uid) : null;
    if (uid && !tech) throw new Error("no_such_tech");
    var done = 0, skipped = 0, by = myUid(), when = new Date().toISOString();
    for (var i = 0; i < ids.length; i++) {
      var ok = await w.updateRequestRecordAsync(ids[i], function (_, r) {
        if (r.closed || r.paid) return false;
        if (uid) { r.techId = uid; r.techName = tech.name || ""; r.techWallet = tech.wallet || ""; r.assignedAt = when; r.assignedBy = by; }
        else { r.techId = ""; r.techName = ""; r.techWallet = ""; r.assignedAt = ""; r.assignedBy = by; }
        return true;
      });
      if (ok) done++; else skipped++;
    }
    return { done: done, skipped: skipped };
  }
  w.WFTech = { directory: directory, assign: assign, canAssign: canAssign, lastError: function () { return lastError; } };

  /* ---------- لوحة request.html ---------- */
  var path = (w.location && w.location.pathname) || "";
  if (!/request\.html$/i.test(path)) return;
  var doc = w.document;
  function mk(tag, css, text) { var e = doc.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }
  var rendering = false;
  function currentRequest() {
    try { var id = new URLSearchParams(w.location.search).get("id"); return (w.arr(w.K.r) || []).find(function (x) { return String(x.id) === String(id); }) || null; } catch (e) { return null; }
  }
  async function render() {
    if (rendering) return; rendering = true;
    try {
      var host = doc.getElementById("requestProfile"); if (!host || !host.parentNode) return;
      var r = currentRequest(); if (!r) return;
      var box = doc.getElementById("wfTechAssign");
      if (!box) { box = mk("section", "margin:10px 0;padding:12px;border-radius:12px;border:1px solid var(--border,#d5dbe8);background:var(--bg-sunken,#f3f6fb)"); box.id = "wfTechAssign"; host.parentNode.insertBefore(box, host); }
      while (box.firstChild) box.removeChild(box.firstChild);
      box.appendChild(mk("b", "", "👷 الفني المسؤول"));
      var cur = mk("div", "margin-top:4px", r.techName ? r.techName : "لم يُعيَّن فني بعد");
      box.appendChild(cur);
      if (!canAssign() || r.closed || r.paid) {
        if (r.closed || r.paid) box.appendChild(mk("div", "font-size:13px;opacity:.7;margin-top:4px", "الأمر مقفول: لا يمكن تغيير الفني."));
        if (!canAssign() && !r.techName) box.style.display = "none"; else box.style.display = "";
        return;
      }
      var users = await directory();
      var sel = mk("select", "margin-top:8px;width:100%;box-sizing:border-box;padding:9px;border-radius:10px");
      var o0 = mk("option", "", "— بدون فني —"); o0.value = ""; sel.appendChild(o0);
      users.forEach(function (u) { var o = mk("option", "", (u.name || u.uid) + (u.roleName ? " — " + u.roleName : "") + (u.scope === "assigned" ? " (مقيّد بأوامره)" : "")); o.value = u.uid; if (u.uid === r.techId) o.selected = true; sel.appendChild(o); });
      var btn = mk("button", "margin-top:8px", "💾 حفظ التعيين"); btn.type = "button"; btn.className = "primary small-btn";
      var msg = mk("div", "margin-top:6px;font-size:13px", "");
      btn.onclick = async function () {
        btn.disabled = true; msg.textContent = "";
        try { var res = await assign([r.id], sel.value); msg.textContent = res.done ? "✅ تم التعيين." : "الأمر مقفول أو مش موجود."; if (typeof w.requestProfile === "function") await w.requestProfile(); }
        catch (e) { msg.textContent = "تعذّر التعيين: " + (e && e.message === "no_such_tech" ? "الفني مش موجود" : "جرّب تاني"); }
        btn.disabled = false; rendering = false; render();
      };
      box.appendChild(sel); box.appendChild(btn); box.appendChild(msg);
      if (!users.length) box.appendChild(mk("div", "font-size:13px;opacity:.75;margin-top:6px", "مفيش قائمة فنيين متحمّلة (محتاج نت مرة واحدة)."));
    } finally { rendering = false; }
  }
  function boot() {
    var tries = 0;
    (function wait() {
      var host = doc.getElementById("requestProfile");
      if (host && host.firstChild && typeof w.arr === "function" && w.K && w.WFPerm) { render(); try { new w.MutationObserver(function () { if (!doc.getElementById("wfTechAssign") && !rendering) render(); }).observe(host.parentNode, { childList: true }); } catch (e) {} return; }
      if (++tries < 200) setTimeout(wait, 100);
    })();
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot); else boot();
})(window);
