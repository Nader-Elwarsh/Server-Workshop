/* ربط الورشة الفنية بنفس قاعدة Firebase بتاعة الموقع الحالي، مع دعم الأوفلاين.
   - التطبيق بيشتغل على localStorage، وكل تعديل بيتعكس على نفس الكولكشنز (customers, devices, requests, ...).
   - أوفلاين: التعديلات (والصور) بتفضل معلّقة على الجهاز وبتترفع لوحدها أول ما النت يرجع، حتى لو قفلت الصفحة.
   - أي دمج بين الجهاز والسحابة بيحافظ على البيانات: بنقارن بآخر حالة اتزامنت، فمفيش سجل بيتمسح من السحابة إلا لو انت مسحته. */
(function () {
  "use strict";
  if (typeof firebase === "undefined") { console.warn("Firebase SDK غير متاح (أوفلاين قبل أول تحميل) — التطبيق شغال محليًا"); return; }
  var CFG = { apiKey: "AIzaSyAISlRIHOVKhupLS8l2hG_QwY6Wkchq9W8", authDomain: "elwarsha-elfanya.firebaseapp.com", projectId: "elwarsha-elfanya", storageBucket: "elwarsha-elfanya.firebasestorage.app", messagingSenderId: "916075814550", appId: "1:916075814550:web:90e6b0c01b58abc614ecb7" };
  var COLS = { wf_c: "customers", wf_d: "devices", wf_r: "requests", wf_p: "parts", wf_tr: "treasury", wf_tasks: "tasks", wf_wallet_tx: "walletTx", wf_fault_codes: "faultCodes", wf_inv: "invoices" };
  var EXTRA = ["wf_m", "wf_e", "wf_trash", "wf_followup_log", "wf_pending_calls", "wf_comp_custom", "wf_comp_fav"];
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
  function toDoc(rec) { var o = JSON.parse(JSON.stringify(rec)); delete o.id; ["createdAt", "updatedAt"].forEach(function (f) { if (typeof o[f] === "string" && !isNaN(Date.parse(o[f]))) o[f] = firebase.firestore.Timestamp.fromDate(new Date(o[f])); }); return o; }
  function byCreated(a, b) { return (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0); }
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
      return withTimeout(db.collection("settings").doc("global").set(toDoc(v), { merge: true })).then(function () { SB.x[k] = h(snapshotRaw); saveBase(); lastRaw[k] = snapshotRaw; publishPortalConfig(); return touchMeta(); }).then(function () { return done(true); }).catch(function () { return done(false); });
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
    cs.forEach(function (c) { if (c && c.portal === true) portal[c.id] = 1; });
    rs.forEach(function (r) {
      if (!r || !r.id || !portal[r.customerId]) return; seen[r.id] = 1;
      var d = ds.find(function (x) { return x.id === r.deviceId; }) || {};
      var p = { customerId: r.customerId, no: r.no || "", deviceId: r.deviceId || "", deviceLabel: [d.type, d.brand, d.model].filter(Boolean).join(" "), fault: r.fault || "", status: r.status || "", visit: r.visit || "", executionPlace: r.executionPlace || "", workshopStatus: r.workshopStatus || "", partsWaiting: !!r.partsWaiting, total: +r.total || 0, deposit: +r.deposit || 0, remain: +r.remain || 0, closed: !!r.closed, createdAt: r.createdAt || "" };
      var x = h(stable(p)); if (po[r.id] !== x) { next[r.id] = x; ops.push(function (bt) { bt.set(db.collection("portalOrders").doc(r.id), Object.assign({}, p, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() })); }); }
    });
    Object.keys(po).forEach(function (id) { if (!seen[id]) { delete next[id]; ops.push(function (bt) { bt.delete(db.collection("portalOrders").doc(id)); }); } });
    if (!ops.length) return Promise.resolve();
    poBusy = true;
    return commitOps(ops).then(function () { SB.po = next; saveBase(); }).catch(function (e) { console.warn("portal projection pending", e && e.message); }).then(function () { poBusy = false; });
  }
  function publishPortalConfig() { // قوائم عامة للبوابة (من غير أي بيانات حساسة)
    if (!online() || typeof window.settings !== "function") return;
    var s = window.settings(), c = { centers: s.centers || [], villages: s.villages || {}, types: s.types || {}, brands: s.brands || [], executionPlaces: s.executionPlaces || [] }, x = h(stable(c));
    if (SB.x.pc === x) return;
    db.collection("portal").doc("config").set(c).then(function () { SB.x.pc = x; saveBase(); }).catch(function () {});
  }
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

  var CURRENT_UID = null, denied = false;
  function boot(user) {
    CURRENT_UID = user.uid; db = firebase.firestore(); meta = db.collection("settings").doc("wf_meta");
    var hydrated = ls.getItem(HYD) === user.uid, recent = Date.now() - (+ls.getItem(FULL) || 0) < 5 * 60 * 1000;
    function goReady(reload) {
      ready = true; uncover(); badge();
      if (reload) { location.reload(); return; }
      pushAll(false); watchMeta(); publishPortalConfig(); setTimeout(function () { convertPortal(); projectOrders(); }, 1500);
      try { db.collection("portalRequests").where("handled", "==", false).onSnapshot(function () { convertPortal(); }, function () {}); } catch (e) {}
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
      return withTimeout(db.collection("customers").doc(user.uid).get()).then(function (c) { return !(c.exists && c.data().portal === true); }).catch(function () { return true; });
    }).catch(function () { return true; });
    staffCheck.then(function (isStaff) {
      if (isStaff) return continueBoot();
      denied = true; cover("الحساب ده مش حساب موظف. لو أنت عميل ادخل من بوابة العملاء."); var a = document.createElement("a"); a.href = "portal.html"; a.textContent = "بوابة العملاء"; a.style.cssText = "display:block;margin-top:14px;color:#9cf"; document.getElementById("wfCloudCover").appendChild(a); firebase.auth().signOut();
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
      hydrateFull().then(function (r) { origSet.call(ls, SEEN, String(x.ts)); if (r && r.changed) { banner(); } pushAll(false); }).catch(function () {});
    }, function () {});
  }

  window.wfCloudSignOut = function () { origRemove.call(ls, HYD); origRemove.call(ls, FULL); origRemove.call(ls, "wf_is_staff_uid"); sessionStorage.removeItem("wf_hyd_reload"); return firebase.auth().signOut().then(function () { location.href = "login.html"; }); };
  window.wfCloudSyncNow = function () { return hydrateFull().then(function () { return pushAll(true); }); };
  window.addEventListener("online", function () { badge(); pushAll(false); });
  window.addEventListener("offline", badge);
  window.addEventListener("pagehide", function () { Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); delete timers[k]; push(k, false); }); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") pushAll(false); });
  setInterval(function () { badge(); if (ready && online()) pushAll(false); }, 15000);
  document.addEventListener("DOMContentLoaded", badge);

  firebase.initializeApp(CFG);
  if (!isLogin && !ls.getItem(HYD)) cover("جاري تحميل بيانات الورشة…"); // أول مرة بس
  firebase.auth().onAuthStateChanged(function (u) {
    if (isLogin) { if (u) location.replace("index.html"); return; }
    if (!u) { if (denied) return; if (navigator.onLine === false && ls.getItem(HYD)) { ready = false; uncover(); return; } location.replace("login.html"); return; }
    boot(u);
  });
})();
