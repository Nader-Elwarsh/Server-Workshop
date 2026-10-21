/* =========================================================
   🧪 التيست مود (app-test-modes.js) — جوه صفحة «أكواد الأعطال والتيست مود».
   - التيست مود بيتخزن في نفس مكان الأكواد (K.fc) بس بعلامة kind:"test" — فبيتزامن ويتعمله
     نسخة احتياطية ويتصدّر مع الأكواد من غير أي إعداد جديد.
   - كل تيست مود: نوع الجهاز، الماركة، الموديلات، العنوان، طريقة الدخول، اللي بيحصل في كل خطوة،
     الخروج، ملاحظات، وصور/فيديو (Cloudinary — نفس صور أوامر الشغل).
   - صفحة الكود الواحد (faultcode.html) بقى فيها صور كمان (wfFaultMedia).
   ========================================================= */
(function (w) {
  "use strict";
  var d = w.document, TAB_KEY = "wf_fc_tab";
  function $(id) { return d.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function A() { try { return (typeof w.arr === "function" ? w.arr(w.K.fc) : []) || []; } catch (e) { return []; } }
  function S() { try { return typeof w.settings === "function" ? w.settings() || {} : {}; } catch (e) { return {}; } }
  function can(p) { try { return !w.WFPerm || !w.WFPerm.can || w.WFPerm.can(p); } catch (e) { return true; } }
  function nl(s) { return esc(s).replace(/\n/g, "<br>"); }
  function save(all) { return typeof w.saveFaultCodesRecords === "function" ? w.saveFaultCodesRecords(all) : false; }
  function isTest(f) { return !!(f && f.kind === "test"); }
  function tests() { return A().filter(isTest); }
  function codesCount() { return A().filter(function (f) { return !isTest(f); }).length; }
  function nf(v) { return typeof w.normalizeFaultText === "function" ? w.normalizeFaultText(v) : String(v || "").toLowerCase().trim(); }
  function types() { return Object.keys(S().types || {}); }
  function brands() { var s = S(); return typeof w.wfBrandList === "function" ? w.wfBrandList(s.brands) : (s.brands || []); }
  function opts(list, v, ph) { return "<option value=''>" + esc(ph) + "</option>" + list.concat(v && list.indexOf(v) < 0 ? [v] : []).map(function (x) { return "<option" + (x === v ? " selected" : "") + ">" + esc(x) + "</option>"; }).join(""); }

  function css() {
    if ($("wfTmCss")) return;
    var st = d.createElement("style"); st.id = "wfTmCss";
    st.textContent = ".tm-tabs{display:flex;gap:6px;margin:10px 0;flex-wrap:wrap}.tm-tabs button{flex:1;min-width:140px;padding:10px;border-radius:12px;border:1px solid var(--border,#d5dbe8);background:var(--bg-elevated,#fff);color:inherit;font-weight:700;cursor:pointer}.tm-tabs button.on{background:#0b2a66;color:#fff;border-color:#0b2a66}" +
      "main.tm-on>#bulkFaultBox,main.tm-on>#faultForm,main.tm-on>.filters,main.tm-on>#faultList,main.tm-on>details.danger-zone,main.tm-on>#wfAiCodeFill,main.tm-on .page-head .section-actions,main.tm-on>p.hint.tm-codes-hint{display:none!important}main:not(.tm-on)>#tmSection{display:none}" +
      ".tm-steps{white-space:normal;line-height:1.8}.tm-item .tm-sub{font-size:13px;opacity:.8}.tm-badge{display:inline-block;font-size:11.5px;padding:1px 7px;border-radius:8px;background:rgba(124,58,237,.12);margin-inline-start:6px}";
    (d.head || d.documentElement).appendChild(st);
  }

  /* ---------------- التبويبات في صفحة الأكواد ---------------- */
  var tab = "codes";
  function setupTabs() {
    var main = d.querySelector("main.page"), list = $("faultList"); if (!main || !list || $("tmTabs")) return;
    css();
    var q = new URLSearchParams(location.search);
    try { tab = q.get("tab") === "test" || q.get("tmedit") ? "test" : (sessionStorage.getItem(TAB_KEY) || "codes"); } catch (e) { tab = q.get("tab") === "test" ? "test" : "codes"; }
    if (q.get("edit") || q.get("ai")) tab = "codes";
    var hint = main.querySelector(":scope > p.hint"); if (hint) hint.classList.add("tm-codes-hint");
    var bar = d.createElement("div"); bar.id = "tmTabs"; bar.className = "tm-tabs no-print";
    var head = main.querySelector(".page-head"); (head ? head.parentNode : main).insertBefore(bar, head ? head.nextSibling : main.firstChild);
    var sec = d.createElement("section"); sec.id = "tmSection";
    main.insertBefore(sec, list.nextSibling);
    sec.innerHTML = "<p class='hint'>طرق الدخول في وضع الاختبار/الخدمة (Test mode / Service mode / Self diagnosis) لكل جهاز: إزاي تدخل، كل خطوة بتختبر إيه، وإزاي تخرج — ومعاها صور أو فيديو للوحة التحكم.</p>" +
      (can("faultcodes.add") ? "<div class='section-actions' style='margin-bottom:8px'><button type='button' class='primary small-btn' id='tmNewBtn'>➕ تيست مود جديد</button></div>" : "") +
      "<form id='tmForm' class='quick-add hidden wide' autocomplete='off'><h3 id='tmFormTitle'>🧪 تيست مود جديد</h3><div class='form-grid'>" +
      "<label>نوع الجهاز<select id='tmType'></select></label><label>الماركة<select id='tmBrand'></select></label>" +
      "<label class='wide'>الموديلات <small>اختياري — مثال: F4J6، WT-1200</small><input id='tmModel'></label>" +
      "<label class='wide'>العنوان<input id='tmTitle' placeholder='مثال: تيست مود الغسالة — اختبار المكونات'></label>" +
      "<label class='wide'>🔑 طريقة الدخول <small>خطوة في كل سطر</small><textarea id='tmEnter' rows='4' placeholder='1) افصل الجهاز وشغّله تاني\n2) دوس Spin + Temp مع بعض 3 ثواني'></textarea></label>" +
      "<label class='wide'>🧪 الخطوات / بيختبر إيه <small>خطوة في كل سطر</small><textarea id='tmTests' rows='6' placeholder='1) الموتور يلف يمين وشمال\n2) محبس المية يفتح'></textarea></label>" +
      "<label class='wide'>🚪 الخروج<textarea id='tmExit' rows='2' placeholder='افصل الجهاز أو دوس Power'></textarea></label>" +
      "<label class='wide'>📝 ملاحظات<textarea id='tmNote' rows='2'></textarea></label></div>" +
      "<div class='actions'><button type='submit' class='primary'>💾 حفظ وفتح</button><button type='button' class='secondary' id='tmCancel'>إلغاء</button></div><div class='hint'>الصور والفيديو بتتضاف من صفحة التيست مود بعد الحفظ.</div></form>" +
      "<div class='filters tm-filters'><select id='tmFilterType'></select><select id='tmFilterBrand'></select><input id='tmSearch' class='search' placeholder='🔍 بحث بالعنوان أو الموديل أو الخطوات'></div><div id='tmList'></div>";
    if ($("tmNewBtn")) $("tmNewBtn").onclick = function () { openForm(null); };
    $("tmCancel").onclick = function () { $("tmForm").classList.add("hidden"); };
    $("tmForm").onsubmit = submit;
    ["tmFilterType", "tmFilterBrand"].forEach(function (i) { $(i).onchange = renderList; });
    $("tmSearch").oninput = renderList;
    var ed = q.get("tmedit"); if (ed) { var f = A().filter(function (x) { return x.id === ed && isTest(x); })[0]; if (f) openForm(f); }
    drawTabs(); renderList();
  }
  function drawTabs() {
    var bar = $("tmTabs"); if (!bar) return;
    bar.innerHTML = "<button type='button' data-t='codes' class='" + (tab === "codes" ? "on" : "") + "'>🧯 أكواد الأعطال (" + codesCount() + ")</button><button type='button' data-t='test' class='" + (tab === "test" ? "on" : "") + "'>🧪 التيست مود (" + tests().length + ")</button>";
    Array.prototype.forEach.call(bar.querySelectorAll("button"), function (b) { b.onclick = function () { tab = b.getAttribute("data-t"); try { sessionStorage.setItem(TAB_KEY, tab); } catch (e) {} drawTabs(); }; });
    d.querySelector("main.page").classList.toggle("tm-on", tab === "test");
  }
  function fillFilters() {
    var ft = $("tmFilterType"), fb = $("tmFilterBrand"); if (!ft) return;
    var vt = ft.value, vb = fb.value;
    ft.innerHTML = opts(types(), vt, "🔧 كل الأنواع"); fb.innerHTML = opts(brands(), vb, "🏷️ كل الماركات");
  }
  function renderList() {
    var el = $("tmList"); if (!el) return;
    fillFilters();
    var t = $("tmFilterType").value, b = $("tmFilterBrand").value, q = ($("tmSearch").value || "").trim();
    var list = tests().filter(function (f) { return (!t || f.deviceType === t) && (!b || f.brand === b); }).filter(function (f) {
      if (!q) return true;
      return typeof w.wfMatch === "function" ? w.wfMatch([f.title, f.model, f.enter, f.tests, f.deviceType, f.brand], q) : nf([f.title, f.model, f.enter, f.tests, f.deviceType, f.brand].join(" ")).indexOf(nf(q)) > -1;
    }).sort(function (x, y) { return (x.deviceType || "").localeCompare(y.deviceType || "", "ar") || (x.brand || "").localeCompare(y.brand || "", "ar") || (x.title || "").localeCompare(y.title || "", "ar"); });
    var row = function (f) {
      var n = (w.WFMedia ? w.WFMedia.clean(f.media) : []).length;
      return "<div class='item tm-item'><div class='item-head'><a href='faultcode.html?id=" + encodeURIComponent(f.id) + "'><b>🧪 " + esc(f.title) + "</b></a>" + (n ? "<span class='tm-badge'>📷 " + n + "</span>" : "") + "</div><div class='tm-sub'>" + esc(f.deviceType || "كل الأنواع") + " • 🏷️ " + esc(f.brand || "كل الماركات") + (f.model ? " • " + esc(f.model) : "") + "</div>" + (f.enter ? "<div class='tm-sub'>🔑 " + esc(String(f.enter).split("\n")[0]).slice(0, 140) + "</div>" : "") + "</div>";
    };
    el.innerHTML = list.length ? (w.WFPager ? w.WFPager.render("testmodes", list, row, [t, b, q].join("|")).html : list.map(row).join("")) : "<div class='item'>" + (tests().length ? "مفيش تيست مود بالفلتر ده." : "لسه مفيش تيست مود متسجّل — دوس «➕ تيست مود جديد»، أو استورد من كتالوج PDF أو صورة بالذكاء الاصطناعي.") + "</div>";
    drawTabs();
  }
  var editing = null;
  function openForm(f) {
    editing = f || null;
    $("tmType").innerHTML = opts(types(), f ? f.deviceType : "", "كل الأنواع (عام)");
    $("tmBrand").innerHTML = opts(brands(), f ? f.brand : "", "كل الماركات (عام)");
    ["Model", "Title", "Enter", "Tests", "Exit", "Note"].forEach(function (k) { $("tm" + k).value = f ? (f[k.toLowerCase()] || "") : ""; });
    $("tmFormTitle").textContent = f ? "✏️ تعديل التيست مود" : "🧪 تيست مود جديد";
    $("tmForm").classList.remove("hidden"); $("tmTitle").focus();
  }
  function submit(e) {
    e.preventDefault();
    var v = {}; ["Model", "Title", "Enter", "Tests", "Exit", "Note"].forEach(function (k) { v[k.toLowerCase()] = $("tm" + k).value.trim(); });
    v.deviceType = $("tmType").value; v.brand = $("tmBrand").value;
    if (!v.title) return w.alert("اكتب عنوان للتيست مود.");
    if (!v.enter) return w.alert("اكتب طريقة الدخول.");
    var all = A(), key = [v.deviceType, v.brand, v.title].map(nf).join("|");
    var dup = all.filter(function (f) { return isTest(f) && (!editing || f.id !== editing.id) && [f.deviceType, f.brand, f.title].map(nf).join("|") === key; })[0];
    if (dup) return w.alert("⚠️ فيه تيست مود بنفس العنوان لنفس النوع/الماركة: «" + dup.title + "».");
    var at = new Date().toISOString(), rec;
    if (editing) { rec = all.filter(function (f) { return f.id === editing.id; })[0]; if (!rec) return; Object.assign(rec, v, { updatedAt: at }); }
    else { rec = Object.assign({ id: w.id(), kind: "test", source: "manual", media: [], createdAt: at, updatedAt: at }, v); all.push(rec); }
    if (!save(all)) return;
    location.href = "faultcode.html?id=" + encodeURIComponent(rec.id);
  }

  /* ---------------- صفحة التيست مود الواحد ---------------- */
  function profile(f, el) {
    el.classList.add("ps-context-target"); el.setAttribute("data-ps-title", "تيست مود " + (f.title || ""));
    var ps = typeof w.psActions === "function" ? w.psActions("تيست مود " + (f.title || "")) : "";
    var sec = function (icon, t, v) { return v ? "<h3 class='expense-subtitle'>" + icon + " " + t + "</h3><div class='item tm-steps'>" + nl(v) + "</div>" : ""; };
    el.innerHTML = "<div class='profile'><div class='page-head'><h1 class='profile-title'>🧪 " + esc(f.title) + "</h1><div class='compact-actions'>" +
      (can("faultcodes.edit") ? "<a class='secondary' href='faultcodes.html?tab=test&tmedit=" + encodeURIComponent(f.id) + "'>✏️ تعديل</a>" : "") +
      (can("faultcodes.delete") ? "<button class='danger-btn' data-wf-event='click' data-wf-code=\"deleteFaultCodeRecord('" + esc(f.id) + "')\">🗑️ حذف</button>" : "") + ps + "</div></div>" +
      "<div class='profile-grid'><div class='kv'><b>نوع الجهاز</b>" + (esc(f.deviceType) || "كل الأنواع (عام)") + "</div><div class='kv'><b>الماركة</b>" + (esc(f.brand) || "كل الماركات (عام)") + "</div>" + (f.model ? "<div class='kv'><b>الموديلات</b>" + esc(f.model) + "</div>" : "") + "</div>" +
      sec("🔑", "طريقة الدخول", f.enter) + sec("🧪", "الخطوات / بيختبر إيه", f.tests) + sec("🚪", "الخروج", f.exit) + sec("📝", "ملاحظات", f.note) +
      "<div id='fcMediaBox'></div><p><a href='faultcodes.html?tab=test'>← كل التيست مود</a></p></div>";
    media(f, $("fcMediaBox"));
  }

  /* ---------------- صور/فيديو لكود أو تيست مود ---------------- */
  function media(f, box) {
    if (!box) return;
    if (!w.WFMedia) { box.innerHTML = ""; return; }
    var edit = can("faultcodes.edit"), key = "fc-" + f.id, ml = w.WFMedia.clean(f.media);
    if (!ml.length && !edit) { box.innerHTML = ""; return; }
    box.innerHTML = "<h3 class='expense-subtitle'>📷 صور وفيديو " + (isTest(f) ? "(لوحة التحكم، الأزرار، الشاشة…)" : "(مكان القطعة، الشاشة، القياس…)") + "</h3>" + w.WFMedia.listHtml(ml, { removable: edit, key: key, empty: "<div class='hint'>مفيش صور لسه.</div>" }) + (edit ? w.WFMedia.actsHtml(key) : "");
    var me = function () { try { return (w.WFPerm && w.WFPerm.profile && w.WFPerm.profile().name) || ""; } catch (e) { return ""; } };
    var update = function (fn) {
      var all = A(), rec = all.filter(function (x) { return x.id === f.id; })[0]; if (!rec) return false;
      fn(rec); rec.updatedAt = new Date().toISOString();
      if (!save(all)) return false;
      f.media = rec.media; return true;
    };
    w.WFMedia.bind(key, { max: 10, count: function () { return w.WFMedia.clean(f.media).length; }, by: me,
      onAdd: function (it) { if (update(function (r) { r.media = w.WFMedia.clean(r.media).concat(it); })) media(f, $("fcMediaBox") || box); },
      onRemove: function (i) { if (update(function (r) { var m = w.WFMedia.clean(r.media); m.splice(i, 1); r.media = m; })) media(f, $("fcMediaBox") || box); } });
  }

  w.wfTestModeProfile = profile;
  w.wfFaultMedia = media;
  w.WFTestModes = { render: renderList, openForm: openForm, isTest: isTest };
  function start() {
    setupTabs();
    // صفحة ملف الكود اتعرضت قبل ما الملف ده يحمّل؟ نعرضها تاني
    try { var el = $("faultCodeProfile"); if (el && typeof w.faultCodeProfile === "function" && !$("fcMediaBox")) w.faultCodeProfile(); } catch (e) {}
  }
  function boot() { Promise.resolve(w.WFStorageReady).then(function () { setTimeout(start, 0); }, start); }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot); else boot();
})(window);
