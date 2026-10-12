/* dispatch-page.js — «توزيع الأوامر على الفنيين» (dispatch.html). لمن عنده صلاحية requests.assign.
   بيعرض الأوامر المفتوحة، تختار منها وتعيّنها لفني دفعة واحدة. كل النصوص بتتحط بـtextContent (مفيش innerHTML). */
(function () {
  "use strict";
  var waited = 0;
  function ready() { return window.WFPerm && window.WFTech && typeof window.arr === "function" && window.K && typeof window.updateRequestRecordAsync === "function"; }
  function wait() {
    if (ready()) return start();
    if ((waited += 80) > 20000) { var m = document.getElementById("dispatchRoot"); if (m) m.textContent = "تعذّر تحميل الصفحة. حدّث وجرّب تاني."; return; }
    setTimeout(wait, 80);
  }
  function start() {
    var root = document.getElementById("dispatchRoot"), msgBox = document.getElementById("dispatchMsg");
    var state = { users: [], filter: "unassigned", q: "", sel: {}, limit: 60 }, qT = null;
    function mk(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }
    function say(t, bad) { msgBox.textContent = ""; if (!t) return; var p = mk("p", "padding:8px 10px;border-radius:10px;margin:8px 0;background:" + (bad ? "#fde2e2;color:#8a1c1c" : "#dff5e3;color:#14532d"), t); msgBox.appendChild(p); }
    function A(k) { try { return window.arr(k) || []; } catch (e) { return []; } }
    function devLabel(d) { return d ? [d.type, d.brand, d.model].filter(Boolean).join(" ") : ""; }
    function rows() {
      var cs = {}, ds = {};
      A(window.K.c).forEach(function (c) { cs[c.id] = c; }); A(window.K.d).forEach(function (d) { ds[d.id] = d; });
      var q = state.q.trim().toLowerCase();
      return A(window.K.r).filter(function (r) { return r && !r.closed && !r.paid && r.status !== "ملغي"; }).map(function (r) {
        var c = cs[r.customerId] || {}, d = ds[r.deviceId];
        return { r: r, cname: c.name || "عميل محذوف", phone: c.phone || "", dev: devLabel(d) };
      }).filter(function (x) {
        if (state.filter === "unassigned" && x.r.techId) return false;
        if (state.filter !== "all" && state.filter !== "unassigned" && x.r.techId !== state.filter) return false;
        if (q && (x.cname + " " + x.phone + " " + x.dev + " " + (x.r.no || "") + " " + (x.r.fault || "")).toLowerCase().indexOf(q) < 0) return false;
        return true;
      }).sort(function (a, b) { return String(b.r.createdAt || b.r.no || "").localeCompare(String(a.r.createdAt || a.r.no || "")); });
    }
    function selCount() { return Object.keys(state.sel).filter(function (k) { return state.sel[k]; }).length; }
    function draw() {
      while (root.firstChild) root.removeChild(root.firstChild);
      var bar = mk("div", "display:flex;gap:8px;flex-wrap:wrap;margin:8px 0");
      var f = mk("select", "flex:1;min-width:140px;padding:9px;border-radius:10px");
      [["unassigned", "غير معيّنة"], ["all", "كل المفتوحة"]].concat(state.users.map(function (u) { return [u.uid, "أوامر: " + (u.name || u.uid)]; })).forEach(function (p) { var o = mk("option", "", p[1]); o.value = p[0]; if (p[0] === state.filter) o.selected = true; f.appendChild(o); });
      f.onchange = function () { state.filter = f.value; state.limit = 60; draw(); };
      var q = mk("input", "flex:2;min-width:140px;padding:9px;border-radius:10px"); q.type = "search"; q.placeholder = "🔍 بحث (عميل، موبايل، جهاز، رقم أمر)"; q.value = state.q;
      q.oninput = function () { state.q = q.value; clearTimeout(qT); qT = setTimeout(function () { state.limit = 60; var pos = q.selectionStart; draw(); var n = root.querySelector("input[type=search]"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } }, 220); };
      bar.appendChild(f); bar.appendChild(q); root.appendChild(bar);
      var list = rows();
      root.appendChild(mk("div", "font-size:13px;opacity:.75;margin-bottom:6px", list.length + " أمر"));
      var all = mk("button", "margin-bottom:8px", "تحديد الكل / إلغاء الكل"); all.type = "button"; all.className = "secondary mini-action";
      all.onclick = function () { var every = list.length && list.every(function (x) { return state.sel[x.r.id]; }); list.forEach(function (x) { state.sel[x.r.id] = !every; }); draw(); };
      root.appendChild(all);
      // آلاف الأوامر المفتوحة كانت بتترسم مرة واحدة (والصفحة بتتقل). بنعرض أول 60 و«عرض المزيد».
      list.slice(0, state.limit).forEach(function (x) {
        var card = mk("label", "display:flex;gap:10px;align-items:flex-start;padding:10px;margin-bottom:8px;border-radius:12px;border:1px solid var(--border,#d5dbe8);background:var(--bg-elevated,#fff);cursor:pointer");
        var cb = mk("input", "margin-top:4px;width:20px;height:20px;flex:none"); cb.type = "checkbox"; cb.checked = !!state.sel[x.r.id]; cb.onchange = function () { state.sel[x.r.id] = cb.checked; refreshBar(); };
        var body = mk("div", "flex:1;min-width:0");
        body.appendChild(mk("b", "", "#" + (x.r.no || "") + " — " + x.cname + (x.phone ? " (" + x.phone + ")" : "")));
        if (x.dev) body.appendChild(mk("div", "font-size:14px", "🔧 " + x.dev));
        if (x.r.fault) body.appendChild(mk("div", "font-size:13px;opacity:.8", String(x.r.fault).slice(0, 90)));
        body.appendChild(mk("div", "font-size:13px;margin-top:2px;" + (x.r.techId ? "color:#1d4ed8" : "color:#b45309"), x.r.techId ? "👷 " + (x.r.techName || "فني") : "بدون فني"));
        card.appendChild(cb); card.appendChild(body); root.appendChild(card);
      });
      if (list.length > state.limit) { var more = mk("button", "width:100%;margin:4px 0 8px", "عرض المزيد (" + (list.length - state.limit) + " أمر كمان)"); more.type = "button"; more.className = "secondary"; more.onclick = function () { state.limit += 100; draw(); }; root.appendChild(more); }
      if (!list.length) root.appendChild(mk("p", "opacity:.7", "مفيش أوامر بالفلتر ده."));
      // شريط التعيين (لاصق أسفل الشاشة)
      var foot = mk("div", "position:sticky;bottom:70px;z-index:5;display:flex;gap:8px;flex-wrap:wrap;padding:10px;border-radius:12px;background:#0b2a66;color:#fff;margin-top:10px");
      var who = mk("select", "flex:1;min-width:150px;padding:9px;border-radius:10px"); who.id = "dispatchWho";
      var o0 = mk("option", "", "— اختار الفني —"); o0.value = "__none__"; who.appendChild(o0);
      var o1 = mk("option", "", "إلغاء التعيين (بدون فني)"); o1.value = ""; who.appendChild(o1);
      state.users.forEach(function (u) { var o = mk("option", "", (u.name || u.uid) + (u.scope === "assigned" ? " (مقيّد بأوامره)" : "")); o.value = u.uid; who.appendChild(o); });
      var go = mk("button", "", ""); go.type = "button"; go.id = "dispatchGo"; go.className = "primary small-btn";
      go.onclick = async function () {
        var ids = Object.keys(state.sel).filter(function (k) { return state.sel[k]; });
        if (!ids.length) return say("اختار أمر واحد على الأقل.", true);
        if (who.value === "__none__") return say("اختار الفني الأول.", true);
        go.disabled = true; say("");
        try {
          var res = await window.WFTech.assign(ids, who.value);
          state.sel = {}; say("✅ اتعيّن " + res.done + " أمر" + (res.skipped ? " (وتخطّيت " + res.skipped + " مقفول)" : "") + ".");
        } catch (e) { say("تعذّر التعيين: " + (e && e.message === "not_allowed" ? "مفيش صلاحية" : "جرّب تاني"), true); }
        draw();
      };
      foot.appendChild(who); foot.appendChild(go); root.appendChild(foot);
      refreshBar();
    }
    function refreshBar() { var g = document.getElementById("dispatchGo"); if (g) g.textContent = "👷 عيّن المحدد (" + selCount() + ")"; }
    root.textContent = "جارٍ التحميل…";
    window.WFTech.directory().then(function (u) { state.users = u || []; if (!state.users.length) say("مفيش قائمة فنيين متحمّلة — " + (window.WFTech.lastError() || "افتح الصفحة مع النت مرة واحدة") + ".", true); draw(); });
    try { window.WFPerm.onChange(function () { if (!window.WFPerm.can("requests.assign")) root.textContent = "🔒 مفيش صلاحية تعيين الفنيين."; }); } catch (e) {}
  }
  wait();
})();
