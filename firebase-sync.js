/* ربط الورشة الفنية بنفس قاعدة Firebase بتاعة الموقع الحالي، مع دعم الأوفلاين.
   - التطبيق بيشتغل على localStorage، وكل تعديل بيتعكس على نفس الكولكشنز (customers, devices, requests, ...).
   - أوفلاين: التعديلات (والصور) بتفضل معلّقة على الجهاز وبتترفع لوحدها أول ما النت يرجع، حتى لو قفلت الصفحة.
   - أي دمج بين الجهاز والسحابة بيحافظ على البيانات: بنقارن بآخر حالة اتزامنت، فمفيش سجل بيتمسح من السحابة إلا لو انت مسحته. */
(function () {
  "use strict";
  if (typeof firebase === "undefined") { console.warn("Firebase SDK غير متاح (أوفلاين قبل أول تحميل) — التطبيق شغال محليًا"); return; }
  var CFG = { apiKey: "AIzaSyAISlRIHOVKhupLS8l2hG_QwY6Wkchq9W8", authDomain: "elwarsha-elfanya.firebaseapp.com", projectId: "elwarsha-elfanya", storageBucket: "elwarsha-elfanya.firebasestorage.app", messagingSenderId: "916075814550", appId: "1:916075814550:web:90e6b0c01b58abc614ecb7" };
  var COLS = { wf_c: "customers", wf_d: "devices", wf_r: "requests", wf_p: "parts", wf_tr: "treasury", wf_tasks: "tasks", wf_wallet_tx: "walletTx", wf_fault_codes: "faultCodes", wf_inv: "invoices", wf_m: "partMoves" };
  var EXTRA = ["wf_e", "wf_trash", "wf_followup_log", "wf_pending_calls", "wf_comp_custom", "wf_comp_fav"];
  var SETTINGS = "wf_s", CHUNK = 250000, TIMEOUT = 25000;
  var ALL = Object.keys(COLS).concat(EXTRA, [SETTINGS]);
  var HYD = "wf_cloud_hydrated_uid", BASEKEY = "wf_syncbase", FULL = "wf_last_full_sync", SEEN = "wf_meta_seen";
  var isLogin = /login\.html$/.test(location.pathname);
  var P = Storage.prototype, ls = window.localStorage, origSet = P.setItem, origRemove = P.removeItem;
  var db = null, meta = null, ready = false, applying = false, timers = {}, lastRaw = {}, flushing = false, hydrating = false, pushing = {};
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
  function badge() {
    if (isLogin || !document.body) return;
    var el = document.getElementById("wfCloudBadge");
    if (!el) { el = document.createElement("div"); el.id = "wfCloudBadge"; el.style.cssText = "position:fixed;bottom:8px;left:8px;z-index:9998;background:rgba(0,27,77,.85);color:#fff;padding:4px 10px;border-radius:14px;font:600 12px sans-serif;direction:rtl;pointer-events:none"; document.body.appendChild(el); }
    var pending = ALL.filter(function (k) { return lastRaw[k] !== undefined && ls.getItem(k) !== lastRaw[k]; }).length;
    el.textContent = navigator.onLine === false ? "📴 أوفلاين — التعديلات هتترفع لما النت يرجع" : (pending || Object.keys(timers).length ? "⏳ جاري الرفع للسحابة" : "☁️ متزامن");
  }

  /* ---------- أدوات ---------- */
  function h(s) { var x = 5381, i = s.length; while (i) x = ((x << 5) + x + s.charCodeAt(--i)) | 0; return (x >>> 0).toString(36) + s.length.toString(36); }
  function clean(v) { if (v && typeof v.toDate === "function") return v.toDate().toISOString(); if (Array.isArray(v)) return v.map(clean); if (v && typeof v === "object") { var o = {}; Object.keys(v).forEach(function (k) { o[k] = clean(v[k]); }); return o; } return v; }
  var ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:?\d\d)?$/;
  function stable(v) { if (typeof v === "string" && ISO.test(v)) { var t = Date.parse(v); if (!isNaN(t)) return JSON.stringify("~" + t); } if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]"; if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}"; return JSON.stringify(v === undefined ? null : v); }
  function hr(r) { var o = Object.assign({}, r); delete o.id; return h(stable(o)); }
  function fromDoc(d) { var o = clean(d.data()); o.id = d.id; return o; }
  function toDoc(rec) { var o = JSON.parse(JSON.stringify(rec)); delete o.id; ["createdAt", "updatedAt", "at"].forEach(function (f) { if (typeof o[f] === "string" && !isNaN(Date.parse(o[f]))) o[f] = firebase.firestore.Timestamp.fromDate(new Date(o[f])); }); return o; }
  function byCreated(a, b) { return (Date.parse(a.createdAt || a.at) || 0) - (Date.parse(b.createdAt || b.at) || 0); }
  function local(k) { try { return JSON.parse(ls.getItem(k) || "null"); } catch (e) { return null; } }
  function raw(k, v) { applying = true; origSet.call(ls, k, v); applying = false; }
  function withTimeout(p) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, TIMEOUT); })]); }
  function online() { return navigator.onLine !== false && !!db; }

  P.setItem = function (k, v) { origSet.call(this, k, v); if (this === ls && ready && !applying && ALL.indexOf(k) > -1) queue(k); };
  P.removeItem = function (k) { origRemove.call(this, k); if (this === ls && ready && !applying && ALL.indexOf(k) > -1) queue(k); };

  /* ---------- الرفع ---------- */
  function queue(k) { clearTimeout(timers[k]); timers[k] = setTimeout(function () { delete timers[k]; push(k, true); }, 700); badge(); }
  function commitOps(ops) { var chain = Promise.resolve(); for (var i = 0; i < ops.length; i += 400) (function (part) { chain = chain.then(function () { var b = db.batch(); part.forEach(function (f) { f(b); }); return withTimeout(b.commit()); }); })(ops.slice(i, i + 400)); return chain; }
  function touchMeta() { var ts = Date.now(); origSet.call(ls, SEEN, String(ts)); return meta.set({ ts: ts, dev: DEV }).catch(function () {}); }

  function push(k, interactive) {
    if (!online() || pushing[k]) return Promise.resolve(false);
    pushing[k] = true;
    var done = function (ok) { pushing[k] = false; badge(); return ok; };
    var snapshotRaw = ls.getItem(k), ops = [], v = local(k), next;
    if (COLS[k]) {
      var col = db.collection(COLS[k]), B = SB.c[k] || {}, arr = Array.isArray(v) ? v : [], seen = {}, dels = 0;
      next = {};
      arr.forEach(function (r) { if (!r || !r.id) return; seen[r.id] = 1; var x = hr(r); next[r.id] = x; if (B[r.id] !== x) ops.push(function (bt) { bt.set(col.doc(r.id), toDoc(r)); }); });
      Object.keys(B).forEach(function (id) { if (!seen[id]) { dels++; ops.push(function (bt) { bt.delete(col.doc(id)); }); } });
      var total = Object.keys(B).length;
      if (dels > 20 && dels > total / 2) { // حماية من المسح الجماعي
        if (!interactive) return Promise.resolve(done(false)); // هنسأل لما تضغط «مزامنة الآن»
        if (!window.confirm("⚠️ هيتم حذف " + dels + " سجل من السحابة نهائيًا. متأكد؟\n(إلغاء = استرجاعهم من السحابة)")) { SB.c[k] = {}; saveBase(); pushing[k] = false; hydrateFull(true).then(function () { location.reload(); }); return Promise.resolve(false); }
      }
      if (!ops.length) { SB.c[k] = next; saveBase(); lastRaw[k] = snapshotRaw; return Promise.resolve(done(true)); }
      return commitOps(ops).then(function () { SB.c[k] = next; saveBase(); lastRaw[k] = snapshotRaw; return touchMeta(); }).then(function () { if (k === "wf_r" || k === "wf_c" || k === "wf_d") projectOrders(); return done(true); }).catch(function (e) { console.warn("sync pending", k, e && e.message); return done(false); });
    }
    if (k === SETTINGS) {
      if (!v) return Promise.resolve(done(true));
      if (SB.x[k] === h(snapshotRaw)) { lastRaw[k] = snapshotRaw; return Promise.resolve(done(true)); }
      return withTimeout(db.collection("settings").doc("global").set(toDoc(v), { merge: true })).then(function () { SB.x[k] = h(snapshotRaw); saveBase(); lastRaw[k] = snapshotRaw; publishPortalConfig(); projectOrders(); return touchMeta(); }).then(function () { return done(true); }).catch(function () { return done(false); });
    }
    var hh0 = snapshotRaw === null ? null : h(snapshotRaw);
    if (SB.x[k] === hh0) { lastRaw[k] = snapshotRaw; return Promise.resolve(done(true)); }
    var id = "wfkv_" + k, old = SB.x["n_" + k] || 0, parts = [], n;
    if (snapshotRaw !== null) for (var i = 0; i < snapshotRaw.length; i += CHUNK) parts.push(snapshotRaw.slice(i, i + CHUNK));
    n = parts.length;
    ops.push(function (bt) { n ? bt.set(db.collection("settings").doc(id), { n: n, dev: DEV, ts: Date.now() }) : bt.delete(db.collection("settings").doc(id)); });
    parts.forEach(function (p, i) { ops.push(function (bt) { bt.set(db.collection("settings").doc(id + "~" + i), { v: p }); }); });
    for (var j = n; j < old; j++) (function (j) { ops.push(function (bt) { bt.delete(db.collection("settings").doc(id + "~" + j)); }); })(j);
    return commitOps(ops).then(function () { SB.x[k] = snapshotRaw === null ? null : h(snapshotRaw); SB.x["n_" + k] = n; saveBase(); lastRaw[k] = snapshotRaw; return touchMeta(); }).then(function () { return done(true); }).catch(function () { return done(false); });
  }
  function pushAll(interactive) { if (!ready || !online()) return Promise.resolve(); return Promise.all(ALL.filter(function (k) { return ls.getItem(k) !== lastRaw[k]; }).map(function (k) { return push(k, interactive); })).then(flushImages); }

  /* ---------- رفع الصور/الصوت المعلّقة (اتعملت أوفلاين) ---------- */
  function flushImages() {
    if (!online() || flushing || !window.ImageStore || !window.ImageStore.keys) return Promise.resolve();
    flushing = true;
    return window.ImageStore.keys().then(async function (keys) {
      if (!keys.length) return;
      var targets = Object.keys(COLS).concat(EXTRA), map = {}, raws = {}, changed = {};
      targets.forEach(function (t) { raws[t] = ls.getItem(t) || ""; });
      for (var ki = 0; ki < keys.length; ki++) {
        var ref = String(keys[ki]), needle = '"' + ref + '"';
        var holders = targets.filter(function (t) { return raws[t].indexOf(needle) > -1; });
        if (!holders.length) continue;
        var data = await window.ImageStore.get(ref); if (!data) continue;
        var url = await window.ImageStore.uploadRemote(data); if (!url) continue;
        map[ref] = url;
        holders.forEach(function (t) { raws[t] = raws[t].split(needle).join('"' + url + '"'); changed[t] = 1; });
      }
      Object.keys(changed).forEach(function (t) { ls.setItem(t, raws[t]); });
      Object.keys(map).forEach(function (ref) { if (!targets.some(function (t) { return raws[t].indexOf('"' + ref + '"') > -1; })) window.ImageStore.delete(ref); });
    }).catch(function (e) { console.warn("image flush", e); }).then(function () { flushing = false; });
  }

  /* ---------- السحب والدمج ---------- */
  function extrasFrom(snap) { var mt = {}, ch = {}, out = {}; snap.forEach(function (d) { if (d.id.indexOf("wfkv_") !== 0) return; var i = d.id.indexOf("~"); if (i < 0) mt[d.id.slice(5)] = d.data(); else { var k = d.id.slice(5, i); (ch[k] = ch[k] || [])[+d.id.slice(i + 1)] = d.data().v; } }); Object.keys(mt).forEach(function (k) { var c = ch[k] || [], ok = true; for (var i = 0; i < mt[k].n; i++) if (c[i] == null) ok = false; if (ok) out[k] = { v: c.slice(0, mt[k].n).join(""), n: mt[k].n }; }); return out; }


  /* ---------- بوابة العملاء (جهة الموظف) ---------- */
  function sanitize(o) { if (typeof o === "string") return o.replace(/[<>]/g, ""); if (Array.isArray(o)) return o.map(sanitize); if (o && typeof o === "object") { var r = {}; Object.keys(o).forEach(function (k) { r[k] = sanitize(o[k]); }); return r; } return o; }
  function cleanPortal(r) { return r && r.portal === true ? sanitize(r) : r; }
  var poBusy = false;
  function projectOrders() { // نسخة آمنة من أوامر عملاء البوابة (من غير تكلفة القطع) عشان العميل يتابع حالته
    if (!online() || poBusy) return Promise.resolve();
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
    if (!ops.length) return Promise.resolve();
    poBusy = true;
    return commitOps(ops).then(function () { SB.po = next; saveBase(); }).catch(function (e) { console.warn("portal projection pending", e && e.message); }).then(function () { poBusy = false; });
  }
  function publishPortalConfig() { // قوائم عامة للبوابة (من غير أي بيانات حساسة)
    if (!online() || typeof window.settings !== "function") return;
    var s = window.settings(), c = { centers: s.centers || [], villages: s.villages || {}, types: s.types || {}, brands: s.brands || [], executionPlaces: s.executionPlaces || [] };
    // شريط الإعلانات: بيتنشر مع نفس المستند. لو الجهاز ده ماعندوش إعداد شريط (نسخة قديمة) مانبعتش الحقل خالص،
    // ومع mergeFields أدناه ده معناه إن الشريط المنشور من جهاز تاني مايتمسحش.
    if (s.portalTicker && typeof s.portalTicker === "object") c.ticker = window.PortalTicker ? (window.PortalTicker.sanitize(s.portalTicker) || s.portalTicker) : s.portalTicker;
    var x = h(stable(c));
    publishTicker(c.ticker); // لها بصمة مستقلة: تتنشر حتى لو بقية إعدادات البوابة ماتغيّرتش
    if (SB.x.pc === x) return;
    // mergeFields: نستبدل الحقول اللي بنبعتها بالكامل (زي set القديمة بالظبط) من غير ما نلمس أي حقل تاني في المستند.
    db.collection("portal").doc("config").set(c, { mergeFields: Object.keys(c) }).then(function () { SB.x.pc = x; saveBase(); }).catch(function () {});
  }
  // الشريط الإعلاني لازم يظهر للزوار قبل تسجيل الدخول كمان: portal/config ممكن يكون مقفول على المسجّلين،
  // فبننشره كمان في portalPosts (نفس المكان اللي الزوار بيقروا منه المقالات أصلًا) بمعرّف ثابت وبيتفلتر بره قايمة المقالات.
  function publishTicker(t) {
    if (!t) return;
    var x = h(stable(t));
    if (SB.x.pt === x) return;
    db.collection("portalPosts").doc("wf-ticker").set({ title: "شريط إعلانات", category: "ticker", body: "", image: "", pinned: false, published: true, ticker: t, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
      .then(function () { SB.x.pt = x; saveBase(); }).catch(function (e) { console.warn("ticker publish pending", e && e.message); });
  }
  var inboxN = { a: 0, b: 0, c: 0, q: 0 };
  window.wfPortalInbox = inboxN;
  function pill() { // مفيش شريط عايم: العدّاد بيظهر جوه كارت "بوابة العملاء" في الرئيسية بس
    var t = inboxN.a + inboxN.b + inboxN.c + inboxN.q, old = document.getElementById("wfPortalPill");
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
      var n = 0, marks = [];
      snap.docs.forEach(function (d) {
        var p = sanitize(clean(d.data())), id = d.id, ds = window.arr(window.K.d), cs = window.arr(window.K.c);
        var dev = ds.find(function (x) { return x.id === p.deviceId; }), cust = cs.find(function (x) { return x.id === p.customerId; });
        if (!dev || !cust) return; // لسه مانزلش على الجهاز: هنحاول تاني
        if (dev.customerId !== p.customerId) { marks.push(d.ref.update({ handled: true, rejected: true })); return; }
        var exists = window.arr(window.K.r).find(function (x) { return x.id === id; });
        if (!exists) {
          var s = window.settings();
          var r = { id: id, no: window.orderNo(), customerId: p.customerId, deviceId: p.deviceId, addressKey: "main", visit: p.visit || "", status: "جديد", executionPlace: p.executionPlace || (s.executionPlaces || [])[0] || "عند العميل", workshopStatus: (s.workshopStatuses || [])[0] || "غير مطلوب", partsWaiting: false, tag: "", fault: p.fault || "", work: "", labor: 0, parts: [], partsTotal: 0, partsCost: 0, total: 0, deposit: 0, remain: 0, closed: false, source: "portal", customerNote: p.note || "", createdAt: new Date().toISOString() };
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
    }).then(function (r) { hydrating = false; return r; }, function (e) { hydrating = false; throw e; });
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
  var INV_DEF = "أهلاً {الاسم} 👋\nتقدر تتابع أجهزتك وأوامر الصيانة وتسأل الورشة من بوابة الورشة الفنية:\n{الرابط}\n\nالدخول برقم تليفونك: {الرقم}\n{كلمة_المرور}";
  function portalPhone(x) { var d = nph(x); return /^01[0125]\d{8}$/.test(d) ? d : ""; }
  function secApp() { if (!SEC) SEC = firebase.apps.filter(function (a) { return a.name === "sec"; })[0] || firebase.initializeApp(firebase.app().options, "sec"); return SEC; }
  function inviteText(c, p, mustChange) {
    var tpl = ls.getItem(INV_KEY) || INV_DEF;
    var link = new URL("portal.html", location.href).href + "?p=" + p;
    var pw = mustChange === false ? "" : "كلمة المرور المبدئية: نفس رقم تليفونك (هتطلب منك تغييرها أول دخول).";
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
    var em = p + "@phone.elwarsha.app", sa = secApp().auth();
    return sa.createUserWithEmailAndPassword(em, p).then(function (cr) {
      var uid = cr.user.uid;
      return secApp().firestore().collection("phoneIndex").doc(p).set({ email: em, uid: uid })
        .then(function () { return db.collection("portalLinks").doc(uid).set({ customerId: c.id, phone: p, mustChange: true, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); })
        .then(function () { return sa.signOut(); }).then(function () { return uid; });
    }).catch(function (e) { try { sa.signOut(); } catch (x) {} throw e; });
  }
  function resolveInvite(c, p) {
    return withTimeout(db.collection("phoneIndex").doc(p).get()).then(function (d) {
      if (!d.exists) return createPortalAccount(c, p).then(function (uid) { return { uid: uid, mustChange: true, created: true }; });
      var uid = d.data().uid;
      var linkOk = function (l) { return l.exists && l.data().customerId === c.id ? { uid: uid, mustChange: l.data().mustChange !== false, created: false } : null; };
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
      var msg = inviteText(c, p, r.mustChange), wa = "https://wa.me/2" + p + "?text=" + encodeURIComponent(msg);
      var m = invModal('<b style="font-size:17px">' + (r.created ? "✅ تم تفعيل حساب البوابة" : "✅ الحساب متفعّل") + '</b><div style="margin:6px 0;color:#444">' + (r.mustChange ? "العميل هيدخل برقمه وهيغيّر كلمة المرور أول مرة." : "العميل دخل قبل كده وعنده كلمة مرور.") + '</div><textarea id="wfInvText" readonly rows="8" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #bbb;border-radius:8px;font:14px/1.5 sans-serif"></textarea><div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><a id="wfInvWa" target="_blank" rel="noopener" style="flex:1;text-align:center;background:#25d366;color:#fff;padding:10px;border-radius:10px;text-decoration:none;font-weight:700">📲 افتح واتساب</a><button id="wfInvCopy" type="button" style="flex:1;padding:10px;border-radius:10px;border:1px solid #999;background:#f3f3f3;color:#111">📋 نسخ الرسالة</button><button id="wfInvClose" type="button" style="padding:10px;border-radius:10px;border:1px solid #999;background:#fff;color:#111">إغلاق</button></div>');
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
  function tempPassword() { var a = new Uint32Array(1); (window.crypto || window.msCrypto).getRandomValues(a); return String(10000000 + (a[0] % 90000000)); }
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
      return withTimeout(db.collection("portalLinks").doc(newUid).set({ customerId: c.id, phone: p, mustChange: true, resetAt: SV, createdAt: SV }));
    }).then(function () {
      return withTimeout(db.collection("portalLinks").doc(oldUid).set({ customerId: "_reset", phone: p, disabled: true, replacedBy: newUid, resetAt: SV })).catch(function () {});
    }).then(function () {
      try { sa.signOut(); } catch (e) {}
      var all = window.arr(window.K.c), cc = all.find(function (x) { return x.id === cid; });
      if (cc) { cc.portal = true; cc.portalUid = newUid; saveLocal(window.K.c, all); }
      if (typeof window.auditLog === "function") try { window.auditLog("إعادة تعيين كلمة سر بوابة", "عميل", cid, c.name || ""); } catch (e) {}
      var link = new URL("portal.html", location.href).href + "?p=" + p;
      var msg = "أهلاً " + (c.name || "") + " 👋\nتم إعادة تعيين كلمة مرورك في بوابة الورشة الفنية.\n" + link + "\nالدخول برقم تليفونك: " + p + "\nكلمة المرور المؤقتة: " + temp + "\n(هتطلب منك تغييرها أول دخول)";
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
  function boot(user) {
    CURRENT_UID = user.uid; db = firebase.firestore(); meta = db.collection("settings").doc("wf_meta");
    var hydrated = ls.getItem(HYD) === user.uid, recent = Date.now() - (+ls.getItem(FULL) || 0) < 5 * 60 * 1000;
    function goReady(reload) {
      ready = true; uncover(); badge();
      if (reload) { location.reload(); return; }
      pushAll(false); watchMeta(); publishPortalConfig(); setTimeout(function () { convertPortal(); projectOrders(); mergePortalDuplicates(); watchPortalCustomers(); }, 1500);
      watchInbox();
    }
    if (!online()) { // أوفلاين: اشتغل على النسخة المحلية
      if (hydrated) { ready = true; uncover(); badge(); return; }
      cover("لازم تفتح الموقع أونلاين أول مرة على الجهاز ده"); return;
    }
    if (hydrated) uncover();
    var STAFF = "wf_is_staff_uid";
    var staffCheck = ls.getItem(STAFF) === user.uid ? Promise.resolve(true) : withTimeout(db.collection("staff").doc(user.uid).get()).then(function (d) {
      if (d.exists) { origSet.call(ls, STAFF, user.uid); return true; }
      // مفيش مستند موظف: نرفض بس لو الحساب ده عميل بوابة (وإلا نعتبره موظف قديم لحد ما القواعد الجديدة تتنشر)
      return withTimeout(db.collection("customers").doc(user.uid).get()).then(function (c) { if (c.exists && c.data().portal === true) return false; return withTimeout(db.collection("portalLinks").doc(user.uid).get()).then(function (l) { return !l.exists; }); }).catch(function () { return true; });
    }).catch(function () { return true; });
    staffCheck.then(function (isStaff) {
      if (isStaff) return continueBoot();
      denied = true; cover("الحساب ده مش حساب موظف. لو أنت عميل ادخل من بوابة العملاء."); var a = document.createElement("a"); a.href = "portal.html"; a.textContent = "بوابة العملاء"; a.style.cssText = "display:block;margin-top:14px;color:#9cf"; var cv = document.getElementById("wfCloudCover"); cv.appendChild(a); var so = document.createElement("button"); so.type = "button"; so.textContent = "تسجيل الخروج والدخول بحساب موظف"; so.style.cssText = "display:block;margin:14px auto 0;padding:10px 16px;border-radius:10px;border:1px solid #9cf;background:transparent;color:#fff;font:600 15px sans-serif"; so.onclick = function () { window.wfCloudSignOut(); }; cv.appendChild(so); /* مافيش خروج تلقائي: الجلسة بتنتهي بس لما المستخدم يختار */
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

  window.wfCloudSignOut = function () { origRemove.call(ls, HYD); origRemove.call(ls, FULL); origRemove.call(ls, "wf_is_staff_uid"); sessionStorage.removeItem("wf_hyd_reload"); forgetLogin(); return firebase.auth().signOut().then(function () { location.href = "login.html"; }); };
  window.wfCloudSyncNow = function () { return hydrateFull().then(function () { return pushAll(true); }); };
  window.addEventListener("online", function () { badge(); pushAll(false); });
  window.addEventListener("offline", badge);
  window.addEventListener("pagehide", function () { Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); delete timers[k]; push(k, false); }); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") pushAll(false); });
  setInterval(function () { badge(); if (ready && online()) pushAll(false); }, 15000);
  document.addEventListener("DOMContentLoaded", badge);

  firebase.initializeApp(CFG);
  try { firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {}); } catch (e) {}
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {} // اطلب تخزين دائم عشان المتصفح مايمسحش الجلسة
  if (!isLogin && !ls.getItem(HYD)) cover("جاري تحميل بيانات الورشة…"); // أول مرة بس
  firebase.auth().onAuthStateChanged(function (u) {
    if (isLogin) { if (u) location.replace("index.html"); return; }
    if (!u) { if (denied) return; if (navigator.onLine === false && ls.getItem(HYD)) { ready = false; uncover(); return; }
      // الجلسة اتمسحت من المتصفح بدون ما المستخدم يعمل خروج؟ جرّب الدخول الصامت من مدير كلمات المرور قبل ما نروح لصفحة الدخول
      loadScript("wf-session.js").then(function () { return window.WfSession ? WfSession.silent(firebase.auth()) : null; }).then(function (r) { if (!r) location.replace("login.html"); }); return; }
    boot(u);
  });
})();
