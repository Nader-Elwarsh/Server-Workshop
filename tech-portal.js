/* tech-portal.js — «بوابة الفني» (tech.html): شاشة مستقلة للفني بتتوصل بأوامره المعيّنة بس.
   - اليوم: زيارات النهارده والمتأخرة والجاية (من حقل «الموعد» على الأمر) + أوامر بدون موعد.
   - أوامري: كل الأوامر المفتوحة المعيّنة ليه. فتح أمر: العميل (اتصال/خريطة)، الجهاز، العطل، الموعد، الحالة،
     الشغل والأجرة، القطع (إضافة يدوية فقط: مفيش تصفح للمخزن)، وقفل الأمر (المحفظة الافتراضية = محفظة عهدته).
   - عهدتي: الرصيد والحركات (بتتنشر من جهاز الإدارة)، وتسجيل مصروف «معلّق» لحد ما الإدارة تعتمده.
   مفيش طباعة ولا إرسال رسائل ولا حذف. كل النصوص بتتحط بـ textContent. */
(function () {
  "use strict";
  var waited = 0;
  function ready() { return window.WFPerm && window.firebase && typeof window.arr === "function" && window.K && typeof window.updateRequestRecordAsync === "function" && typeof window.settings === "function"; }
  function wait() {
    if (ready()) return start();
    if ((waited += 80) > 20000) { var m = document.getElementById("techRoot"); if (m) m.textContent = "تعذّر تحميل الصفحة. حدّث وجرّب تاني."; return; }
    setTimeout(wait, 80);
  }

  function start() {
    var root = document.getElementById("techRoot"), msgBox = document.getElementById("techMsg");
    var qs = new URLSearchParams(location.search);
    var state = { tab: qs.get("tab") || "today", id: qs.get("id") || "", acct: null, acctErr: "", exps: [] };
    var lastRaw = "";

    /* ---------- أدوات ---------- */
    function mk(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }
    function btn(label, css, fn) { var b = mk("button", css || "", label); b.type = "button"; if (fn) b.onclick = fn; return b; }
    function say(t, bad) { msgBox.textContent = ""; if (!t) return; msgBox.appendChild(mk("p", "padding:8px 10px;border-radius:10px;margin:8px 0;background:" + (bad ? "#fde2e2;color:#8a1c1c" : "#dff5e3;color:#14532d"), t)); }
    function A(k) { try { return window.arr(k) || []; } catch (e) { return []; } }
    function money(n) { return (Math.round((+n || 0) * 100) / 100).toLocaleString("ar-EG") + " ج"; }
    function uid() { try { return window.firebase.auth().currentUser.uid; } catch (e) { return ""; } }
    function me() { var p = window.WFPerm.profile && window.WFPerm.profile(); return (p && p.name) || ""; }
    function fsdb() { return window.firebase.firestore(); }
    var CARD = "padding:12px;margin:0 0 10px;border-radius:14px;border:1px solid var(--border,#d5dbe8);background:var(--bg-card,#fff)";
    var CHIP = "display:inline-block;padding:2px 9px;border-radius:99px;font-size:12px;background:#e8eefc;color:#1d3a8a;margin-inline-start:6px";
    var BTN = "padding:9px 14px;border-radius:10px;border:0;background:#0b57d0;color:#fff;font-weight:700;font-size:15px";
    var BTN2 = "padding:9px 14px;border-radius:10px;border:1px solid #9aa7c2;background:transparent;color:inherit;font-size:15px";
    var INP = "width:100%;box-sizing:border-box;padding:9px;border-radius:10px;border:1px solid #9aa7c2;font-size:16px";

    function isMine(r) { return window.wfSyncMode === "scoped" || r.techId === uid(); }
    function openOrders() { return A(window.K.r).filter(function (r) { return r && !r.closed && !r.paid && r.status !== "ملغي" && isMine(r); }); }
    function custOf(r) { var c = A(window.K.c).filter(function (x) { return x.id === r.customerId; })[0]; return c || {}; }
    function devOf(r) { var d = A(window.K.d).filter(function (x) { return x.id === r.deviceId; })[0]; return d || null; }
    function devLabel(d) { return d ? [d.type, d.brand, d.model].filter(Boolean).join(" ") : ""; }
    function addrOf(c, r) {
      var a = (r && r.addressKey === "extra" ? c.extraAddress : c.mainAddress) || c.mainAddress || {};
      return [a.center, a.village, a.address, a.street].filter(Boolean).join(" - ");
    }
    function dayOf(v) { try { return window.dayKeyLocal(v); } catch (e) { return ""; } }
    function timeOf(v) { var d = new Date(v); return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }); }
    function dateLabel(v) { var d = new Date(v); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" }); }
    function toInputValue(v) { // datetime-local = YYYY-MM-DDTHH:mm
      var d = new Date(v); if (isNaN(d.getTime())) return "";
      var p = function (n) { return String(n).padStart(2, "0"); };
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
    }
    function go(params) { var u = new URL(location.href); u.search = ""; Object.keys(params).forEach(function (k) { if (params[k]) u.searchParams.set(k, params[k]); }); location.href = u.href; }
    function myWallet() {
      var w = window.WFPerm.wallet && window.WFPerm.wallet();
      if (w) return w;
      var o = A(window.K.r).filter(function (r) { return r.techWallet; })[0];
      return o ? o.techWallet : "";
    }

    /* ---------- شريط الحالة والتنقل ---------- */
    function topBar() {
      var box = mk("div", CARD + ";display:flex;gap:8px;align-items:center;flex-wrap:wrap");
      var info = (window.wfSyncInfo && window.wfSyncInfo()) || {};
      var line = mk("div", "flex:1;min-width:150px");
      line.appendChild(mk("b", "", "👷 " + (me() || "الفني")));
      line.appendChild(mk("div", "font-size:12px;opacity:.75", new Date().toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })));
      var st = mk("div", "font-size:12px;margin-top:2px");
      if (info.error) { st.textContent = "🔴 " + info.error; st.style.color = "#b91c1c"; }
      else if (info.conflicts) { st.textContent = "🟠 فيه تعارض مزامنة"; st.style.color = "#b45309"; }
      else if (info.pending) { st.textContent = "🟠 " + info.pending + " تعديل لسه ما اترفعش"; st.style.color = "#b45309"; }
      else if (info.online === false) { st.textContent = "📴 أوفلاين — محفوظ على الجهاز"; }
      else { st.textContent = "🟢 متزامن"; st.style.color = "#15803d"; }
      line.appendChild(st);
      var sync = btn("🔄 مزامنة", BTN2, function () {
        sync.disabled = true; sync.textContent = "جارٍ…";
        Promise.resolve(window.wfCloudSyncNow ? window.wfCloudSyncNow() : null).catch(function () {}).then(function () { sync.disabled = false; sync.textContent = "🔄 مزامنة"; draw(); loadAccount(); });
      });
      box.appendChild(line); box.appendChild(sync);
      return box;
    }
    function tabs() {
      var bar = mk("div", "display:flex;gap:8px;margin:0 0 10px");
      [["today", "📅 اليوم"], ["orders", "🛠️ أوامري"], ["account", "💼 عهدتي"]].forEach(function (t) {
        var on = state.tab === t[0] && !state.id;
        bar.appendChild(btn(t[1], "flex:1;padding:11px 6px;border-radius:12px;font-weight:700;font-size:15px;border:1px solid #0b57d0;" + (on ? "background:#0b57d0;color:#fff" : "background:transparent;color:inherit"), function () { go({ tab: t[0] }); }));
      });
      return bar;
    }

    /* ---------- كروت الأوامر ---------- */
    function orderCard(r) {
      var c = custOf(r), d = devOf(r), addr = addrOf(c, r);
      var card = mk("div", CARD + ";cursor:pointer");
      card.onclick = function () { go({ id: r.id, tab: state.tab }); };
      var head = mk("div", "display:flex;justify-content:space-between;gap:8px;align-items:baseline");
      head.appendChild(mk("b", "", "#" + (r.no || "") + " — " + (c.name || "عميل")));
      head.appendChild(mk("span", "font-size:13px;white-space:nowrap;" + (r.visit ? "color:#1d4ed8;font-weight:700" : "color:#b45309"), r.visit ? timeOf(r.visit) : "بدون موعد"));
      card.appendChild(head);
      if (devLabel(d)) card.appendChild(mk("div", "font-size:14px", "🔧 " + devLabel(d)));
      if (r.fault) card.appendChild(mk("div", "font-size:13px;opacity:.85", "📝 " + String(r.fault).slice(0, 100)));
      if (addr) card.appendChild(mk("div", "font-size:13px;opacity:.85", "📍 " + addr));
      var foot = mk("div", "display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center");
      foot.appendChild(mk("span", CHIP, r.status || "جديد"));
      if (c.phone) { var a = mk("a", BTN2 + ";text-decoration:none", "📞 اتصال"); a.href = "tel:" + c.phone; a.onclick = function (e) { e.stopPropagation(); }; foot.appendChild(a); }
      if (addr) { var m = mk("a", BTN2 + ";text-decoration:none", "🗺️ الخريطة"); m.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr); m.target = "_blank"; m.rel = "noopener"; m.onclick = function (e) { e.stopPropagation(); }; foot.appendChild(m); }
      card.appendChild(foot);
      return card;
    }
    function section(title, list, color) {
      if (!list.length) return null;
      var s = mk("div", "margin-bottom:6px");
      s.appendChild(mk("h3", "margin:12px 0 6px;" + (color ? "color:" + color : ""), title + " (" + list.length + ")"));
      list.forEach(function (r) { s.appendChild(orderCard(r)); });
      return s;
    }
    function byVisit(a, b) { return String(a.visit || "").localeCompare(String(b.visit || "")); }

    function drawToday() {
      var box = mk("div"), all = openOrders(), today = dayOf(new Date());
      var overdue = all.filter(function (r) { return r.visit && dayOf(r.visit) < today && r.status !== "مجمد"; }).sort(byVisit);
      var now = all.filter(function (r) { return r.visit && dayOf(r.visit) === today; }).sort(byVisit);
      var soon = all.filter(function (r) { var k = r.visit ? dayOf(r.visit) : ""; return k > today; }).sort(byVisit);
      var none = all.filter(function (r) { return !r.visit; });
      var sum = mk("div", "display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px");
      [["اليوم", now.length, "#1d4ed8"], ["متأخر", overdue.length, "#b91c1c"], ["قادم", soon.length, "#15803d"], ["بدون موعد", none.length, "#b45309"]].forEach(function (x) {
        var t = mk("div", "text-align:center;padding:10px 4px;border-radius:12px;border:1px solid var(--border,#d5dbe8)");
        t.appendChild(mk("div", "font-size:22px;font-weight:800;color:" + x[2], String(x[1]))); t.appendChild(mk("div", "font-size:12px", x[0])); sum.appendChild(t);
      });
      box.appendChild(sum);
      [section("⚠️ متأخرة عن موعدها", overdue, "#b91c1c"), section("📅 النهارده", now), section("⏭️ قادمة", soon), section("🕓 بدون موعد — حدّد موعدها", none, "#b45309")].forEach(function (s) { if (s) box.appendChild(s); });
      if (!all.length) box.appendChild(mk("p", "opacity:.7;text-align:center;padding:24px 0", "مفيش أوامر معيّنة ليك حاليًا. 🎉"));
      return box;
    }
    function drawOrders() {
      var box = mk("div"), all = openOrders().sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); });
      var q = mk("input", INP + ";margin-bottom:10px"); q.type = "search"; q.placeholder = "🔍 بحث (عميل، موبايل، جهاز، رقم أمر)";
      var list = mk("div"); box.appendChild(q); box.appendChild(list);
      function paint() {
        while (list.firstChild) list.removeChild(list.firstChild);
        var t = q.value.trim().toLowerCase();
        var rows = all.filter(function (r) { var c = custOf(r); return !t || ((c.name || "") + " " + (c.phone || "") + " " + devLabel(devOf(r)) + " " + (r.no || "") + " " + (r.fault || "")).toLowerCase().indexOf(t) > -1; });
        rows.forEach(function (r) { list.appendChild(orderCard(r)); });
        if (!rows.length) list.appendChild(mk("p", "opacity:.7;text-align:center", "مفيش أوامر."));
      }
      q.oninput = paint; paint();
      return box;
    }

    /* ---------- تفاصيل أمر ---------- */
    function recompute(r) {
      var pt = (r.parts || []).reduce(function (a, p) { return a + (+p.qty || 0) * (+p.sell || 0); }, 0);
      var pc = (r.parts || []).reduce(function (a, p) { return a + (+p.qty || 0) * (+p.cost || 0); }, 0);
      r.partsTotal = Math.round(pt * 100) / 100; r.partsCost = Math.round(pc * 100) / 100;
      r.total = Math.round(((+r.labor || 0) + r.partsTotal) * 100) / 100;
      r.remain = Math.max(0, Math.round((r.total - (+r.deposit || 0)) * 100) / 100);
    }
    function mutate(id, fn, failMsg) {
      return window.updateRequestRecordAsync(id, function (_, r) { if (r.closed || r.paid) return false; fn(r); return true; }).then(function (ok) {
        if (!ok) say(failMsg || "تعذّر الحفظ — الأمر ممكن يكون اتقفل.", true);
        return ok;
      });
    }
    function remainOf(r) { return Math.max(0, Math.round(((+r.total || 0) - (+r.deposit || 0)) * 100) / 100); }
    function kv(label, value) { var d = mk("div", "display:flex;gap:8px;margin:3px 0"); d.appendChild(mk("b", "min-width:90px", label)); d.appendChild(mk("span", "flex:1;word-break:break-word", value)); return d; }

    function drawOrder() {
      var r = A(window.K.r).filter(function (x) { return String(x.id) === state.id && isMine(x); })[0];
      var box = mk("div");
      box.appendChild(btn("← رجوع للقائمة", BTN2 + ";margin-bottom:10px", function () { go({ tab: state.tab }); }));
      if (!r) { box.appendChild(mk("p", "padding:20px;text-align:center", "الأمر مش موجود عندك (ممكن يكون اتقفل أو اتنقل لفني تاني).")); return box; }
      var c = custOf(r), d = devOf(r), addr = addrOf(c, r), locked = !!(r.closed || r.paid);

      var h = mk("div", CARD);
      var t = mk("div", "display:flex;justify-content:space-between;gap:8px;align-items:center");
      t.appendChild(mk("b", "font-size:18px", "🛠️ " + (r.no || "")));
      t.appendChild(mk("span", CHIP, locked ? "مقفول 🔒" : (r.status || "جديد")));
      h.appendChild(t);
      if (locked) h.appendChild(mk("p", "margin:8px 0 0;color:#15803d;font-weight:700", "✅ الأمر اتقفل. هيختفي من حسابك بعد المزامنة وتفضل حركته في عهدتك."));
      box.appendChild(h);

      var cc = mk("div", CARD);
      cc.appendChild(mk("h3", "margin:0 0 6px", "👤 العميل"));
      cc.appendChild(kv("الاسم", c.name || "—"));
      [c.phone, c.phone2].filter(Boolean).forEach(function (p, i) {
        var row = mk("div", "display:flex;gap:8px;align-items:center;margin:3px 0"); row.appendChild(mk("b", "min-width:90px", i ? "موبايل ٢" : "الموبايل"));
        row.appendChild(mk("span", "flex:1;direction:ltr;text-align:right", p));
        var a = mk("a", BTN + ";text-decoration:none;padding:6px 12px", "📞 اتصال"); a.href = "tel:" + p; row.appendChild(a); cc.appendChild(row);
      });
      if (addr) {
        var row2 = mk("div", "display:flex;gap:8px;align-items:center;margin:3px 0"); row2.appendChild(mk("b", "min-width:90px", "العنوان")); row2.appendChild(mk("span", "flex:1", addr));
        var m = mk("a", BTN2 + ";text-decoration:none;padding:6px 12px", "🗺️"); m.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr); m.target = "_blank"; m.rel = "noopener"; row2.appendChild(m); cc.appendChild(row2);
      }
      if (c.notes) cc.appendChild(kv("ملاحظات", c.notes));
      box.appendChild(cc);

      var dc = mk("div", CARD);
      dc.appendChild(mk("h3", "margin:0 0 6px", "🔧 الجهاز والعطل"));
      dc.appendChild(kv("الجهاز", devLabel(d) || "—"));
      if (d && (d.desc || d.notes)) dc.appendChild(kv("وصف", d.desc || d.notes));
      dc.appendChild(kv("العطل", r.fault || "—"));
      if (r.customerNote) dc.appendChild(kv("ملاحظة العميل", r.customerNote));
      box.appendChild(dc);

      if (!locked) {
        // الموعد
        var sc = mk("div", CARD); sc.appendChild(mk("h3", "margin:0 0 6px", "📅 الموعد" + (r.visit ? " — " + dateLabel(r.visit) + " " + timeOf(r.visit) : " (غير محدد)")));
        var inp = mk("input", INP); inp.type = "datetime-local"; inp.value = toInputValue(r.visit);
        var row3 = mk("div", "display:flex;gap:8px;margin-top:8px;flex-wrap:wrap");
        row3.appendChild(btn("حفظ الموعد", BTN, function () {
          if (!inp.value) return say("اختار التاريخ والوقت الأول.", true);
          mutate(r.id, function (x) { x.visit = inp.value; }).then(function (ok) { if (ok) { say("✅ اتحفظ الموعد وهيظهر للإدارة بعد المزامنة."); draw(); } });
        }));
        row3.appendChild(btn("مسح الموعد", BTN2, function () { mutate(r.id, function (x) { x.visit = ""; }).then(function (ok) { if (ok) draw(); }); }));
        sc.appendChild(inp); sc.appendChild(row3); box.appendChild(sc);

        // الحالة
        var stc = mk("div", CARD); stc.appendChild(mk("h3", "margin:0 0 6px", "🚦 الحالة"));
        var sel = mk("select", INP);
        var opts = (typeof window.nextStatusOptions === "function" ? window.nextStatusOptions(r.status || "جديد") : [r.status]).filter(function (s) { return s !== "ملغي"; });
        opts.forEach(function (s) { var o = mk("option", "", s); o.value = s; if (s === r.status) o.selected = true; sel.appendChild(o); });
        sel.onchange = function () { Promise.resolve(window.changeRequestStatus(r.id, sel.value)).then(function () { draw(); }); };
        stc.appendChild(sel); box.appendChild(stc);

        // الشغل والأجرة
        var wc = mk("div", CARD); wc.appendChild(mk("h3", "margin:0 0 6px", "🧰 الشغل المنفّذ"));
        var work = mk("textarea", INP + ";min-height:80px"); work.value = r.work || ""; work.placeholder = "اكتب اللي اتعمل في الجهاز…";
        var labor = mk("input", INP + ";margin-top:8px"); labor.type = "number"; labor.min = "0"; labor.step = "any"; labor.inputMode = "decimal"; labor.value = r.labor == null ? "" : r.labor; labor.placeholder = "أجرة الصنعة (ج)";
        wc.appendChild(work); wc.appendChild(mk("label", "display:block;margin-top:8px;font-size:13px", "أجرة الصنعة")); wc.appendChild(labor);
        wc.appendChild(btn("حفظ الشغل والأجرة", BTN + ";margin-top:8px", function () {
          var l = labor.value === "" ? 0 : +labor.value;
          if (!isFinite(l) || l < 0) return say("اكتب أجرة صحيحة.", true);
          mutate(r.id, function (x) { x.work = work.value.trim(); x.labor = l; recompute(x); }).then(function (ok) { if (ok) { say("✅ اتحفظ."); draw(); } });
        }));
        box.appendChild(wc);
      }

      // القطع
      var pc = mk("div", CARD); pc.appendChild(mk("h3", "margin:0 0 6px", "🔩 القطع المستخدمة"));
      (r.parts || []).forEach(function (p, i) {
        var row = mk("div", "display:flex;gap:8px;align-items:center;margin:4px 0;padding:6px 0;border-bottom:1px dashed #cbd5e1");
        row.appendChild(mk("span", "flex:1", (p.external ? "🧳 " : "🔧 ") + (p.name || "قطعة مخزن") + " × " + (p.qty || 1)));
        row.appendChild(mk("b", "", money((+p.qty || 0) * (+p.sell || 0))));
        if (!locked && p.external) row.appendChild(btn("✖", BTN2 + ";padding:4px 9px", function () {
          if (!confirm("شيل القطعة دي من الأمر؟")) return;
          mutate(r.id, function (x) { x.parts = (x.parts || []).filter(function (_, j) { return j !== i; }); recompute(x); }).then(function (ok) { if (ok) draw(); });
        }));
        pc.appendChild(row);
      });
      if (!(r.parts || []).length) pc.appendChild(mk("p", "opacity:.7;margin:4px 0", "مفيش قطع مسجّلة."));
      if (!locked) {
        var f = mk("div", "margin-top:10px;padding-top:10px;border-top:1px solid #cbd5e1");
        f.appendChild(mk("b", "", "➕ إضافة قطعة"));
        var pn = mk("input", INP + ";margin-top:6px"); pn.placeholder = "اسم القطعة";
        var g = mk("div", "display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px");
        var pq = mk("input", INP); pq.type = "number"; pq.min = "1"; pq.step = "1"; pq.value = "1"; pq.placeholder = "الكمية";
        var ps = mk("input", INP); ps.type = "number"; ps.min = "0"; ps.step = "any"; ps.inputMode = "decimal"; ps.placeholder = "سعر البيع";
        var pb = mk("input", INP); pb.type = "number"; pb.min = "0"; pb.step = "any"; pb.inputMode = "decimal"; pb.placeholder = "سعر الشراء";
        g.appendChild(pq); g.appendChild(ps); g.appendChild(pb);
        var lbl = mk("label", "display:flex;gap:8px;align-items:center;margin-top:8px;font-size:14px");
        var own = mk("input"); own.type = "checkbox"; own.style.cssText = "width:20px;height:20px"; own.checked = true;
        lbl.appendChild(own); lbl.appendChild(mk("span", "", "اشتريتها من عهدتي (يتسجل مصروف معلّق بسعر الشراء)"));
        f.appendChild(pn); f.appendChild(g); f.appendChild(lbl);
        f.appendChild(btn("إضافة القطعة", BTN + ";margin-top:8px", function () {
          var name = pn.value.trim(), q = +pq.value, sell = +ps.value, cost = pb.value === "" ? 0 : +pb.value;
          if (!name) return say("اكتب اسم القطعة.", true);
          if (!Number.isInteger(q) || q < 1) return say("الكمية لازم تكون رقم صحيح.", true);
          if (!isFinite(sell) || sell < 0 || !isFinite(cost) || cost < 0) return say("اكتب أسعار صحيحة.", true);
          mutate(r.id, function (x) { x.parts = (x.parts || []).concat({ external: true, name: name, qty: q, sell: sell, cost: cost }); recompute(x); }).then(function (ok) {
            if (!ok) return;
            if (own.checked && cost * q > 0) {
              submitExpense({ amount: cost * q, note: "قطعة: " + name + " × " + q, orderId: r.id, orderNo: r.no || "" }).then(function () { say("✅ اتضافت القطعة وسُجّل مصروفها (معلّق لحد اعتماد الإدارة)."); draw(); }, function (e) { say("القطعة اتضافت لكن المصروف ما اتسجلش (" + e + "). سجّله من «عهدتي».", true); draw(); });
            } else { say("✅ اتضافت القطعة."); draw(); }
          });
        }));
        pc.appendChild(f);
      }
      box.appendChild(pc);

      var mc = mk("div", CARD); mc.appendChild(mk("h3", "margin:0 0 6px", "💰 الحساب"));
      mc.appendChild(kv("الإجمالي", money(r.total))); mc.appendChild(kv("العربون", money(r.deposit))); mc.appendChild(kv("المتبقي", money(remainOf(r))));
      box.appendChild(mc);

      if (!locked) {
        var cl = mk("div", CARD + ";border-color:#15803d"); cl.appendChild(mk("h3", "margin:0 0 6px", "🔒 تحصيل وقفل الأمر"));
        if (r.status !== "مكتمل") {
          cl.appendChild(mk("p", "margin:0;opacity:.85", "غيّر الحالة لـ «مكتمل» الأول عشان تقدر تقفل الأمر وتحصّل المتبقي."));
        } else {
          cl.appendChild(mk("p", "margin:0 0 8px;font-size:14px", "المتبقي للتحصيل: " + money(remainOf(r)) + " — بيتسجل في محفظة عهدتك إلا لو اخترت غيرها."));
          var ws = mk("select", INP); ws.id = "rCloseWallet";
          var o0 = mk("option", "", "بدون تحديد"); o0.value = ""; ws.appendChild(o0);
          var def = typeof window.resolveDefaultWallet === "function" ? window.resolveDefaultWallet(r) : "";
          (window.settings().wallets || []).forEach(function (w) { var o = mk("option", "", w); o.value = w; if (w === def) o.selected = true; ws.appendChild(o); });
          cl.appendChild(ws);
          cl.appendChild(btn("💳 تم الدفع بالكامل وقفل الأمر", BTN + ";margin-top:10px;background:#15803d;width:100%", function () { window.markPaidAndClose(r.id); }));
        }
        box.appendChild(cl);
      }
      return box;
    }

    /* ---------- عهدتي ---------- */
    var ACCT_CACHE = "wf_tech_acct";
    function readAcctCache() { try { var v = window.WFStorage.getItem(ACCT_CACHE); var o = v ? JSON.parse(v) : null; return o && o.uid === uid() ? o : null; } catch (e) { return null; } }
    function loadAccount() {
      var u = uid(); if (!u || !window.firebase) return Promise.resolve();
      if (navigator.onLine === false) {
        if (!state.acct) { var c = readAcctCache(); if (c) { state.acct = c.acct; state.exps = c.exps || []; state.acctErr = "📴 أوفلاين — آخر بيانات محفوظة"; } }
        if (state.tab === "account" && !state.id) draw();
        return Promise.resolve();
      }
      return Promise.all([
        fsdb().collection("techWallets").doc(u).get(),
        fsdb().collection("techExpenses").where("techId", "==", u).get()
      ]).then(function (res) {
        state.acct = res[0].exists ? res[0].data() : null;
        state.exps = res[1].docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }).sort(function (a, b) { return String(b.at || "").localeCompare(String(a.at || "")); }).slice(0, 60);
        state.acctErr = "";
        try { window.WFStorage.setItem(ACCT_CACHE, JSON.stringify({ uid: u, acct: state.acct, exps: state.exps })); } catch (e) {}
      }).catch(function (e) {
        var c = readAcctCache(); if (c && !state.acct) { state.acct = c.acct; state.exps = c.exps || []; }
        state.acctErr = "تعذّر تحديث الحساب (" + ((e && e.code) || "شبكة") + ")";
      }).then(function () { if (state.tab === "account" && !state.id) draw(); });
    }
    function submitExpense(x) {
      var u = uid(); if (!u) return Promise.reject("سجّل الدخول");
      if (navigator.onLine === false) return Promise.reject("مفيش نت");
      var data = { techId: u, techName: me(), wallet: myWallet(), amount: Math.round(+x.amount * 100) / 100, note: String(x.note || "").trim(), status: "pending", at: new Date().toISOString() };
      if (x.orderId) { data.orderId = String(x.orderId); data.orderNo = String(x.orderNo || ""); }
      if (x.category) data.category = String(x.category);
      var ref = fsdb().collection("techExpenses").doc();
      return ref.set(data).then(function () { state.exps.unshift(Object.assign({ id: ref.id }, data)); }, function (e) { throw (e && e.code) || "خطأ"; });
    }
    function localCollections(projRefs) { // تحصيلات قفلتها من جهازك ولسه ما ظهرتش في حساب الإدارة
      var w = myWallet(); if (!w) return [];
      return A(window.K.wtx).filter(function (x) { return x && !x.deleted && x.type === "in" && String(x.wallet || "").trim() === w && /^order-final-/.test(String(x.refKey || "")) && !projRefs[x.refKey]; });
    }
    var STAT = { pending: ["⏳ معلّق", "#b45309"], approved: ["✅ معتمد", "#15803d"], rejected: ["❌ مرفوض", "#b91c1c"] };
    function drawAccount() {
      var box = mk("div"), w = myWallet(), a = state.acct;
      var refs = {}; ((a && a.entries) || []).forEach(function (e) { if (e.ref) refs[e.ref] = 1; });
      var loc = localCollections(refs), locSum = loc.reduce(function (s, x) { return s + (+x.amount || 0); }, 0);
      var bal = ((a && +a.balance) || 0) + locSum;
      var top = mk("div", CARD + ";text-align:center");
      top.appendChild(mk("div", "font-size:13px;opacity:.8", "💼 محفظة العهدة" + (w ? " — " + w : "")));
      top.appendChild(mk("div", "font-size:34px;font-weight:800;margin:6px 0;color:" + (bal < 0 ? "#b91c1c" : "#15803d"), money(bal)));
      top.appendChild(mk("div", "font-size:12px;opacity:.75", "الرصيد = اللي معاك دلوقتي (الإيداعات + تحصيلاتك − المصروفات المعتمدة − التسويات)"));
      if (loc.length) top.appendChild(mk("div", "font-size:12px;color:#b45309;margin-top:4px", "⏳ منها " + money(locSum) + " تحصيلات لسه بانتظار ظهورها في حساب الإدارة"));
      if (state.acctErr) top.appendChild(mk("div", "font-size:12px;color:#b45309;margin-top:4px", state.acctErr));
      if (!w) top.appendChild(mk("div", "font-size:13px;color:#b91c1c;margin-top:6px", "مفيش محفظة عهدة متحددة لحسابك — اطلب من المسؤول يحددها."));
      box.appendChild(top);

      // تسجيل مصروف
      var fc = mk("details", CARD); fc.appendChild(mk("summary", "cursor:pointer;font-weight:700", "➕ تسجيل مصروف (يتعلّق لحد اعتماد الإدارة)"));
      var amt = mk("input", INP + ";margin-top:8px"); amt.type = "number"; amt.min = "0"; amt.step = "any"; amt.inputMode = "decimal"; amt.placeholder = "المبلغ (ج)";
      var note = mk("input", INP + ";margin-top:8px"); note.placeholder = "المصروف على إيه؟ (بنزين، قطعة، مواصلات…)"; note.maxLength = 300;
      var os = mk("select", INP + ";margin-top:8px"); var o0 = mk("option", "", "مش مرتبط بأمر"); o0.value = ""; os.appendChild(o0);
      openOrders().forEach(function (r) { var o = mk("option", "", "أمر " + (r.no || "") + " — " + (custOf(r).name || "")); o.value = r.id; os.appendChild(o); });
      fc.appendChild(amt); fc.appendChild(note); fc.appendChild(os);
      fc.appendChild(btn("إرسال للاعتماد", BTN + ";margin-top:8px", function () {
        var v = +amt.value, n = note.value.trim();
        if (!isFinite(v) || v <= 0) return say("اكتب مبلغ صحيح.", true);
        if (n.length < 2) return say("اكتب بيان المصروف.", true);
        var ord = os.value ? A(window.K.r).filter(function (r) { return r.id === os.value; })[0] : null;
        submitExpense({ amount: v, note: n, orderId: ord ? ord.id : "", orderNo: ord ? ord.no : "" }).then(function () { say("✅ اتسجّل المصروف وبانتظار اعتماد الإدارة."); draw(); }, function (e) { say("ما اتسجلش (" + e + "). المصروفات محتاجة اتصال بالنت.", true); });
      }));
      box.appendChild(fc);

      // مصروفاتي
      box.appendChild(mk("h3", "margin:12px 0 6px", "🧾 مصروفاتي"));
      state.exps.forEach(function (e) {
        var st = STAT[e.status] || [e.status, "#444"];
        var row = mk("div", CARD + ";display:flex;gap:8px;align-items:center");
        var main = mk("div", "flex:1;min-width:0");
        main.appendChild(mk("b", "", e.note || "")); main.appendChild(mk("div", "font-size:12px;opacity:.75", (e.orderNo ? "أمر " + e.orderNo + " • " : "") + (e.at ? new Date(e.at).toLocaleString("ar-EG") : "")));
        if (e.decisionNote) main.appendChild(mk("div", "font-size:12px", "ملاحظة الإدارة: " + e.decisionNote));
        row.appendChild(main);
        var side = mk("div", "text-align:left"); side.appendChild(mk("b", "", money(e.amount))); side.appendChild(mk("div", "font-size:12px;color:" + st[1], st[0]));
        if (e.status === "pending") side.appendChild(btn("إلغاء", BTN2 + ";padding:3px 8px;font-size:12px;margin-top:4px", function () {
          if (!confirm("إلغاء المصروف ده؟")) return;
          fsdb().collection("techExpenses").doc(e.id).delete().then(function () { state.exps = state.exps.filter(function (x) { return x.id !== e.id; }); draw(); }, function () { say("ما اتلغاش — يمكن اتعتمد.", true); loadAccount(); });
        }));
        row.appendChild(side); box.appendChild(row);
      });
      if (!state.exps.length) box.appendChild(mk("p", "opacity:.7", "مفيش مصروفات."));

      // الحركات
      box.appendChild(mk("h3", "margin:12px 0 6px", "📒 حركات المحفظة"));
      var rows = loc.map(function (x) { return { type: "in", amount: +x.amount, reason: x.reason || "تحصيل", date: x.date, time: x.time, pending: true }; }).concat(((a && a.entries) || []));
      rows.forEach(function (e) {
        var row = mk("div", CARD + ";display:flex;gap:8px;align-items:center;padding:9px");
        var main = mk("div", "flex:1;min-width:0"); main.appendChild(mk("div", "", e.reason || e.category || "")); main.appendChild(mk("div", "font-size:12px;opacity:.7", (e.date || "") + " " + (e.time || "") + (e.pending ? " • ⏳ بانتظار الظهور" : "") + (e.category ? " • " + e.category : "")));
        row.appendChild(main);
        row.appendChild(mk("b", "white-space:nowrap;color:" + (e.type === "in" ? "#15803d" : "#b91c1c"), (e.type === "in" ? "+" : "−") + money(e.amount)));
        box.appendChild(row);
      });
      if (!rows.length) box.appendChild(mk("p", "opacity:.7", "مفيش حركات لسه."));
      return box;
    }

    /* ---------- الرسم ---------- */
    function draw() {
      while (root.firstChild) root.removeChild(root.firstChild);
      root.appendChild(topBar());
      if (state.id) { root.appendChild(drawOrder()); return; }
      root.appendChild(tabs());
      root.appendChild(state.tab === "orders" ? drawOrders() : (state.tab === "account" ? drawAccount() : drawToday()));
      lastRaw = String(window.WFStorage.getItem(window.K.r) || "");
    }
    draw();
    loadAccount();
    // تحديث تلقائي لما المزامنة تنزّل أوامر جديدة (من غير ما نقاطع حد بيكتب)
    setInterval(function () {
      var ae = document.activeElement, typing = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName);
      if (typing || state.id) return;
      var cur = String(window.WFStorage.getItem(window.K.r) || "");
      var b = document.getElementById("wfCloudBanner"); if (b) b.remove();
      if (cur !== lastRaw || b) draw();
    }, 6000);
    window.addEventListener("online", function () { loadAccount(); draw(); });
  }
  wait();
})();
