/* ربط الورشة الفنية بنفس قاعدة Firebase بتاعة الموقع الحالي، مع دعم الأوفلاين.
   - التطبيق بيشتغل على WFStorage، وكل تعديل بيتعكس على نفس الكولكشنز (customers, devices, requests, ...).
   - أوفلاين: التعديلات (والصور) بتفضل معلّقة على الجهاز وبتترفع لوحدها أول ما النت يرجع، حتى لو قفلت الصفحة.
   - أي دمج بين الجهاز والسحابة بيحافظ على البيانات: بنقارن بآخر حالة اتزامنت، فمفيش سجل بيتمسح من السحابة إلا لو انت مسحته. */
(async function () {
  "use strict";
  if (window.WFStorageReady) await window.WFStorageReady;
  if (typeof firebase === "undefined") {
    /*
       وضع محلي حقيقي: فشل تحميل Firebase لا يعني فشل قاعدة البيانات المحلية.
       يحصل فتح الأوفلاين فقط على جهاز سبق التحقق فيه من نفس UID كموظف؛
       أما الجهاز الجديد فيظل محجوبًا حتى يتم أول تحقق أونلاين.
    */
    var localOnlyPath = /login\.html$/.test(location.pathname);
    var localOnlyUid = null, localOnlyAt = 0, localOnlyHydrated = null;
    try {
      localOnlyUid = WFStorage.getItem("wf_is_staff_uid");
      localOnlyAt = +(WFStorage.getItem("wf_staff_ok_at") || 0);
      localOnlyHydrated = WFStorage.getItem("wf_cloud_hydrated_uid");
    } catch (e) {}
    var localOnlyAllowed = !!localOnlyUid && localOnlyUid === localOnlyHydrated &&
      !!localOnlyAt && Date.now() - localOnlyAt < 12 * 3600 * 1000;
    if (!localOnlyPath && !localOnlyAllowed) {
      try {
        var lock = document.createElement("div"); lock.id = "wfCloudCover";
        lock.style.cssText = "position:fixed;inset:0;z-index:99999;background:#001b4d;color:#fff;display:flex;align-items:center;justify-content:center;font:600 18px sans-serif;direction:rtl;text-align:center;padding:20px";
        lock.textContent = "لا توجد نسخة محلية موثّقة لهذا الجهاز. افتح النظام مرة واحدة مع الإنترنت لتفعيل العمل أوفلاين.";
        (document.body || document.documentElement).appendChild(lock);
      } catch (e) {}
    }
    var localDashboard = document.getElementById("dashboard");
    if (!localOnlyPath && localOnlyAllowed && localDashboard) {
      try {
        var b = document.createElement("div"); b.id = "wfCloudBadge";
        b.style.cssText = "display:block;box-sizing:border-box;max-width:100%;margin:8px 0;padding:7px 9px;border:1px solid #b7c7dc;border-radius:10px;background:var(--panel,#fff);color:var(--text,#14213d);font:600 13px sans-serif;direction:rtl";
        b.textContent = "📴 أوفلاين — محفوظ على الجهاز";
        localDashboard.parentNode.insertBefore(b, localDashboard.nextSibling);
      } catch (e) {}
    }
    try { window.addEventListener("online", function () { location.reload(); }); } catch (e) {}
    console.warn("Firebase SDK غير متاح — التطبيق يعمل محليًا إذا كان الجهاز موثّقًا سابقًا.");
    return;
  }
  var CFG = window.WF_FIREBASE_CONFIG; // من firebase-config.js (حسب الدومين: إنتاج أو تجريبي)
  if (!CFG) {
    // بيئة تجريبية لسه مش مجهّزة: نقفل الصفحة بدل ما نتصل بأي بيانات.
    try {
      var envLock = document.createElement("div"); envLock.id = "wfCloudCover";
      envLock.style.cssText = "position:fixed;inset:0;z-index:99999;background:#001b4d;color:#fff;display:flex;align-items:center;justify-content:center;font:600 18px sans-serif;direction:rtl;text-align:center;padding:24px";
      envLock.textContent = "هذه بيئة تجريبية غير مجهّزة بعد. أضف إعدادات مشروع Firebase التجريبي في firebase-config.js.";
      (document.body || document.documentElement).appendChild(envLock);
    } catch (e) {}
    return;
  }
  var COLS = { wf_c: "customers", wf_d: "devices", wf_r: "requests", wf_p: "parts", wf_tr: "treasury", wf_tasks: "tasks", wf_wallet_tx: "walletTx", wf_fault_codes: "faultCodes", wf_inv: "invoices", wf_m: "partMoves" };
  var EXTRA = ["wf_e", "wf_trash", "wf_followup_log", "wf_pending_calls", "wf_comp_custom", "wf_comp_fav", "wf_techpay"];
  var SETTINGS = "wf_s", CHUNK = 250000, TIMEOUT = 25000;
  var ALL = Object.keys(COLS).concat(EXTRA, [SETTINGS]);
  var REMOTE_RETRY_KEYS = ["remote:portalOrders", "remote:portalConfig", "remote:portalTicker", "remote:techOrders"];
  var HYD = "wf_cloud_hydrated_uid", BASEKEY = "wf_syncbase", FULL = "wf_last_full_sync", SEEN = "wf_meta_seen";
  var isLogin = /login\.html$/.test(location.pathname);
  /* الوضع المحدود (فني «أوامره المعيّنة فقط»): السيرفر نفسه (قواعد Firestore) بيمنعه من قراءة أي حاجة غير أوامره المفتوحة المعيّنة له
     + عميل/جهاز كل أمر منهم (من techOrders). فالمزامنة بتنزّل دول بس، وبترفع تعديلات أوامره بس، ومفيش أي عملية إدارية. */
  // نفس قايمة المنع اللي في firestore.rules (techOrderPatch)
  var TECH_LOCKED = {}; ["techId", "techName", "techWallet", "assignedAt", "assignedBy", "customerId", "deviceId", "addressKey", "no", "createdAt", "source", "portalRequestId", "portalVis", "portal",
    "deposit", "depositWallet", "depositExtra", "closed", "paid", "paidAt", "closedAt", "closeWallet", "closedByTech", "jobType", "jobTypeName", "techPay", "techPayManual", "techPayAt", "techPayBy", "payShares", "payShareUids", "returnPayPending", "depositRefunded", "warrantyUntil", "warrantyDays", "warrantyManual", "warrantyDecision", "warrantyOf", "warrantyOfNo", "warrantyOfScope", "warrantyScope"].forEach(function (f) { TECH_LOCKED[f] = 1; });
  var SCOPED = false, MODE_KEY = "wf_sync_mode", UID_KEY = "wf_sync_uid", wipedForMode = false, TECH_PAGES = /\/(tech|login|privacy|terms|index|requests|request|customers|customer|devices|device|route)\.html$|\/$/; // صفحات بتشتغل ببيانات الفني (أوامره وعملاؤها وأجهزتها). أي صفحة تانية بتحوّله لبوابته
  var ls = window.WFStorage, origSet = ls.setItem.bind(ls), origRemove = ls.removeItem.bind(ls);
  var db = null, meta = null, ready = false, applying = false, timers = {}, lastRaw = {}, flushing = false, hydrating = false, pushing = {};
  var RETRY_KEY = "wf_sync_retry_state", CONFLICT_KEY = "wf_sync_conflicts", retryState = {}, retryTimers = {}, conflicts = {}, lastSyncAt = +(ls.getItem("wf_last_sync_at") || 0), lastSyncError = ls.getItem("wf_sync_last_error") || "";
  try { retryState = JSON.parse(ls.getItem(RETRY_KEY) || "{}") || {}; } catch (e) { retryState = {}; }
  try { conflicts = JSON.parse(ls.getItem(CONFLICT_KEY) || "{}") || {}; } catch (e) { conflicts = {}; }
  var DEV = ls.getItem("wf_device_id") || (function () { var x = Math.random().toString(36).slice(2); origSet.call(ls, "wf_device_id", x); return x; })();
  var SB; try { SB = JSON.parse(ls.getItem(BASEKEY)) || {}; } catch (e) { SB = {}; } SB.c = SB.c || {}; SB.x = SB.x || {};
  // كذا حفظ لـ«أصل المزامنة» في نفس الدورة → كتابة واحدة في آخرها (النص ده ممكن يبقى ~مليون حرف)
  var baseQueued = false;
  function saveBase() { baseVer = (typeof baseVer === "number" ? baseVer : 0) + 1; if (baseQueued) return; baseQueued = true; Promise.resolve().then(function () { baseQueued = false; origSet.call(ls, BASEKEY, JSON.stringify(SB)); }); }

  /* ---------- واجهة ---------- */
  function cover(msg) { var ex = document.getElementById("wfCloudCover"); if (ex) { ex.textContent = msg; return; } var d = document.createElement("div"); d.id = "wfCloudCover"; d.style.cssText = "position:fixed;inset:0;z-index:99999;background:#001b4d;color:#fff;display:flex;align-items:center;justify-content:center;font:600 18px sans-serif;direction:rtl;text-align:center;padding:20px"; d.textContent = msg; (document.body || document.documentElement).appendChild(d); }
  function uncover() { var c = document.getElementById("wfCloudCover"); if (c) c.remove(); }
  var scripts = {};
  function loadScript(src) { // تحميل ملف مساعد عند الحاجة (مرة واحدة)
    if (scripts[src]) return scripts[src];
    return (scripts[src] = new Promise(function (res) { var t = document.createElement("script"); t.src = src; t.onload = t.onerror = function () { res(); }; document.head.appendChild(t); }));
  }
  function rememberLogin(email, pw) { // حفظ الدخول في مدير كلمات المرور بتاع المتصفح (مش في تخزين الموقع)
    try { if (window.PasswordCredential && navigator.credentials && email && pw) navigator.credentials.store(new PasswordCredential({ id: email, password: pw })).catch(function () {}); } catch (e) {}
  }
  function forgetLogin() { try { if (navigator.credentials && navigator.credentials.preventSilentAccess) navigator.credentials.preventSilentAccess().catch(function () {}); } catch (e) {} }
  function banner() { if (document.getElementById("wfCloudBanner")) return; var b = document.createElement("div"); b.id = "wfCloudBanner"; b.style.cssText = "position:fixed;bottom:70px;left:12px;right:12px;z-index:9999;background:#0b57d0;color:#fff;padding:12px;border-radius:10px;text-align:center;direction:rtl;font:600 15px sans-serif;cursor:pointer"; b.textContent = "🔄 فيه تحديث من جهاز تاني — اضغط لإعادة التحميل"; b.onclick = function () { location.reload(); }; (document.body || document.documentElement).appendChild(b); }
  function pendingKeys() { return ALL.filter(function (k) { return (lastRaw[k] !== undefined && ls.getItem(k) !== lastRaw[k]) || !!timers[k] || !!pushing[k] || !!retryTimers[k]; }).concat(REMOTE_RETRY_KEYS.filter(function (k) { return !!retryState[k] || !!retryTimers[k]; })); }
  function retryDelay(attempt) { return Math.min(5 * 60 * 1000, 2000 * Math.pow(2, Math.max(0, attempt - 1))); }
  function saveRetryState() { try { origSet.call(ls, RETRY_KEY, JSON.stringify(retryState)); } catch (e) {} }
  function scheduleRetry(k) {
    var item = retryState[k]; if (!item) return;
    saveRetryState(); clearTimeout(retryTimers[k]);
    retryTimers[k] = setTimeout(function () {
      delete retryTimers[k]; if (!ready || !online()) { badge(); return; }
      if (REMOTE_RETRY_KEYS.indexOf(k) > -1) {
        var currentSettings = typeof window.settings === "function" ? window.settings() : {};
        var job = k === "remote:portalOrders" ? projectPortalOrders() : (k === "remote:techOrders" ? projectTech() : (k === "remote:portalConfig" ? publishPortalConfig() : publishTicker(currentSettings.portalTicker || null)));
        Promise.resolve(job).then(function (ok) { if (ok === false && !retryTimers[k]) retryLater(k); }).catch(function () { if (!retryTimers[k]) retryLater(k); });
      } else push(k, false);
      badge();
    }, Math.max(0, (+item.nextAt || Date.now()) - Date.now()));
  }
  function retryLater(k) {
    var item = retryState[k] || (retryState[k] = { attempts: 0 });
    item.attempts = Math.min(12, (+item.attempts || 0) + 1); item.nextAt = Date.now() + retryDelay(item.attempts);
    scheduleRetry(k);
  }
  function clearRetry(k) { delete retryState[k]; clearTimeout(retryTimers[k]); delete retryTimers[k]; saveRetryState(); }
  function resumeRetries() { Object.keys(retryState).forEach(function (k) { if (ALL.indexOf(k) > -1 || REMOTE_RETRY_KEYS.indexOf(k) > -1) scheduleRetry(k); }); }
  // عدّ التعديلات المعلّقة كان بيحسب بصمة كل سجل في كل مجموعة مع كل تحديث للشارة (كل 15 ثانية وبعد كل رفع)
  // — مع آلاف الأوامر ده كان بيعلّق الصفحة ثواني. دلوقتي: المجموعة اللي اترفعت وماتغيّرتش = صفر من غير حساب،
  // والباقي بيتحسب مرة واحدة لكل نسخة من البيانات.
  var pcCache = {}, baseVer = 0;
  function countPendingOperations() {
    var count = 0;
    ALL.forEach(function (k) {
      if (COLS[k]) {
        var rawNow = ls.getItem(k);
        if (lastRaw[k] !== undefined && rawNow === lastRaw[k]) return;
        var c = pcCache[k];
        if (c && c.raw === rawNow && c.ver === baseVer) { count += c.n; return; }
        var tq = touchedIdx(k);
        if (tq) { var base0 = SB.c[k] || {}, n0 = 0; tq.ids.forEach(function (id) { var r = tq.idx[id]; if (!r || base0[id] !== hrc(r)) n0++; }); pcCache[k] = { raw: rawNow, ver: baseVer, n: n0 }; count += n0; return; }
        var localRows = localRO(k), rows = Array.isArray(localRows) ? localRows : [], base = SB.c[k] || {}, seen = {}, n = 0;
        rows.forEach(function (r) { if (!r || !r.id) return; seen[r.id] = 1; if (base[r.id] !== hrc(r)) n++; });
        Object.keys(base).forEach(function (id) { if (!seen[id]) n++; });
        pcCache[k] = { raw: rawNow, ver: baseVer, n: n }; count += n;
      } else if (lastRaw[k] !== undefined && ls.getItem(k) !== lastRaw[k]) count++;
    });
    return count + REMOTE_RETRY_KEYS.filter(function (k) { return !!retryState[k]; }).length;
  }
  function isHomePage() { return !!document.getElementById("dashboard"); }
  function syncPanel() {
    var panel = document.getElementById("wfSyncStatusPanel");
    if (isLogin || !document.body) return;
    if (!isHomePage()) { if (panel) panel.remove(); return; }
    if (!panel) {
      panel = document.createElement("section"); panel.id = "wfSyncStatusPanel";
      panel.setAttribute("aria-live", "polite");
      panel.style.cssText = "position:relative;display:flex;align-items:center;gap:8px;min-width:0;max-width:100%;margin:8px 0;padding:7px 9px;border:1px solid #b7c7dc;border-radius:10px;background:var(--panel,#fff);color:var(--text,#14213d);direction:rtl;box-shadow:0 2px 8px #001b4d12;font-size:13px;white-space:nowrap";
      var dash = document.getElementById("dashboard");
      if (dash && dash.parentNode) dash.parentNode.insertBefore(panel, dash.nextSibling); else (document.querySelector("main") || document.body).prepend(panel);
    }
    var pending = pendingKeys().length, waiting = countPendingOperations();
    var status = navigator.onLine === false ? "غير متصل — محفوظ محليًا" : (pending ? (Object.keys(retryTimers).length ? "إعادة المحاولة بانتظار Backoff" : "توجد تعديلات تنتظر المزامنة") : (ready ? "متزامن" : "جارٍ التحقق/الاتصال"));
    var last = lastSyncAt ? new Date(lastSyncAt).toLocaleString("ar-EG") : "لم تتم مزامنة ناجحة بعد";
    var conflictCount = Object.keys(conflicts).reduce(function (n, k) { return n + Object.keys(conflicts[k] || {}).length; }, 0);
    var summary = lastSyncError ? "خطأ: " + lastSyncError : status;
    if (pending) summary += " · معلّق " + pending;
    if (lastSyncAt) summary += " · " + new Date(lastSyncAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
    if (conflictCount) summary += " · تعارض " + conflictCount;
    var wasOpen = !!(panel.querySelector("#wfSyncDetails") && panel.querySelector("#wfSyncDetails").open);
    panel.innerHTML = "<strong style='flex:0 0 auto'>☁️ المزامنة</strong><span id='wfSyncSummary' style='flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis' title=''></span><button type='button' id='wfSyncNowBtn' style='flex:0 0 auto;border:0;border-radius:7px;padding:6px 9px;background:#0b57d0;color:#fff;font-weight:700'>مزامنة</button><details id='wfSyncDetails' style='position:relative;flex:0 0 auto'><summary style='cursor:pointer;list-style:none;border:1px solid #b7c7dc;border-radius:7px;padding:5px 8px'>التفاصيل</summary><div style='position:absolute;top:calc(100% + 6px);left:0;z-index:9999;width:min(330px,calc(100vw - 36px));box-sizing:border-box;white-space:normal;background:var(--panel,#fff);color:var(--text,#14213d);border:1px solid #b7c7dc;border-radius:10px;padding:10px;box-shadow:0 4px 16px #001b4d30'><div><b>الحالة:</b> <span id='wfSyncState'></span></div><div><b>آخر مزامنة:</b> <span id='wfSyncLast'></span></div><div><b>التعديلات المعلقة:</b> <span id='wfSyncPending'></span></div><div><b>عدد العمليات المنتظرة:</b> <span id='wfSyncWaiting'></span></div><div><b>آخر خطأ:</b> <span id='wfSyncError'></span></div><div><b>تعارضات تحتاج مراجعة:</b> <span id='wfSyncConflicts'></span> <button type='button' id='wfSyncConflictBtn' style='display:none;border:0;border-radius:7px;padding:5px 8px;background:#b45309;color:#fff'>مراجعة</button><div style='margin-top:6px'><button type='button' id='wfSyncTrashBtn' style='border:1px solid #b7c7dc;border-radius:7px;padding:5px 8px;background:transparent;color:inherit'>🗑️ المحذوف من السحابة (30 يوم)</button></div></div></div></details>";
    var summaryNode = panel.querySelector("#wfSyncSummary"); summaryNode.textContent = summary; summaryNode.title = summary;
    panel.querySelector("#wfSyncState").textContent = status;
    panel.querySelector("#wfSyncLast").textContent = last;
    panel.querySelector("#wfSyncPending").textContent = String(pending);
    panel.querySelector("#wfSyncWaiting").textContent = String(waiting);
    panel.querySelector("#wfSyncError").textContent = lastSyncError || "لا يوجد";
    panel.querySelector("#wfSyncConflicts").textContent = String(conflictCount);
    panel.querySelector("#wfSyncConflictBtn").style.display = conflictCount ? "inline-block" : "none";
    panel.querySelector("#wfSyncConflictBtn").onclick = showSyncConflicts;
    var tb = panel.querySelector("#wfSyncTrashBtn"); if (tb) tb.onclick = showCloudDeleted;
    panel.querySelector("#wfSyncNowBtn").onclick = function () { var btn = this; btn.disabled = true; btn.textContent = "جارٍ…"; window.wfCloudSyncNow().catch(function (e) { lastSyncError = String(e && e.message || e); origSet.call(ls, "wf_sync_last_error", lastSyncError); }).then(function () { btn.disabled = false; btn.textContent = "مزامنة"; badge(); }); };
    if (wasOpen) panel.querySelector("#wfSyncDetails").open = true;
  }
  function badge() {
    if (isLogin || !document.body) return;
    var oldBadge = document.getElementById("wfCloudBadge"); if (oldBadge) oldBadge.remove();
    syncPanel();
  }

  function showSyncConflicts() {
    var rows = [];
    Object.keys(conflicts).forEach(function (k) { Object.keys(conflicts[k] || {}).forEach(function (id) { rows.push({ key: k, id: id, value: conflicts[k][id] }); }); });
    if (!rows.length) return;
    var modal = document.createElement("div"); modal.style.cssText = "position:fixed;inset:0;z-index:100000;background:#0009;display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl";
    var box = document.createElement("div"); box.style.cssText = "background:#fff;color:#172033;border-radius:12px;padding:16px;max-width:620px;width:100%;max-height:80vh;overflow:auto";
    var title = document.createElement("h3"); title.textContent = "تعارضات المزامنة — اختر النسخة لكل سجل"; box.appendChild(title);
    var note = document.createElement("p"); note.textContent = "لم يُستبدل أي سجل أحدث. اختر الاحتفاظ بنسخة السحابة أو اعتماد نسخة هذا الجهاز لكل تعارض."; box.appendChild(note);
    rows.forEach(function (item) {
      var row = document.createElement("div"); row.style.cssText = "border-top:1px solid #ddd;padding:10px 0";
      var label = document.createElement("b"); label.textContent = conflictLabel(item); row.appendChild(label);
      var diff = conflictDiff(item.value); if (diff) { var dv = document.createElement("div"); dv.style.cssText = "font-size:13px;color:#555;margin-top:4px;white-space:pre-line"; dv.textContent = diff; row.appendChild(dv); }
      var localBtn = document.createElement("button"), cloudBtn = document.createElement("button");
      localBtn.type = cloudBtn.type = "button"; localBtn.textContent = "اعتماد نسخة هذا الجهاز"; cloudBtn.textContent = "اعتماد نسخة السحابة";
      localBtn.style.cssText = cloudBtn.style.cssText = "margin:8px 6px 0 0;padding:7px;border:0;border-radius:7px;background:#0b57d0;color:white";
      localBtn.onclick = function () { resolveSyncConflict(item.key, item.id, "local", modal); };
      cloudBtn.onclick = function () { resolveSyncConflict(item.key, item.id, "cloud", modal); };
      row.appendChild(localBtn); row.appendChild(cloudBtn); box.appendChild(row);
    });
    var close = document.createElement("button"); close.type = "button"; close.textContent = "إغلاق"; close.onclick = function () { modal.remove(); }; box.appendChild(close); modal.appendChild(box); document.body.appendChild(modal);
  }
  var COL_AR = { wf_c: "عميل", wf_d: "جهاز", wf_r: "أمر شغل", wf_p: "قطعة", wf_tr: "حركة خزنة", wf_tasks: "مهمة", wf_wallet_tx: "حركة محفظة", wf_fault_codes: "كود عطل", wf_inv: "فاتورة", wf_m: "حركة مخزن" };
  function conflictLabel(row) {
    var v = row.value || {}, r = v.local || v.remote || {};
    var name = r.no || r.name || r.code || r.title || r.reason || row.id;
    return (COL_AR[row.key] || row.key) + " — " + name;
  }
  var DEP_FIELDS = ["deposit", "depositWallet", "depositExtra"];
  function depNum(r) { return Math.round((+(r && r.deposit) || 0) * 100) / 100; }
  /* الفلوس اللي اتسجل استلامها على الجهاز ماتضيعش لو اخترت نسخة السحابة: لو عربون الجهاز أكبر، بيتنقل للنسخة اللي هتتحفظ */
  function keepLocalDeposit(k, local, remote) {
    if (k !== "wf_r" || !local || !remote) return remote;
    if (!(depNum(local) > depNum(remote) + 0.004)) return remote;
    var m = Object.assign({}, remote);
    DEP_FIELDS.forEach(function (f) { if (local[f] !== undefined) m[f] = local[f]; });
    m.remain = Math.max(0, Math.round(((+m.total || 0) - ((+m.deposit || 0) - (+m.depositRefunded || 0))) * 100) / 100);
    return m;
  }
  function conflictDiff(v) {
    if (!v || !v.local || !v.remote) return "";
    var skip = { _ts: 1, _by: 1, updatedAt: 1 }, keys = {}, out = [];
    Object.keys(v.local).concat(Object.keys(v.remote)).forEach(function (f) { if (!skip[f]) keys[f] = 1; });
    Object.keys(keys).forEach(function (f) { if (JSON.stringify(v.local[f]) !== JSON.stringify(v.remote[f])) out.push(f); });
    var t = out.length ? "الحقول المختلفة: " + out.slice(0, 12).join("، ") : "";
    if (depNum(v.local) !== depNum(v.remote)) t += "\n💵 العربون: على الجهاز " + depNum(v.local).toFixed(2) + " — في السحابة " + depNum(v.remote).toFixed(2) + (depNum(v.local) > depNum(v.remote) ? " (لو اخترت السحابة، عربون الجهاز هيفضل محفوظ)" : "");
    return t;
  }
  window.wfKeepLocalDeposit = keepLocalDeposit;
  function resolveSyncConflict(k, id, choice, modal) {
    var item = conflicts[k] && conflicts[k][id]; if (!item) return;
    if (k === SETTINGS) {
      var remoteRaw = JSON.stringify(item.remote || {});
      if (choice === "cloud") { raw(k, remoteRaw); setSettingsBase(remoteRaw); }
      else setSettingsBase(remoteRaw);
      SB.x[k] = h(remoteRaw); saveBase();
      delete conflicts[k][id]; if (!Object.keys(conflicts[k]).length) delete conflicts[k];
      origSet.call(ls, CONFLICT_KEY, JSON.stringify(conflicts));
      if (modal && !Object.keys(conflicts).some(function (key) { return Object.keys(conflicts[key] || {}).length; })) modal.remove();
      badge();
      if (choice === "local") push(k, true); else { publishPortalConfig(); projectOrders(); pushAll(false); }
      return;
    }
    if (choice === "cloud") {
      var records = local(k), list = Array.isArray(records) ? records.slice() : [], at = list.findIndex(function (r) { return r && r.id === id; });
      var keep = keepLocalDeposit(k, item.local, item.remote);
      if (keep) { if (at < 0) list.push(keep); else list[at] = keep; }
      else if (at >= 0) list.splice(at, 1);
      origSet.call(ls, k, JSON.stringify(list));
      SB.c[k] = SB.c[k] || {}; if (item.remoteHash) SB.c[k][id] = item.remoteHash; else delete SB.c[k][id]; saveBase();
      dropBase(k, id);
    } else {
      SB.c[k] = SB.c[k] || {}; if (item.remoteHash) SB.c[k][id] = item.remoteHash; else delete SB.c[k][id]; saveBase();
      if (item.remote) { BR[k] = BR[k] || {}; BR[k][id] = JSON.parse(JSON.stringify(item.remote)); saveBR(); }
    }
    delete conflicts[k][id]; if (!Object.keys(conflicts[k]).length) delete conflicts[k];
    origSet.call(ls, CONFLICT_KEY, JSON.stringify(conflicts));
    if (modal && !Object.keys(conflicts).some(function (key) { return Object.keys(conflicts[key] || {}).length; })) modal.remove();
    badge(); if (choice === "local") push(k, true); else pushAll(false);
  }
  window.wfResolveSyncConflicts = showSyncConflicts;

  /* ---------- المحذوف من السحابة: أي سجل اتمسح (من أي جهاز) بيفضل 30 يوم ويترجع بضغطة ---------- */
  function showCloudDeleted() {
    if (!online()) { window.alert("محتاج نت."); return; }
    if (SCOPED) return;
    var modal = document.createElement("div"); modal.id = "wfCloudTrash"; modal.style.cssText = "position:fixed;inset:0;z-index:100000;background:#0009;display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl";
    var box = document.createElement("div"); box.style.cssText = "background:var(--panel,#fff);color:var(--text,#172033);border-radius:12px;padding:16px;max-width:640px;width:100%;max-height:80vh;overflow:auto";
    box.innerHTML = "<h3 style='margin-top:0'>🗑️ المحذوف من السحابة</h3><p style='font-size:13px'>كل سجل اتمسح من أي جهاز في آخر 30 يوم. «رجّعه» بيرجّعه لكل الأجهزة.</p><div id='wfCtList'>⏳ جاري التحميل…</div>";
    var close = document.createElement("button"); close.type = "button"; close.textContent = "إغلاق"; close.style.cssText = "margin-top:10px"; close.onclick = function () { modal.remove(); };
    box.appendChild(close); modal.appendChild(box); modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); }); document.body.appendChild(modal);
    var list = box.querySelector("#wfCtList"), KEY_OF = {}; Object.keys(COLS).forEach(function (k) { KEY_OF[COLS[k]] = k; });
    /* شواهد الأرشيف (arch: true، من غير نسخة السجل) كتير وبتيجي في نفس الترتيب: بنقرا صفحات لحد ما نلاقي 150 محذوف فعلًا */
    function pageDeleted(after, acc, pages) {
      var q = db.collection("syncDeletes").orderBy("_ts", "desc"); if (after) q = q.startAfter(after);
      return withTimeout(q.limit(400).get()).then(function (snap) {
        snap.docs.forEach(function (d) { var x = d.data() || {}; if (x.rec && !x.arch) acc.push(d); });
        if (acc.length >= 150 || snap.docs.length < 400 || pages >= 8) return acc.slice(0, 150);
        return pageDeleted(snap.docs[snap.docs.length - 1], acc, pages + 1);
      });
    }
    pageDeleted(null, [], 1).then(function (docs) {
      var rows = docs.map(function (d) { var x = d.data() || {}; return { x: x, t: tsMs(d) }; }).filter(function (r) { return r.x.rec && KEY_OF[r.x.c] && (!r.x.exp || !r.x.exp.toMillis || r.x.exp.toMillis() > Date.now()); });
      list.innerHTML = ""; if (!rows.length) { list.textContent = "مفيش حاجة اتمسحت في آخر 30 يوم (أو اتمسحت قبل التحديث ده)."; return; }
      rows.forEach(function (r) {
        var rec; try { rec = JSON.parse(r.x.rec); } catch (e) { return; }
        var k = KEY_OF[r.x.c], row = document.createElement("div"); row.style.cssText = "border-top:1px solid #ddd;padding:8px 0;display:flex;gap:8px;align-items:center;justify-content:space-between";
        var lab = document.createElement("div"); lab.style.cssText = "min-width:0;font-size:13px";
        var b = document.createElement("b"); b.textContent = (COL_AR[k] || k) + " — " + (rec.no || rec.name || rec.code || rec.title || rec.reason || rec.id); lab.appendChild(b);
        var sm = document.createElement("div"); sm.style.cssText = "opacity:.75"; sm.textContent = "اتمسح " + (r.t ? new Date(r.t).toLocaleString("ar-EG") : ""); lab.appendChild(sm);
        var go = document.createElement("button"); go.type = "button"; go.textContent = "↩️ رجّعه"; go.style.cssText = "flex:0 0 auto";
        go.onclick = function () {
          var cur = local(k) || []; if (cur.some(function (x) { return x && x.id === rec.id; })) { go.textContent = "موجود ✅"; go.disabled = true; return; }
          if (!window.confirm("ترجيع " + b.textContent + "؟")) return;
          rec.id = rec.id || r.x.id; cur.push(rec); cur.sort(byCreated);
          if (!saveLocal(k, cur)) { window.alert("تعذر الحفظ."); return; }
          try { if (window.auditLog) window.auditLog("ترجيع سجل محذوف من السحابة", COL_AR[k] || k, rec.id, b.textContent); } catch (e) {}
          go.textContent = "اترجع ✅"; go.disabled = true; queue(k);
        };
        row.appendChild(lab); row.appendChild(go); list.appendChild(row);
      });
    }).catch(function (e) { list.textContent = "تعذر التحميل: " + ((e && e.message) || e); });
  }
  window.wfShowCloudDeleted = showCloudDeleted;

  /* ---------- أدوات ---------- */
  function h(s) { var x = 5381, i = s.length; while (i) x = ((x << 5) + x + s.charCodeAt(--i)) | 0; return (x >>> 0).toString(36) + s.length.toString(36); }
  function clean(v) { if (v && typeof v.toDate === "function") return v.toDate().toISOString(); if (Array.isArray(v)) return v.map(clean); if (v && typeof v === "object") { var o = {}; Object.keys(v).forEach(function (k) { o[k] = clean(v[k]); }); return o; } return v; }
  var ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:?\d\d)?$/;
  function stable(v) { if (typeof v === "string" && ISO.test(v)) { var t = Date.parse(v); if (!isNaN(t)) return JSON.stringify("~" + t); } if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]"; if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}"; return JSON.stringify(v === undefined ? null : v); }
  function sameField(a, b, key) { var ah = Object.prototype.hasOwnProperty.call(a || {}, key), bh = Object.prototype.hasOwnProperty.call(b || {}, key); return ah === bh && (!ah || stable(a[key]) === stable(b[key])); }
  function hr(r) { var o = Object.assign({}, r); delete o.id; delete o._by; return h(stable(o)); }
  /* بصمة سجل من نسخة القراءة: بتتحسب مرة لكل سجل (السجلات اللي ما اتغيّرتش بتفضل نفس الكائن بعد الحفظ)،
     بدل ما كل رفع بعد أي حفظ يحسب بصمة آلاف الأوامر مرتين (كان بيوقّف الموبايل ثواني بعد كل حفظ). */
  var hrMemo = typeof WeakMap === "function" ? new WeakMap() : null;
  function hrc(r) { if (!hrMemo || !r || typeof r !== "object") return hr(r); var v = hrMemo.get(r); if (v === undefined) { v = hr(r); hrMemo.set(r, v); } return v; }
  /* السجلات المتعدّلة من آخر مزامنة (لما كل التعديلات جت من «تعديل سجل واحد»): بنفحص دول بس بدل كل القسم.
     touched[k] = Set (معروفين) أو undefined (مش معروف → فحص كامل زي الأول). */
  var touched = {}, fastNote = {};
  function touchedIdx(k) { var t = touched[k]; if (!(t instanceof Set) || SCOPED) return null; var a = localRO(k) || [], idx = {}; for (var i = 0; i < a.length; i++) { var r = a[i]; if (r && r.id && t.has(r.id)) idx[r.id] = r; } return { ids: Array.from(t), idx: idx }; }
  /* ---------- دمج حقل بحقل ----------
     لكل سجل اتعدّل على الجهاز بنحفظ «أصله» (آخر نسخة كانت متطابقة مع السحابة). لما السحابة تتغيّر هي كمان،
     بدل ما نسجّل تعارض ونخيّرك بين النسختين كاملين (أو نكتب فوق التاني بصمت)، بنقارن كل حقل بأصله:
     اللي اتغيّر هنا بس ← بتاعنا، اللي اتغيّر في السحابة بس ← بتاعها، والاتنين غيّروه ← قواعد تحت. */
  var BRKEY = "wf_sync_base_recs", BR; try { BR = JSON.parse(ls.getItem(BRKEY)) || {}; } catch (e) { BR = {}; }
  var brTimer = null;
  function saveBR() { clearTimeout(brTimer); brTimer = setTimeout(function () { try { origSet.call(ls, BRKEY, JSON.stringify(BR)); } catch (e) {} }, 300); }
  function baseRec(k, id, hash) { var b = BR[k] && BR[k][id]; return b && (hash === undefined || hr(b) === hash) ? b : null; }
  function dropBase(k, id) { if (BR[k] && BR[k][id]) { delete BR[k][id]; saveBR(); } }
  var brParsed = {};
  function lastMap(k) {
    var r0 = lastRaw[k]; if (typeof r0 !== "string") return null;
    if (brParsed[k] && brParsed[k].raw === r0) return brParsed[k].map;
    var m = {}; try { (JSON.parse(r0) || []).forEach(function (r) { if (r && r.id) m[r.id] = r; }); } catch (e) { return null; }
    brParsed[k] = { raw: r0, map: m }; return m;
  }
  /* بيتنادى قبل الرفع (حتى أوفلاين): أي سجل بقى مختلف عن السحابة ولسه ماتحفظلوش أصل، أصله = نسخته في آخر حالة متزامنة */
  function captureBases(k) {
    if (!COLS[k] || SCOPED) return;
    if (ls.getItem(k) === lastRaw[k]) return; // مفيش تعديل محلي من آخر مزامنة
    var B = SB.c[k] || {}, bk = BR[k] = BR[k] || {}, any = false, need = [], tx = touchedIdx(k);
    if (tx) tx.ids.forEach(function (id) { var r = tx.idx[id]; if (r && !bk[id] && B[id] !== undefined && hrc(r) !== B[id]) need.push(id); });
    else (localRO(k) || []).forEach(function (r) { if (r && r.id && !bk[r.id] && B[r.id] !== undefined && hrc(r) !== B[r.id]) need.push(r.id); });
    if (!need.length) return;
    var m = lastMap(k); if (!m) return;
    need.forEach(function (id) { var b = m[id]; if (!b || hr(b) !== B[id]) return; bk[id] = JSON.parse(JSON.stringify(b)); any = true; });
    if (any) saveBR();
  }
  /* تعديل سجل واحد (updateRecordFast): السجل القديم نفسه هو «الأصل» لو كان متزامن — نحفظه من غير ما نحلل نص القسم كله */
  window.wfSyncNoteDone = function (k) { delete fastNote[k]; }; // لو الحفظ ما تمّش، الملاحظة ماتتطبّقش على كتابة تانية
  window.wfSyncNoteBase = function (k, oldRec) {
    try {
      if (!COLS[k] || SCOPED || !oldRec || !oldRec.id) return;
      (fastNote[k] = fastNote[k] || []).push(oldRec.id);
      var B = SB.c[k] || {}; if (B[oldRec.id] === undefined || (BR[k] && BR[k][oldRec.id])) return;
      if (hrc(oldRec) === B[oldRec.id]) { BR[k] = BR[k] || {}; BR[k][oldRec.id] = JSON.parse(JSON.stringify(oldRec)); saveBR(); }
    } catch (e) {}
  };
  var DEP_SET = ["deposit", "depositWallet", "depositExtra"], CLOSE_SET = ["closed", "paid", "paidAt", "closedAt", "closeWallet", "closedByTech", "remain", "warrantyDays", "warrantyUntil"];
  function merge3(k, base, loc, rem) {
    var out = {}, keys = {}, both = [];
    [base, loc, rem].forEach(function (o) { Object.keys(o || {}).forEach(function (f) { keys[f] = 1; }); });
    Object.keys(keys).forEach(function (f) {
      var pick;
      if (f === "id") pick = loc;
      else if (sameField(loc, rem, f)) pick = loc;
      else if (sameField(loc, base, f)) pick = rem;       // اتغيّر في السحابة بس
      else if (sameField(rem, base, f)) pick = loc;       // اتغيّر هنا بس
      else { both.push(f); pick = loc; }                   // الاتنين غيّروه: الأحدث على الجهاز ده (زي قبل كده) — إلا القواعد تحت
      if (Object.prototype.hasOwnProperty.call(pick || {}, f)) out[f] = pick[f];
    });
    if (k === "wf_r" && both.length) {
      var take = function (src, list) { list.forEach(function (f) { if (Object.prototype.hasOwnProperty.call(src, f)) out[f] = src[f]; else delete out[f]; }); };
      // الفلوس اللي اتسجل استلامها مابتضيعش: العربون الأكبر هو اللي يفضل
      if (both.some(function (f) { return DEP_SET.indexOf(f) > -1; })) take((+rem.deposit || 0) > (+loc.deposit || 0) ? rem : loc, DEP_SET);
      // الأمر اتقفل في السحابة (الفني قفله من السيرفر مثلًا) → بيانات القفل والتحصيل من السحابة
      if ((rem.closed === true || rem.paid === true) && !(loc.closed === true || loc.paid === true)) take(rem, CLOSE_SET.concat(["status", "statusHistory", "completedAt"]));
      // سجل الحالات: نجمع الاتنين من غير تكرار
      if (both.indexOf("statusHistory") > -1 && Array.isArray(loc.statusHistory) && Array.isArray(rem.statusHistory) && !(rem.closed && !loc.closed)) {
        var seenH = {}, hist = [];
        loc.statusHistory.concat(rem.statusHistory).forEach(function (x) { var key = stable(x); if (!seenH[key]) { seenH[key] = 1; hist.push(x); } });
        hist.sort(function (a, b) { return (Date.parse(a && a.at) || 0) - (Date.parse(b && b.at) || 0); }); out.statusHistory = hist;
      }
    }
    if (k === "wf_r" && !out.paid) out.remain = Math.max(0, Math.round(((+out.total || 0) - ((+out.deposit || 0) - (+out.depositRefunded || 0))) * 100) / 100);
    return { rec: out, both: both };
  }
  window.wfMerge3 = merge3;
  function fromDoc(d) { var o = clean(d.data()); delete o._ts; delete o._by; o.id = d.id; return o; }
  /* ---------- المزامنة بالتغييرات بس (بدل إعادة قراءة كل البيانات) ----------
     كل سجل بيترفع بيتختم بوقت السيرفر (_ts)، والحذف بيسيب «شاهد» في syncDeletes. الأجهزة التانية بتقرا بس
     اللي اتختم بعد آخر مرة قرت (cursor = أكبر _ts شافته، من ساعة السيرفر مش ساعة الجهاز). قراءة كاملة بتحصل
     أول مرة، أو لو آخر قراءة كاملة عدّى عليها 12 ساعة، أو لو جهاز رفع نسخة كاملة (استرجاع نسخة احتياطية). */
  var DELTA_KEY = "wf_sync_cursor", FULL_EVERY = 48 * 60 * 60 * 1000, DELTA_OVERLAP = 60 * 1000;
  function stampTs() { return firebase.firestore.FieldValue.serverTimestamp(); }
  // _by = آخر مستخدم رفع السجل (السيرفر بيستخدمه في الإشعارات: مين غيّر حالة الأمر). مش بيتحفظ على الجهاز ومش داخل في المقارنة.
  function myUidSafe() { try { var u = firebase.auth().currentUser; return u ? u.uid : ""; } catch (e) { return ""; } }
  function stamp(o) { o._ts = stampTs(); var u = myUidSafe(); if (u) o._by = u; return o; }
  function tsMs(d) { try { var t = d.get ? d.get("_ts") : (d.data() || {})._ts; return t && typeof t.toMillis === "function" ? t.toMillis() : 0; } catch (e) { return 0; } }
  /* ---------- صلاحيات الموظف من السيرفر ----------
     القواعد بترفض أي قراءة/كتابة مش في صلاحياته. القسم اللي مايقدرش يقراه بيتساب (من غير ما المزامنة تقف)،
     والتعديل اللي اترفض بيترجع لآخر نسخة متزامنة، مع رسالة واضحة بدل ما يفضل يحاول للأبد. */
  var NOACC = {}, deniedShown = {};
  function isDenied(e) { return !SCOPED && !!e && (e.code === "permission-denied" || /permission/i.test(String(e.code || ""))); }
  function deniedNote(k, n) {
    var key = k + ":" + Math.floor(Date.now() / 60000); if (deniedShown[key]) return; deniedShown[key] = 1;
    var msg = "🔒 مالكش صلاحية تحفظ " + (COL_AR[k] ? "(" + COL_AR[k] + ")" : "التعديل ده") + (n > 1 ? " — " + n + " تعديل" : "") + "، فرجع زي ما هو في السحابة. اطلب الصلاحية من المالك.";
    lastSyncError = msg; try { origSet.call(ls, "wf_sync_last_error", msg); } catch (e) {}
    try { window.alert(msg); } catch (e) {}
  }
  function tombRef(k, id) { return db.collection("syncDeletes").doc(COLS[k] + "__" + id); }
  /* شاهد الحذف بقى فيه نسخة من السجل المحذوف (30 يوم) عشان أي مسح بالغلط يترجع من «المحذوف من السحابة» */
  function tombData(k, id, rec) {
    var o = { c: COLS[k], id: id, _ts: stampTs() }, by = myUidSafe(); if (by) o.by = by;
    try { if (rec) { var t = JSON.stringify(rec); if (t.length < 700000) { o.rec = t; o.exp = firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 86400000)); } } } catch (e) {}
    return o;
  }
  function getCursor() { var v = ls.getItem(DELTA_KEY); return v === null || v === "" ? null : +v; }
  function setCursor(ms) { origSet.call(ls, DELTA_KEY, String(Math.max(0, +ms || 0))); }
  function toDoc(rec) { var o = JSON.parse(JSON.stringify(rec)); delete o.id; delete o._by; ["createdAt", "updatedAt", "at"].forEach(function (f) { if (typeof o[f] === "string" && !isNaN(Date.parse(o[f]))) o[f] = firebase.firestore.Timestamp.fromDate(new Date(o[f])); }); return o; }
  function byCreated(a, b) { return (Date.parse(a.createdAt || a.at) || 0) - (Date.parse(b.createdAt || b.at) || 0); }
  /* قراءة بس (من غير نسخ): نفس نسخة القراءة اللي الصفحة بتستخدمها. ممنوع تعديل الناتج — للتعديل استخدم local(). */
  function localRO(k) { try { var sn = window.WorkshopDB && window.WorkshopDB.getSnapshot && window.WorkshopDB.getSnapshot(k); if (sn) return sn.records; } catch (e) {} return local(k); }
  function local(k) { try { return JSON.parse(ls.getItem(k) || "null"); } catch (e) { return null; } }
  var SNAP_KEYS = { wf_c: 1, wf_d: 1, wf_r: 1, wf_p: 1, wf_m: 1, wf_wallet_tx: 1 };
  function raw(k, v) {
    applying = true; origSet.call(ls, k, v); applying = false;
    try { if (window.wfBumpDataRev) window.wfBumpDataRev(); } catch (e) {}
    // نسخة القراءة الفورية لازم تتحدث مع التخزين، وإلا كتابة محلية لسه بتخلص في IndexedDB كانت ترجّع البيانات القديمة فوق اللي نزل من السحابة
    // نسخة القراءة بتتلغي تلقائيًا مع الكتابة (WFStorage) وبتتبني تاني بس لو صفحة احتاجتها — مفيش تحليل هنا
  }
  /* أصل الإعدادات (آخر نسخة معروفة إنها متطابقة مع السحابة) بيتحفظ على الجهاز كمان، مش في الذاكرة بس:
     من غيره كل فتح للصفحة بيبدأ بأصل مجهول، وأي تعديل بسيط في الإعدادات وقت الفتح كان بيتعامل كتعارض
     مع السحابة حتى على جهاز واحد («تعارض إعدادات: لم تتم الكتابة فوق النسخة الأحدث»). */
  var SBASE = "wf_settings_base_raw";
  function setSettingsBase(v) { lastRaw[SETTINGS] = v; if (typeof v === "string") { try { origSet.call(ls, SBASE, v); } catch (e) {} } }
  function withTimeout(p) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, TIMEOUT); })]); }
  function online() { return navigator.onLine !== false && !!db; }
  /* علامة «متزامن» محفوظة لكل مجموعة (بصمة نصها كله). فتح أي صفحة كان بيحسب بصمة كل سجل في كل المجموعات عشان يعرف
     فيه حاجة اترفعتش ولا لأ (ثانية أو أكتر مع آلاف الأوامر). دلوقتي لو نص المجموعة زي آخر مرة اتزامنت، بنعتبرها نضيفة على طول. */
  /* علامة «القسم ده متزامن»: ختم آخر كتابة للمفتاح (رخيص) بدل بصمة النص كله. لو الختم مش متاح (متصفح/نسخة قديمة) بنرجع للبصمة. */
  function stampOf(k) { try { return ls.stamp ? ls.stamp(k) : 0; } catch (e) { return 0; } }
  function setClean(k, rawv) {
    SB.rh = SB.rh || {}; SB.rs = SB.rs || {};
    var st = stampOf(k);
    if (st && ls.getItem(k) === rawv) { SB.rs[k] = st; delete SB.rh[k]; if (COLS[k]) touched[k] = new Set(); }
    else { delete SB.rs[k]; SB.rh[k] = h(rawv || ""); }
  }
  function markClean() { Object.keys(COLS).forEach(function (k) { if (lastRaw[k] !== undefined) setClean(k, lastRaw[k]); }); saveBase(); }
  function primeClean() {
    if (!SB.rh && !SB.rs) return;
    Object.keys(COLS).forEach(function (k) {
      if (lastRaw[k] !== undefined) return;
      var st = SB.rs && SB.rs[k];
      if (st && stampOf(k) === st) { lastRaw[k] = ls.getItem(k); touched[k] = new Set(); return; } // ما اتكتبش من آخر مزامنة
      if (!SB.rh || SB.rh[k] === undefined) return;
      var r = ls.getItem(k); if (h(r || "") === SB.rh[k]) lastRaw[k] = r;
    });
  }

  ls.subscribe(function (k) {
    if (COLS[k] && !applying) { var fn = fastNote[k]; delete fastNote[k]; if (fn && touched[k] instanceof Set) fn.forEach(function (id) { touched[k].add(id); }); else touched[k] = undefined; }
    if (ready && !applying && ALL.indexOf(k) > -1) queue(k);
  });

  /* ---------- الرفع ---------- */
  /* الصفحة بتتقفل/تتنقل قبل ما الرفع المؤجل (700ms) يبدأ: احفظ أصل السجلات المتعدّلة دلوقتي، عشان الدمج حقل بحقل يشتغل بعد الفتح الجاي */
  try { window.addEventListener("pagehide", function () { var any = false; Object.keys(timers).forEach(function (k) { try { captureBases(k); any = true; } catch (e) {} }); if (any) { clearTimeout(brTimer); try { origSet.call(ls, BRKEY, JSON.stringify(BR)); } catch (e) {} } }); } catch (e) {}
  function queue(k) { clearTimeout(timers[k]); timers[k] = setTimeout(function () { delete timers[k]; push(k, true); }, 700); badge(); }
  function commitOps(ops) { var chain = Promise.resolve(); for (var i = 0; i < ops.length; i += 400) (function (part) { chain = chain.then(function () { var b = db.batch(); part.forEach(function (f) { f(b); }); return withTimeout(b.commit()); }); })(ops.slice(i, i + 400)); return chain; }
  /* s = آخر مرة الإعدادات اتغيّرت: الأجهزة التانية بتقرا مجموعة الإعدادات (عشرات المستندات) بس لو s اتغيّر.
     merge عشان s يفضل موجود لما جهاز يرفع سجلات عادية؛ ولو نسخة قديمة مسحته، الأجهزة بترجع تقرا الإعدادات كل مرة (الأمان). */
  var SEEN_S = "wf_seen_settings";
  function touchMeta(full, settings) { var ts = Date.now(), v = { ts: ts, dev: DEV }; if (full) v.full = ts; if (full || settings) { v.s = ts; origSet.call(ls, SEEN_S, String(ts)); } origSet.call(ls, SEEN, String(ts)); return meta.set(v, { merge: true }).catch(function () {}); } // full = الأجهزة التانية تقرا كله (نسخة كاملة اترفعت)

  function push(k, interactive) {
    if (SCOPED && k !== "wf_r") { lastRaw[k] = ls.getItem(k); return Promise.resolve(true); } // المحدود النطاق: مفيش رفع غير أوامره
    if (COLS[k] && NOACC[k]) { lastRaw[k] = ls.getItem(k); return Promise.resolve(true); } // قسم مالوش صلاحية عليه أصلًا
    if (COLS[k] && !pushing[k]) { try { captureBases(k); } catch (e) {} } // أصل السجلات المتعدّلة بيتحفظ حتى لو أوفلاين (عشان الدمج بعدين)
    if (!online() || pushing[k]) return Promise.resolve(false);
    pushing[k] = true;
    var done = function (ok, err) { pushing[k] = false; if (ok) { delete retryState[k]; clearTimeout(retryTimers[k]); delete retryTimers[k]; lastSyncAt = Date.now(); lastSyncError = ""; origRemove.call(ls, "wf_sync_last_error"); origSet.call(ls, "wf_last_sync_at", String(lastSyncAt)); saveRetryState(); } else { if (err) { lastSyncError = String(err.message || err); origSet.call(ls, "wf_sync_last_error", lastSyncError); } retryLater(k); } badge(); return ok; };
    var snapshotRaw = ls.getItem(k), ops = [], v = COLS[k] ? localRO(k) : local(k), next; // الأقسام: قراءة بس (الرفع بيعمل نسخ بنفسه)
    if (COLS[k]) {
      var col = db.collection(COLS[k]), B = SB.c[k] || {}, arr = Array.isArray(v) ? v : [], seen = {}, dels = 0;
      next = Object.assign({}, B);
      var jobs = [];
      var tq = touchedIdx(k), fast = !!tq && tq.ids.every(function (id) { return tq.idx[id] && B[id] !== undefined; });
      if (fast) { // كل التعديلات على سجلات معروفة موجودة: نفحصها هي بس (مفيش إضافة ولا حذف)
        tq.ids.forEach(function (id) { var r = tq.idx[id], localHash = hrc(r); next[id] = localHash; if (B[id] !== localHash) { if (!SCOPED && conflicts[k] && conflicts[k][id]) next[id] = B[id]; else jobs.push({ id: id, ref: col.doc(id), record: r, localHash: localHash, baseHash: B[id], kind: "set" }); } });
      } else arr.forEach(function (r) {
        if (!r || !r.id) return;
        seen[r.id] = 1; var localHash = hrc(r); next[r.id] = localHash;
        if (B[r.id] !== localHash) { if (!SCOPED && conflicts[k] && conflicts[k][r.id]) next[r.id] = B[r.id]; else jobs.push({ id: r.id, ref: col.doc(r.id), record: r, localHash: localHash, baseHash: B[r.id], kind: "set" }); }
      });
      if (!fast) Object.keys(B).forEach(function (id) {
        if (!seen[id]) { if (SCOPED) { delete next[id]; return; } dels++; if (!(conflicts[k] && conflicts[k][id])) jobs.push({ id: id, ref: col.doc(id), localHash: null, baseHash: B[id], kind: "delete" }); }
      });
      var total = Object.keys(B).length;
      // مسح كتير مرة واحدة (حتى لو أقل من النص): نسأل الأول. وأي مسح بيتحفظ نسخته 30 يوم في «المحذوف من السحابة».
      if (dels >= 10 && dels > total * 0.1) {
        if (!interactive) { pushing[k] = false; badge(); return Promise.resolve(false); }
        if (!window.confirm("⚠️ هيتم حذف " + dels + " " + (COL_AR[k] ? "(" + COL_AR[k] + ")" : "سجل") + " من السحابة ومن كل الأجهزة.\nلو انت اللي مسحتهم بقصد اضغط موافق.\nلو مش انت (ممكن بيانات الجهاز ناقصة) اضغط إلغاء وهيرجعوا من السحابة.")) { SB.c[k] = {}; saveBase(); pushing[k] = false; hydrateFull(true).then(function () { location.reload(); }); return Promise.resolve(false); }
      }
      var wrote = false, hasConflict = false, chain = Promise.resolve(), goneIds = [], closedIds = [], rejectedNew = [], mergedRecs = [], deniedJobs = [];
      // الرفع كان سجل ورا سجل (معاملة لكل سجل بالتتابع): 3000 عميل اتعدّلوا مرة واحدة كانوا بياخدوا دقايق.
      // دلوقتي 8 معاملات في نفس الوقت (كل واحدة على سجل مختلف)، ولو واحدة فشلت الباقي بيقف ونعيد المحاولة بعدين.
      function runJob(job) {
        return Promise.resolve().then(function () {
          return withTimeout(db.runTransaction(async function (tx) {
            var snap = await tx.get(job.ref), remote = snap.exists ? fromDoc(snap) : null, remoteHash = remote ? hr(remote) : null;
            if (job.kind === "set" && remoteHash === job.localHash) return { state: "same", remote: remote, remoteHash: remoteHash };
            if (job.kind === "delete" && !snap.exists) return { state: "same", remote: null, remoteHash: null };
            if (SCOPED) { // الفني: تحديث الحقول اللي هو غيّرها بس (القواعد بتسمح بحقول شغل الأمر فقط)
              // مفيش «تعارض» هنا: لو الإدارة عدّلت الأمر في نفس الوقت، بنرفع بس الحقول اللي الفني غيّرها فعلًا (مقارنة بآخر نسخة نزلت له)،
              // فتعديلات الإدارة على باقي الحقول بتفضل زي ما هي، وتعديلات الفني بتوصل بدل ما تتعلّق.
              if (!snap.exists) return { state: "gone", remote: null, remoteHash: null };
              var lrec = toDoc(job.record), rdata = snap.data(), patch = {}, any = false, base = SB.sr && SB.sr[job.id];
              // الحقول اللي القواعد مش بتسمح للفني يغيّرها مابتترفعش أصلًا (لو اختلفت على الجهاز لأي سبب، زي شكل تاريخ أو رقم،
              // كانت بتخلّي السيرفر يرفض التعديل كله — الحالة والشغل والأجرة — والأمر يفضل مايتقفلش). نسخة السحابة هي اللي بتفضل ليها.
              Object.keys(lrec).forEach(function (f) {
                if (TECH_LOCKED[f]) return;
                var mine = stable(clean(lrec[f]));
                if (base && stable(clean(toDoc(base)[f])) === mine) return; // الفني ما غيّرهوش
                if (stable(clean(rdata[f])) !== mine) { patch[f] = lrec[f]; any = true; }
              });
              if (patch.status === "ملغي") { delete patch.status; any = Object.keys(patch).length > 0; }
              job.patchKeys = Object.keys(patch);
              if (any) { patch._ts = stampTs(); var pu = myUidSafe(); if (pu) patch._by = pu; tx.update(job.ref, patch); }
              return { state: "written", remote: remote, remoteHash: remoteHash };
            }
            var baselineMatches = job.baseHash === undefined ? !snap.exists : remoteHash === job.baseHash;
            if (!baselineMatches) {
              var b0 = job.kind === "set" && remote && !SCOPED ? baseRec(k, job.id, job.baseHash) : null;
              if (!b0) return { state: "conflict", remote: remote, remoteHash: remoteHash };
              var mg = merge3(k, b0, job.record, remote).rec;
              tx.set(job.ref, stamp(toDoc(mg)));
              return { state: "merged", remote: remote, remoteHash: remoteHash, merged: mg };
            }
            if (job.kind === "delete") { tx.delete(job.ref); tx.set(tombRef(k, job.id), tombData(k, job.id, remote)); } else tx.set(job.ref, stamp(toDoc(job.record)));
            return { state: "written", remote: remote, remoteHash: remoteHash };
          })).catch(function (e) {
            if (SCOPED && e && e.code === "permission-denied" && job.baseHash === undefined) { rejectedNew.push(job.id); return { state: "gone", remote: null, remoteHash: null }; } // سجل جديد عمله الفني: الفني مايقدرش ينشئ
            if (SCOPED && e && e.code === "permission-denied") { // الأمر اتقفل/اتنقل لفني تاني؟ لو لسه مقروء يبقى السيرفر رفض التعديل نفسه
              return withTimeout(job.ref.get()).then(function () { throw new Error("السيرفر رفض تعديل الأمر " + ((job.record && job.record.no) || "") + " (الحقول: " + ((job.patchKeys || []).join("، ") || "؟") + ") — انشر قواعد Firestore الأخيرة"); }, function () { return { state: "gone", remote: null, remoteHash: null }; });
            }
            if (isDenied(e)) return { state: "denied" };
            throw e;
          }).then(function (result) {
            if (result.state === "denied") { deniedJobs.push(job); if (job.baseHash === undefined) delete next[job.id]; else next[job.id] = job.baseHash; return; }
            if (result.state === "gone") { goneIds.push(job.id); delete next[job.id]; return; }
            if (SCOPED && job.record && job.record.closed === true && result.state === "written") closedIds.push(job.id);
            if (result.state === "conflict") {
              hasConflict = true; conflicts[k] = conflicts[k] || {};
              conflicts[k][job.id] = { local: job.kind === "delete" ? null : job.record, remote: result.remote, remoteHash: result.remoteHash, localHash: job.localHash, createdAt: Date.now() };
              next[job.id] = job.baseHash;
            } else if (result.state === "merged") {
              mergedRecs.push({ id: job.id, rec: result.merged, localHash: job.localHash }); next[job.id] = hr(result.merged); wrote = true;
            } else {
              dropBase(k, job.id);
              if (job.kind === "delete" && k === "wf_r") { SB.pd = SB.pd || {}; SB.pd[job.id] = 1; } // الجهاز ده مسح الأمر: نسخة البوابة تتمسح كمان
              if (job.kind === "delete") delete next[job.id]; else next[job.id] = job.localHash;
              if (SCOPED && job.record) { SB.sr = SB.sr || {}; SB.sr[job.id] = JSON.parse(JSON.stringify(job.record)); }
              if (result.state === "written") wrote = true;
            }
          });
        });
      }
      var jobQ = jobs.slice(), firstErr = null, workers = [];
      function nextJob() { var j = jobQ.shift(); if (!j || firstErr) return Promise.resolve(); return runJob(j).then(nextJob, function (e) { if (!firstErr) firstErr = e; }); }
      for (var wi = 0; wi < Math.min(8, jobQ.length); wi++) workers.push(nextJob());
      chain = Promise.all(workers).then(function () { if (firstErr) throw firstErr; });
      return chain.then(function () {
        if (SCOPED && (goneIds.length || closedIds.length)) { // أوامر اتقفلت/اتسحبت: نشيلها من الجهاز ونمسح نسخة العرض بتاعتها
          var gone = {}; goneIds.concat(closedIds).forEach(function (id) { gone[id] = 1; });
          var cur = local("wf_r") || []; raw("wf_r", JSON.stringify(cur.filter(function (r) { return !(r && gone[r.id]); })));
          goneIds.concat(closedIds).forEach(function (id) { delete next[id]; try { db.collection("techOrders").doc(id).delete().catch(function () {}); } catch (e) {} });
          snapshotRaw = ls.getItem("wf_r");
          if (rejectedNew.length) { try { window.alert("حساب الفني مايقدرش ينشئ أوامر جديدة، فاتشال " + rejectedNew.length + " أمر اتعمل من الجهاز ده. اطلب من المسؤول ينشئه ويعيّنه ليك."); } catch (e) {} }
          if (closedIds.length) setTimeout(function () { hydrateScoped().then(function () { if (closedIds.some(function (id) { return location.search.indexOf(id) > -1; })) location.replace("tech.html"); else banner(); }).catch(function () {}); }, 50);
        }
        if (deniedJobs.length) { // اترفض من السيرفر (صلاحيات): رجّع السجل لآخر نسخة متزامنة، والجديد يتشال
          var lm = lastMap(k) || {}, curD = (local(k) || []).slice(), posD = {};
          curD.forEach(function (r, i) { if (r && r.id) posD[r.id] = i; });
          deniedJobs.forEach(function (j) {
            var old = lm[j.id] || baseRec(k, j.id), i = posD[j.id];
            if (old && (j.baseHash === undefined || hr(old) === j.baseHash)) { if (i === undefined) curD.push(old); else curD[i] = old; }
            else if (i !== undefined && j.baseHash === undefined) curD[i] = null;
            dropBase(k, j.id);
          });
          curD = curD.filter(Boolean); raw(k, JSON.stringify(curD)); snapshotRaw = ls.getItem(k);
          deniedNote(k, deniedJobs.length);
        }
        if (mergedRecs.length) { // اللي اتدمج في السحابة يتحط على الجهاز كمان (لو السجل ما اتعدّلش تاني وإحنا بنرفع)
          var curL = local(k) || [], at = {}; curL.forEach(function (r, i) { if (r && r.id) at[r.id] = i; });
          mergedRecs.forEach(function (m) { var i = at[m.id]; if (i === undefined) return; if (hr(curL[i]) === m.localHash) { curL[i] = m.rec; dropBase(k, m.id); } else { BR[k] = BR[k] || {}; BR[k][m.id] = m.rec; saveBR(); } });
          raw(k, JSON.stringify(curL)); snapshotRaw = ls.getItem(k);
        }
        SB.c[k] = next; if (!hasConflict) setClean(k, snapshotRaw); saveBase();
        if (hasConflict) { origSet.call(ls, CONFLICT_KEY, JSON.stringify(conflicts)); }
        if (!hasConflict) lastRaw[k] = snapshotRaw;
        var touch = wrote ? touchMeta() : Promise.resolve();
        return touch.then(function () { if (wrote && (k === "wf_r" || k === "wf_c" || k === "wf_d" || k === "wf_wallet_tx")) projectOrders(); return done(!hasConflict, hasConflict ? new Error("تعارض إصدار: لم تتم الكتابة فوق السجل الأحدث") : null); });
      }).catch(function (e) { console.warn("sync pending", k, e && e.message); return done(false, e); });
    }
    if (k === SETTINGS) {
      if (!v) return Promise.resolve(done(true));
      if (SB.x[k] === h(snapshotRaw)) { setSettingsBase(snapshotRaw); return Promise.resolve(done(true)); }
      if (conflicts[k] && conflicts[k].global) { pushing[k] = false; badge(); return Promise.resolve(false); }
      var settingsRef = db.collection("settings").doc("global"), baseRaw = lastRaw[k], baseKnown, base = {};
      if (baseRaw === undefined) { var pb = ls.getItem(SBASE); if (pb) baseRaw = pb; }
      baseKnown = baseRaw !== undefined;
      if (baseKnown && baseRaw !== null) { try { base = JSON.parse(baseRaw) || {}; } catch (e) { baseKnown = false; } }
      return withTimeout(db.runTransaction(async function (tx) {
        var snap = await tx.get(settingsRef), remote = snap.exists ? clean(snap.data()) : {};
        if (!baseKnown) {
          if (snap.exists) return { state: "conflict", remote: remote, fields: Object.keys(v) };
          tx.set(settingsRef, toDoc(v));
          return { state: "written", merged: Object.assign({}, v), remote: remote };
        }
        if (!snap.exists && baseRaw !== null) return { state: "conflict", remote: remote, fields: Object.keys(base).concat(Object.keys(v)) };
        var keys = Array.from(new Set(Object.keys(base).concat(Object.keys(v))));
        var changed = keys.filter(function (key) { return !sameField(base, v, key); });
        var changedConflict = changed.filter(function (key) { return !sameField(remote, base, key) && !sameField(remote, v, key); });
        if (changedConflict.length) return { state: "conflict", remote: remote, fields: changedConflict };
        var patch = {}, merged = Object.assign({}, remote), localDoc = toDoc(v);
        changed.forEach(function (key) {
          if (Object.prototype.hasOwnProperty.call(v, key)) { patch[key] = localDoc[key]; merged[key] = v[key]; }
          else { patch[key] = firebase.firestore.FieldValue.delete(); delete merged[key]; }
        });
        if (changed.length) tx.set(settingsRef, patch, { merge: true });
        return { state: changed.length ? "written" : "same", merged: merged, remote: remote };
      })).then(function (result) {
        if (result.state === "conflict") {
          conflicts[k] = conflicts[k] || {};
          conflicts[k].global = { local: v, remote: result.remote, fields: result.fields || [], createdAt: Date.now() };
          origSet.call(ls, CONFLICT_KEY, JSON.stringify(conflicts));
          delete retryState[k]; clearTimeout(retryTimers[k]); delete retryTimers[k]; saveRetryState();
          pushing[k] = false; lastSyncError = "تعارض إعدادات: لم تتم الكتابة فوق النسخة الأحدث"; origSet.call(ls, "wf_sync_last_error", lastSyncError); badge();
          return false;
        }
        var mergedRaw = JSON.stringify(result.merged || v);
        raw(k, mergedRaw); SB.x[k] = h(mergedRaw); saveBase(); setSettingsBase(mergedRaw);
        publishPortalConfig(); projectOrders();
        return touchMeta(false, true).then(function () { return done(true); });
      }).catch(function (e) {
        if (isDenied(e) && typeof baseRaw === "string") { raw(k, baseRaw); SB.x[k] = h(baseRaw); saveBase(); setSettingsBase(baseRaw); deniedNote(k, 1); return done(true); }
        return done(false, e);
      });
    }
    var hh0 = snapshotRaw === null ? null : h(snapshotRaw);
    if (SB.x[k] === hh0) { lastRaw[k] = snapshotRaw; return Promise.resolve(done(true)); }
    var id = "wfkv_" + k, old = SB.x["n_" + k] || 0, parts = [], n;
    if (snapshotRaw !== null) for (var i = 0; i < snapshotRaw.length; i += CHUNK) parts.push(snapshotRaw.slice(i, i + CHUNK));
    n = parts.length;
    ops.push(function (bt) { n ? bt.set(db.collection("settings").doc(id), { n: n, dev: DEV, ts: Date.now() }) : bt.delete(db.collection("settings").doc(id)); });
    parts.forEach(function (p, i) { ops.push(function (bt) { bt.set(db.collection("settings").doc(id + "~" + i), { v: p }); }); });
    for (var j = n; j < old; j++) (function (j) { ops.push(function (bt) { bt.delete(db.collection("settings").doc(id + "~" + j)); }); })(j);
    return commitOps(ops).then(function () { SB.x[k] = snapshotRaw === null ? null : h(snapshotRaw); SB.x["n_" + k] = n; saveBase(); lastRaw[k] = snapshotRaw; return touchMeta(false, true); }).then(function () { return done(true); }).catch(function (e) {
      if (isDenied(e)) { if (typeof lastRaw[k] === "string") raw(k, lastRaw[k]); else lastRaw[k] = snapshotRaw; deniedNote(k, 1); return done(true); }
      return done(false, e);
    });
  }
  function pushAll(interactive) { if (!ready || !online()) return Promise.resolve(); return Promise.all(ALL.filter(function (k) { return ls.getItem(k) !== lastRaw[k]; }).map(function (k) { return push(k, interactive); })).then(flushImages); }

  /* ---------- رفع الصور/الصوت المعلّقة (اتعملت أوفلاين) ---------- */
  function flushImages() {
    if (!online() || flushing || !window.ImageStore || !window.ImageStore.keys) return Promise.resolve();
    flushing = true;
    return window.ImageStore.keys().then(async function (keys) {
      if (!keys.length) return;
      var targets = Object.keys(COLS).concat(EXTRA), raws = {}, uploaded = [];
      targets.forEach(function (t) { raws[t] = ls.getItem(t) || ""; });
      for (var ki = 0; ki < keys.length; ki++) {
        var ref = String(keys[ki]), needle = '"' + ref + '"';
        var holders = targets.filter(function (t) { return raws[t].indexOf(needle) > -1; });
        if (!holders.length) continue;
        var data = await window.ImageStore.get(ref); if (!data) continue;
        var url = await window.ImageStore.uploadRemote(data); if (!url) continue;
        uploaded.push(ref);
        // لا نكتب snapshot قديمًا أخِذ قبل الرفع؛ اقرأ أحدث قيمة الآن
        // وبدّل المرجع المرفوع فقط، حتى لا تضيع تعديلات متزامنة من تبويب آخر.
        holders.forEach(function (t) {
          var current = ls.getItem(t) || "";
          var next = current.split(needle).join('"' + url + '"');
          if (next !== current) ls.setItem(t, next);
        });
      }
      uploaded.forEach(function (ref) {
        var needle = '"' + ref + '"';
        if (!targets.some(function (t) { return String(ls.getItem(t) || "").indexOf(needle) > -1; })) window.ImageStore.delete(ref);
      });
    }).catch(function (e) { console.warn("image flush", e); }).then(function () { flushing = false; });
  }

  /* ---------- السحب والدمج ---------- */
  function extrasFrom(snap) { var mt = {}, ch = {}, out = {}; snap.forEach(function (d) { if (d.id.indexOf("wfkv_") !== 0) return; var i = d.id.indexOf("~"); if (i < 0) mt[d.id.slice(5)] = d.data(); else { var k = d.id.slice(5, i); (ch[k] = ch[k] || [])[+d.id.slice(i + 1)] = d.data().v; } }); Object.keys(mt).forEach(function (k) { var c = ch[k] || [], ok = true; for (var i = 0; i < mt[k].n; i++) if (c[i] == null) ok = false; if (ok) out[k] = { v: c.slice(0, mt[k].n).join(""), n: mt[k].n }; }); return out; }


  /* ---------- بوابة العملاء (جهة الموظف) ---------- */
  function sanitize(o) { if (typeof o === "string") return o.replace(/[<>]/g, ""); if (Array.isArray(o)) return o.map(sanitize); if (o && typeof o === "object") { var r = {}; Object.keys(o).forEach(function (k) { r[k] = sanitize(o[k]); }); return r; } return o; }
  function cleanPortal(r) { return r && r.portal === true ? sanitize(r) : r; }
  var poBusy = false;
  function projectOrders() { projectTech(); return projectPortalOrders(); }
  function projectPortalOrders() { // نسخة آمنة من أوامر عملاء البوابة (من غير تكلفة القطع) عشان العميل يتابع حالته
    if (SCOPED) return Promise.resolve(true);
    if (!online()) { retryLater("remote:portalOrders"); return Promise.resolve(false); }
    if (poBusy) return Promise.resolve(false);
    var cs = localRO("wf_c") || [], ds = localRO("wf_d") || [], rs = localRO("wf_r") || [], portal = {}, po = SB.po = SB.po || {}, ops = [], seen = {}, next = Object.assign({}, po);
    var pm = {}; (localRO("wf_p") || []).forEach(function (x) { if (x && x.id) pm[x.id] = x; });
    cs.forEach(function (c) { if (c && c.portal === true) portal[c.id] = 1; });
    rs.forEach(function (r) {
      if (!r || !r.id || !portal[r.customerId]) return; seen[r.id] = 1;
      var d = ds.find(function (x) { return x.id === r.deviceId; }) || {};
      var V = Object.assign({ price: true, labor: true, parts: true, work: true, history: true, workshopStatus: true, visit: true }, (local(SETTINGS) || {}).portalVis || {}, r.portalVis || {});
      // خيارات أدق: الإجمالي / العربون / المتبقي / أجرة اليد (سعر) / أسماء القطع / أسعار القطع — القيم القديمة (price, labor) بتفضل شغالة كأصل
      function vv(k, base) { return V[k] === undefined ? !!V[base] : !!V[k]; }
      var showTotal = vv("total", "price"), showDep = vv("deposit", "price"), showRemain = vv("remain", "price"), showLabor = vv("labor", "labor"), showPartPrice = vv("partPrices", "price"), showQty = V.partQty !== false;
      var p = { customerId: r.customerId, no: r.no || "", deviceId: r.deviceId || "", deviceLabel: [d.type, d.brand, d.model].filter(Boolean).join(" "), fault: r.fault || "", status: (r.status === "مكتمل" || r.closed ? "مكتمل" : (r.status || "جديد")), executionPlace: r.executionPlace || "", closed: !!r.closed, partsWaiting: !!r.partsWaiting, source: r.source || "", createdAt: r.createdAt || "" };
      if (V.visit) p.visit = r.visit || "";
      if (V.workshopStatus) p.workshopStatus = r.workshopStatus || "";
      if (showTotal) p.total = +r.total || 0;
      // العربون الصافي (بعد اللي اترد للعميل) والمتبقي محسوب دايمًا من الأرقام نفسها (الحقل المخزّن ممكن يكون قديم)
      var netDep = Math.round(((+r.deposit || 0) - (+r.depositRefunded || 0)) * 100) / 100;
      if (showDep) p.deposit = Math.max(0, netDep);
      if (showRemain) p.remain = r.closed || r.paid || r.status === "ملغي" ? 0 : Math.max(0, Math.round(((+r.total || 0) - netDep) * 100) / 100);
      if (showLabor) p.labor = +r.labor || 0;
      if (V.work) p.work = r.work || "";
      if (V.parts) p.parts = (r.parts || []).map(function (i) { var pt = pm[i.partId] || {}; var o = { name: pt.name || pt.title || i.name || "قطعة" }; if (showQty) o.qty = +i.qty || 1; if (showPartPrice) o.price = +i.sell || 0; return o; });
      if (V.history) p.history = (r.statusHistory || []).map(function (x) { return { to: x.to || "", at: x.at || "" }; });
      // الضمان: لحد إمتى وعلى إيه بالظبط (الشغل والقطع اللي اتغيرت) — عشان العميل يعرف إن الضمان مش على أي عطل تاني
      if (r.closed && r.warrantyUntil) { p.warrantyUntil = String(r.warrantyUntil); var sc = (V.work || V.parts) && typeof window.warrantyScopeText === "function" ? window.warrantyScopeText(r) : String(r.warrantyScope || ""); if (sc) p.warrantyScope = String(sc).slice(0, 600); }
      if (r.warrantyDecision === "warranty") p.warrantyOfNo = String(r.warrantyOfNo || "");
      var x = h(stable(p)); if (po[r.id] !== x) { next[r.id] = x; ops.push(function (bt) { bt.set(db.collection("portalOrders").doc(r.id), Object.assign({}, p, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() })); }); }
    });
    /* نسخة البوابة بتتمسح بس لو الأمر لسه على الجهاز (العميل اتشال من البوابة) أو الجهاز ده هو اللي مسحه.
       أمر اختفى بالمزامنة (اتنقل للأرشيف، أو اتمسح من جهاز تاني وهو اللي بيمسح نسخته) نسيب نسخته: العميل يفضل شايف تاريخه. */
    var localIds = {}; rs.forEach(function (r) { if (r && r.id) localIds[r.id] = 1; });
    var pd = SB.pd || {}, pdNext = Object.assign({}, pd);
    Object.keys(po).forEach(function (id) { if (seen[id]) return; delete next[id]; delete pdNext[id]; if (localIds[id] || pd[id]) ops.push(function (bt) { bt.delete(db.collection("portalOrders").doc(id)); }); });
    Object.keys(pdNext).forEach(function (id) { if (!po[id]) delete pdNext[id]; });
    if (!ops.length) { SB.po = next; SB.pd = pdNext; saveBase(); clearRetry("remote:portalOrders"); return Promise.resolve(true); }
    poBusy = true;
    return commitOps(ops).then(function () { SB.po = next; SB.pd = pdNext; saveBase(); clearRetry("remote:portalOrders"); return true; }).catch(function (e) { console.warn("portal projection pending", e && e.message); if (isDenied(e)) { clearRetry("remote:portalOrders"); return false; } retryLater("remote:portalOrders"); return false; }).then(function (ok) { poBusy = false; return ok; });
  }
  /* نسخة العرض للفنيين: لكل أمر مفتوح ومعيّن لفني → techOrders/{id} فيها بيانات العميل والجهاز كاملة.
     بتتكتب من أجهزة الإدارة بس، والفني بيقراها هي وأمره المعيّن له فقط (قواعد Firestore). بتتمسح لما الأمر يتقفل أو يتسحب من الفني. */
  var tpBusy = false;
  function techPick(o, drop) { var r = {}; Object.keys(o || {}).forEach(function (f) { if (drop.indexOf(f) < 0) r[f] = o[f]; }); return r; }
  function projectTech() {
    if (SCOPED) return Promise.resolve(true);
    if (!online()) { retryLater("remote:techOrders"); return Promise.resolve(false); }
    if (tpBusy) return Promise.resolve(false);
    var cs = {}, ds = {}, rs = localRO("wf_r") || [], tp = SB.tp = SB.tp || {}, ops = [], seen = {}, next = Object.assign({}, tp);
    if (rs.some(function (r) { return r && r.techId && r.closed === undefined; })) { // السيرفر بيفلتر أوامر الفني بـ closed == false
      rs = local("wf_r") || []; rs.forEach(function (r) { if (r && r.techId && r.closed === undefined) r.closed = false; }); ls.setItem("wf_r", JSON.stringify(rs));
    }
    (localRO("wf_c") || []).forEach(function (c) { if (c && c.id) cs[c.id] = c; });
    (localRO("wf_d") || []).forEach(function (d) { if (d && d.id) ds[d.id] = d; });
    rs.forEach(function (r) {
      if (!r || !r.id || !r.techId || r.closed === true) return;
      var c = cs[r.customerId]; if (!c) return;
      var d = ds[r.deviceId] || null;
      seen[r.id] = 1;
      var p = { techId: String(r.techId), orderId: r.id, no: r.no || "", customerId: r.customerId, deviceId: r.deviceId || "",
        customer: Object.assign(techPick(c, ["portal", "portalUid", "email"]), { id: c.id }),
        device: d ? Object.assign(techPick(d, ["portal"]), { id: d.id }) : null };
      var x = h(stable(p));
      if (tp[r.id] !== x) { next[r.id] = x; ops.push(function (bt) { bt.set(db.collection("techOrders").doc(r.id), Object.assign({}, p, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() })); }); }
    });
    Object.keys(tp).forEach(function (id) { if (!seen[id]) { delete next[id]; ops.push(function (bt) { bt.delete(db.collection("techOrders").doc(id)); }); } });
    // حساب عهدة الفني (الرصيد والحركات وسجل أوامره المقفولة) بقى بيتحسب على السيرفر (دالة techAccount) مش من الأجهزة.
    if (!ops.length) { clearRetry("remote:techOrders"); return Promise.resolve(true); }
    tpBusy = true;
    return commitOps(ops).then(function () { SB.tp = next; delete SB.tw; saveBase(); clearRetry("remote:techOrders"); return true; }).catch(function (e) { console.warn("tech projection pending", e && e.message); if (isDenied(e)) { clearRetry("remote:techOrders"); return false; } retryLater("remote:techOrders"); return false; }).then(function (ok) { tpBusy = false; return ok; });
  }
  function publishPortalConfig() { // قوائم عامة للبوابة (من غير أي بيانات حساسة)
    if (SCOPED) return Promise.resolve(true);
    if (!online()) { retryLater("remote:portalConfig"); return Promise.resolve(false); }
    if (typeof window.settings !== "function") return Promise.resolve(true);
    var s = window.settings(), c = { centers: s.centers || [], villages: s.villages || {}, types: s.types || {}, brands: s.brands || [], executionPlaces: s.executionPlaces || [] };
    // شريط الإعلانات: بيتنشر مع نفس المستند. لو الجهاز ده ماعندوش إعداد شريط (نسخة قديمة) مانبعتش الحقل خالص،
    // ومع mergeFields أدناه ده معناه إن الشريط المنشور من جهاز تاني مايتمسحش.
    if (s.portalTicker && typeof s.portalTicker === "object") c.ticker = window.PortalTicker ? ((window.PortalTicker.prune ? window.PortalTicker.prune(s.portalTicker).ticker : window.PortalTicker.sanitize(s.portalTicker)) || s.portalTicker) : s.portalTicker;
    var x = h(stable(c));
    publishTicker(c.ticker); // لها بصمة مستقلة: تتنشر حتى لو بقية إعدادات البوابة ماتغيّرتش
    if (SB.x.pc === x) { clearRetry("remote:portalConfig"); return Promise.resolve(true); }
    // mergeFields: نستبدل الحقول اللي بنبعتها بالكامل (زي set القديمة بالظبط) من غير ما نلمس أي حقل تاني في المستند.
    return db.collection("portal").doc("config").set(c, { mergeFields: Object.keys(c) }).then(function () { SB.x.pc = x; saveBase(); clearRetry("remote:portalConfig"); return true; }).catch(function (e) { console.warn("portal config publish pending", e && e.message); if (isDenied(e)) { clearRetry("remote:portalConfig"); return false; } retryLater("remote:portalConfig"); return false; });
  }
  // الشريط الإعلاني لازم يظهر للزوار قبل تسجيل الدخول كمان: portal/config ممكن يكون مقفول على المسجّلين،
  // فبننشره كمان في portalPosts (نفس المكان اللي الزوار بيقروا منه المقالات أصلًا) بمعرّف ثابت وبيتفلتر بره قايمة المقالات.
  function publishTicker(t) {
    if (SCOPED) return Promise.resolve(true);
    if (!online()) { retryLater("remote:portalTicker"); return Promise.resolve(false); }
    if (!t) { clearRetry("remote:portalTicker"); return Promise.resolve(true); }
    try { if (window.PortalTicker && window.PortalTicker.prune) t = window.PortalTicker.prune(t).ticker || t; } catch (e) {} // العروض المنتهية ما بتتنشرش
    var x = h(stable(t));
    if (SB.x.pt === x) { clearRetry("remote:portalTicker"); return Promise.resolve(true); }
    return db.collection("portalPosts").doc("wf-ticker").set({ title: "شريط إعلانات", category: "ticker", body: "", image: "", pinned: false, published: true, ticker: t, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
      .then(function () { SB.x.pt = x; saveBase(); clearRetry("remote:portalTicker"); return true; }).catch(function (e) { console.warn("ticker publish pending", e && e.message); if (isDenied(e)) { clearRetry("remote:portalTicker"); return false; } retryLater("remote:portalTicker"); return false; });
  }
  var inboxN = { a: 0, b: 0, c: 0, q: 0, g: 0 }; // g = طلبات الزوار (guestRequests)
  window.wfPortalInbox = inboxN;
  function pill() { // مفيش شريط عايم: العدّاد بيظهر جوه كارت "بوابة العملاء" في الرئيسية بس
    var t = inboxN.a + inboxN.b + inboxN.c + inboxN.q + inboxN.g, old = document.getElementById("wfPortalPill");
    if (old) old.remove();
    window.wfPortalTotal = t;
    try { document.dispatchEvent(new CustomEvent("wf-portal-inbox", { detail: { total: t, n: inboxN } })); } catch (e) {}
  }
  var inboxOn = false, reqSnap = null; // آخر نسخة من الطلبات الجديدة (المراقبة بتحدّثها لوحدها، فالتحويل مابيقراش تاني)
  function watchInbox() {
    if (inboxOn || SCOPED) return; inboxOn = true;
    try {
      db.collection("portalRequests").where("handled", "==", false).onSnapshot(function (s) { reqSnap = s; inboxN.a = s.size; pill(); convertPortal(); }, function () {});
      db.collection("portalComplaints").where("status", "==", "جديد").onSnapshot(function (s) { inboxN.b = s.size; pill(); }, function () {});
      db.collection("portalSuggestions").where("status", "==", "pending").onSnapshot(function (s) { inboxN.c = s.size; pill(); }, function () {});
      db.collection("portalQuestions").where("status", "==", "جديد").onSnapshot(function (s) { inboxN.q = s.size; pill(); }, function () {});
      db.collection("guestRequests").where("handled", "==", false).onSnapshot(function (s) { inboxN.g = s.size; pill(); }, function () {});
    } catch (e) {}
  }
  window.wfChangePassword = function () { // تغيير كلمة سر الموظف/المدير (مع تأكيد وزر إظهار)
    var u = firebase.auth().currentUser; if (!u || !u.email) return alert("لازم تكون مسجّل دخول.");
    var inp = function (id, label, ac) { return '<label style="display:block;margin-top:10px;font-weight:600">' + label + '<input id="' + id + '" type="password" autocomplete="' + ac + '" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:10px;border:1px solid #999;border-radius:8px;background:#fff;color:#111;font-size:16px"></label>'; };
    var m = invModal('<b style="font-size:17px">🔑 تغيير كلمة المرور</b>' + inp("wfPw0", "كلمة المرور الحالية", "current-password") + inp("wfPw1", "كلمة المرور الجديدة (6 حروف على الأقل)", "new-password") + inp("wfPw2", "تأكيد كلمة المرور الجديدة", "new-password") +
      '<p id="wfPwMsg" role="alert" style="color:#b00020;min-height:22px;margin:8px 0 4px"></p><div style="display:flex;gap:8px"><button id="wfPwGo" type="button" style="flex:1;padding:11px;border-radius:10px;border:0;background:#0b57d0;color:#fff;font-size:16px">حفظ</button><button id="wfPwX" type="button" style="padding:11px 16px;border-radius:10px;border:1px solid #999;background:#fff;color:#111;font-size:16px">إلغاء</button></div>');
    loadScript("pw-eye.js").then(function () { if (window.PwEye) PwEye.scan(m); });
    var $ = function (id) { return m.querySelector("#" + id); }, say = function (t, ok) { var p = $("wfPwMsg"); p.style.color = ok ? "#0a7a2f" : "#b00020"; p.textContent = t; };
    $("wfPwX").onclick = function () { m.remove(); };
    $("wfPwGo").onclick = function () {
      var o = $("wfPw0").value, n = $("wfPw1").value, c = $("wfPw2").value;
      if (!o) return say("اكتب كلمة المرور الحالية.");
      if (n.length < 6) return say("كلمة المرور الجديدة لازم تكون 6 حروف على الأقل.");
      if (n !== c) return say("كلمة المرور الجديدة وتأكيدها مش متطابقين.");
      if (n === o) return say("الجديدة لازم تختلف عن الحالية.");
      var b = $("wfPwGo"); b.disabled = true; say("جاري الحفظ…", true);
      u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, o)).then(function () { return u.updatePassword(n); }).then(function () {
        rememberLogin(u.email, n); say("✅ اتغيّرت كلمة المرور", true); setTimeout(function () { m.remove(); }, 1200);
      }).catch(function (e) {
        b.disabled = false; var code = e && e.code || "";
        say(/wrong-password|invalid-credential/.test(code) ? "كلمة المرور الحالية غير صحيحة." : /too-many/.test(code) ? "محاولات كتير — استنى شوية وجرّب تاني." : /network/.test(code) ? "مفيش اتصال بالإنترنت." : "تعذّر التغيير — جرّب تاني.");
      });
    };
    setTimeout(function () { var f = $("wfPw0"); if (f) f.focus(); }, 50);
  };
  var converting = false, SAFE_ID = /^[A-Za-z0-9_~.\-]{1,120}$/;
  function convertPortal() { // حوّل طلبات البوابة الجديدة لأوامر شغل حقيقية
    var fns = ["orderNo", "recordStatusHistory", "applyStatusTimestamp", "saveJSONSafe", "arr", "settings"];
    if (SCOPED || !online() || converting || !ready || fns.some(function (f) { return typeof window[f] !== "function"; }) || !window.K) return Promise.resolve();
    converting = true;
    return (reqSnap ? Promise.resolve(reqSnap) : db.collection("portalRequests").where("handled", "==", false).get()).then(function (snap) {
      var n = 0, marks = [], seenPortal = {};
      /* 🛡️ حماية من السبام: الطلب بيتحول لأمر شغل لوحده لحد حد معيّن، والزيادة بتستنى موافقتك من «إدارة البوابة».
         - العميل عنده أمرين مفتوحين من البوابة أو أكتر، أو
         - اتحوّل 5 طلبات بوابة أو أكتر في آخر 24 ساعة (حسابات كتير جديدة مثلًا). */
      var allR = window.arr(window.K.r), dayAgo = Date.now() - 864e5, openBy = {}, lastDay = 0;
      allR.forEach(function (x) { if (!x || x.source !== "portal") return; if (!x.closed && x.status !== "ملغي") openBy[x.customerId] = (openBy[x.customerId] || 0) + 1; if (Date.parse(x.createdAt) > dayAgo) lastDay++; });
      var holds = [];
      snap.docs.forEach(function (d) {
        var p = sanitize(clean(d.data())), id = d.id, ds = window.arr(window.K.d), cs = window.arr(window.K.c);
        // 🛡️ المعرّفات بيختارها جهاز العميل: أي رمز غريب (علامات تنصيص، <>) ممكن يتحقن في صفحات الإدارة — نرفضه
        if (!SAFE_ID.test(id) || (p.deviceId && !SAFE_ID.test(String(p.deviceId)))) { marks.push(d.ref.update({ handled: true, rejected: true, rejectReason: "bad_id" })); return; }
        if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(String(p.visit || ""))) p.visit = "";
        ["fault", "note", "executionPlace"].forEach(function (f) { if (p[f] != null) p[f] = String(p[f]).slice(0, f === "executionPlace" ? 60 : 1000); });
        if (p.hold === true && p.approved !== true) return; // مستني موافقتك
        var dev = ds.find(function (x) { return x.id === p.deviceId; }), cust = cs.find(function (x) { return x.id === p.customerId; });
        if (!dev || !cust) return; // لسه مانزلش على الجهاز: هنحاول تاني
        if (dev.customerId !== p.customerId) { marks.push(d.ref.update({ handled: true, rejected: true })); return; }
        // تنظيف الطلبات القديمة التي أُنشئت قبل استخدام doc id ثابت: نفس
        // العميل والجهاز ونفس بيانات الطلب = طلب واحد، حتى لو اختلف معرّف
        // Firestore بسبب الضغط على زر الإرسال أكثر من مرة.
        var fp = [p.customerId, p.deviceId, p.fault, p.visit, p.executionPlace, p.note].map(function (x) { return String(x || "").trim().toLowerCase(); }).join("\u001f");
        if (seenPortal[fp]) { marks.push(d.ref.update({ handled: true, duplicateOf: seenPortal[fp] })); return; }
        seenPortal[fp] = id;
        // هوية طلب البوابة هي مفتاح التكرار؛ لا نعتمد على رقم أمر جديد أو
        // على دورة onSnapshot وحدها، لأن تبويبين قد يحاولا التحويل معًا.
        var exists = window.arr(window.K.r).find(function (x) { return x.id === id || (x.source === "portal" && x.portalRequestId === id); });
        if (!exists && p.approved !== true && ((openBy[p.customerId] || 0) >= 2 || lastDay >= 5)) { holds.push(d.ref.update({ hold: true, holdReason: (openBy[p.customerId] || 0) >= 2 ? "customer_open" : "daily_limit" })); return; }
        if (!exists) {
          var s = window.settings();
          var r = { id: id, portalRequestId: id, no: window.orderNo(), customerId: p.customerId, deviceId: p.deviceId, addressKey: "main", visit: p.visit || "", status: "جديد", executionPlace: p.executionPlace || (s.executionPlaces || [])[0] || "عند العميل", workshopStatus: (s.workshopStatuses || [])[0] || "غير مطلوب", partsWaiting: false, tag: "", fault: p.fault || "", work: "", labor: 0, parts: [], partsTotal: 0, partsCost: 0, total: 0, deposit: 0, remain: 0, closed: false, source: "portal", customerNote: p.note || "", createdAt: new Date().toISOString() };
          // صور/فيديو/صوت العطل ولوكيشن مكان التنفيذ اللي العميل بعتهم (لينكات Cloudinary بس، وإحداثيات أرقام).
          var pm = (Array.isArray(p.media) ? p.media : []).filter(function (m) { return m && /^https:\/\/res\.cloudinary\.com\/[^\s"'<>]+$/.test(String(m.url || "")) && (m.kind === "video" || m.kind === "audio" || m.kind === "image"); }).slice(0, 6).map(function (m) { return { url: m.url, kind: m.kind, dur: +m.dur || 0, bytes: +m.bytes || 0, at: String(m.at || "").slice(0, 40), by: "العميل" }; });
          if (pm.length) r.media = pm;
          if (p.loc && typeof p.loc === "object" && ((isFinite(+p.loc.lat) && isFinite(+p.loc.lng)) || typeof p.loc.url === "string")) r.loc = p.loc.url ? { url: String(p.loc.url).slice(0, 300) } : { lat: +p.loc.lat, lng: +p.loc.lng, acc: +p.loc.acc || 0 };
          window.recordStatusHistory(r, "", r.status); window.applyStatusTimestamp(r, r.status);
          if (!window.saveJSONSafe(window.K.r, window.arr(window.K.r).concat(r))) return;
          exists = r; n++; openBy[p.customerId] = (openBy[p.customerId] || 0) + 1; lastDay++;
        }
        marks.push(d.ref.update({ handled: true, orderId: id, orderNo: exists.no || "" }));
      });
      return Promise.all(marks.concat(holds.map(function (h) { return h.catch(function () {}); }))).then(function () { if (n) { banner(); return projectOrders(); } });
    }).catch(function (e) { console.warn("portal convert", e && e.message); }).then(function () { converting = false; });
  }

  window.wfConvertPortalNow = function () { reqSnap = null; return convertPortal(); }; // بعد موافقتك على طلب متوقف
  function isDirty(k) {
    var rawv = ls.getItem(k);
    if (COLS[k] && touched[k] instanceof Set && !SCOPED) { var tq0 = touchedIdx(k), B0 = SB.c[k] || {}; return tq0.ids.some(function (id) { var r = tq0.idx[id]; return !r || B0[id] !== hrc(r); }); }
    if (COLS[k]) { var arr = localRO(k) || [], B = SB.c[k] || {}, ids = {}; for (var i = 0; i < arr.length; i++) { var r = arr[i]; if (!r || !r.id) continue; ids[r.id] = 1; if (B[r.id] !== hrc(r)) return true; } return Object.keys(B).some(function (id) { return !ids[id]; }); }
    if (k === SETTINGS) return rawv !== null && h(rawv) !== SB.x[k];
    return rawv === null ? (SB.x[k] !== undefined && SB.x[k] !== null) : h(rawv) !== SB.x[k];
  }
  // رفع نسخة الجهاز للسحابة واعتبارها الأصل (بيستبدل اللي في السحابة): بيتنادى تلقائيًا بعد استرجاع نسخة احتياطية
  window.wfCloudForceUpload = function (skipConfirm) {
    if (SCOPED) return Promise.reject(new Error("scoped"));
    if (!online()) return Promise.reject(new Error("offline"));
    if (!skipConfirm && !window.confirm("هيتم استبدال بيانات السحابة ببيانات الجهاز ده بالكامل (اللي مش موجود هنا هيتمسح من السحابة). متأكد؟")) return Promise.resolve(false);
    var keys = Object.keys(COLS);
    return withTimeout(Promise.all(keys.map(function (k) { return db.collection(COLS[k]).get(); }))).then(function (res) {
      var ops = [], next = {};
      keys.forEach(function (k, i) {
        var col = db.collection(COLS[k]), arr = local(k) || [], seen = {}, nb = {};
        arr.forEach(function (r) { if (!r || !r.id) return; seen[r.id] = 1; nb[r.id] = hr(r); ops.push(function (bt) { bt.set(col.doc(r.id), stamp(toDoc(r))); }); });
        res[i].docs.forEach(function (d) { if (!seen[d.id]) ops.push(function (bt) { bt.delete(d.ref); bt.set(tombRef(k, d.id), tombData(k, d.id, fromDoc(d))); }); });
        next[k] = nb;
      });
      return commitOps(ops).then(function () { keys.forEach(function (k) { SB.c[k] = next[k]; }); saveBase(); });
    }).then(function () {
      var rest = EXTRA.concat([SETTINGS]); rest.forEach(function (k) { delete SB.x[k]; delete lastRaw[k]; }); try { origRemove.call(ls, SBASE); } catch (e) {}
      return Promise.all(rest.map(function (k) { return push(k, false); }));
    }).then(function () { origSet.call(ls, HYD, CURRENT_UID || ls.getItem(HYD) || ""); origSet.call(ls, FULL, String(Date.now())); return touchMeta(true); }).then(function () { projectOrders(); badge(); return true; });
  };
  function hydrateFull(force) {
    if (SCOPED) return hydrateScoped(force);
    if (hydrating) return Promise.resolve(false); hydrating = true;
    var keys = Object.keys(COLS), first = ls.getItem(HYD) !== CURRENT_UID;
    keys.forEach(function (k) { try { captureBases(k); } catch (e) {} }); // قبل ما نسحب: أصل أي تعديل محلي عشان الدمج
    return withTimeout(Promise.all(keys.map(function (k) { return db.collection(COLS[k]).get().then(function (r) { delete NOACC[k]; return r; }, function (e) { if (isDenied(e)) { NOACC[k] = 1; return null; } throw e; }); }).concat([db.collection("settings").get()]))).then(function (res) {
      var changedAny = false, maxTs = 0; changedKeys = {};
      var sSnap = res[keys.length], st = applySettingsSnap(sSnap, first);
      var cloudEmpty = !st.g && !Object.keys(st.ex).length && keys.every(function (k, i) { return !res[i] || !res[i].docs.length; });
      keys.forEach(function (k, i) {
        if (!res[i]) { if ((local(k) || []).length) { raw(k, "[]"); changedAny = true; changedKeys[k] = 1; } SB.c[k] = {}; return; } // قسم مالوش صلاحية يشوفه
        res[i].docs.forEach(function (d) { var t = tsMs(d); if (t > maxTs) maxTs = t; });
        var merged = mergeColWithBase(k, res[i].docs.map(fromDoc).map(cleanPortal), first, SB.c[k]);
        if (stable(local(k) || []) !== stable(merged.arr)) { raw(k, JSON.stringify(merged.arr)); changedAny = true; changedKeys[k] = 1; }
        SB.c[k] = merged.base;
      });
      if (st.changed) changedAny = true;
      raw(HYD, CURRENT_UID); origSet.call(ls, FULL, String(Date.now())); setCursor(maxTs); saveBase();
      lastRaw = {}; ALL.forEach(function (k) { if (!isDirty(k)) lastRaw[k] = ls.getItem(k); }); // ارفع بس اللي اتغيّر فعلًا
      markClean();
      // الإعدادات: لو متغيّرة محليًا، أصلها هو نسخة السحابة اللي لسه نازلين بيها (عشان الرفع يبقى دمج حقول مش تعارض).
      if (lastRaw[SETTINGS] !== undefined) setSettingsBase(lastRaw[SETTINGS]); else if (st.g) setSettingsBase(JSON.stringify(st.g));
      return { changed: changedAny, cloudEmpty: cloudEmpty };
    }).then(function (r) {
      // نسخة السجلات في IndexedDB: بنعيد كتابة المجموعات اللي اتغيّرت بس (قبل كده كل مزامنة — حتى من غير أي تغيير —
      // كانت بتمسح وتكتب كل العملاء والأوامر والحركات من الأول، وده كان بيتقل الجهاز مع كل تعديل من جهاز تاني).
      // لازم نستنى الحفظ يتأكد قبل أي إعادة تحميل (أول مزامنة بتعيد تحميل الصفحة)، وإلا الأقسام الكبيرة كانت بتضيع
      return Promise.resolve(ls.flush ? ls.flush().catch(function () {}) : null).then(function () { hydrating = false; return r; });
    }, function (e) { hydrating = false; throw e; });
  }
  var changedKeys = {};
  function applySettingsSnap(sSnap, first) {
    var ex = extrasFrom(sSnap), g = null, changed = false; sSnap.forEach(function (d) { if (d.id === "global") g = clean(d.data()); });
    EXTRA.forEach(function (k) {
      var lr = ls.getItem(k), ch = lr !== null && (first ? !ex[k] : h(lr) !== SB.x[k]);
      if (ex[k] && !ch) { if (lr !== ex[k].v) { raw(k, ex[k].v); changed = true; } SB.x[k] = h(ex[k].v); }
      SB.x["n_" + k] = ex[k] ? ex[k].n : (SB.x["n_" + k] || 0);
    });
    var lr = ls.getItem(SETTINGS), lchanged = lr !== null && (first ? !g : h(lr) !== SB.x[SETTINGS]);
    if (g) { var lo = local(SETTINGS) || {}; var m = lchanged ? Object.assign({}, g, lo) : Object.assign({}, lo, g); if (stable(lo) !== stable(m)) { raw(SETTINGS, JSON.stringify(m)); changed = true; } if (!lchanged) SB.x[SETTINGS] = h(ls.getItem(SETTINGS)); }
    return { ex: ex, g: g, changed: changed };
  }
  /* بيدمج سجلات اتغيّرت (ups) وسجلات اتحذفت (tombs: id → وقت الحذف) في مجموعة محلية، بنفس قواعد الدمج الكامل:
     سجل متعدّل على الجهاز ولسه مارفعش بيفضل زي ما هو (والرفع بعدين بيكشف التعارض)، وسجل الجهاز مسحه ولسه مارفعش الحذف مابيرجعش. */
  function applyDelta(k, ups, tombs) {
    var Larr = local(k); Larr = Array.isArray(Larr) ? Larr.slice() : [];
    var B = SB.c[k] = SB.c[k] || {}, idx = {}, changed = false, added = false;
    Larr.forEach(function (r, i) { if (r && r.id) idx[r.id] = i; });
    var U = {}; (ups || []).forEach(function (x) { U[x.rec.id] = x; });
    Object.keys(tombs || {}).forEach(function (id) {
      if (U[id] && U[id].ts > tombs[id]) return; // اتعمل تاني بعد ما اتحذف
      delete U[id];
      var i = idx[id], loc = i === undefined ? null : Larr[i];
      if (loc && B[id] !== undefined && B[id] !== hr(loc)) { delete B[id]; return; } // متعدّل هنا: يفضل ويترفع من جديد
      if (loc) { Larr[i] = null; changed = true; }
      delete B[id];
    });
    Object.keys(U).forEach(function (id) {
      var rec = U[id].rec, nh = hr(rec), i = idx[id], loc = i === undefined ? null : Larr[i];
      if (loc) {
        if (B[id] === hr(loc) || B[id] === undefined) { if (hr(loc) !== nh) { Larr[i] = rec; changed = true; } dropBase(k, id); }
        else if (nh !== B[id]) { // متعدّل هنا ولسه مارفعش، والسحابة اتغيّرت كمان → دمج حقل بحقل لو أصله معروف
          var bb = baseRec(k, id, B[id]);
          if (bb && !SCOPED) { var mg = merge3(k, bb, loc, rec).rec; if (hr(mg) !== hr(loc)) { Larr[i] = mg; changed = true; } BR[k][id] = JSON.parse(JSON.stringify(rec)); saveBR(); }
        }
      }
      else if (B[id] === undefined) { Larr.push(rec); changed = added = true; }
      B[id] = nh;
    });
    if (!changed) return false;
    Larr = Larr.filter(Boolean); if (added) Larr.sort(byCreated);
    raw(k, JSON.stringify(Larr)); changedKeys[k] = 1; return true;
  }
  function hydrateDelta(sv) {
    var cur = getCursor();
    // sv = قيمة s من wf_meta: لو معروفة ومطابقة لآخر نسخة نزلت، مابنقراش مجموعة الإعدادات
    var skipS = sv !== undefined && sv !== null && String(sv) === String(ls.getItem(SEEN_S) || "");
    if (SCOPED || cur === null || ls.getItem(HYD) !== CURRENT_UID || Date.now() - (+ls.getItem(FULL) || 0) > FULL_EVERY) return hydrateFull();
    if (hydrating) return Promise.resolve(false); hydrating = true;
    Object.keys(COLS).forEach(function (k) { try { captureBases(k); } catch (e) {} });
    var keys = Object.keys(COLS), since = firebase.firestore.Timestamp.fromMillis(Math.max(0, cur - DELTA_OVERLAP));
    var qs = keys.map(function (k) { return NOACC[k] ? Promise.resolve(null) : db.collection(COLS[k]).where("_ts", ">", since).get().catch(function (e) { if (isDenied(e)) { NOACC[k] = 1; return null; } throw e; }); });
    qs.push(db.collection("syncDeletes").where("_ts", ">", since).get(), skipS ? Promise.resolve(null) : db.collection("settings").get());
    return withTimeout(Promise.all(qs)).then(function (res) {
      var changedAny = false, maxTs = cur, found = 0; changedKeys = {};
      var tombs = {}; res[keys.length].docs.forEach(function (d) { var x = d.data() || {}, t = tsMs(d); if (t > cur) found++; if (t > maxTs) maxTs = t; var k = keys.filter(function (kk) { return COLS[kk] === x.c; })[0]; if (k && x.id) (tombs[k] = tombs[k] || {})[x.id] = t; });
      keys.forEach(function (k, i) {
        if (!res[i]) return;
        var ups = res[i].docs.map(function (d) { var t = tsMs(d); if (t > cur) found++; if (t > maxTs) maxTs = t; return { rec: cleanPortal(fromDoc(d)), ts: t }; });
        if ((ups.length || tombs[k]) && applyDelta(k, ups, tombs[k])) changedAny = true;
      });
      var st = res[keys.length + 1] ? applySettingsSnap(res[keys.length + 1], false) : { changed: false, g: null, ex: {} };
      if (res[keys.length + 1] && sv !== undefined && sv !== null) origSet.call(ls, SEEN_S, String(sv));
      if (st.changed) changedAny = true;
      setCursor(maxTs); saveBase();
      ALL.forEach(function (k) { if ((changedKeys[k] || st.changed) && !isDirty(k)) lastRaw[k] = ls.getItem(k); });
      markClean();
      if (lastRaw[SETTINGS] !== undefined) setSettingsBase(lastRaw[SETTINGS]); else if (st.g) setSettingsBase(JSON.stringify(st.g));
      hydrating = false; return { changed: changedAny, cloudEmpty: false, delta: true, found: found, settingsChanged: st.changed };
    }, function (e) { hydrating = false; console.warn("delta sync failed → full", e && e.message); return hydrateFull(); });
  }
  window.wfSyncDeltaInfo = function () { return { cursor: getCursor(), lastFull: +ls.getItem(FULL) || 0 }; };
  /* ---------- الوضع المحدود (فني): سحب أوامره + عملائها وأجهزتها بس ---------- */
  function wipeLocal() { // تبديل حساب/وضع على نفس الجهاز: امسح أي بيانات محلية من الحساب القديم قبل ما نسحب أي حاجة
    Object.keys(COLS).concat(EXTRA, [SETTINGS]).forEach(function (k) { origRemove.call(ls, k); });
    [BASEKEY, SBASE, CONFLICT_KEY, RETRY_KEY, SEEN, FULL, HYD, DELTA_KEY, "wf_last_sync_at", "wf_sync_last_error"].forEach(function (k) { try { origRemove.call(ls, k); } catch (e) {} });
    Object.keys(retryTimers).forEach(function (k) { clearTimeout(retryTimers[k]); delete retryTimers[k]; });
    SB = { c: {}, x: {} }; conflicts = {}; retryState = {}; lastRaw = {}; lastSyncAt = 0; lastSyncError = "";
    wipedForMode = true;
    try { if (window.WorkshopDB && typeof window.WorkshopDB.replaceMany === "function") window.WorkshopDB.replaceMany({ wf_c: [], wf_d: [], wf_r: [], wf_p: [], wf_m: [], wf_wallet_tx: [] }).catch(function () {}); } catch (e) {}
  }
  function detectScoped(user, staffData) { // مستند الموظف (اللي القواعد بتقراه) بيتقدّم على claim الـ token
    var sc = staffData && staffData.sc;
    if (sc === "a" || sc === "w") return Promise.resolve(sc === "a");
    return Promise.resolve(user.getIdTokenResult ? user.getIdTokenResult() : null).then(function (r) { return !!(r && r.claims && r.claims.sc === "a"); }).catch(function () { return false; });
  }
  function hydrateScoped() {
    if (hydrating) return Promise.resolve(false); hydrating = true;
    var uid = CURRENT_UID;
    return withTimeout(Promise.all([
      db.collection("requests").where("techId", "==", uid).where("closed", "==", false).get(),
      db.collection("techOrders").where("techId", "==", uid).get(),
      db.collection("settings").doc("global").get()
    ])).then(function (res) {
      var changedAny = wipedForMode; wipedForMode = false;
      var cloudR = res[0].docs.map(fromDoc), merged = mergeColWithBase("wf_r", cloudR, false, SB.c.wf_r);
      if (stable(local("wf_r") || []) !== stable(merged.arr)) { raw("wf_r", JSON.stringify(merged.arr)); changedAny = true; }
      // آخر نسخة نزلت للفني من كل أمر (عشان الرفع يعرف هو غيّر إيه بالظبط). الأمر اللي عليه تعديل لسه مارفعش بيفضل بأساسه القديم.
      var srNext = {}, cm = {}; cloudR.forEach(function (r) { cm[r.id] = r; });
      merged.arr.forEach(function (r) { if (!cm[r.id]) return; srNext[r.id] = stable(r) === stable(cm[r.id]) ? cm[r.id] : ((SB.sr && SB.sr[r.id]) || null); if (!srNext[r.id]) delete srNext[r.id]; });
      SB.sr = srNext;
      if (conflicts.wf_r) { delete conflicts.wf_r; origSet.call(ls, CONFLICT_KEY, JSON.stringify(conflicts)); } // حساب الفني مالوش تعارضات (الرفع بالحقول)
      SB.c.wf_r = merged.base;
      var live = {}; merged.arr.forEach(function (r) { live[r.id] = 1; });
      var cs = {}, ds = {};
      res[1].docs.forEach(function (d) {
        if (!live[d.id]) return; var t = clean(d.data());
        if (t.customer && t.customer.id) cs[t.customer.id] = t.customer;
        if (t.device && t.device.id) ds[t.device.id] = t.device;
      });
      [["wf_c", cs], ["wf_d", ds]].forEach(function (pair) {
        var arr = Object.keys(pair[1]).map(function (id) { return pair[1][id]; }).sort(byCreated), nb = {};
        arr.forEach(function (r) { nb[r.id] = hr(r); });
        if (stable(local(pair[0]) || []) !== stable(arr)) { raw(pair[0], JSON.stringify(arr)); changedAny = true; }
        SB.c[pair[0]] = nb;
      });
      Object.keys(COLS).forEach(function (k) { if (k !== "wf_r" && k !== "wf_c" && k !== "wf_d") { SB.c[k] = {}; if (ls.getItem(k) === null) raw(k, "[]"); } });
      if (res[2].exists) {
        var g = clean(res[2].data()), lo = local(SETTINGS) || {}, m = Object.assign({}, lo, g);
        if (stable(lo) !== stable(m)) { raw(SETTINGS, JSON.stringify(m)); changedAny = true; }
        SB.x[SETTINGS] = h(ls.getItem(SETTINGS));
      }
      raw(HYD, CURRENT_UID); origSet.call(ls, FULL, String(Date.now())); saveBase();
      lastRaw = {}; ALL.forEach(function (k) { if (k !== "wf_r" || !isDirty(k)) lastRaw[k] = ls.getItem(k); });
      markClean();
      setSettingsBase(lastRaw[SETTINGS]);
      return { changed: changedAny, cloudEmpty: false };
    }).then(function (r) {
      var mirror = window.WorkshopDB && typeof window.WorkshopDB.replaceMany === "function"
        ? window.WorkshopDB.replaceMany({ wf_c: local("wf_c") || [], wf_d: local("wf_d") || [], wf_r: local("wf_r") || [], wf_p: local("wf_p") || [], wf_m: local("wf_m") || [], wf_wallet_tx: local("wf_wallet_tx") || [] }).catch(function (e) { console.warn("IndexedDB mirror after scoped hydration failed", e); })
        : Promise.resolve();
      return mirror.then(function () { hydrating = false; return r; });
    }, function (e) { hydrating = false; throw e; });
  }
  // دمج بأساس صريح (آخر حالة اتزامنت)
  function mergeColWithBase(k, cloudArr, first, B0) {
    var B = B0 || {}, Larr = local(k); Larr = Array.isArray(Larr) ? Larr : [];
    var cm = {}; cloudArr.forEach(function (r) { cm[r.id] = r; });
    if (first || !B0) { B = {}; Larr.forEach(function (r) { if (r && cm[r.id]) B[r.id] = hr(r); }); }
    var out = [], seen = {};
    Larr.forEach(function (r) {
      if (!r || !r.id) return; seen[r.id] = 1;
      if (B[r.id] === hr(r)) { dropBase(k, r.id); if (cm[r.id]) out.push(cm[r.id]); return; }
      var c = cm[r.id], bb = !first && B0 && c && hr(c) !== B[r.id] && !SCOPED ? baseRec(k, r.id, B[r.id]) : null;
      if (bb) { out.push(merge3(k, bb, r, c).rec); BR[k][r.id] = JSON.parse(JSON.stringify(c)); saveBR(); } else out.push(r);
    });
    cloudArr.forEach(function (r) { if (!seen[r.id] && B[r.id] === undefined) out.push(r); });
    var nb = {}; cloudArr.forEach(function (r) { nb[r.id] = hr(r); });
    return { arr: out.sort(byCreated), base: nb };
  }

  /* ----------  دمج العميل المكرر (سجل الورشة + سجل البوابة) ----------
     لما عميل مسجّل عندك بالفعل يفتح لينك البوابة ويسجّل بنفسه، البوابة بتنشئ
     customers/{uid} بعلامة portal:true بنفس رقم التليفون. هنا بنكتشف الحالة دي
     ونربط حساب البوابة بالسجل الأصلي (portalLinks) وننقل أي أجهزة/أوامر/طلبات
     اتسجلت على السجل الجديد، وبعدين نشيل السجل المكرر. العملية idempotent. */
  function nph(x) {
    var d = String(x || "").replace(/[\u0660-\u0669]/g, function (c) { return c.charCodeAt(0) - 1632; })
      .replace(/[\u06F0-\u06F9]/g, function (c) { return c.charCodeAt(0) - 1776; }).replace(/\D/g, "");
    if (d.indexOf("0020") === 0) d = d.slice(4);
    if (d.length === 12 && d.indexOf("20") === 0) d = "0" + d.slice(2);
    if (d.length === 10 && d[0] === "1") d = "0" + d;
    return d.length >= 7 ? d : "";
  }
  var CUST_REF_KEYS = ["d", "r", "tasks", "inv", "pc", "wtx", "tr", "followupLog"];
  // اسم الحقل اللي بيشاور على العميل في كل مجموعة (portalSuggestions بتستخدم by)
  var PORTAL_CUST_COLS = { portalRequests: "customerId", portalComplaints: "customerId", portalQuestions: "customerId", portalOrders: "customerId", portalSuggestions: "by" };
  var merging = false;
  function saveLocal(key, a) { if (typeof window.saveJSONSafe === "function") return window.saveJSONSafe(key, a); origSet.call(ls, key, JSON.stringify(a)); return true; }
  function refCount(id) {
    var K = window.K, n = 0;
    ["d", "r"].forEach(function (k) { window.arr(K[k]).forEach(function (x) { if (x && x.customerId === id) n++; }); });
    return n;
  }
  //  سجل اتعمل من تسجيل العميل بنفسه في البوابة (id = uid الحساب، من غير سجل ورشة أصلي)
  function isSelfReg(c) { return !!c && c.portal === true && (!c.portalUid || c.portalUid === c.id); }
  function applyMergeLocal(dupId, keepId) {
    var K = window.K, cs = window.arr(K.c);
    var keep = cs.find(function (x) { return x.id === keepId; }), dup = cs.find(function (x) { return x.id === dupId; });
    if (!keep || !dup) return false;
    var snapshot = ""; try { snapshot = JSON.stringify(dup).slice(0, 600); } catch (e) {}
    if (!keep.email && dup.email) keep.email = dup.email;
    if (!keep.phone2 && dup.phone2) keep.phone2 = dup.phone2;
    var ma = keep.mainAddress || {};
    if (!(ma.center || ma.village || ma.street || ma.address) && dup.mainAddress) keep.mainAddress = dup.mainAddress;
    var ea = keep.extraAddress || {};
    if (!(ea.center || ea.village || ea.street || ea.address) && dup.extraAddress) keep.extraAddress = dup.extraAddress;
    if (!keep.portalUid) {
      if (isSelfReg(dup)) { keep.portal = true; keep.portalUid = dupId; }
      else if (dup.portalUid) { keep.portal = true; keep.portalUid = dup.portalUid; }
    }
    keep.updatedAt = new Date().toISOString();
    CUST_REF_KEYS.forEach(function (rk) {
      var key = K[rk]; if (!key) return;
      var a = window.arr(key), ch = false;
      a.forEach(function (x) { if (x && x.customerId === dupId) { x.customerId = keepId; ch = true; } });
      if (ch) saveLocal(key, a);
    });
    saveLocal(K.c, cs.filter(function (x) { return x.id !== dupId; }));
    try { window.auditLog && window.auditLog("دمج", "عميل", keepId, "دمج سجل مكرر (" + (dup.name || "") + " / " + (dup.phone || "") + ") — نسخة: " + snapshot); } catch (e) {}
    return true;
  }
  //  دمج dup في keep: يربط حسابات البوابة بالسجل الباقي وينقل كل السجلات المرتبطة. لو dup عنده حساب بوابة لازم نت.
  function mergeCustomers(keepId, dupId) {
    var W = window;
    if (!W.K || typeof W.arr !== "function" || !keepId || !dupId || keepId === dupId) return Promise.reject({ code: "bad-args" });
    var cs = W.arr(W.K.c), keep = cs.find(function (x) { return x.id === keepId; }), dup = cs.find(function (x) { return x.id === dupId; });
    if (!keep || !dup) return Promise.reject({ code: "missing" });
    var cloud = online() && ready;
    if ((dup.portal === true || dup.portalUid) && !cloud) return Promise.reject({ code: "offline" });
    var chain = Promise.resolve();
    if (cloud) {
      chain = chain.then(function () {
        if (!isSelfReg(dup)) return;
        return withTimeout(db.collection("portalLinks").doc(dupId).set({ customerId: keepId, phone: nph(dup.phone), mustChange: false, mergedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }));
      }).then(function () {
        return withTimeout(db.collection("portalLinks").where("customerId", "==", dupId).get()).then(function (sn) {
          return Promise.all(sn.docs.map(function (d) { return d.ref.update({ customerId: keepId }); }));
        });
      }).then(function () {
        return Promise.all(Object.keys(PORTAL_CUST_COLS).map(function (c) {
          var f = PORTAL_CUST_COLS[c];
          return withTimeout(db.collection(c).where(f, "==", dupId).get()).then(function (sn) {
            return Promise.all(sn.docs.map(function (d) { var u = {}; u[f] = keepId; return d.ref.update(u); }));
          }).catch(function (e) { console.warn("merge repoint", c, e && e.message); });
        }));
      });
    }
    // 📦 أوامره القديمة اللي في الأرشيف (على السيرفر) بتتنقل للعميل اللي فضل كمان — لو الدالة مش متاحة الدمج بيكمّل والأرشيف يفضل زي ما هو
    if (cloud) chain = chain.then(function () { return Promise.resolve().then(function () { return callServer("archiveRepointCustomer", { dupId: dupId, keepId: keepId }); }).catch(function (e) { console.warn("archive repoint", e && e.message); }); });
    return chain.then(function () { var ok = applyMergeLocal(dupId, keepId); try { projectOrders(); } catch (e) {} return ok; });
  }
  function doMerge(j) { return mergeCustomers(j.keep.id, j.dup.id); }
  function mergePortalDuplicates() {
    var W = window;
    if (SCOPED || !online() || !ready || merging || !W.K || typeof W.arr !== "function") return Promise.resolve(0);
    var by = {}, jobs = [];
    (typeof W.arrCached === "function" ? W.arrCached(W.K.c) : W.arr(W.K.c)).forEach(function (c) { var p = c && nph(c.phone); if (p) (by[p] = by[p] || []).push(c); });
    Object.keys(by).forEach(function (p) {
      var g = by[p]; if (g.length < 2) return;
      var ports = g.filter(isSelfReg), others = g.filter(function (c) { return !isSelfReg(c); });
      if (!ports.length || !others.length) return;
      others.sort(function (a, b) { return (refCount(b.id) - refCount(a.id)) || byCreated(a, b); });
      ports.forEach(function (d) { jobs.push({ dup: d, keep: others[0], phone: p }); });
    });
    if (!jobs.length) return Promise.resolve(0);
    merging = true; var done = 0, chain = Promise.resolve();
    jobs.forEach(function (j) { chain = chain.then(function () { return doMerge(j); }).then(function (ok) { if (ok) done++; }).catch(function (e) { console.warn("portal merge failed", e && e.message); }); });
    return chain.then(function () { merging = false; if (done) banner(); return done; });
  }
  function callServer(name, data) {
    var u = firebase.auth().currentUser; if (!u) return Promise.reject(new Error("sign_in_required"));
    var url = "https://us-central1-" + encodeURIComponent(firebase.app().options.projectId) + ".cloudfunctions.net/" + encodeURIComponent(name);
    return u.getIdToken().then(function (tok) {
      return (window.WFAppCheck && window.WFAppCheck.headers ? window.WFAppCheck.headers().catch(function () { return {}; }) : Promise.resolve({})).then(function (h) {
        var hdr = { "Content-Type": "application/json", Authorization: "Bearer " + tok }; Object.keys(h || {}).forEach(function (k) { hdr[k] = h[k]; });
        return withTimeout(fetch(url, { method: "POST", headers: hdr, body: JSON.stringify({ data: data || {} }) })).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (r.ok && j && j.result !== undefined) return j.result; throw new Error((j && j.error && j.error.message) || ("HTTP " + r.status)); }); });
      });
    });
  }
  window.wfMergeCustomers = mergeCustomers;
  window.wfMergePortalDuplicates = mergePortalDuplicates;
  /* ----------  دعوة العميل للبوابة بضغطة واحدة  ----------
     بتفعّل حساب البوابة للعميل (الدخول برقم تليفونه) وتربطه بسجله الحالي، وبعدين
     تجهّز رسالة واتساب فيها لينك بيفتح على شاشة الدخول برقم العميل مكتوب. */
  var INV_KEY = "wf_portal_invite_tpl", SEC = null;
  var INV_DEF = "أهلاً {الاسم} 👋\nتقدر تتابع أجهزتك وأوامر الصيانة وتسأل الورشة من بوابة " + (window.WL ? WL.name() : "الورشة الفنية") + ":\n{الرابط}\n\nالدخول برقم تليفونك: {الرقم}\n{كلمة_المرور}";
  function portalPhone(x) { var d = nph(x); return /^01[0125]\d{8}$/.test(d) ? d : ""; }
  // كلمة مؤقتة عشوائية من 8 أرقام (crypto) للحسابات الجديدة وإعادة التعيين.
  function tempPassword() { var a = new Uint32Array(1); (window.crypto || window.msCrypto).getRandomValues(a); return String(10000000 + (a[0] % 90000000)); }
  function secApp() { if (!SEC) SEC = firebase.apps.filter(function (a) { return a.name === "sec"; })[0] || firebase.initializeApp(firebase.app().options, "sec"); try { if (window.WFAppCheck) WFAppCheck.attach(SEC); } catch (e) {} return SEC; }
  // temp: كلمة مؤقتة اتولّدت دلوقتي. legacy: حساب قديم كلمته نفس رقم التليفون. غير كده (كلمة اتبعتت قبل كده) مانكتبش كلمة.
  function inviteText(c, p, mustChange, temp, legacy) {
    var tpl = ls.getItem(INV_KEY) || INV_DEF;
    var link = new URL("portal.html", location.href).href + "?p=" + p;
    var pw = mustChange === false ? "" : temp ? "كلمة المرور المؤقتة: " + temp + " (هتطلب منك تغييرها أول دخول)." : legacy ? "كلمة المرور المبدئية: نفس رقم تليفونك (هتطلب منك تغييرها أول دخول)." : "";
    return tpl.replace(/\{الاسم\}/g, c.name || "").replace(/\{الرابط\}/g, link).replace(/\{الرقم\}/g, p).replace(/\{كلمة_المرور\}/g, pw).trim();
  }
  function invModal(html) {
    var m = document.getElementById("wfInviteModal");
    if (!m) { m = document.createElement("div"); m.id = "wfInviteModal"; m.style.cssText = "position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl"; document.body.appendChild(m); m.addEventListener("click", function (e) { if (e.target === m) m.remove(); }); }
    m.innerHTML = '<div style="background:#fff;color:#111;max-width:420px;width:100%;border-radius:14px;padding:16px;font:15px/1.6 sans-serif;max-height:90vh;overflow:auto">' + html + '</div>';
    return m;
  }
  function invError(code) {
    return ({ "auth/email-already-in-use": "فيه حساب دخول بالرقم ده بس مش متسجّل صح. جرّب من لوحة البوابة.", "permission-denied": "مش مسموح لك بالعملية دي (صلاحيات Firestore).", "linked-other": "الرقم ده مربوط بعميل تاني. ادمج العملاء المكررين الأول من شاشة العملاء.", "bad-phone": "رقم التليفون غير صالح (لازم 01xxxxxxxxx).", "offline": "محتاج نت لتفعيل الحساب.", "timeout": "النت ضعيف، جرّب تاني." })[code] || "حصل خطأ (" + code + ")، جرّب تاني.";
  }
  function createPortalAccount(c, p) {
    // كلمة مؤقتة عشوائية (مش نفس رقم التليفون): أي حد يعرف رقم العميل مايقدرش يدخل بحسابه قبله.
    var em = p + "@phone.elwarsha.app", sa = secApp().auth(), temp = tempPassword();
    return sa.createUserWithEmailAndPassword(em, temp).then(function (cr) {
      var uid = cr.user.uid;
      return secApp().firestore().collection("phoneIndex").doc(p).set({ email: em, uid: uid })
        .then(function () { return db.collection("portalLinks").doc(uid).set({ customerId: c.id, phone: p, mustChange: true, pwKind: "random", createdAt: firebase.firestore.FieldValue.serverTimestamp() }); })
        .then(function () { return sa.signOut(); }).then(function () { return { uid: uid, temp: temp }; });
    }).catch(function (e) { try { sa.signOut(); } catch (x) {} throw e; });
  }
  /* حساب بوابة قديم بقى مربوط بعميل اتمسح من النظام (مثلاً اتمسح العميل واتضاف تاني بنفس الرقم):
     ده مش «عميل تاني» فعلاً، فمينفعش يمنع الموظف يفعّل الحساب. بنتأكد من السيرفر نفسه إن سجل العميل
     القديم مش موجود (قراءة ناجحة بنتيجة «مش موجود») — لو فيه أي خطأ أو الرابط معطّل بنعتبره عميل تاني ونرفض زي الأول. */
  function linkedCustomerGone(link) {
    var id = link && link.customerId;
    if (!id || id === "_reset" || link.disabled) return Promise.resolve(false);
    return withTimeout(db.collection("customers").doc(String(id)).get()).then(function (s) { return !s.exists; }).catch(function () { return false; });
  }
  function replaceOrphanPortalAccount(c, p, oldUid, oldLink) {
    var sa = secApp().auth(), temp = tempPassword(), em = p + "." + Date.now().toString(36) + "@phone.elwarsha.app", newUid = null, swapped = false, SV = firebase.firestore.FieldValue.serverTimestamp();
    var pi = db.collection("phoneIndex").doc(p);
    return withTimeout(sa.createUserWithEmailAndPassword(em, temp)).then(function (cr) {
      newUid = cr.user.uid;
      return withTimeout(pi.set({ email: em, uid: newUid })).catch(function () { // لو القواعد بتسمح بالإنشاء بس: امسح وأنشئ من الحساب الجديد
        return withTimeout(pi.delete()).then(function () { return withTimeout(secApp().firestore().collection("phoneIndex").doc(p).set({ email: em, uid: newUid })); });
      });
    }).then(function () {
      swapped = true;
      return withTimeout(db.collection("portalLinks").doc(newUid).set({ customerId: c.id, phone: p, mustChange: true, pwKind: "random", replacedOrphan: String((oldLink && oldLink.customerId) || ""), createdAt: SV }));
    }).then(function () {
      return withTimeout(db.collection("portalLinks").doc(oldUid).set({ customerId: "_reset", phone: p, disabled: true, replacedBy: newUid, resetAt: SV })).catch(function () {});
    }).then(function () {
      try { sa.signOut(); } catch (e) {}
      return { uid: newUid, mustChange: true, created: true, temp: temp };
    }).catch(function (e) {
      try { sa.signOut(); } catch (x) {}
      // فشل قبل تحويل الفهرس: امسح الحساب الجديد اللي اتفتح عشان مايفضلش حساب يتيم
      if (newUid && !swapped) { try { var u = sa.currentUser; if (u) u.delete().catch(function () {}); } catch (x) {} }
      throw e;
    });
  }
  function resolveInvite(c, p) {
    return withTimeout(db.collection("phoneIndex").doc(p).get()).then(function (d) {
      if (!d.exists) return createPortalAccount(c, p).then(function (a) { return { uid: a.uid, mustChange: true, created: true, temp: a.temp }; });
      var uid = d.data().uid;
      var linkOk = function (l) { return l.exists && l.data().customerId === c.id ? { uid: uid, mustChange: l.data().mustChange !== false, created: false, legacy: !l.data().pwKind } : null; };
      return withTimeout(db.collection("portalLinks").doc(uid).get()).then(function (l) {
        var r = linkOk(l); if (r) return r;
        // فيه حساب بنفس الرقم اتسجّل بنفسه (مش مربوط بسجلك): ادمج الأول بعد ما نسحب آخر بيانات
        return hydrateDelta().catch(function () {}).then(function () { return mergePortalDuplicates(); })
          .then(function () { return withTimeout(db.collection("portalLinks").doc(uid).get()); })
          .then(function (l2) {
            var r2 = linkOk(l2); if (r2) return r2;
            if (l2.exists) {
              var od = l2.data() || {};
              return linkedCustomerGone(od).then(function (gone) {
                if (!gone) throw { code: "linked-other" };
                // الحساب القديم كلمة سره مجهولة للموظف: بنفتح حساب جديد بكلمة مؤقتة عشوائية تتبعت في الدعوة، ونعطّل القديم
                return replaceOrphanPortalAccount(c, p, uid, od);
              });
            }
            return withTimeout(db.collection("portalLinks").doc(uid).set({ customerId: c.id, phone: p, mustChange: false, createdAt: firebase.firestore.FieldValue.serverTimestamp() })).then(function () { return { uid: uid, mustChange: false, created: false }; });
          });
      });
    });
  }
  function inviteCustomer(cid) {
    if (!window.K || typeof window.arr !== "function") return;
    var c = window.arr(window.K.c).find(function (x) { return x.id === cid; });
    if (!c) return alert("العميل مش موجود.");
    var p = portalPhone(c.phone);
    if (!p) return alert(invError("bad-phone"));
    if (!online() || !ready) return alert(invError("offline"));
    invModal('<b>جاري تجهيز الدعوة…</b>');
    return resolveInvite(c, p).then(function (r) {
      var all = window.arr(window.K.c), cc = all.find(function (x) { return x.id === cid; });
      if (cc && (cc.portalUid !== r.uid || cc.portal !== true)) { cc.portal = true; cc.portalUid = r.uid; saveLocal(window.K.c, all); }
      var msg = inviteText(c, p, r.mustChange, r.temp, r.legacy), wa = "https://wa.me/2" + p + "?text=" + encodeURIComponent(msg);
      var m = invModal('<b style="font-size:17px">' + (r.created ? "✅ تم تفعيل حساب البوابة" : "✅ الحساب متفعّل") + '</b><div style="margin:6px 0;color:#444">' + (r.mustChange ? (r.temp || r.legacy ? "العميل هيدخل برقمه وهيغيّر كلمة المرور أول مرة." : "الكلمة المؤقتة اتبعتت للعميل قبل كده ومش بتتعرض تاني. لو ضاعت اضغط «🔑 إعادة تعيين كلمة السر» في صفحة العميل.") : "العميل دخل قبل كده وعنده كلمة مرور.") + '</div><textarea id="wfInvText" readonly rows="8" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #bbb;border-radius:8px;font:14px/1.5 sans-serif"></textarea><div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><a id="wfInvWa" target="_blank" rel="noopener" style="flex:1;text-align:center;background:#25d366;color:#fff;padding:10px;border-radius:10px;text-decoration:none;font-weight:700">📲 افتح واتساب</a><button id="wfInvCopy" type="button" style="flex:1;padding:10px;border-radius:10px;border:1px solid #999;background:#f3f3f3;color:#111">📋 نسخ الرسالة</button><button id="wfInvClose" type="button" style="padding:10px;border-radius:10px;border:1px solid #999;background:#fff;color:#111">إغلاق</button></div>');
      m.querySelector("#wfInvText").value = msg; m.querySelector("#wfInvWa").href = wa;
      m.querySelector("#wfInvCopy").onclick = function () { var t = m.querySelector("#wfInvText"); t.select(); try { (navigator.clipboard ? navigator.clipboard.writeText(msg) : Promise.reject()).catch(function () { document.execCommand("copy"); }); } catch (e) { document.execCommand("copy"); } this.textContent = "✅ اتنسخت"; };
      m.querySelector("#wfInvClose").onclick = function () { m.remove(); if (typeof window.customerProfile === "function") try { window.customerProfile(); } catch (e) {} };
    }).catch(function (e) {
      var m = invModal('<b>⚠️ ' + invError((e && (e.code || e.message)) || "err") + '</b><div style="margin-top:10px"><button id="wfInvClose" type="button" style="padding:10px;border-radius:10px;border:1px solid #999;background:#fff;color:#111">إغلاق</button></div>');
      m.querySelector("#wfInvClose").onclick = function () { m.remove(); };
    });
  }
  window.wfInviteCustomer = inviteCustomer;

  /* ----------  إعادة تعيين كلمة سر عميل نسيها (حساب من غير إيميل)  ----------
     الموظف مايقدرش يغيّر باسورد حساب Firebase لعميل (ده محتاج صلاحيات سيرفر). فبنعمل بدل كده:
     1) نفتح حساب دخول جديد بنفس رقم العميل وكلمة مؤقتة عشوائية (من تطبيق ثانوي، زي تفعيل الحساب بالظبط).
     2) نحوّل فهرس الرقم (phoneIndex) للحساب الجديد، ونربطه بنفس سجل العميل (portalLinks) فكل أجهزته وأوامره وطلباته تفضل زي ما هي.
     3) الحساب القديم بيتعلّم «معطّل» فلو حد عنده جلسة قديمة مايدخلش على بيانات العميل.
     العميل بيدخل بالكلمة المؤقتة وبيتطلب منه يغيّرها فورًا. */
  function resetError(code) {
    return ({ "no-account": "العميل ده ملوش حساب بوابة لسه. استخدم «📲 دعوة البوابة» الأول.", "linked-other": "الرقم ده مربوط بعميل تاني. ادمج العملاء المكررين الأول.", "cancel": "", "permission-denied": "مش مسموح بالعملية دي (صلاحيات Firestore): لازم قواعد phoneIndex تسمح للموظف بالتعديل أو الحذف، ولـ portalLinks بالكتابة.", "auth/operation-not-allowed": "تسجيل الدخول بالإيميل/الباسورد مقفول في إعدادات Firebase." })[code] || invError(code);
  }
  function resetCustomerPassword(cid) {
    if (!window.K || typeof window.arr !== "function") return;
    var c = window.arr(window.K.c).find(function (x) { return x.id === cid; });
    if (!c) return alert("العميل مش موجود.");
    var p = portalPhone(c.phone);
    if (!p) return alert(invError("bad-phone"));
    if (!online()) return alert(invError("offline"));
    if (!confirm("إعادة تعيين كلمة مرور بوابة «" + (c.name || "") + "»؟\nهيتعمل للعميل كلمة مؤقتة جديدة (بيغيّرها أول دخول)، والكلمة القديمة هتتلغي.")) return;
    invModal("<b>جاري إعادة التعيين…</b>");
    var sa = secApp().auth(), temp = tempPassword(), em = p + "." + Date.now().toString(36) + SYNMAIL, idx = null, oldUid = null, newUid = null, swapped = false, SV = firebase.firestore.FieldValue.serverTimestamp();
    var pi = db.collection("phoneIndex").doc(p);
    withTimeout(pi.get()).then(function (d) {
      if (!d.exists) throw { code: "no-account" };
      idx = d.data(); oldUid = idx.uid;
      return withTimeout(db.collection("portalLinks").doc(oldUid).get());
    }).then(function (l) {
      var owner = l.exists ? l.data().customerId : oldUid;
      var ownerOk = owner === c.id ? Promise.resolve(true) : linkedCustomerGone(l.exists ? l.data() : null);
      return ownerOk.then(function (okOwner) {
      if (!okOwner) throw { code: "linked-other" };
      if (String(idx.email || "").slice(-SYNMAIL.length) !== SYNMAIL && !confirm("العميل ده مسجّل بإيميل (" + idx.email + ").\nالأفضل يستخدم «نسيت كلمة المرور» ويوصله رابط على إيميله.\nلو كمّلت هيدخل بعد كده برقم التليفون والكلمة المؤقتة. تكمّل؟")) throw { code: "cancel" };
      return withTimeout(sa.createUserWithEmailAndPassword(em, temp));
      });
    }).then(function (cr) {
      newUid = cr.user.uid;
      return withTimeout(pi.set({ email: em, uid: newUid })).catch(function (e) { // لو القواعد بتسمح بالإنشاء بس: امسح وأنشئ من الحساب الجديد
        return withTimeout(pi.delete()).then(function () { return withTimeout(secApp().firestore().collection("phoneIndex").doc(p).set({ email: em, uid: newUid })); }).catch(function (e2) { throw e2 && e2.code ? e2 : e; });
      });
    }).then(function () {
      swapped = true;
      return withTimeout(db.collection("portalLinks").doc(newUid).set({ customerId: c.id, phone: p, mustChange: true, pwKind: "random", resetAt: SV, createdAt: SV }));
    }).then(function () {
      return withTimeout(db.collection("portalLinks").doc(oldUid).set({ customerId: "_reset", phone: p, disabled: true, replacedBy: newUid, resetAt: SV })).catch(function () {});
    }).then(function () {
      try { sa.signOut(); } catch (e) {}
      var all = window.arr(window.K.c), cc = all.find(function (x) { return x.id === cid; });
      if (cc) { cc.portal = true; cc.portalUid = newUid; saveLocal(window.K.c, all); }
      if (typeof window.auditLog === "function") try { window.auditLog("إعادة تعيين كلمة سر بوابة", "عميل", cid, c.name || ""); } catch (e) {}
      var link = new URL("portal.html", location.href).href + "?p=" + p;
      var msg = "أهلاً " + (c.name || "") + " 👋\nتم إعادة تعيين كلمة مرورك في بوابة " + (window.WL ? WL.name() : "الورشة الفنية") + ".\n" + link + "\nالدخول برقم تليفونك: " + p + "\nكلمة المرور المؤقتة: " + temp + "\n(هتطلب منك تغييرها أول دخول)";
      var m = invModal('<b style="font-size:17px">✅ اتعمل إعادة تعيين</b><div style="margin:6px 0;color:#444">كلمة المرور المؤقتة للعميل:</div><div id="wfRsPw" dir="ltr" style="font:700 26px/1.4 monospace;text-align:center;background:#f3f6ff;border:1px dashed #0b57d0;border-radius:10px;padding:8px;letter-spacing:2px;user-select:all">' + temp + '</div><div style="margin:6px 0;color:#a15c00;font-size:13px">الكلمة دي بتظهر مرة واحدة هنا — ابعتها للعميل دلوقتي. (لو ضاعت اعمل إعادة تعيين تاني.)</div><textarea id="wfRsText" readonly rows="6" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #bbb;border-radius:8px;font:14px/1.5 sans-serif"></textarea><div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><a id="wfRsWa" target="_blank" rel="noopener" style="flex:1;text-align:center;background:#25d366;color:#fff;padding:10px;border-radius:10px;text-decoration:none;font-weight:700">📲 ابعت واتساب</a><button id="wfRsCopy" type="button" style="flex:1;padding:10px;border-radius:10px;border:1px solid #999;background:#f3f3f3;color:#111">📋 نسخ الرسالة</button><button id="wfRsClose" type="button" style="padding:10px;border-radius:10px;border:1px solid #999;background:#fff;color:#111">إغلاق</button></div>');
      m.querySelector("#wfRsText").value = msg; m.querySelector("#wfRsWa").href = "https://wa.me/2" + p + "?text=" + encodeURIComponent(msg);
      m.querySelector("#wfRsCopy").onclick = function () { var t = m.querySelector("#wfRsText"); t.select(); try { (navigator.clipboard ? navigator.clipboard.writeText(msg) : Promise.reject()).catch(function () { document.execCommand("copy"); }); } catch (e) { document.execCommand("copy"); } this.textContent = "✅ اتنسخت"; };
      m.querySelector("#wfRsClose").onclick = function () { m.remove(); if (typeof window.customerProfile === "function") try { window.customerProfile(); } catch (e) {} };
    }).catch(function (e) {
      try { sa.signOut(); } catch (x) {}
      // فشل قبل تحويل الفهرس: امسح الحساب الجديد اللي اتفتح عشان مايفضلش حساب يتيم
      if (newUid && !swapped) { try { var u = sa.currentUser; if (u) u.delete().catch(function () {}); } catch (x) {} }
      var code = (e && (e.code || e.message)) || "err", txt = resetError(code);
      if (code === "cancel") { var mm = document.getElementById("wfInviteModal"); if (mm) mm.remove(); return; }
      var m = invModal('<b>⚠️ ' + txt + '</b><div style="margin-top:10px"><button id="wfRsClose" type="button" style="padding:10px;border-radius:10px;border:1px solid #999;background:#fff;color:#111">إغلاق</button></div>');
      m.querySelector("#wfRsClose").onclick = function () { m.remove(); };
    });
  }
  var SYNMAIL = "@phone.elwarsha.app";
  window.wfResetCustomerPassword = resetCustomerPassword;

  /* عملاء وأجهزة البوابة بيتكتبوا من جهاز العميل من غير ختم المزامنة (_ts)، فالمزامنة بالتغييرات مابتشوفهمش.
     بدل مراقبة كل عملاء البوابة (كانت بتقرا كل واحد فيهم مع كل فتحة صفحة)، بنراقب بس اللي اتسجّل أو اتعدّل
     من البوابة بعد آخر قراية كاملة (updatedAt بيتختم من السيرفر مع كل إنشاء/تعديل من البوابة) — قراءات قليلة جدًا. */
  var kickAt = 0, custWatch = false;
  function watchPortalCustomers() {
    if (custWatch || SCOPED) return; custWatch = true;
    var since; try { since = firebase.firestore.Timestamp.fromMillis(Math.max(0, (+ls.getItem(FULL) || Date.now()) - 2 * 3600 * 1000)); } catch (e) { return; }
    [["wf_c", "customers"], ["wf_d", "devices"]].forEach(function (p) {
      var k = p[0];
      try {
        db.collection(p[1]).where("updatedAt", ">", since).onSnapshot(function (sn) {
          if (!sn.size || !window.K || typeof window.arr !== "function" || hydrating) return;
          var ups = sn.docs.filter(function (d) { return (d.data() || {}).portal === true; }).map(function (d) { return { rec: cleanPortal(fromDoc(d)), ts: 0 }; });
          if (!ups.length) return;
          changedKeys = {};
          if (applyDelta(k, ups, null)) {
            saveBase(); if (!isDirty(k)) lastRaw[k] = ls.getItem(k); markClean();

            try { banner(); } catch (e) {}
            if (k === "wf_d") convertPortal(); // طلب جه على جهاز جديد: يتحوّل أول ما الجهاز ينزل
          }
          if (k === "wf_c" && Date.now() - kickAt > 60000) { kickAt = Date.now(); Promise.resolve().then(function () { return mergePortalDuplicates(); }).catch(function () {}); }
        }, function () {});
      } catch (e) {}
    });
  }

  var CURRENT_UID = null, denied = false;
  /* فتح فوري: بعد أول تحقق ناجح من السيرفر بنحفظ (uid + وقت التحقق). خلال STAFF_TTL الصفحة بتفتح فورًا من البيانات المحلية،
     والتحقق من السيرفر بيتكرر في الخلفية (مش أكتر من مرة كل STAFF_RECHECK) ولو الحساب اتسحبت عضويته بيتقفل فورًا.
     الحماية الفعلية للبيانات السحابية هي قواعد Firestore (isStaff) مش الواجهة. */
  var STAFF = "wf_is_staff_uid", STAFF_AT = "wf_staff_ok_at", STAFF_TTL = 12 * 3600 * 1000, STAFF_RECHECK = 10 * 60 * 1000;
  function staffFresh(uid) { return !!uid && ls.getItem(STAFF) === uid && Date.now() - (+ls.getItem(STAFF_AT) || 0) < STAFF_TTL; }
  function fastHint() { var u = ls.getItem(HYD); return !!u && staffFresh(u); } // قبل ما الجلسة ترجع: هل نتوقع فتح فوري؟
  function lockDenied(unavailable) {
    denied = true; ready = false;
    if (!unavailable) { try { cover("جارٍ فتح بوابة العملاء…"); } catch (e) {} try { location.replace("portal.html"); return; } catch (e) {} }
    cover(unavailable ? "تعذّر التحقق من عضوية الموظف من الخادم. اتصل بالإنترنت ثم أعد المحاولة." : "الحساب ده غير مصرح له بدخول لوحة الورشة. لو أنت عميل ادخل من بوابة العملاء.");
    var a = document.createElement("a"); a.href = "portal.html"; a.textContent = "بوابة العملاء"; a.style.cssText = "display:block;margin-top:14px;color:#9cf"; var cv = document.getElementById("wfCloudCover"); cv.appendChild(a); var so = document.createElement("button"); so.type = "button"; so.textContent = "تسجيل الخروج والدخول بحساب موظف"; so.style.cssText = "display:block;margin:14px auto 0;padding:10px 16px;border-radius:10px;border:1px solid #9cf;background:transparent;color:#fff;font:600 15px sans-serif"; so.onclick = function () { window.wfCloudSignOut(); }; cv.appendChild(so);
    if (unavailable) { /* تعذّر التحقق بسبب النت: زر إعادة محاولة + إعادة تلقائية أول ما النت يرجع */
      var rt = document.createElement("button"); rt.type = "button"; rt.textContent = "إعادة المحاولة"; rt.style.cssText = "display:block;margin:14px auto 0;padding:10px 16px;border-radius:10px;border:0;background:#2563eb;color:#fff;font:600 15px sans-serif"; rt.onclick = function () { location.reload(); }; cv.insertBefore(rt, a);
      try { window.addEventListener("online", function () { location.reload(); }, { once: true }); } catch (e) {}
    }
  }
  function boot(user) {
    CURRENT_UID = user.uid; db = firebase.firestore(); meta = db.collection("settings").doc("wf_meta");
    var hydrated = ls.getItem(HYD) === user.uid, recent = Date.now() - (+ls.getItem(FULL) || 0) < 5 * 60 * 1000;
    SCOPED = ls.getItem(MODE_KEY) === "scoped"; window.wfSyncMode = SCOPED ? "scoped" : "full";
    if (SCOPED && ls.getItem(UID_KEY) === user.uid && !TECH_PAGES.test(location.pathname)) { location.replace("tech.html"); return; }
    function goReady(reload) {
      primeClean();
      ready = true; uncover(); resumeRetries(); badge();
      if (reload) { Promise.resolve(ls.flush ? ls.flush().catch(function () {}) : null).then(function () { location.reload(); }); return; }
      pushAll(false); watchMeta();
      if (SCOPED) return;
      publishPortalConfig(); setTimeout(function () { convertPortal(); projectOrders(); mergePortalDuplicates(); watchPortalCustomers(); }, 1500);
      watchInbox();
    }
    if (!online()) { // أوفلاين: لا تكشف نسخة الموظفين المحفوظة إلا لمعرّف سبق التحقق منه كموظف.
      if (hydrated && ls.getItem("wf_is_staff_uid") === user.uid && ls.getItem(MODE_KEY) !== null) { ready = true; uncover(); resumeRetries(); badge(); return; }
      cover("اتصل بالإنترنت للتحقق من حساب الموظف قبل فتح بيانات النظام."); return;
    }
    // مسار سريع: عضوية موظف متحقق منها حديثًا لنفس الحساب + بيانات متزامنة → افتح فورًا بدون أي انتظار للشبكة
    if (hydrated && staffFresh(user.uid) && ls.getItem(MODE_KEY) !== null) {
      goReady(false); // بيشيل الغطاء، ويشغّل الرفع ومراقبة تحديثات الأجهزة التانية (watchMeta) في الخلفية
      if (Date.now() - (+ls.getItem(STAFF_AT) || 0) > STAFF_RECHECK) {
        withTimeout(db.collection("staff").doc(user.uid).get({ source: "server" })).then(function (d) {
          if (d.exists) {
            origSet.call(ls, STAFF_AT, String(Date.now()));
            return detectScoped(user, d.data()).then(function (sc) { // النطاق اتغيّر (فني ↔ كامل): ابدأ تحميل جديد بالوضع الصح
              if (sc !== SCOPED) { origRemove.call(ls, HYD); origRemove.call(ls, STAFF_AT); location.reload(); }
            });
          }
          origRemove.call(ls, STAFF); origRemove.call(ls, STAFF_AT); lockDenied(false); // العضوية اتسحبت فعلًا
        }).catch(function () { /* مفيش نت/تأخير: نكمل بالتحقق السابق لحد انتهاء مهلته */ });
      }
      return;
    }
    if (hydrated) uncover();
    cover("جارٍ التحقق من صلاحيات حساب الموظف…");
    // لا نثق بعلامة STAFF المحلية وحدها؛ لازم تأكيد المستند من الخادم (بعد أول دخول أو انتهاء مهلة التحقق).
    var staffCheck = withTimeout(db.collection("staff").doc(user.uid).get({ source: "server" })).then(function (d) {
      if (d.exists) { origSet.call(ls, STAFF, user.uid); origSet.call(ls, STAFF_AT, String(Date.now())); return detectScoped(user, d.data()).then(function (sc) { return { staff: true, scoped: sc }; }); }
      origRemove.call(ls, STAFF); origRemove.call(ls, STAFF_AT); return { staff: false };
    }).catch(function (e) {
      origRemove.call(ls, STAFF); origRemove.call(ls, STAFF_AT);
      return { staff: false, unavailable: true, error: e };
    });
    staffCheck.then(function (result) {
      if (result.staff) return continueBoot(result.scoped);
      lockDenied(result.unavailable); /* لا تُفتح البيانات عند تعذر إثبات العضوية */
    });
    function continueBoot(scoped) {
    SCOPED = !!scoped; window.wfSyncMode = SCOPED ? "scoped" : "full";
    var prevMode = ls.getItem(MODE_KEY), prevUid = ls.getItem(UID_KEY);
    // مسح بيانات الجهاز بس لو الوضع اتغيّر أو الحساب اتغيّر (نفس الفني بيخرج ويدخل تاني: تعديلاته اللي لسه مارفعتش تفضل)
    if ((SCOPED && (prevMode !== "scoped" || prevUid !== user.uid)) || (!SCOPED && prevMode === "scoped")) { wipeLocal(); hydrated = false; recent = false; }
    origSet.call(ls, MODE_KEY, SCOPED ? "scoped" : "full"); origSet.call(ls, UID_KEY, user.uid);
    if (SCOPED && !TECH_PAGES.test(location.pathname)) { location.replace("tech.html"); return; } // بوابة الفني المستقلة
    var quick = hydrated && recent;
    var metaS; // قيمة s من wf_meta لو قريناها (عشان المزامنة بالتغييرات ماتقراش الإعدادات من غير داعي)
    (quick ? withTimeout(meta.get()).then(function (d) { metaS = d.exists ? (d.data() || {}).s : undefined; return d.exists && String(d.data().ts) !== ls.getItem(SEEN); }).catch(function () { return false; }) : Promise.resolve(true)).then(function (needFull) {
      if (!needFull && !Object.keys(timers).length) return goReady(false);
      return (hydrated ? hydrateDelta(metaS) : hydrateFull()).then(function (r) {
        if (r && r.cloudEmpty && !hydrated) { /* سحابة فاضية: هيترفع اللي على الجهاز */ }
        var reloadKey = "wf_hyd_reload"; var doReload = !hydrated && r && r.changed && !sessionStorage.getItem(reloadKey); if (hydrated && r && r.changed) banner();
        if (doReload) sessionStorage.setItem(reloadKey, "1"); else sessionStorage.removeItem(reloadKey);
        goReady(doReload);
      });
    }).catch(function (e) {
      console.warn("hydrate failed", e);
      if (hydrated) { ready = true; uncover(); badge(); } else cover("تعذّر الاتصال بقاعدة البيانات — راجع الإنترنت وصلاحيات Firestore ثم أعد التحميل");
    });
    }
  }

  var watching = false;
  function watchMeta() {
    if (watching) return; watching = true;
    meta.onSnapshot(function (d) {
      if (!d.exists || d.metadata.hasPendingWrites) return;
      var x = d.data(); if (x.dev === DEV || String(x.ts) === ls.getItem(SEEN)) return;
      if (x.full && +x.full <= (+ls.getItem(FULL) || 0)) origSet.call(ls, "wf_seen_full", String(x.full)); // قرينا كله بعد النسخة الكاملة دي أصلًا
      (x.full && String(x.full) !== ls.getItem("wf_seen_full") ? (origSet.call(ls, "wf_seen_full", String(x.full)), hydrateFull()) : hydrateDelta(x.s).then(function (r) {
        // جهاز تاني بلّغ بتعديل والتغييرات المختومة فاضية = التعديل جه من نسخة قديمة من التطبيق (مابتختمش): نقرا كله مرة
        return r && r.delta && !r.found && !r.settingsChanged ? hydrateFull() : r;
      })).then(function (r) { origSet.call(ls, SEEN, String(x.ts)); if (r && r.changed) { banner(); } pushAll(false); mergePortalDuplicates(); projectOrders(); }).catch(function () {});
    }, function () {});
  }

  window.wfCloudSignOut = function (to) {
    var flush = (ready && online()) ? Promise.race([pushAll(false), new Promise(function (r) { setTimeout(r, 5000); })]).catch(function () {}) : Promise.resolve(); // ارفع أي تعديل معلّق قبل الخروج (كل حساب بيمسح بياناته المحلية عند التبديل)
    return flush.then(function () {
      if (ready && countPendingOperations() > 0 && !window.confirm("فيه تعديلات لسه ما اترفعتش للسيرفر وهتضيع لو خرجت دلوقتي. تخرج برضه؟\n(إلغاء = ابقى وحاول المزامنة)")) return false;
      return doSignOut(to);
    });
  };
  function doSignOut(to) { origRemove.call(ls, HYD); origRemove.call(ls, FULL); origRemove.call(ls, "wf_is_staff_uid"); origRemove.call(ls, "wf_staff_ok_at"); sessionStorage.removeItem("wf_hyd_reload"); forgetLogin(); return firebase.auth().signOut().then(function () { location.href = typeof to === "string" && /^[a-z-]+\.html$/.test(to) ? to : "login.html"; }); }
  window.wfSyncInfo = function () { // حالة المزامنة للواجهات الخارجية (بوابة الفني)
    var cf = Object.keys(conflicts).reduce(function (n, k) { return n + Object.keys(conflicts[k] || {}).length; }, 0);
    return { pending: countPendingOperations(), error: lastSyncError, last: lastSyncAt, online: online(), ready: ready, mode: SCOPED ? "scoped" : "full", conflicts: cf };
  };
  window.wfCloudSyncNow = function () { return hydrateFull().then(function () { return pushAll(true); }); };
  window.addEventListener("online", function () { badge(); pushAll(false); Object.keys(retryState).forEach(function (k) { if ((ALL.indexOf(k) > -1 || REMOTE_RETRY_KEYS.indexOf(k) > -1) && !retryTimers[k]) scheduleRetry(k); }); });
  window.addEventListener("offline", badge);
  window.addEventListener("pagehide", function () { Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); delete timers[k]; push(k, false); }); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") pushAll(false); });
  setInterval(function () { badge(); if (ready && online()) pushAll(false); }, 15000);
  document.addEventListener("DOMContentLoaded", badge);

  firebase.initializeApp(CFG);
  try { if (window.WFAppCheck) WFAppCheck.attach(firebase.app()); } catch (e) {}
  /* الأدوار والصلاحيات (حراسة الواجهة): بتتحمّل تلقائيًا في كل صفحات الموظفين من غير تعديل كل صفحة؛ فشل تحميلها ما بيوقفش النظام. */
  if (!isLogin && !window.WFPerm) loadScript("roles-core.js").then(function () { return window.WFRoles ? loadScript("app-permissions.js") : null; });
  try { firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {}); } catch (e) {}
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {} // اطلب تخزين دائم عشان المتصفح مايمسحش الجلسة
  if (!isLogin && !fastHint()) cover("جارٍ التحقق من صلاحيات حساب الموظف…");
  firebase.auth().onAuthStateChanged(function (u) {
    if (isLogin) { if (u) location.replace("index.html"); return; }
    if (!u) { if (denied) return; if (navigator.onLine === false) {
        /* Auth قد لا يعيد الجلسة في بعض المتصفحات رغم وجود نسخة محلية موثّقة.
           لا نرمي المستخدم خارج النظام: نفتح البيانات المحلية لنفس UID فقط. */
        if (fastHint()) { ready = true; uncover(); resumeRetries(); badge(); return; }
        ready = false; cover("يلزم فتح النظام مرة واحدة مع الإنترنت للتحقق من حساب الموظف."); return;
      }
      cover("جارٍ التحقق من صلاحيات حساب الموظف…"); // مفيش جلسة: غطّي الشاشة لحد التحويل لصفحة الدخول
      // الجلسة اتمسحت من المتصفح بدون ما المستخدم يعمل خروج؟ جرّب الدخول الصامت من مدير كلمات المرور قبل ما نروح لصفحة الدخول
      loadScript("wf-session.js").then(function () { return window.WfSession ? WfSession.silent(firebase.auth()) : null; }).then(function (r) { if (!r) location.replace("login.html"); }); return; }
    boot(u);
  });
})();
