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
  var CFG = { apiKey: "AIzaSyAISlRIHOVKhupLS8l2hG_QwY6Wkchq9W8", authDomain: "elwarsha-elfanya.firebaseapp.com", projectId: "elwarsha-elfanya", storageBucket: "elwarsha-elfanya.firebasestorage.app", messagingSenderId: "916075814550", appId: "1:916075814550:web:90e6b0c01b58abc614ecb7" };
  var COLS = { wf_c: "customers", wf_d: "devices", wf_r: "requests", wf_p: "parts", wf_tr: "treasury", wf_tasks: "tasks", wf_wallet_tx: "walletTx", wf_fault_codes: "faultCodes", wf_inv: "invoices", wf_m: "partMoves" };
  var EXTRA = ["wf_e", "wf_trash", "wf_followup_log", "wf_pending_calls", "wf_comp_custom", "wf_comp_fav"];
  var SETTINGS = "wf_s", CHUNK = 250000, TIMEOUT = 25000;
  var ALL = Object.keys(COLS).concat(EXTRA, [SETTINGS]);
  var REMOTE_RETRY_KEYS = ["remote:portalOrders", "remote:portalConfig", "remote:portalTicker"];
  var HYD = "wf_cloud_hydrated_uid", BASEKEY = "wf_syncbase", FULL = "wf_last_full_sync", SEEN = "wf_meta_seen";
  var isLogin = /login\.html$/.test(location.pathname);
  var ls = window.WFStorage, origSet = ls.setItem.bind(ls), origRemove = ls.removeItem.bind(ls);
  var db = null, meta = null, ready = false, applying = false, timers = {}, lastRaw = {}, flushing = false, hydrating = false, pushing = {};
  var RETRY_KEY = "wf_sync_retry_state", CONFLICT_KEY = "wf_sync_conflicts", retryState = {}, retryTimers = {}, conflicts = {}, lastSyncAt = +(ls.getItem("wf_last_sync_at") || 0), lastSyncError = ls.getItem("wf_sync_last_error") || "";
  try { retryState = JSON.parse(ls.getItem(RETRY_KEY) || "{}") || {}; } catch (e) { retryState = {}; }
  try { conflicts = JSON.parse(ls.getItem(CONFLICT_KEY) || "{}") || {}; } catch (e) { conflicts = {}; }
  var DEV = ls.getItem("wf_device_id") || (function () { var x = Math.random().toString(36).slice(2); origSet.call(ls, "wf_device_id", x); return x; })();
  var SB; try { SB = JSON.parse(ls.getItem(BASEKEY)) || {}; } catch (e) { SB = {}; } SB.c = SB.c || {}; SB.x = SB.x || {};
  function saveBase() { origSet.call(ls, BASEKEY, JSON.stringify(SB)); }

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
        var job = k === "remote:portalOrders" ? projectOrders() : (k === "remote:portalConfig" ? publishPortalConfig() : publishTicker(currentSettings.portalTicker || null));
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
  function countPendingOperations() {
    var count = 0;
    ALL.forEach(function (k) {
      if (COLS[k]) {
        var localRows = local(k), rows = Array.isArray(localRows) ? localRows : [], base = SB.c[k] || {}, seen = {};
        rows.forEach(function (r) { if (!r || !r.id) return; seen[r.id] = 1; if (base[r.id] !== hr(r)) count++; });
        Object.keys(base).forEach(function (id) { if (!seen[id]) count++; });
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
    panel.innerHTML = "<strong style='flex:0 0 auto'>☁️ المزامنة</strong><span id='wfSyncSummary' style='flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis' title=''></span><button type='button' id='wfSyncNowBtn' style='flex:0 0 auto;border:0;border-radius:7px;padding:6px 9px;background:#0b57d0;color:#fff;font-weight:700'>مزامنة</button><details id='wfSyncDetails' style='position:relative;flex:0 0 auto'><summary style='cursor:pointer;list-style:none;border:1px solid #b7c7dc;border-radius:7px;padding:5px 8px'>التفاصيل</summary><div style='position:absolute;top:calc(100% + 6px);left:0;z-index:9999;width:min(330px,calc(100vw - 36px));box-sizing:border-box;white-space:normal;background:var(--panel,#fff);color:var(--text,#14213d);border:1px solid #b7c7dc;border-radius:10px;padding:10px;box-shadow:0 4px 16px #001b4d30'><div><b>الحالة:</b> <span id='wfSyncState'></span></div><div><b>آخر مزامنة:</b> <span id='wfSyncLast'></span></div><div><b>التعديلات المعلقة:</b> <span id='wfSyncPending'></span></div><div><b>عدد العمليات المنتظرة:</b> <span id='wfSyncWaiting'></span></div><div><b>آخر خطأ:</b> <span id='wfSyncError'></span></div><div><b>تعارضات تحتاج مراجعة:</b> <span id='wfSyncConflicts'></span> <button type='button' id='wfSyncConflictBtn' style='display:none;border:0;border-radius:7px;padding:5px 8px;background:#b45309;color:#fff'>مراجعة</button></div></div></details>";
    var summaryNode = panel.querySelector("#wfSyncSummary"); summaryNode.textContent = summary; summaryNode.title = summary;
    panel.querySelector("#wfSyncState").textContent = status;
    panel.querySelector("#wfSyncLast").textContent = last;
    panel.querySelector("#wfSyncPending").textContent = String(pending);
    panel.querySelector("#wfSyncWaiting").textContent = String(waiting);
    panel.querySelector("#wfSyncError").textContent = lastSyncError || "لا يوجد";
    panel.querySelector("#wfSyncConflicts").textContent = String(conflictCount);
    panel.querySelector("#wfSyncConflictBtn").style.display = conflictCount ? "inline-block" : "none";
    panel.querySelector("#wfSyncConflictBtn").onclick = showSyncConflicts;
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
      var label = document.createElement("b"); label.textContent = item.key + " / " + item.id; row.appendChild(label);
      var localBtn = document.createElement("button"), cloudBtn = document.createElement("button");
      localBtn.type = cloudBtn.type = "button"; localBtn.textContent = "اعتماد نسخة هذا الجهاز"; cloudBtn.textContent = "اعتماد نسخة السحابة";
      localBtn.style.cssText = cloudBtn.style.cssText = "margin:8px 6px 0 0;padding:7px;border:0;border-radius:7px;background:#0b57d0;color:white";
      localBtn.onclick = function () { resolveSyncConflict(item.key, item.id, "local", modal); };
      cloudBtn.onclick = function () { resolveSyncConflict(item.key, item.id, "cloud", modal); };
      row.appendChild(localBtn); row.appendChild(cloudBtn); box.appendChild(row);
    });
    var close = document.createElement("button"); close.type = "button"; close.textContent = "إغلاق"; close.onclick = function () { modal.remove(); }; box.appendChild(close); modal.appendChild(box); document.body.appendChild(modal);
  }
  function resolveSyncConflict(k, id, choice, modal) {
    var item = conflicts[k] && conflicts[k][id]; if (!item) return;
    if (k === SETTINGS) {
      var remoteRaw = JSON.stringify(item.remote || {});
      if (choice === "cloud") { raw(k, remoteRaw); lastRaw[k] = remoteRaw; }
      else lastRaw[k] = remoteRaw;
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
      if (item.remote) { if (at < 0) list.push(item.remote); else list[at] = item.remote; }
      else if (at >= 0) list.splice(at, 1);
      origSet.call(ls, k, JSON.stringify(list));
      SB.c[k] = SB.c[k] || {}; if (item.remoteHash) SB.c[k][id] = item.remoteHash; else delete SB.c[k][id]; saveBase();
    } else {
      SB.c[k] = SB.c[k] || {}; if (item.remoteHash) SB.c[k][id] = item.remoteHash; else delete SB.c[k][id]; saveBase();
    }
    delete conflicts[k][id]; if (!Object.keys(conflicts[k]).length) delete conflicts[k];
    origSet.call(ls, CONFLICT_KEY, JSON.stringify(conflicts));
    if (modal && !Object.keys(conflicts).some(function (key) { return Object.keys(conflicts[key] || {}).length; })) modal.remove();
    badge(); if (choice === "local") push(k, true); else pushAll(false);
  }
  window.wfResolveSyncConflicts = showSyncConflicts;

  /* ---------- أدوات ---------- */
  function h(s) { var x = 5381, i = s.length; while (i) x = ((x << 5) + x + s.charCodeAt(--i)) | 0; return (x >>> 0).toString(36) + s.length.toString(36); }
  function clean(v) { if (v && typeof v.toDate === "function") return v.toDate().toISOString(); if (Array.isArray(v)) return v.map(clean); if (v && typeof v === "object") { var o = {}; Object.keys(v).forEach(function (k) { o[k] = clean(v[k]); }); return o; } return v; }
  var ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:?\d\d)?$/;
  function stable(v) { if (typeof v === "string" && ISO.test(v)) { var t = Date.parse(v); if (!isNaN(t)) return JSON.stringify("~" + t); } if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]"; if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}"; return JSON.stringify(v === undefined ? null : v); }
  function sameField(a, b, key) { var ah = Object.prototype.hasOwnProperty.call(a || {}, key), bh = Object.prototype.hasOwnProperty.call(b || {}, key); return ah === bh && (!ah || stable(a[key]) === stable(b[key])); }
  function hr(r) { var o = Object.assign({}, r); delete o.id; return h(stable(o)); }
  function fromDoc(d) { var o = clean(d.data()); o.id = d.id; return o; }
  function toDoc(rec) { var o = JSON.parse(JSON.stringify(rec)); delete o.id; ["createdAt", "updatedAt", "at"].forEach(function (f) { if (typeof o[f] === "string" && !isNaN(Date.parse(o[f]))) o[f] = firebase.firestore.Timestamp.fromDate(new Date(o[f])); }); return o; }
  function byCreated(a, b) { return (Date.parse(a.createdAt || a.at) || 0) - (Date.parse(b.createdAt || b.at) || 0); }
  function local(k) { try { return JSON.parse(ls.getItem(k) || "null"); } catch (e) { return null; } }
  function raw(k, v) { applying = true; origSet.call(ls, k, v); applying = false; }
  function withTimeout(p) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, TIMEOUT); })]); }
  function online() { return navigator.onLine !== false && !!db; }

  ls.subscribe(function (k) { if (ready && !applying && ALL.indexOf(k) > -1) queue(k); });

  /* ---------- الرفع ---------- */
  function queue(k) { clearTimeout(timers[k]); timers[k] = setTimeout(function () { delete timers[k]; push(k, true); }, 700); badge(); }
  function commitOps(ops) { var chain = Promise.resolve(); for (var i = 0; i < ops.length; i += 400) (function (part) { chain = chain.then(function () { var b = db.batch(); part.forEach(function (f) { f(b); }); return withTimeout(b.commit()); }); })(ops.slice(i, i + 400)); return chain; }
  function touchMeta() { var ts = Date.now(); origSet.call(ls, SEEN, String(ts)); return meta.set({ ts: ts, dev: DEV }).catch(function () {}); }

  function push(k, interactive) {
    if (!online() || pushing[k]) return Promise.resolve(false);
    pushing[k] = true;
    var done = function (ok, err) { pushing[k] = false; if (ok) { delete retryState[k]; clearTimeout(retryTimers[k]); delete retryTimers[k]; lastSyncAt = Date.now(); lastSyncError = ""; origRemove.call(ls, "wf_sync_last_error"); origSet.call(ls, "wf_last_sync_at", String(lastSyncAt)); saveRetryState(); } else { if (err) { lastSyncError = String(err.message || err); origSet.call(ls, "wf_sync_last_error", lastSyncError); } retryLater(k); } badge(); return ok; };
    var snapshotRaw = ls.getItem(k), ops = [], v = local(k), next;
    if (COLS[k]) {
      var col = db.collection(COLS[k]), B = SB.c[k] || {}, arr = Array.isArray(v) ? v : [], seen = {}, dels = 0;
      next = Object.assign({}, B);
      var jobs = [];
      arr.forEach(function (r) {
        if (!r || !r.id) return;
        seen[r.id] = 1; var localHash = hr(r); next[r.id] = localHash;
        if (B[r.id] !== localHash) { if (conflicts[k] && conflicts[k][r.id]) next[r.id] = B[r.id]; else jobs.push({ id: r.id, ref: col.doc(r.id), record: r, localHash: localHash, baseHash: B[r.id], kind: "set" }); }
      });
      Object.keys(B).forEach(function (id) {
        if (!seen[id]) { dels++; if (!(conflicts[k] && conflicts[k][id])) jobs.push({ id: id, ref: col.doc(id), localHash: null, baseHash: B[id], kind: "delete" }); }
      });
      var total = Object.keys(B).length;
      if (dels > 20 && dels > total / 2) {
        if (!interactive) { pushing[k] = false; badge(); return Promise.resolve(false); }
        if (!window.confirm("⚠️ هيتم حذف " + dels + " سجل من السحابة نهائيًا. متأكد؟\n(إلغاء = استرجاعهم من السحابة)")) { SB.c[k] = {}; saveBase(); pushing[k] = false; hydrateFull(true).then(function () { location.reload(); }); return Promise.resolve(false); }
      }
      var wrote = false, hasConflict = false, chain = Promise.resolve();
      jobs.forEach(function (job) {
        chain = chain.then(function () {
          return withTimeout(db.runTransaction(async function (tx) {
            var snap = await tx.get(job.ref), remote = snap.exists ? fromDoc(snap) : null, remoteHash = remote ? hr(remote) : null;
            if (job.kind === "set" && remoteHash === job.localHash) return { state: "same", remote: remote, remoteHash: remoteHash };
            if (job.kind === "delete" && !snap.exists) return { state: "same", remote: null, remoteHash: null };
            var baselineMatches = job.baseHash === undefined ? !snap.exists : remoteHash === job.baseHash;
            if (!baselineMatches) return { state: "conflict", remote: remote, remoteHash: remoteHash };
            if (job.kind === "delete") tx.delete(job.ref); else tx.set(job.ref, toDoc(job.record));
            return { state: "written", remote: remote, remoteHash: remoteHash };
          })).then(function (result) {
            if (result.state === "conflict") {
              hasConflict = true; conflicts[k] = conflicts[k] || {};
              conflicts[k][job.id] = { local: job.kind === "delete" ? null : job.record, remote: result.remote, remoteHash: result.remoteHash, localHash: job.localHash, createdAt: Date.now() };
              next[job.id] = job.baseHash;
            } else {
              if (job.kind === "delete") delete next[job.id]; else next[job.id] = job.localHash;
              if (result.state === "written") wrote = true;
            }
          });
        });
      });
      return chain.then(function () {
        SB.c[k] = next; saveBase();
        if (hasConflict) { origSet.call(ls, CONFLICT_KEY, JSON.stringify(conflicts)); }
        if (!hasConflict) lastRaw[k] = snapshotRaw;
        var touch = wrote ? touchMeta() : Promise.resolve();
        return touch.then(function () { if (wrote && (k === "wf_r" || k === "wf_c" || k === "wf_d")) projectOrders(); return done(!hasConflict, hasConflict ? new Error("تعارض إصدار: لم تتم الكتابة فوق السجل الأحدث") : null); });
      }).catch(function (e) { console.warn("sync pending", k, e && e.message); return done(false, e); });
    }
    if (k === SETTINGS) {
      if (!v) return Promise.resolve(done(true));
      if (SB.x[k] === h(snapshotRaw)) { lastRaw[k] = snapshotRaw; return Promise.resolve(done(true)); }
      if (conflicts[k] && conflicts[k].global) { pushing[k] = false; badge(); return Promise.resolve(false); }
      var settingsRef = db.collection("settings").doc("global"), baseRaw = lastRaw[k], baseKnown = baseRaw !== undefined, base = {};
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
        raw(k, mergedRaw); SB.x[k] = h(mergedRaw); saveBase(); lastRaw[k] = mergedRaw;
        publishPortalConfig(); projectOrders();
        return touchMeta().then(function () { return done(true); });
      }).catch(function (e) { return done(false, e); });
    }
    var hh0 = snapshotRaw === null ? null : h(snapshotRaw);
    if (SB.x[k] === hh0) { lastRaw[k] = snapshotRaw; return Promise.resolve(done(true)); }
    var id = "wfkv_" + k, old = SB.x["n_" + k] || 0, parts = [], n;
    if (snapshotRaw !== null) for (var i = 0; i < snapshotRaw.length; i += CHUNK) parts.push(snapshotRaw.slice(i, i + CHUNK));
    n = parts.length;
    ops.push(function (bt) { n ? bt.set(db.collection("settings").doc(id), { n: n, dev: DEV, ts: Date.now() }) : bt.delete(db.collection("settings").doc(id)); });
    parts.forEach(function (p, i) { ops.push(function (bt) { bt.set(db.collection("settings").doc(id + "~" + i), { v: p }); }); });
    for (var j = n; j < old; j++) (function (j) { ops.push(function (bt) { bt.delete(db.collection("settings").doc(id + "~" + j)); }); })(j);
    return commitOps(ops).then(function () { SB.x[k] = snapshotRaw === null ? null : h(snapshotRaw); SB.x["n_" + k] = n; saveBase(); lastRaw[k] = snapshotRaw; return touchMeta(); }).then(function () { return done(true); }).catch(function (e) { return done(false, e); });
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
  function projectOrders() { // نسخة آمنة من أوامر عملاء البوابة (من غير تكلفة القطع) عشان العميل يتابع حالته
    if (!online()) { retryLater("remote:portalOrders"); return Promise.resolve(false); }
    if (poBusy) return Promise.resolve(false);
    var cs = local("wf_c") || [], ds = local("wf_d") || [], rs = local("wf_r") || [], portal = {}, po = SB.po = SB.po || {}, ops = [], seen = {}, next = Object.assign({}, po);
    var pm = {}; (local("wf_p") || []).forEach(function (x) { if (x && x.id) pm[x.id] = x; });
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
      if (showDep) p.deposit = +r.deposit || 0;
      if (showRemain) p.remain = +r.remain || 0;
      if (showLabor) p.labor = +r.labor || 0;
      if (V.work) p.work = r.work || "";
      if (V.parts) p.parts = (r.parts || []).map(function (i) { var pt = pm[i.partId] || {}; var o = { name: pt.name || pt.title || i.name || "قطعة" }; if (showQty) o.qty = +i.qty || 1; if (showPartPrice) o.price = +i.sell || 0; return o; });
      if (V.history) p.history = (r.statusHistory || []).map(function (x) { return { to: x.to || "", at: x.at || "" }; });
      var x = h(stable(p)); if (po[r.id] !== x) { next[r.id] = x; ops.push(function (bt) { bt.set(db.collection("portalOrders").doc(r.id), Object.assign({}, p, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() })); }); }
    });
    Object.keys(po).forEach(function (id) { if (!seen[id]) { delete next[id]; ops.push(function (bt) { bt.delete(db.collection("portalOrders").doc(id)); }); } });
    if (!ops.length) { clearRetry("remote:portalOrders"); return Promise.resolve(true); }
    poBusy = true;
    return commitOps(ops).then(function () { SB.po = next; saveBase(); clearRetry("remote:portalOrders"); return true; }).catch(function (e) { console.warn("portal projection pending", e && e.message); retryLater("remote:portalOrders"); return false; }).then(function (ok) { poBusy = false; return ok; });
  }
  function publishPortalConfig() { // قوائم عامة للبوابة (من غير أي بيانات حساسة)
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
    return db.collection("portal").doc("config").set(c, { mergeFields: Object.keys(c) }).then(function () { SB.x.pc = x; saveBase(); clearRetry("remote:portalConfig"); return true; }).catch(function (e) { console.warn("portal config publish pending", e && e.message); retryLater("remote:portalConfig"); return false; });
  }
  // الشريط الإعلاني لازم يظهر للزوار قبل تسجيل الدخول كمان: portal/config ممكن يكون مقفول على المسجّلين،
  // فبننشره كمان في portalPosts (نفس المكان اللي الزوار بيقروا منه المقالات أصلًا) بمعرّف ثابت وبيتفلتر بره قايمة المقالات.
  function publishTicker(t) {
    if (!online()) { retryLater("remote:portalTicker"); return Promise.resolve(false); }
    if (!t) { clearRetry("remote:portalTicker"); return Promise.resolve(true); }
    try { if (window.PortalTicker && window.PortalTicker.prune) t = window.PortalTicker.prune(t).ticker || t; } catch (e) {} // العروض المنتهية ما بتتنشرش
    var x = h(stable(t));
    if (SB.x.pt === x) { clearRetry("remote:portalTicker"); return Promise.resolve(true); }
    return db.collection("portalPosts").doc("wf-ticker").set({ title: "شريط إعلانات", category: "ticker", body: "", image: "", pinned: false, published: true, ticker: t, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
      .then(function () { SB.x.pt = x; saveBase(); clearRetry("remote:portalTicker"); return true; }).catch(function (e) { console.warn("ticker publish pending", e && e.message); retryLater("remote:portalTicker"); return false; });
  }
  var inboxN = { a: 0, b: 0, c: 0, q: 0, g: 0 }; // g = طلبات الزوار (guestRequests)
  window.wfPortalInbox = inboxN;
  function pill() { // مفيش شريط عايم: العدّاد بيظهر جوه كارت "بوابة العملاء" في الرئيسية بس
    var t = inboxN.a + inboxN.b + inboxN.c + inboxN.q + inboxN.g, old = document.getElementById("wfPortalPill");
    if (old) old.remove();
    window.wfPortalTotal = t;
    try { document.dispatchEvent(new CustomEvent("wf-portal-inbox", { detail: { total: t, n: inboxN } })); } catch (e) {}
  }
  var inboxOn = false;
  function watchInbox() {
    if (inboxOn) return; inboxOn = true;
    try {
      db.collection("portalRequests").where("handled", "==", false).onSnapshot(function (s) { inboxN.a = s.size; pill(); convertPortal(); }, function () {});
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
  var converting = false;
  function convertPortal() { // حوّل طلبات البوابة الجديدة لأوامر شغل حقيقية
    var fns = ["orderNo", "recordStatusHistory", "applyStatusTimestamp", "saveJSONSafe", "arr", "settings"];
    if (!online() || converting || !ready || fns.some(function (f) { return typeof window[f] !== "function"; }) || !window.K) return Promise.resolve();
    converting = true;
    return db.collection("portalRequests").where("handled", "==", false).get().then(function (snap) {
      var n = 0, marks = [], seenPortal = {};
      snap.docs.forEach(function (d) {
        var p = sanitize(clean(d.data())), id = d.id, ds = window.arr(window.K.d), cs = window.arr(window.K.c);
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
        if (!exists) {
          var s = window.settings();
          var r = { id: id, portalRequestId: id, no: window.orderNo(), customerId: p.customerId, deviceId: p.deviceId, addressKey: "main", visit: p.visit || "", status: "جديد", executionPlace: p.executionPlace || (s.executionPlaces || [])[0] || "عند العميل", workshopStatus: (s.workshopStatuses || [])[0] || "غير مطلوب", partsWaiting: false, tag: "", fault: p.fault || "", work: "", labor: 0, parts: [], partsTotal: 0, partsCost: 0, total: 0, deposit: 0, remain: 0, closed: false, source: "portal", customerNote: p.note || "", createdAt: new Date().toISOString() };
          window.recordStatusHistory(r, "", r.status); window.applyStatusTimestamp(r, r.status);
          if (!window.saveJSONSafe(window.K.r, window.arr(window.K.r).concat(r))) return;
          exists = r; n++;
        }
        marks.push(d.ref.update({ handled: true, orderId: id, orderNo: exists.no || "" }));
      });
      return Promise.all(marks).then(function () { if (n) { banner(); return projectOrders(); } });
    }).catch(function (e) { console.warn("portal convert", e && e.message); }).then(function () { converting = false; });
  }

  function isDirty(k) {
    var rawv = ls.getItem(k);
    if (COLS[k]) { var arr = local(k) || [], B = SB.c[k] || {}, ids = {}; for (var i = 0; i < arr.length; i++) { var r = arr[i]; if (!r || !r.id) continue; ids[r.id] = 1; if (B[r.id] !== hr(r)) return true; } return Object.keys(B).some(function (id) { return !ids[id]; }); }
    if (k === SETTINGS) return rawv !== null && h(rawv) !== SB.x[k];
    return rawv === null ? (SB.x[k] !== undefined && SB.x[k] !== null) : h(rawv) !== SB.x[k];
  }
  // رفع نسخة الجهاز للسحابة واعتبارها الأصل (بيستبدل اللي في السحابة): بيتنادى تلقائيًا بعد استرجاع نسخة احتياطية
  window.wfCloudForceUpload = function (skipConfirm) {
    if (!online()) return Promise.reject(new Error("offline"));
    if (!skipConfirm && !window.confirm("هيتم استبدال بيانات السحابة ببيانات الجهاز ده بالكامل (اللي مش موجود هنا هيتمسح من السحابة). متأكد؟")) return Promise.resolve(false);
    var keys = Object.keys(COLS);
    return withTimeout(Promise.all(keys.map(function (k) { return db.collection(COLS[k]).get(); }))).then(function (res) {
      var ops = [], next = {};
      keys.forEach(function (k, i) {
        var col = db.collection(COLS[k]), arr = local(k) || [], seen = {}, nb = {};
        arr.forEach(function (r) { if (!r || !r.id) return; seen[r.id] = 1; nb[r.id] = hr(r); ops.push(function (bt) { bt.set(col.doc(r.id), toDoc(r)); }); });
        res[i].docs.forEach(function (d) { if (!seen[d.id]) ops.push(function (bt) { bt.delete(d.ref); }); });
        next[k] = nb;
      });
      return commitOps(ops).then(function () { keys.forEach(function (k) { SB.c[k] = next[k]; }); saveBase(); });
    }).then(function () {
      var rest = EXTRA.concat([SETTINGS]); rest.forEach(function (k) { delete SB.x[k]; delete lastRaw[k]; });
      return Promise.all(rest.map(function (k) { return push(k, false); }));
    }).then(function () { origSet.call(ls, HYD, CURRENT_UID || ls.getItem(HYD) || ""); origSet.call(ls, FULL, String(Date.now())); return touchMeta(); }).then(function () { projectOrders(); badge(); return true; });
  };
  function hydrateFull(force) {
    if (hydrating) return Promise.resolve(false); hydrating = true;
    var keys = Object.keys(COLS), first = ls.getItem(HYD) !== CURRENT_UID;
    return withTimeout(Promise.all(keys.map(function (k) { return db.collection(COLS[k]).get(); }).concat([db.collection("settings").get()]))).then(function (res) {
      var changedAny = false;
      var sSnap = res[keys.length], ex = extrasFrom(sSnap), g = null; sSnap.forEach(function (d) { if (d.id === "global") g = clean(d.data()); });
      var cloudEmpty = !g && !Object.keys(ex).length && keys.every(function (k, i) { return !res[i].docs.length; });
      keys.forEach(function (k, i) {
        var merged = mergeColWithBase(k, res[i].docs.map(fromDoc).map(cleanPortal), first, SB.c[k]);
        if (stable(local(k) || []) !== stable(merged.arr)) { raw(k, JSON.stringify(merged.arr)); changedAny = true; }
        SB.c[k] = merged.base;
      });
      EXTRA.forEach(function (k) {
        var lr = ls.getItem(k), changed = lr !== null && (first ? !ex[k] : h(lr) !== SB.x[k]);
        if (ex[k] && !changed) { if (lr !== ex[k].v) { raw(k, ex[k].v); changedAny = true; } SB.x[k] = h(ex[k].v); }
        SB.x["n_" + k] = ex[k] ? ex[k].n : (SB.x["n_" + k] || 0);
      });
      var lr = ls.getItem(SETTINGS), lchanged = lr !== null && (first ? !g : h(lr) !== SB.x[SETTINGS]);
      if (g) { var lo = local(SETTINGS) || {}; var m = lchanged ? Object.assign({}, g, lo) : Object.assign({}, lo, g); if (stable(lo) !== stable(m)) { raw(SETTINGS, JSON.stringify(m)); changedAny = true; } if (!lchanged) SB.x[SETTINGS] = h(ls.getItem(SETTINGS)); }
      raw(HYD, CURRENT_UID); origSet.call(ls, FULL, String(Date.now())); saveBase();
      lastRaw = {}; ALL.forEach(function (k) { if (!isDirty(k)) lastRaw[k] = ls.getItem(k); }); // ارفع بس اللي اتغيّر فعلًا
      return { changed: changedAny, cloudEmpty: cloudEmpty };
    }).then(function (r) {
      var mirror = window.WorkshopDB && typeof window.WorkshopDB.replaceMany === "function"
        ? window.WorkshopDB.replaceMany({ wf_c: local("wf_c") || [], wf_d: local("wf_d") || [], wf_r: local("wf_r") || [], wf_p: local("wf_p") || [], wf_m: local("wf_m") || [], wf_wallet_tx: local("wf_wallet_tx") || [] }).catch(function (e) { console.warn("IndexedDB mirror after cloud hydration failed", e); })
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
    Larr.forEach(function (r) { if (!r || !r.id) return; seen[r.id] = 1; if (B[r.id] !== hr(r)) out.push(r); else if (cm[r.id]) out.push(cm[r.id]); });
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
    return chain.then(function () { var ok = applyMergeLocal(dupId, keepId); try { projectOrders(); } catch (e) {} return ok; });
  }
  function doMerge(j) { return mergeCustomers(j.keep.id, j.dup.id); }
  function mergePortalDuplicates() {
    var W = window;
    if (!online() || !ready || merging || !W.K || typeof W.arr !== "function") return Promise.resolve(0);
    var by = {}, jobs = [];
    W.arr(W.K.c).forEach(function (c) { var p = c && nph(c.phone); if (p) (by[p] = by[p] || []).push(c); });
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
  function secApp() { if (!SEC) SEC = firebase.apps.filter(function (a) { return a.name === "sec"; })[0] || firebase.initializeApp(firebase.app().options, "sec"); return SEC; }
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
  function resolveInvite(c, p) {
    return withTimeout(db.collection("phoneIndex").doc(p).get()).then(function (d) {
      if (!d.exists) return createPortalAccount(c, p).then(function (a) { return { uid: a.uid, mustChange: true, created: true, temp: a.temp }; });
      var uid = d.data().uid;
      var linkOk = function (l) { return l.exists && l.data().customerId === c.id ? { uid: uid, mustChange: l.data().mustChange !== false, created: false, legacy: !l.data().pwKind } : null; };
      return withTimeout(db.collection("portalLinks").doc(uid).get()).then(function (l) {
        var r = linkOk(l); if (r) return r;
        // فيه حساب بنفس الرقم اتسجّل بنفسه (مش مربوط بسجلك): ادمج الأول بعد ما نسحب آخر بيانات
        return hydrateFull().catch(function () {}).then(function () { return mergePortalDuplicates(); })
          .then(function () { return withTimeout(db.collection("portalLinks").doc(uid).get()); })
          .then(function (l2) {
            var r2 = linkOk(l2); if (r2) return r2;
            if (l2.exists) throw { code: "linked-other" };
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
      if (owner !== c.id) throw { code: "linked-other" };
      if (String(idx.email || "").slice(-SYNMAIL.length) !== SYNMAIL && !confirm("العميل ده مسجّل بإيميل (" + idx.email + ").\nالأفضل يستخدم «نسيت كلمة المرور» ويوصله رابط على إيميله.\nلو كمّلت هيدخل بعد كده برقم التليفون والكلمة المؤقتة. تكمّل؟")) throw { code: "cancel" };
      return withTimeout(sa.createUserWithEmailAndPassword(em, temp));
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

  //  أول ما عميل بوابة جديد يظهر في السحابة ومش موجود محليًا، اسحب وادمج فورًا (بدون انتظار فتح التطبيق)
  var kickAt = 0, custWatch = false;
  function watchPortalCustomers() {
    if (custWatch) return; custWatch = true;
    try {
      db.collection("customers").where("portal", "==", true).onSnapshot(function (sn) {
        if (!window.K || typeof window.arr !== "function" || hydrating || Date.now() - kickAt < 60000) return;
        var have = {}; window.arr(window.K.c).forEach(function (c) { have[c.id] = 1; });
        var base = SB.c.wf_c || {};
        var missing = sn.docs.some(function (d) { return !have[d.id] && base[d.id] === undefined; });
        if (!missing) return;
        kickAt = Date.now();
        hydrateFull().then(function () { return mergePortalDuplicates(); }).catch(function () {});
      }, function () {});
    } catch (e) {}
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
    function goReady(reload) {
      ready = true; uncover(); resumeRetries(); badge();
      if (reload) { location.reload(); return; }
      pushAll(false); watchMeta(); publishPortalConfig(); setTimeout(function () { convertPortal(); projectOrders(); mergePortalDuplicates(); watchPortalCustomers(); }, 1500);
      watchInbox();
    }
    if (!online()) { // أوفلاين: لا تكشف نسخة الموظفين المحفوظة إلا لمعرّف سبق التحقق منه كموظف.
      if (hydrated && ls.getItem("wf_is_staff_uid") === user.uid) { ready = true; uncover(); resumeRetries(); badge(); return; }
      cover("اتصل بالإنترنت للتحقق من حساب الموظف قبل فتح بيانات النظام."); return;
    }
    // مسار سريع: عضوية موظف متحقق منها حديثًا لنفس الحساب + بيانات متزامنة → افتح فورًا بدون أي انتظار للشبكة
    if (hydrated && staffFresh(user.uid)) {
      goReady(false); // بيشيل الغطاء، ويشغّل الرفع ومراقبة تحديثات الأجهزة التانية (watchMeta) في الخلفية
      if (Date.now() - (+ls.getItem(STAFF_AT) || 0) > STAFF_RECHECK) {
        withTimeout(db.collection("staff").doc(user.uid).get({ source: "server" })).then(function (d) {
          if (d.exists) { origSet.call(ls, STAFF_AT, String(Date.now())); return; }
          origRemove.call(ls, STAFF); origRemove.call(ls, STAFF_AT); lockDenied(false); // العضوية اتسحبت فعلًا
        }).catch(function () { /* مفيش نت/تأخير: نكمل بالتحقق السابق لحد انتهاء مهلته */ });
      }
      return;
    }
    if (hydrated) uncover();
    cover("جارٍ التحقق من صلاحيات حساب الموظف…");
    // لا نثق بعلامة STAFF المحلية وحدها؛ لازم تأكيد المستند من الخادم (بعد أول دخول أو انتهاء مهلة التحقق).
    var staffCheck = withTimeout(db.collection("staff").doc(user.uid).get({ source: "server" })).then(function (d) {
      if (d.exists) { origSet.call(ls, STAFF, user.uid); origSet.call(ls, STAFF_AT, String(Date.now())); return { staff: true }; }
      origRemove.call(ls, STAFF); origRemove.call(ls, STAFF_AT); return { staff: false };
    }).catch(function (e) {
      origRemove.call(ls, STAFF); origRemove.call(ls, STAFF_AT);
      return { staff: false, unavailable: true, error: e };
    });
    staffCheck.then(function (result) {
      if (result.staff) return continueBoot();
      lockDenied(result.unavailable); /* لا تُفتح البيانات عند تعذر إثبات العضوية */
    });
    function continueBoot() {
    var quick = hydrated && recent;
    (quick ? withTimeout(meta.get()).then(function (d) { return d.exists && String(d.data().ts) !== ls.getItem(SEEN); }).catch(function () { return false; }) : Promise.resolve(true)).then(function (needFull) {
      if (!needFull && !Object.keys(timers).length) return goReady(false);
      return hydrateFull().then(function (r) {
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
      hydrateFull().then(function (r) { origSet.call(ls, SEEN, String(x.ts)); if (r && r.changed) { banner(); } pushAll(false); mergePortalDuplicates(); }).catch(function () {});
    }, function () {});
  }

  window.wfCloudSignOut = function () { origRemove.call(ls, HYD); origRemove.call(ls, FULL); origRemove.call(ls, "wf_is_staff_uid"); origRemove.call(ls, "wf_staff_ok_at"); sessionStorage.removeItem("wf_hyd_reload"); forgetLogin(); return firebase.auth().signOut().then(function () { location.href = "login.html"; }); };
  window.wfCloudSyncNow = function () { return hydrateFull().then(function () { return pushAll(true); }); };
  window.addEventListener("online", function () { badge(); pushAll(false); Object.keys(retryState).forEach(function (k) { if ((ALL.indexOf(k) > -1 || REMOTE_RETRY_KEYS.indexOf(k) > -1) && !retryTimers[k]) scheduleRetry(k); }); });
  window.addEventListener("offline", badge);
  window.addEventListener("pagehide", function () { Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); delete timers[k]; push(k, false); }); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") pushAll(false); });
  setInterval(function () { badge(); if (ready && online()) pushAll(false); }, 15000);
  document.addEventListener("DOMContentLoaded", badge);

  firebase.initializeApp(CFG);
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
