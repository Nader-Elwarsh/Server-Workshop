/* tech-portal.js — «بوابة الفني» (tech.html): شاشة مستقلة للفني متوصلة بكل اللي متعيّن له.
   - النهارده: زياراته (المتأخرة والنهارده والجاية) + الأوامر اللي لسه ملهاش موعد.
   - أوامري: كل أوامره المفتوحة + بحث وفلتر بالحالة. فتح أمر: العميل (اتصال/خريطة)، الجهاز، الموعد، الحالة،
     الشغل والأجرة، القطع (يدوي بس: مفيش تصفح للمخزن)، والقفل.
   - المقفولة: سجل أوامره اللي اتقفلت (من السيرفر: مش بيضيع لو خرج ودخل أو غيّر الجهاز).
   - عهدتي: رصيد محفظة العهدة وحركاتها ومصروفاته — محسوبة على السيرفر (دالة techAccount).
   القفل بيتم على السيرفر (دالة techCloseOrder): الأمر يتقفل وحركة التحصيل تتسجل في المحفظة مع بعض،
   والمحفظة الافتراضية = محفظة عهدة الفني إلا لو اختار غيرها.
   مفيش طباعة ولا إرسال رسائل ولا حذف. كل النصوص بتتحط بـ textContent. */
(function () {
  "use strict";
  var waited = 0;
  function ready() { return window.WFPerm && window.firebase && typeof window.arr === "function" && window.K && typeof window.updateRequestRecordAsync === "function" && typeof window.settings === "function"; }
  var storageOk = false;
  try { Promise.resolve(window.WFStorageReady).then(function () { storageOk = true; }, function () { storageOk = true; }); } catch (e) { storageOk = true; }
  function wait() {
    // لازم تخزين الجهاز (IndexedDB) يكون اتقرا الأول، وإلا الصفحة بتترسم فاضية لحد ما تضغط مزامنة
    if (ready() && (storageOk || !window.WFStorageReady)) return start();
    if ((waited += 80) > 20000) { var m = document.getElementById("techRoot"); if (m) m.textContent = "تعذّر تحميل الصفحة. حدّث وجرّب تاني."; return; }
    setTimeout(wait, 80);
  }

  var ERRORS = {
    stale_total: "التعديلات اللي عملتها على الأمر لسه بتترفع. استنى ثواني وجرّب القفل تاني.",
    not_completed: "غيّر حالة الأمر لـ «مكتمل» الأول.",
    already_closed: "الأمر ده اتقفل بالفعل.",
    not_your_order: "الأمر ده اتنقل لفني تاني.",
    no_order: "الأمر مش موجود على السيرفر (ممكن يكون اتمسح).",
    wallet_required: "اختار المحفظة اللي هيتسجل فيها المبلغ.",
    bad_wallet: "المحفظة دي مش من محافظ الورشة.",
    deposit_over_total: "العربون أكبر من إجمالي الأمر. راجع الأجرة والقطع.",
    bad_amounts: "إجمالي الأمر أو العربون مش صحيح.",
    no_close_permission: "حسابك مالوش صلاحية قفل الأوامر. كلّم المسؤول.",
    not_staff: "حسابك موقوف أو مش موظف.",
    custody_only: "مش مسموح.",
    sign_in_required: "سجّل الدخول من جديد."
  };
  function errText(e, fallback) {
    var m = String((e && e.message) || ""), c = String((e && e.code) || "");
    if (ERRORS[m]) return ERRORS[m];
    if (/not.?found|404|unimplemented/.test(c) || (c === "internal" && !m)) return "خدمة الحسابات على السيرفر مش جاهزة (لازم تتنشر دوال techCloseOrder و techAccount).";
    if (c === "unauthenticated") return ERRORS.sign_in_required;
    if (/timeout|network|failed to fetch|unavailable/i.test(m + " " + c)) return "مفيش اتصال كويس بالنت. جرّب تاني.";
    return fallback || ("حصل خطأ (" + (m || c || "غير معروف") + ").");
  }

  function start() {
    var root = document.getElementById("techRoot"), msgBox = document.getElementById("techMsg");
    var qs = new URLSearchParams(location.search);
    var state = { tab: qs.get("tab") || "today", id: qs.get("id") || "", filter: "all", acct: null, acctAt: "", acctErr: "", acctLoading: false, busy: false };
    var lastRaw = "", statusEl = null;

    /* ---------- أدوات ---------- */
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(label, cls, fn) { var b = el("button", cls || "tp-btn", label); b.type = "button"; if (fn) b.onclick = fn; return b; }
    function say(t, bad) {
      msgBox.textContent = ""; if (!t) return;
      msgBox.appendChild(el("div", "tp-msg " + (bad ? "tp-msg-bad" : "tp-msg-ok"), t));
      try { window.scrollTo(0, 0); } catch (e) {}
    }
    function A(k) { try { return window.arr(k) || []; } catch (e) { return []; } }
    function money(n) { return (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " ج"; }
    function uid() { try { return window.firebase.auth().currentUser.uid; } catch (e) { return ""; } }
    function me() { var p = window.WFPerm.profile && window.WFPerm.profile(); return (p && p.name) || ""; }
    function can(k) { try { return window.WFPerm.can(k) !== false; } catch (e) { return true; } }
    function fsdb() { return window.firebase.firestore(); }
    function online() { return navigator.onLine !== false; }

    function isMine(r) { return window.wfSyncMode === "scoped" || r.techId === uid(); }
    function openOrders() { return A(window.K.r).filter(function (r) { return r && !r.closed && !r.paid && r.status !== "ملغي" && isMine(r); }); }
    function custOf(r) { return A(window.K.c).filter(function (x) { return x.id === r.customerId; })[0] || {}; }
    function devOf(r) { return A(window.K.d).filter(function (x) { return x.id === r.deviceId; })[0] || null; }
    function devLabel(d) { return d ? [d.type, d.brand, d.model].filter(Boolean).join(" ") : ""; }
    function addrOf(c, r) {
      var a = (r && r.addressKey === "extra" ? c.extraAddress : c.mainAddress) || c.mainAddress || {};
      return [a.center, a.village, a.address, a.street].filter(Boolean).join(" - ");
    }
    function dayOf(v) { try { return window.dayKeyLocal(v); } catch (e) { return ""; } }
    function timeOf(v) { var d = new Date(v); return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }); }
    function dateLabel(v) { var d = new Date(v); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" }); }
    function shortDate(v) { var d = new Date(v); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" }); }
    function toInputValue(v) { // datetime-local = YYYY-MM-DDTHH:mm
      var d = new Date(v); if (isNaN(d.getTime())) return "";
      var p = function (n) { return String(n).padStart(2, "0"); };
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
    }
    function nowKey() { var d = new Date(); return { date: dayOf(d), time: String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") }; }
    function go(params) { var u = new URL(location.href); u.search = ""; Object.keys(params).forEach(function (k) { if (params[k]) u.searchParams.set(k, params[k]); }); location.href = u.href; }
    function myWallet() {
      var w = window.WFPerm.wallet && window.WFPerm.wallet();
      if (w) return w;
      if (state.acct && state.acct.wallet) return state.acct.wallet;
      var o = A(window.K.r).filter(function (r) { return r.techWallet; })[0];
      return o ? o.techWallet : "";
    }
    function walletChoices() {
      var out = [], mine = myWallet();
      if (mine) out.push(mine);
      (window.settings().wallets || []).forEach(function (w) { w = String(w || "").trim(); if (w && out.indexOf(w) < 0) out.push(w); });
      return out;
    }

    /* ---------- الحساب من السيرفر (مع نسخة محفوظة للأوفلاين) ---------- */
    var ACCT_CACHE = "wf_tech_account";
    function readAcctCache() { try { var v = window.WFStorage.getItem(ACCT_CACHE); var o = v ? JSON.parse(v) : null; return o && o.uid === uid() ? o : null; } catch (e) { return null; } }
    function useCache() { if (state.acct) return; var c = readAcctCache(); if (c) { state.acct = c.data; state.acctAt = c.at; } }
    useCache();
    function loadAccount() {
      if (!uid()) return Promise.resolve();
      if (!online()) { state.acctErr = "📴 أوفلاين — دي آخر بيانات اتحمّلت"; redrawIf(); return Promise.resolve(); }
      state.acctLoading = true; redrawIf();
      return window.WFPerm.call("techAccount", {}).then(function (res) {
        state.acct = res || null; state.acctAt = new Date().toISOString(); state.acctErr = "";
        try { window.WFStorage.setItem(ACCT_CACHE, JSON.stringify({ uid: uid(), data: state.acct, at: state.acctAt })); } catch (e) {}
      }, function (e) {
        state.acctErr = errText(e, "تعذّر تحديث الحساب من السيرفر.");
      }).then(function () { state.acctLoading = false; redrawIf(); });
    }
    function redrawIf() { if (!state.id && (state.tab === "account" || state.tab === "done" || state.tab === "today")) draw(); }

    /* ---------- رأس الصفحة وحالة المزامنة ---------- */
    function syncState() {
      var info = (window.wfSyncInfo && window.wfSyncInfo()) || {};
      if (!online()) return ["📴 أوفلاين — شغلك محفوظ على الجهاز وهيترفع لما النت يرجع", "warn"];
      if (info.ready === false) return ["⏳ جارٍ الاتصال بالسيرفر…", "muted"];
      if (info.error) return ["🔴 " + info.error, "bad"];
      if (info.conflicts) return ["🟠 فيه تعارض مزامنة — اضغط مزامنة", "warn"];
      if (info.pending) return ["🟠 " + info.pending + " تعديل بيترفع…", "warn"];
      return ["🟢 متزامن مع الإدارة", "ok"];
    }
    function paintStatus() { if (!statusEl) return; var s = syncState(); statusEl.textContent = s[0]; statusEl.className = "tp-sync tp-sync-" + s[1]; }
    function header() {
      var box = el("div", "tp-head");
      var name = me() || "الفني";
      var av = el("div", "tp-avatar", name.trim().charAt(0) || "👷");
      var info = el("div", "tp-head-info");
      info.appendChild(el("b", "tp-head-name", name));
      info.appendChild(el("div", "tp-head-date", new Date().toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })));
      statusEl = el("div", "tp-sync"); paintStatus(); info.appendChild(statusEl);
      var sync = btn("🔄", "tp-icon-btn", function () {
        sync.disabled = true; sync.textContent = "⏳";
        Promise.resolve(window.wfCloudSyncNow ? window.wfCloudSyncNow() : null).catch(function () {}).then(function () { return loadAccount(); }).then(function () { sync.disabled = false; sync.textContent = "🔄"; draw(); });
      });
      sync.setAttribute("aria-label", "مزامنة"); sync.title = "مزامنة";
      box.appendChild(av); box.appendChild(info); box.appendChild(sync);
      return box;
    }
    function bottomNav() {
      var nav = el("nav", "tp-nav"), open = openOrders(), today = dayOf(new Date());
      var todayCount = open.filter(function (r) { return r.visit && dayOf(r.visit) <= today; }).length;
      // حساب الفني: «الرئيسية» = النهارده في بوابته. موظف كامل فاتح البوابة: «الرئيسية» = رئيسية النظام.
      // «الرئيسية» = رئيسية النظام لكل الناس (الفني بيشوف فيها أوامره بس).
      var items = [["__home", "🏠", "الرئيسية", 0], ["today", "📅", "النهارده", todayCount]];
      items.concat([["orders", "🛠️", "أوامري", open.length], ["done", "✅", "المقفولة", 0], ["account", "💼", "عهدتي", 0]]).forEach(function (t) {
        var on = state.tab === t[0] && !state.id;
        var b = btn("", "tp-nav-btn" + (on ? " tp-on" : ""), function () { if (t[0] === "__home") { location.href = "index.html"; return; } go({ tab: t[0] }); });
        b.appendChild(el("i", "", t[1])); b.appendChild(el("small", "", t[2]));
        if (t[3]) b.appendChild(el("span", "tp-badge", String(t[3])));
        nav.appendChild(b);
      });
      return nav;
    }

    /* ---------- كروت الأوامر ---------- */
    function orderCard(r) {
      var c = custOf(r), d = devOf(r), addr = addrOf(c, r);
      var card = el("div", "tp-card tp-order");
      card.onclick = function () { go({ id: r.id, tab: state.tab }); };
      var head = el("div", "tp-row tp-between");
      head.appendChild(el("b", "tp-order-title", "#" + (r.no || "") + " — " + (c.name || "عميل")));
      head.appendChild(el("span", r.visit ? "tp-time" : "tp-time tp-time-none", r.visit ? (dayOf(r.visit) === dayOf(new Date()) ? timeOf(r.visit) : shortDate(r.visit) + " " + timeOf(r.visit)) : "بدون موعد"));
      card.appendChild(head);
      if (devLabel(d)) card.appendChild(el("div", "tp-line", "🔧 " + devLabel(d)));
      if (r.fault) card.appendChild(el("div", "tp-line tp-muted", "📝 " + String(r.fault).slice(0, 100)));
      if (addr) card.appendChild(el("div", "tp-line tp-muted", "📍 " + addr));
      var foot = el("div", "tp-row tp-wrap tp-foot");
      foot.appendChild(el("span", "tp-chip tp-st-" + statusClass(r.status), r.status || "جديد"));
      if (c.phone) { var a = el("a", "tp-btn2 tp-small", "📞 اتصال"); a.href = "tel:" + c.phone; a.onclick = function (e) { e.stopPropagation(); }; foot.appendChild(a); }
      if (addr) { var m = el("a", "tp-btn2 tp-small", "🗺️ الخريطة"); m.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr); m.target = "_blank"; m.rel = "noopener"; m.onclick = function (e) { e.stopPropagation(); }; foot.appendChild(m); }
      card.appendChild(foot);
      return card;
    }
    function statusClass(s) { return ({ "جديد": "new", "جاري التنفيذ": "work", "مكتمل": "done", "مجمد": "frozen" })[s] || "new"; }
    function section(title, list, cls) {
      if (!list.length) return null;
      var s = el("div", "tp-section");
      s.appendChild(el("h3", "tp-h3" + (cls ? " " + cls : ""), title + " (" + list.length + ")"));
      list.forEach(function (r) { s.appendChild(orderCard(r)); });
      return s;
    }
    function byVisit(a, b) { return String(a.visit || "").localeCompare(String(b.visit || "")); }
    function tile(label, value, cls) { var t = el("div", "tp-tile " + (cls || "")); t.appendChild(el("b", "", String(value))); t.appendChild(el("small", "", label)); return t; }

    function drawToday() {
      var box = el("div"), all = openOrders(), today = dayOf(new Date());
      var overdue = all.filter(function (r) { return r.visit && dayOf(r.visit) < today && r.status !== "مجمد"; }).sort(byVisit);
      var now = all.filter(function (r) { return r.visit && dayOf(r.visit) === today; }).sort(byVisit);
      var soon = all.filter(function (r) { var k = r.visit ? dayOf(r.visit) : ""; return k > today; }).sort(byVisit);
      var none = all.filter(function (r) { return !r.visit; });
      var tiles = el("div", "tp-tiles");
      tiles.appendChild(tile("النهارده", now.length, "tp-t-blue")); tiles.appendChild(tile("متأخر", overdue.length, "tp-t-red"));
      tiles.appendChild(tile("قادم", soon.length, "tp-t-green")); tiles.appendChild(tile("بدون موعد", none.length, "tp-t-amber"));
      box.appendChild(tiles);
      [section("⚠️ متأخرة عن موعدها", overdue, "tp-red"), section("📅 النهارده", now), section("⏭️ قادمة", soon), section("🕓 بدون موعد — حدّد موعدها", none, "tp-amber")].forEach(function (s) { if (s) box.appendChild(s); });
      if (!all.length) {
        var e = el("div", "tp-empty");
        e.appendChild(el("div", "tp-empty-ico", "🎉"));
        e.appendChild(el("b", "", "مفيش أوامر مفتوحة معيّنة ليك دلوقتي."));
        var st = state.acct && state.acct.stats;
        if (st && st.closedMonth) e.appendChild(el("div", "tp-muted", "قفلت " + st.closedMonth + " أمر الشهر ده."));
        e.appendChild(btn("✅ شوف أوامرك المقفولة", "tp-btn2", function () { go({ tab: "done" }); }));
        box.appendChild(e);
      }
      return box;
    }
    function drawOrders() {
      var box = el("div"), all = openOrders().sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); });
      var q = el("input", "tp-input"); q.type = "search"; q.placeholder = "🔍 بحث (عميل، موبايل، جهاز، رقم أمر)";
      var chips = el("div", "tp-row tp-wrap tp-filters");
      [["all", "الكل"], ["جديد", "جديد"], ["جاري التنفيذ", "جاري التنفيذ"], ["مكتمل", "مكتمل"], ["مجمد", "مجمد"]].forEach(function (f) {
        var n = f[0] === "all" ? all.length : all.filter(function (r) { return r.status === f[0]; }).length;
        if (f[0] !== "all" && !n) return;
        chips.appendChild(btn(f[1] + " (" + n + ")", "tp-filter" + (state.filter === f[0] ? " tp-on" : ""), function () { state.filter = f[0]; draw(); }));
      });
      var list = el("div"); box.appendChild(q); box.appendChild(chips); box.appendChild(list);
      function paint() {
        while (list.firstChild) list.removeChild(list.firstChild);
        var t = q.value.trim().toLowerCase();
        var rows = all.filter(function (r) {
          if (state.filter !== "all" && r.status !== state.filter) return false;
          var c = custOf(r); return !t || ((c.name || "") + " " + (c.phone || "") + " " + devLabel(devOf(r)) + " " + (r.no || "") + " " + (r.fault || "")).toLowerCase().indexOf(t) > -1;
        });
        rows.forEach(function (r) { list.appendChild(orderCard(r)); });
        if (!rows.length) list.appendChild(el("p", "tp-empty-line", "مفيش أوامر."));
      }
      q.oninput = paint; paint();
      return box;
    }

    /* ---------- المقفولة (من السيرفر) ---------- */
    function accountNotice(box) {
      if (state.acctLoading && !state.acct) box.appendChild(el("p", "tp-empty-line", "⏳ جارٍ تحميل حسابك من السيرفر…"));
      if (state.acctErr) box.appendChild(el("div", "tp-msg tp-msg-warn", state.acctErr));
      if (state.acctAt) box.appendChild(el("div", "tp-updated", "آخر تحديث: " + new Date(state.acctAt).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + (state.acctLoading ? " • بيتحدّث…" : "")));
    }
    function drawDone() {
      var box = el("div"), a = state.acct, st = (a && a.stats) || {};
      accountNotice(box);
      var tiles = el("div", "tp-tiles tp-tiles-3");
      tiles.appendChild(tile("اتقفلت الشهر ده", st.closedMonth || 0, "tp-t-green"));
      tiles.appendChild(tile("حصّلت الشهر ده", money(st.collectedMonth || 0), "tp-t-blue"));
      tiles.appendChild(a && a.pay ? tile("أجرتك الشهر ده", money(a.pay.earnedMonth || 0), "tp-t-amber") : tile("مصنعية الشهر ده", money(st.laborMonth || 0), "tp-t-amber"));
      box.appendChild(tiles);
      var hist = (a && a.history) || [];
      box.appendChild(el("h3", "tp-h3", "✅ أوامرك المقفولة (" + hist.length + ")"));
      hist.forEach(function (h) {
        var c = el("div", "tp-card");
        var top = el("div", "tp-row tp-between");
        top.appendChild(el("b", "", "#" + h.no + " — " + (h.customer || "عميل")));
        top.appendChild(el("span", "tp-muted tp-nowrap", shortDate(h.closedAt)));
        c.appendChild(top);
        if (h.device) c.appendChild(el("div", "tp-line", "🔧 " + h.device));
        if (h.work) c.appendChild(el("div", "tp-line tp-muted", "🧰 " + h.work));
        var f = el("div", "tp-row tp-wrap tp-foot");
        f.appendChild(el("span", "tp-chip tp-st-done", "الإجمالي " + money(h.total)));
        if (h.collected) f.appendChild(el("span", "tp-chip tp-st-work", "حصّلت " + money(h.collected) + (h.wallet ? " • " + h.wallet : "")));
        if (h.priced) f.appendChild(el("span", "tp-chip tp-st-new", "👷 أجرتك " + money(h.pay) + (h.jobType ? " • " + h.jobType : "")));
        else if (a && a.pay) f.appendChild(el("span", "tp-chip", "أجرتك لسه ما اتحددتش"));
        if (!h.byTech) f.appendChild(el("span", "tp-chip", "اتقفل من الإدارة"));
        c.appendChild(f);
        box.appendChild(c);
      });
      if (!hist.length && !state.acctLoading) box.appendChild(el("p", "tp-empty-line", a ? "لسه مفيش أوامر مقفولة." : "افتح النت عشان سجلك يتحمّل."));
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
    function kv(label, value) { var d = el("div", "tp-kv"); d.appendChild(el("b", "", label)); d._v = d.appendChild(el("span", "", value)); return d; }
    function block(title) { var c = el("div", "tp-card"); c.appendChild(el("h3", "tp-card-title", title)); return c; }

    var CAT_KEY = "wf_tech_parts";
    function catName(id) { var c = state.catalog || readCat(); var x = (c || []).filter(function (p) { return p.id === id; })[0]; return x ? x.name : ""; }
    function readCat() { try { var v = JSON.parse(window.WFStorage.getItem(CAT_KEY) || "null"); return v && v.uid === uid() ? v.parts : null; } catch (e) { return null; } }
    function loadCatalog() {
      if (!state.catalog) state.catalog = readCat();
      if (!online()) { if (!state.catalog) state.catalogErr = "📴 المخزن محتاج نت أول مرة."; return Promise.resolve(); }
      return window.WFPerm.call("techPartsCatalog", {}).then(function (res) {
        state.catalog = (res && res.parts) || []; state.catalogErr = "";
        try { window.WFStorage.setItem(CAT_KEY, JSON.stringify({ uid: uid(), at: Date.now(), parts: state.catalog })); } catch (e) {}
      }, function (e) { state.catalogErr = "تعذّر تحميل المخزن (" + errText(e, "") + ")"; });
    }
    function stockCall(name, data, r, okMsg) {
      if (!online()) return say("الإضافة من المخزن محتاجة نت (عشان تتخصم من المخزن فعلًا).", true);
      if (state.flushWork) state.flushWork();
      r = A(window.K.r).filter(function (x) { return x.id === r.id; })[0] || r;
      data.fields = workFields(r);
      say("⏳ جارٍ التنفيذ…");
      return window.WFPerm.call(name, data).then(function (res) {
        if (state.catalog && res) state.catalog.forEach(function (x) { if (x.id === data.partId) x.qty = res.left; });
        return window.updateRequestRecordAsync(r.id, function (_, x) { ["parts", "partsTotal", "partsCost", "total", "remain"].forEach(function (k) { if (res && res[k] !== undefined) x[k] = res[k]; }); return true; })
          .then(function () { say(okMsg); draw(); });
      }, function (e) {
        var code = (e && (e.message || e.code)) || "";
        var MSG = { not_enough: "الكمية مش متاحة في المخزن دلوقتي.", not_your_order: "الأمر مش متعيّن ليك.", already_closed: "الأمر اتقفل.", no_edit_permission: "مالكش صلاحية تعديل الأوامر.", not_on_order: "القطعة مش على الأمر." };
        say(MSG[code] || errText(e, "ما اتنفذش"), true); loadCatalog().then(draw);
      });
    }
    function refreshTotals(id) {
      var x = A(window.K.r).filter(function (o) { return o.id === id; })[0], t = state.totalsEls; if (!x || !t || !t.lab) return;
      t.lab.textContent = money(x.labor); t.tot.textContent = money(x.total); t.rem.textContent = money(remainOf(x));
    }
    function savedTag() { // علامة صغيرة «✓ اتحفظ» جنب الخانات اللي بتتحفظ لوحدها
      var t = el("span", "tp-saved"); var tm = null;
      return { el: t, show: function (txt, bad) { clearTimeout(tm); t.textContent = txt || ""; t.className = "tp-saved" + (bad ? " tp-saved-bad" : ""); if (/اتحفظ$/.test(txt || "")) tm = setTimeout(function () { t.textContent = ""; }, 2500); } };
    }
    function workFields(r) { var o = {}; ["status", "work", "labor", "parts", "partsTotal", "partsCost", "total", "statusHistory", "startedAt", "completedAt", "visit"].forEach(function (k) { if (r[k] !== undefined) o[k] = r[k]; }); return o; }
    function closeOrder(r, wallet, button) {
      if (state.busy) return;
      if (!online()) return say("قفل الأمر محتاج نت عشان التحصيل يتسجل في عهدتك. شغّل النت وجرّب تاني (شغلك على الأمر محفوظ).", true);
      var remain = remainOf(r);
      if (!window.confirm("تأكيد استلام " + money(remain) + " من العميل وقفل الأمر #" + (r.no || "") + (remain > 0 ? "\nالمبلغ هيتسجل في: " + wallet : "") + "\nبعد القفل مش هتقدر تعدّل الأمر.")) return;
      state.busy = true; button.disabled = true; button.textContent = "⏳ جارٍ القفل…";
      var t = nowKey();
      Promise.resolve(state.flushWork ? state.flushWork() : null).catch(function () {}).then(function () { return window.wfCloudSyncNow ? window.wfCloudSyncNow() : null; }).catch(function () {}).then(function () {
        var cur = A(window.K.r).filter(function (x) { return x.id === r.id; })[0] || r;
        return window.WFPerm.call("techCloseOrder", { orderId: r.id, wallet: wallet, expectTotal: +cur.total || 0, expectDeposit: +cur.deposit || 0, date: t.date, time: t.time, fields: workFields(cur) });
      }).then(function (res) {
        try { window.WFStorage.setItem(window.K.r, JSON.stringify(A(window.K.r).filter(function (x) { return x.id !== r.id; }))); } catch (e) {}
        try { window.WFStorage.setItem("wf_tech_flash", (res && res.collected > 0) ? "✅ اتقفل الأمر #" + (res.no || r.no || "") + " واتسجل " + money(res.collected) + " في «" + res.wallet + "»." : "✅ اتقفل الأمر #" + (r.no || "") + "."); } catch (e) {}
        state.busy = false;
        Promise.resolve(window.wfCloudSyncNow ? window.wfCloudSyncNow() : null).catch(function () {}).then(function () { go({ tab: "done" }); });
      }, function (e) {
        state.busy = false; button.disabled = false; button.textContent = "💳 تم الدفع بالكامل وقفل الأمر";
        say(errText(e, "تعذّر قفل الأمر."), true);
        if (e && /already_closed|not_your_order/.test(String(e.message || ""))) Promise.resolve(window.wfCloudSyncNow ? window.wfCloudSyncNow() : null).catch(function () {});
      });
    }

    function drawOrder() {
      var r = A(window.K.r).filter(function (x) { return String(x.id) === state.id && isMine(x); })[0];
      var box = el("div");
      box.appendChild(btn("→ رجوع", "tp-btn2 tp-back", function () { go({ tab: state.tab }); }));
      if (!r) {
        // لسه المزامنة بتجيب أوامره (أول فتح/بعد تحويل): ماتقولش «مش موجود» قبل ما نتأكد
        var inf = (window.wfSyncInfo && window.wfSyncInfo()) || {};
        if (inf.ready === false || state.waitingOrder) { box.appendChild(el("p", "tp-empty-line", "⏳ جارٍ تحميل الأمر…")); if (!state.waitingOrder) { state.waitingOrder = true; setTimeout(function () { state.waitingOrder = false; draw(); }, 4000); } return box; }
        box.appendChild(el("p", "tp-empty-line", "الأمر مش موجود عندك (ممكن يكون اتقفل أو اتنقل لفني تاني).")); return box;
      }
      var full = el("a", "tp-btn2 tp-full-link", "📄 صفحة الأمر الكاملة"); full.href = "request.html?id=" + encodeURIComponent(r.id); box.appendChild(full);
      var c = custOf(r), d = devOf(r), addr = addrOf(c, r), locked = !!(r.closed || r.paid), edit = !locked && can("requests.edit");

      var h = el("div", "tp-card tp-order-head");
      var t = el("div", "tp-row tp-between");
      t.appendChild(el("b", "tp-big", "🛠️ أمر #" + (r.no || "")));
      t.appendChild(el("span", "tp-chip tp-st-" + statusClass(r.status), locked ? "مقفول 🔒" : (r.status || "جديد")));
      h.appendChild(t);
      if (r.visit) h.appendChild(el("div", "tp-muted", "📅 " + dateLabel(r.visit) + " " + timeOf(r.visit)));
      box.appendChild(h);

      var cc = block("👤 العميل");
      cc.appendChild(kv("الاسم", c.name || "—"));
      [c.phone, c.phone2].filter(Boolean).forEach(function (p, i) {
        var row = el("div", "tp-kv"); row.appendChild(el("b", "", i ? "موبايل ٢" : "الموبايل"));
        var s = el("span", "tp-ltr", p); row.appendChild(s);
        var a = el("a", "tp-btn tp-small", "📞 اتصال"); a.href = "tel:" + p; row.appendChild(a); cc.appendChild(row);
      });
      if (addr) {
        var row2 = el("div", "tp-kv"); row2.appendChild(el("b", "", "العنوان")); row2.appendChild(el("span", "", addr));
        var m = el("a", "tp-btn2 tp-small", "🗺️ الخريطة"); m.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr); m.target = "_blank"; m.rel = "noopener"; row2.appendChild(m); cc.appendChild(row2);
      }
      if (c.notes) cc.appendChild(kv("ملاحظات", c.notes));
      box.appendChild(cc);

      var dc = block("🔧 الجهاز والعطل");
      dc.appendChild(kv("الجهاز", devLabel(d) || "—"));
      if (d && (d.desc || d.notes)) dc.appendChild(kv("وصف", d.desc || d.notes));
      dc.appendChild(kv("العطل", r.fault || "—"));
      if (r.customerNote) dc.appendChild(kv("ملاحظة العميل", r.customerNote));
      box.appendChild(dc);

      if (edit) {
        var sc = block("📅 الموعد" + (r.visit ? "" : " (لسه ما اتحددش)"));
        var inp = el("input", "tp-input"); inp.type = "datetime-local"; inp.value = toInputValue(r.visit);
        var row3 = el("div", "tp-row tp-wrap tp-gap"), vs = savedTag();
        // حفظ تلقائي: أول ما تختار الموعد بيتحفظ (من غير زرار حفظ)
        inp.onchange = function () {
          if (!inp.value || inp.value === toInputValue(r.visit)) return;
          vs.show("⏳"); mutate(r.id, function (x) { x.visit = inp.value; }).then(function (ok) { if (ok) { r.visit = inp.value; vs.show("✓ اتحفظ"); say("✅ اتحفظ الموعد وهيظهر للإدارة في جدولك."); } else vs.show(""); });
        };
        if (r.visit) row3.appendChild(btn("مسح الموعد", "tp-btn2", function () { mutate(r.id, function (x) { x.visit = ""; }).then(function (ok) { if (ok) draw(); }); }));
        row3.appendChild(vs.el);
        sc.appendChild(inp); sc.appendChild(row3); box.appendChild(sc);

        var stc = block("🚦 الحالة");
        var sel = el("select", "tp-input");
        var opts = (typeof window.nextStatusOptions === "function" ? window.nextStatusOptions(r.status || "جديد") : [r.status]).filter(function (s) { return s !== "ملغي"; });
        opts.forEach(function (s) { var o = el("option", "", s); o.value = s; if (s === r.status) o.selected = true; sel.appendChild(o); });
        sel.onchange = function () { Promise.resolve(window.changeRequestStatus(r.id, sel.value)).then(function () { draw(); }); };
        stc.appendChild(sel); stc.appendChild(el("div", "tp-hint", "الإلغاء من الإدارة بس. لما تخلّص الشغل خليها «مكتمل» عشان تقدر تقفل الأمر."));
        box.appendChild(stc);

        var wc = block("🧰 الشغل المنفّذ");
        var work = el("textarea", "tp-input"); work.value = r.work || ""; work.placeholder = "اكتب اللي اتعمل في الجهاز…";
        var lbl = el("label", "tp-label", "أجرة الصنعة (ج)");
        var labor = el("input", "tp-input"); labor.type = "number"; labor.min = "0"; labor.step = "any"; labor.inputMode = "decimal"; labor.value = r.labor == null ? "" : r.labor; labor.placeholder = "أجرة الصنعة (ج)";
        var ws = savedTag(), wTimer = null, lastSaved = (r.work || "") + "|" + (r.labor == null ? "" : r.labor);
        wc.appendChild(work); wc.appendChild(lbl); wc.appendChild(labor); wc.appendChild(ws.el);
        // حفظ تلقائي: بعد ما تبطّل كتابة بثانية، ولما تخرج من الخانة (والحساب تحت بيتحدث لما تخرج)
        var saveWork = function (redraw) {
          clearTimeout(wTimer);
          var l = labor.value === "" ? 0 : +labor.value;
          if (!isFinite(l) || l < 0) { ws.show("اكتب أجرة صحيحة", true); return Promise.resolve(false); }
          var key = work.value.trim() + "|" + labor.value;
          if (key === lastSaved) { if (redraw) refreshTotals(r.id); return Promise.resolve(true); }
          ws.show("⏳ بيتحفظ…");
          return mutate(r.id, function (x) { x.work = work.value.trim(); x.labor = l; recompute(x); }).then(function (ok) {
            if (!ok) { ws.show("ما اتحفظش", true); return false; }
            lastSaved = key; ws.show("✓ اتحفظ"); refreshTotals(r.id);
            return true;
          });
        };
        work.oninput = labor.oninput = function () { clearTimeout(wTimer); ws.show("…"); wTimer = setTimeout(function () { saveWork(false); }, 1000); };
        work.onchange = labor.onchange = function () { saveWork(true); };
        state.flushWork = function () { return saveWork(false); };
        box.appendChild(wc);
      }

      var pc = block("🔩 القطع المستخدمة");
      (r.parts || []).forEach(function (p, i) {
        var row = el("div", "tp-part");
        var nm = el("span", "", (p.external ? "🧳 " : "📦 ") + (p.name || catName(p.partId) || "قطعة من المخزن") + " × " + (p.qty || 1));
        if (p.external && p.paidBy) nm.appendChild(el("small", "tp-muted", " • " + (PAY_SHORT[p.paidBy] || "")));
        row.appendChild(nm);
        row.appendChild(el("b", "", money((+p.qty || 0) * (+p.sell || 0))));
        if (edit && !p.external && p.partId) row.appendChild(btn("✖", "tp-btn2 tp-small", function () {
          if (!window.confirm("ترجّع القطعة دي للمخزن وتشيلها من الأمر؟")) return;
          stockCall("techReturnPart", { orderId: r.id, partId: p.partId }, r, "✅ القطعة رجعت المخزن.");
        }));
        if (edit && p.external) row.appendChild(btn("✖", "tp-btn2 tp-small", function () {
          if (!window.confirm("شيل القطعة دي من الأمر؟")) return;
          mutate(r.id, function (x) { x.parts = (x.parts || []).filter(function (_, j) { return j !== i; }); recompute(x); }).then(function (ok) {
            if (!ok) return; draw();
            if (p.expenseId) fsdb().collection("techExpenses").doc(p.expenseId).delete().then(function () { say("اتشالت القطعة واتلغى مصروفها."); loadAccount(); }, function () { say("اتشالت القطعة، بس مصروفها اتعتمد خلاص — كلّم الإدارة تعدّله.", true); });
          });
        }));
        pc.appendChild(row);
      });
      if (!(r.parts || []).length) pc.appendChild(el("p", "tp-muted", "مفيش قطع مسجّلة."));
      if (edit) { // من المخزن: بيتخصم على السيرفر وقت الإضافة (الفني مابيشوفش سعر الشراء)
        var sf = el("details", "tp-add");
        sf.appendChild(el("summary", "", "📦 إضافة من المخزن"));
        var sq = el("input", "tp-input"); sq.placeholder = "🔍 ابحث باسم القطعة…"; sq.type = "search";
        var sres = el("div", "tp-stock-list");
        var paint = function () {
          while (sres.firstChild) sres.removeChild(sres.firstChild);
          if (!state.catalog) { sres.appendChild(el("p", "tp-muted", state.catalogErr || "⏳ جارٍ تحميل المخزن…")); return; }
          var q = sq.value.trim().toLowerCase(), list = state.catalog.filter(function (x) { return !q || (x.name + " " + x.code + " " + x.category).toLowerCase().indexOf(q) > -1; }).slice(0, 30);
          if (!list.length) sres.appendChild(el("p", "tp-muted", "مفيش قطعة بالاسم ده في المخزن."));
          list.forEach(function (x) {
            var it = el("div", "tp-stock-item" + (x.qty > 0 ? "" : " tp-out"));
            var info = el("div", "tp-grow"); info.appendChild(el("b", "", x.name)); info.appendChild(el("div", "tp-small-t tp-muted", (x.qty > 0 ? "متاح " + x.qty : "خلصانة") + " • " + money(x.sell)));
            it.appendChild(info);
            if (x.qty > 0) {
              var qn = el("input", "tp-input tp-qty"); qn.type = "number"; qn.min = "1"; qn.max = String(x.qty); qn.value = "1"; qn.inputMode = "numeric";
              it.appendChild(qn);
              it.appendChild(btn("➕", "tp-btn tp-small", function () {
                var n = Math.floor(+qn.value); if (!(n >= 1) || n > x.qty) return say("الكمية لازم تكون من 1 لـ " + x.qty + ".", true);
                stockCall("techUsePart", { orderId: r.id, partId: x.id, qty: n }, r, "✅ اتضافت " + x.name + " واتخصمت من المخزن.");
              }));
            }
            sres.appendChild(it);
          });
        };
        sq.oninput = paint;
        sf.ontoggle = function () { if (sf.open) { loadCatalog().then(paint); paint(); } };
        sf.appendChild(sq); sf.appendChild(sres);
        pc.appendChild(sf);
      }
      if (edit) {
        var f = el("details", "tp-add");
        f.appendChild(el("summary", "", "🧳 إضافة قطعة من بره المخزن"));
        var pn = el("input", "tp-input"); pn.placeholder = "اسم القطعة";
        var g = el("div", "tp-grid3");
        var pq = el("input", "tp-input"); pq.type = "number"; pq.min = "1"; pq.step = "1"; pq.value = "1"; pq.placeholder = "الكمية";
        var ps = el("input", "tp-input"); ps.type = "number"; ps.min = "0"; ps.step = "any"; ps.inputMode = "decimal"; ps.placeholder = "سعر البيع";
        var pb = el("input", "tp-input"); pb.type = "number"; pb.min = "0"; pb.step = "any"; pb.inputMode = "decimal"; pb.placeholder = "سعر الشراء";
        g.appendChild(pq); g.appendChild(ps); g.appendChild(pb);
        var src = paySelect(true); src.id = "tpPartPay";
        f.appendChild(pn); f.appendChild(g); f.appendChild(el("div", "tp-small-t tp-muted tp-mt", "تمن القطعة (سعر الشراء) اتدفع منين؟")); f.appendChild(src);
        f.appendChild(btn("إضافة القطعة", "tp-btn tp-mt", function () {
          var name = pn.value.trim(), q = +pq.value, sell = +ps.value, cost = pb.value === "" ? 0 : +pb.value;
          if (!name) return say("اكتب اسم القطعة.", true);
          if (!Number.isInteger(q) || q < 1) return say("الكمية لازم تكون رقم صحيح.", true);
          if (!isFinite(sell) || sell < 0 || !isFinite(cost) || cost < 0) return say("اكتب أسعار صحيحة.", true);
          var how = src.value, withExp = how !== "none" && cost * q > 0;
          if (withExp && !online()) return say("تسجيل مصروف القطعة محتاج نت. اختار «مفيش مصروف» أو استنى النت.", true);
          var ref = withExp ? fsdb().collection("techExpenses").doc() : null;
          var part = { external: true, name: name, qty: q, sell: sell, cost: cost, paidBy: how, addedBy: "tech" };
          if (ref) part.expenseId = ref.id;
          mutate(r.id, function (x) { x.parts = (x.parts || []).concat(part); recompute(x); }).then(function (ok) {
            if (!ok) return;
            if (withExp) {
              submitExpense({ ref: ref, part: true, pay: how, amount: cost * q, note: "قطعة: " + name + " × " + q, orderId: r.id, orderNo: r.no || "" }).then(function () { say("✅ اتضافت القطعة وتمنها اتبعت للإدارة (" + PAY_SHORT[how] + ") — مستني الاعتماد."); draw(); }, function (e) { say("القطعة اتضافت لكن المصروف ما اتسجلش (" + e + "). سجّله من «عهدتي».", true); draw(); });
            } else { say("✅ اتضافت القطعة."); draw(); }
          });
        }));
        pc.appendChild(f);
      }
      box.appendChild(pc);

      var mc = block("💰 الحساب");
      var kLab = kv("المصنعية (على العميل)", money(r.labor)), kTot = kv("الإجمالي", money(r.total));
      mc.appendChild(kLab); mc.appendChild(kv("القطع", money(r.partsTotal)));
      mc.appendChild(kTot); mc.appendChild(kv("العربون", money(r.deposit)));
      var rem = kv("المتبقي على العميل", money(remainOf(r))); rem.className = "tp-kv tp-kv-total"; mc.appendChild(rem);
      // الحساب بيتحدث مكانه بعد الحفظ التلقائي (من غير ما الصفحة تترسم تاني وتضيّع الضغطة اللي بعدها)
      state.totalsEls = { lab: kLab._v, tot: kTot._v, rem: rem._v };
      if (!locked && can("requests.close") && r.status !== "ملغي") { // عربون/دفعة من العميل (معاينة والجهاز محتاج قطع وزيارة تانية مثلًا)
        var df = el("details", "tp-add tp-mt"); df.appendChild(el("summary", "", "💵 استلام عربون / دفعة من العميل"));
        var da = el("input", "tp-input"); da.type = "number"; da.min = "0"; da.step = "any"; da.inputMode = "decimal"; da.placeholder = "المبلغ اللي استلمته (ج)";
        var dw = el("select", "tp-input"); walletChoices().forEach(function (w) { var o = el("option", "", w === myWallet() ? "💼 " + w + " (عهدتك)" : w); o.value = w; dw.appendChild(o); });
        var dn = el("input", "tp-input"); dn.placeholder = "ملاحظة (اختياري) — مثلًا: عربون قطعة الغيار"; dn.maxLength = 200;
        df.appendChild(da); df.appendChild(dw); df.appendChild(dn);
        df.appendChild(btn("✅ تسجيل العربون", "tp-btn tp-mt", function () {
          var v = Math.round(+da.value * 100) / 100;
          if (!isFinite(v) || v <= 0) return say("اكتب المبلغ.", true);
          if (!online()) return say("تسجيل العربون محتاج نت (عشان يتسجل في عهدتك على السيرفر).", true);
          if ((+r.total || 0) > 0 && (+r.deposit || 0) + v > (+r.total || 0) + 0.001 && !window.confirm("العربون كده أكبر من إجمالي الأمر الحالي (" + money(r.total) + "). تكمّل؟")) return;
          if (!window.confirm("تأكيد استلام " + money(v) + " من العميل في «" + dw.value + "»؟")) return;
          say("⏳ جارٍ التسجيل…");
          if (state.flushWork) state.flushWork();
          var curR = A(window.K.r).filter(function (x) { return x.id === r.id; })[0] || r;
          window.WFPerm.call("techCollectDeposit", { orderId: r.id, amount: v, wallet: dw.value, note: dn.value.trim(), fields: workFields(curR) }).then(function (res) {
            return window.updateRequestRecordAsync(r.id, function (_, x) { x.deposit = res.deposit; x.depositExtra = res.depositExtra; x.remain = res.remain; return true; })
              .then(function () { say("✅ اتسجل عربون " + money(v) + " — الباقي على العميل " + money(res.remain) + "."); loadAccount(); draw(); });
          }, function (e) {
            var code = (e && (e.message || e.code)) || "", MSG = { bad_wallet: "المحفظة دي مش مسموحة.", already_closed: "الأمر اتقفل.", not_your_order: "الأمر مش متعيّن ليك.", no_close_permission: "مالكش صلاحية التحصيل.", wallet_required: "مفيش محفظة عهدة متحددة لحسابك." };
            say(MSG[code] || errText(e, "ما اتسجلش"), true);
          });
        }));
        mc.appendChild(df);
      }
      box.appendChild(mc);
      // أجرة الفني نفسه على الأمر (المالك/المدير بيحددها) — منفصلة عن حساب العميل
      var pyc = block("👷 أجرتك على الأمر");
      if (+r.techPay > 0 || r.jobType) { var pk = kv(r.jobTypeName || (r.techPayManual ? "مبلغ محدد" : "الأجرة"), money(r.techPay)); pk.className = "tp-kv tp-kv-total"; pyc.appendChild(pk); }
      else pyc.appendChild(el("div", "tp-muted", "لسه ما اتحددتش — الإدارة بتحددها حسب نوع الشغل."));
      box.appendChild(pyc);

      if (!locked && can("requests.close")) {
        var cl = el("div", "tp-card tp-close"); cl.appendChild(el("h3", "tp-card-title", "🔒 تحصيل وقفل الأمر"));
        if (r.status !== "مكتمل") {
          cl.appendChild(el("p", "tp-muted", "غيّر الحالة لـ «مكتمل» الأول عشان تقدر تقفل الأمر وتحصّل المتبقي."));
        } else {
          var choices = walletChoices(), mine = myWallet();
          var def = typeof window.resolveDefaultWallet === "function" ? window.resolveDefaultWallet(r) : "";
          if (choices.indexOf(def) < 0) def = mine || choices[0] || "";
          cl.appendChild(el("p", "", "المتبقي للتحصيل: " + money(remainOf(r))));
          var lw = el("label", "tp-label", "المبلغ هيتسجل في محفظة:");
          var ws = el("select", "tp-input"); ws.id = "rCloseWallet";
          choices.forEach(function (w) { var o = el("option", "", w + (w === mine ? " (عهدتي)" : "")); o.value = w; if (w === def) o.selected = true; ws.appendChild(o); });
          ws.value = def;
          cl.appendChild(lw); cl.appendChild(ws);
          if (!choices.length) cl.appendChild(el("p", "tp-bad", "مفيش محفظة عهدة متحددة لحسابك — اطلب من المسؤول يحددها."));
          var go1 = btn("💳 تم الدفع بالكامل وقفل الأمر", "tp-btn tp-green tp-wide tp-mt", function () {
            if (remainOf(r) > 0 && !ws.value) return say(ERRORS.wallet_required, true);
            closeOrder(r, ws.value, go1);
          });
          cl.appendChild(go1);
          cl.appendChild(el("div", "tp-hint", "القفل بيتسجل على السيرفر مباشرة (محتاج نت)، والأمر بيتنقل لـ «المقفولة»."));
        }
        box.appendChild(cl);
      }
      return box;
    }

    /* ---------- عهدتي ---------- */
    function submitExpense(x) {
      var u = uid(); if (!u) return Promise.reject("سجّل الدخول");
      if (!online()) return Promise.reject("مفيش نت");
      var data = { techId: u, techName: me(), wallet: myWallet(), amount: Math.round(+x.amount * 100) / 100, note: String(x.note || "").trim(), status: "pending", at: new Date().toISOString(), pay: x.pay || "custody" };
      if (x.part) data.category = "part"; // تمن قطعة على أمر: تكلفتها محسوبة في «تكلفة القطع» فمش هتتحسب تاني كمصروف تشغيل
      if (x.orderId) { data.orderId = String(x.orderId); data.orderNo = String(x.orderNo || ""); }
      var ref = x.ref || fsdb().collection("techExpenses").doc();
      return ref.set(data).then(function () {
        if (state.acct) { state.acct.expenses = [{ id: ref.id, amount: data.amount, note: data.note, status: "pending", orderNo: data.orderNo || "", at: data.at, decisionNote: "", pay: data.pay }].concat(state.acct.expenses || []); }
        loadAccount();
      }, function (e) { throw (e && e.code) || "خطأ"; });
    }
    var STAT = { pending: ["⏳ معلّق", "tp-amber"], approved: ["✅ معتمد", "tp-green-t"], rejected: ["❌ مرفوض", "tp-red"] };
    /* الفلوس اتدفعت منين؟ (قطعة من بره أو أي مصروف)
       custody = من العهدة اللي معاه • own = من جيبه والورشة تردّهاله (بتتضاف لمستحقاته) • workshop = الإدارة دفعتها أو اديته تمنها • none = مفيش مصروف */
    var PAY_SRC = { custody: "💼 من عهدتي", own: "👛 من جيبي — الورشة تردّهالي", workshop: "🏢 الإدارة دفعت تمنها / اديتني فلوسها", none: "🚫 مفيش مصروف (العميل جابها / اتسجلت قبل كده)" };
    var PAY_SHORT = { custody: "من العهدة", own: "من جيبك (هتترد لك)", workshop: "دفعتها الإدارة", none: "بدون مصروف" };
    function paySelect(withNone) {
      var s = el("select", "tp-input"), keys = ["custody", "own", "workshop"].concat(withNone ? ["none"] : []);
      keys.forEach(function (k) { var o = el("option", "", PAY_SRC[k]); o.value = k; s.appendChild(o); });
      s.value = myWallet() ? "custody" : "own";
      return s;
    }
    function drawAccount() {
      var box = el("div"), w = myWallet(), a = state.acct;
      accountNotice(box);
      var hero = el("div", "tp-hero");
      hero.appendChild(el("div", "tp-hero-label", "💼 رصيد عهدتك" + (w ? " — " + w : "")));
      var bal = a ? +a.balance || 0 : 0;
      hero.appendChild(el("div", "tp-hero-num" + (bal < 0 ? " tp-neg" : ""), a ? money(bal) : "—"));
      hero.appendChild(el("div", "tp-hero-note", "= الإيداعات + تحصيلاتك − مصروفاتك المعتمدة − اللي سلّمته للورشة"));
      if (a && a.stats && a.stats.pendingExpenses) hero.appendChild(el("div", "tp-hero-note", "⏳ مصروفات عهدة مستنية اعتماد: " + money(a.stats.pendingExpenses)));
      if (!w) hero.appendChild(el("div", "tp-hero-warn", "مفيش محفظة عهدة متحددة لحسابك — اطلب من المسؤول يحددها."));
      box.appendChild(hero);
      if (a && a.pay) { // مستحقاتي: أجور الأوامر اللي اتقفلت − اللي اتصرف لي
        var pv = a.pay, pc2 = block("💰 مستحقاتي");
        var dk = kv("المستحق ليك دلوقتي", money(pv.due)); dk.className = "tp-kv tp-kv-total"; pc2.appendChild(dk);
        pc2.appendChild(kv("أجرتك الشهر ده", money(pv.earnedMonth))); pc2.appendChild(kv("إجمالي أجورك", money(pv.earned)));
        if (pv.reimb) pc2.appendChild(kv("مصاريف دفعتها من جيبك (معتمدة)", money(pv.reimb)));
        pc2.appendChild(kv("اتصرف لك", money(pv.paid)));
        if (pv.pendingReimb) pc2.appendChild(kv("من جيبك مستني اعتماد", money(pv.pendingReimb)));
        if (pv.openPay) pc2.appendChild(kv("أوامر مفتوحة متسعّرة (لما تتقفل)", money(pv.openPay)));
        if (pv.unpriced) pc2.appendChild(el("div", "tp-small-t tp-muted", "⏳ " + pv.unpriced + " أمر مقفول الشهر ده لسه أجرته ما اتحددتش."));
        if (pv.payouts && pv.payouts.length) {
          var pd = el("details", "tp-mt"); pd.appendChild(el("summary", "", "آخر مرات الصرف (" + pv.payouts.length + ")"));
          pv.payouts.forEach(function (x) { pd.appendChild(el("div", "tp-small-t", "• " + (x.date || "") + " — " + money(x.amount) + (x.note ? " (" + x.note + ")" : ""))); });
          pc2.appendChild(pd);
        }
        box.appendChild(pc2);
      }

      var fc = el("details", "tp-card tp-add"); fc.appendChild(el("summary", "", "➕ تسجيل مصروف (بيستنى اعتماد الإدارة)"));
      var amt = el("input", "tp-input"); amt.type = "number"; amt.min = "0"; amt.step = "any"; amt.inputMode = "decimal"; amt.placeholder = "المبلغ (ج)";
      var note = el("input", "tp-input"); note.placeholder = "المصروف على إيه؟ (بنزين، قطعة، مواصلات…)"; note.maxLength = 300;
      var os = el("select", "tp-input"); var o0 = el("option", "", "مش مرتبط بأمر"); o0.value = ""; os.appendChild(o0);
      openOrders().forEach(function (r) { var o = el("option", "", "أمر " + (r.no || "") + " — " + (custOf(r).name || "")); o.value = r.id; os.appendChild(o); });
      var ps2 = paySelect(false); ps2.id = "tpExpPay";
      fc.appendChild(amt); fc.appendChild(note); fc.appendChild(os); fc.appendChild(el("div", "tp-small-t tp-muted tp-mt", "الفلوس اتدفعت منين؟")); fc.appendChild(ps2);
      fc.appendChild(btn("إرسال للاعتماد", "tp-btn tp-mt", function () {
        var v = +amt.value, n = note.value.trim();
        if (!isFinite(v) || v <= 0) return say("اكتب مبلغ صحيح.", true);
        if (n.length < 2) return say("اكتب بيان المصروف.", true);
        var ord = os.value ? A(window.K.r).filter(function (r) { return r.id === os.value; })[0] : null;
        submitExpense({ pay: ps2.value, amount: v, note: n, orderId: ord ? ord.id : "", orderNo: ord ? ord.no : "" }).then(function () { say("✅ اتسجّل المصروف وبانتظار اعتماد الإدارة."); draw(); }, function (e) { say("ما اتسجلش (" + e + "). المصروفات محتاجة اتصال بالنت.", true); });
      }));
      box.appendChild(fc);

      var exps = (a && a.expenses) || [];
      box.appendChild(el("h3", "tp-h3", "🧾 مصروفاتي (" + exps.length + ")"));
      exps.slice(0, 40).forEach(function (e) {
        var st = STAT[e.status] || [e.status, ""];
        var row = el("div", "tp-card tp-row tp-gap");
        var main = el("div", "tp-grow");
        main.appendChild(el("b", "", e.note || "")); main.appendChild(el("div", "tp-small-t tp-muted", (PAY_SHORT[e.pay || "custody"] || "") + " • " + (e.orderNo ? "أمر " + e.orderNo + " • " : "") + (e.at ? new Date(e.at).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "")));
        if (e.decisionNote) main.appendChild(el("div", "tp-small-t", "ملاحظة الإدارة: " + e.decisionNote));
        row.appendChild(main);
        var side = el("div", "tp-side"); side.appendChild(el("b", "", money(e.amount))); side.appendChild(el("div", "tp-small-t " + st[1], st[0]));
        if (e.status === "pending") side.appendChild(btn("إلغاء", "tp-btn2 tp-small", function () {
          if (!window.confirm("إلغاء المصروف ده؟")) return;
          fsdb().collection("techExpenses").doc(e.id).delete().then(function () { if (state.acct) state.acct.expenses = (state.acct.expenses || []).filter(function (x) { return x.id !== e.id; }); draw(); loadAccount(); }, function () { say("ما اتلغاش — يمكن اتعتمد.", true); loadAccount(); });
        }));
        row.appendChild(side); box.appendChild(row);
      });
      if (!exps.length) box.appendChild(el("p", "tp-empty-line", "مفيش مصروفات."));

      var rows = (a && a.entries) || [];
      box.appendChild(el("h3", "tp-h3", "📒 حركات المحفظة"));
      rows.slice(0, 80).forEach(function (e) {
        var row = el("div", "tp-card tp-row tp-gap tp-tx");
        var main = el("div", "tp-grow"); main.appendChild(el("div", "", e.reason || e.category || "")); main.appendChild(el("div", "tp-small-t tp-muted", (e.date || "") + " " + (e.time || "") + (e.category ? " • " + e.category : "")));
        row.appendChild(main);
        row.appendChild(el("b", "tp-nowrap " + (e.type === "in" ? "tp-green-t" : "tp-red"), (e.type === "in" ? "+" : "−") + money(e.amount)));
        box.appendChild(row);
      });
      if (!rows.length) box.appendChild(el("p", "tp-empty-line", "مفيش حركات لسه."));
      return box;
    }

    /* ---------- الرسم ---------- */
    function draw() {
      while (root.firstChild) root.removeChild(root.firstChild);
      root.appendChild(header());
      if (state.id) root.appendChild(drawOrder());
      else root.appendChild(state.tab === "orders" ? drawOrders() : state.tab === "account" ? drawAccount() : state.tab === "done" ? drawDone() : drawToday());
      root.appendChild(bottomNav());
      lastRaw = String(window.WFStorage.getItem(window.K.r) || "");
    }
    try { var flash = window.WFStorage.getItem("wf_tech_flash"); if (flash) { window.WFStorage.setItem("wf_tech_flash", ""); say(flash); } } catch (e) {}
    draw();
    // الحساب محتاج تسجيل الدخول يرجع الأول (بياخد ثانية بعد فتح الصفحة). من غير كده كان بيفضل فاضي لحد ما تضغط 🔄.
    (function whenAuth() {
      function go() { useCache(); draw(); loadAccount(); }
      if (uid()) return go();
      var done = false;
      try { window.firebase.auth().onAuthStateChanged(function (u) { if (u && !done) { done = true; go(); } }); } catch (e) {}
    })();
    // حالة المزامنة بتتحدّث لوحدها، والقايمة بتترسم تاني لما المزامنة تنزّل أوامر جديدة (من غير ما نقاطع حد بيكتب)
    setInterval(paintStatus, 3000);
    setInterval(function () {
      var ae = document.activeElement, typing = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName);
      if (typing || state.id || state.busy) return;
      var cur = String(window.WFStorage.getItem(window.K.r) || "");
      var b = document.getElementById("wfCloudBanner"); if (b) b.remove();
      if (cur !== lastRaw || b) draw();
    }, 6000);
    // أي تغيير في أوامره/عملائه/أجهزته (مزامنة نزلت بيانات) = إعادة رسم فورية
    var redrawT = null;
    try {
      if (window.WFStorage.subscribe) window.WFStorage.subscribe(function (k) {
        if (k !== window.K.r && k !== window.K.c && k !== window.K.d) return;
        clearTimeout(redrawT);
        redrawT = setTimeout(function () {
          var ae = document.activeElement, typing = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName);
          if (!typing && !state.busy) draw();
        }, 300);
      });
    } catch (e) {}
    // أول ما الاتصال بالسيرفر يجهز: مزامنة واحدة تلقائية (بدل ما تضغط 🔄 بإيدك)
    (function autoSync(n) {
      var info = (window.wfSyncInfo && window.wfSyncInfo()) || {};
      if (info.ready && online() && window.wfCloudSyncNow) { Promise.resolve(window.wfCloudSyncNow()).catch(function () {}).then(function () { paintStatus(); draw(); }); return; }
      if (n < 60) setTimeout(function () { autoSync(n + 1); }, 500);
    })(0);
    window.addEventListener("online", function () { paintStatus(); loadAccount(); });
    window.addEventListener("offline", paintStatus);
  }
  wait();
})();
