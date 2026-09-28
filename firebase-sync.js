/* ربط الورشة الفنية (النسخة الكاملة) بنفس قاعدة Firebase بتاعة الموقع الحالي.
   التطبيق بيشتغل على localStorage زي الأصل، وهنا بنعكسه على نفس الكولكشنز
   (customers, devices, requests, parts, treasury, tasks, walletTx, faultCodes, invoices, settings/global)
   فبياناتك القديمة تظهر، وأي حاجة تتسجل هنا تظهر في الموقع القديم والعكس. */
(function () {
  "use strict";
  var CFG = { apiKey: "AIzaSyAISlRIHOVKhupLS8l2hG_QwY6Wkchq9W8", authDomain: "elwarsha-elfanya.firebaseapp.com", projectId: "elwarsha-elfanya", storageBucket: "elwarsha-elfanya.firebasestorage.app", messagingSenderId: "916075814550", appId: "1:916075814550:web:90e6b0c01b58abc614ecb7" };
  var COLS = { wf_c: "customers", wf_d: "devices", wf_r: "requests", wf_p: "parts", wf_tr: "treasury", wf_tasks: "tasks", wf_wallet_tx: "walletTx", wf_fault_codes: "faultCodes", wf_inv: "invoices" };
  var EXTRA = ["wf_m", "wf_e", "wf_trash", "wf_followup_log", "wf_pending_calls", "wf_comp_custom", "wf_comp_fav"]; // مفيش لها كولكشن في الموقع القديم → بتتخزن جوه settings
  var SETTINGS = "wf_s", CHUNK = 250000, HYD = "wf_cloud_hydrated_uid";
  var ALL = Object.keys(COLS).concat(EXTRA, [SETTINGS]);
  var isLogin = /login\.html$/.test(location.pathname);
  var P = Storage.prototype, ls = window.localStorage, origSet = P.setItem, origRemove = P.removeItem;
  var db, ready = false, applying = false, timers = {}, base = {}, DEV = ls.getItem("wf_device_id") || (function () { var x = Math.random().toString(36).slice(2); origSet.call(ls, "wf_device_id", x); return x; })();

  function cover(msg) { if (document.getElementById("wfCloudCover")) return; var d = document.createElement("div"); d.id = "wfCloudCover"; d.style.cssText = "position:fixed;inset:0;z-index:99999;background:#001b4d;color:#fff;display:flex;align-items:center;justify-content:center;font:600 18px sans-serif;direction:rtl;text-align:center;padding:20px"; d.textContent = msg; (document.body || document.documentElement).appendChild(d); }
  function uncover() { var c = document.getElementById("wfCloudCover"); if (c) c.remove(); }
  function banner() { if (document.getElementById("wfCloudBanner")) return; var b = document.createElement("div"); b.id = "wfCloudBanner"; b.style.cssText = "position:fixed;bottom:70px;left:12px;right:12px;z-index:9999;background:#0b57d0;color:#fff;padding:12px;border-radius:10px;text-align:center;direction:rtl;font:600 15px sans-serif;cursor:pointer"; b.textContent = "🔄 فيه تحديث من جهاز تاني — اضغط لإعادة التحميل"; b.onclick = function () { location.reload(); }; (document.body || document.documentElement).appendChild(b); }

  // لازم نعدّل Storage.prototype (تعديل localStorage.setItem مباشرة مش بيشتغل)
  P.setItem = function (k, v) { origSet.call(this, k, v); if (this === ls && ready && !applying && ALL.indexOf(k) > -1) queue(k); };
  P.removeItem = function (k) { origRemove.call(this, k); if (this === ls && ready && !applying && ALL.indexOf(k) > -1) queue(k); };
  function raw(k, v) { applying = true; origSet.call(ls, k, v); applying = false; }

  function clean(v) { if (v && typeof v.toDate === "function") return v.toDate().toISOString(); if (Array.isArray(v)) return v.map(clean); if (v && typeof v === "object") { var o = {}; Object.keys(v).forEach(function (k) { o[k] = clean(v[k]); }); return o; } return v; }
  function stable(v) { if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]"; if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}"; return JSON.stringify(v === undefined ? null : v); }
  function fromDoc(d) { var o = clean(d.data()); o.id = d.id; return o; }
  function toDoc(rec) { var o = JSON.parse(JSON.stringify(rec)); delete o.id; ["createdAt", "updatedAt"].forEach(function (f) { if (typeof o[f] === "string" && !isNaN(Date.parse(o[f]))) o[f] = firebase.firestore.Timestamp.fromDate(new Date(o[f])); }); return o; }
  function byCreated(a, b) { return (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0); }
  function local(k) { try { return JSON.parse(ls.getItem(k) || "null"); } catch (e) { return null; } }

  function queue(k) { clearTimeout(timers[k]); timers[k] = setTimeout(function () { delete timers[k]; push(k); }, 700); }
  function commitOps(ops) { var chain = Promise.resolve(); for (var i = 0; i < ops.length; i += 400) (function (part) { chain = chain.then(function () { var b = db.batch(); part.forEach(function (f) { f(b); }); return b.commit(); }); })(ops.slice(i, i + 400)); return chain; }

  function push(k) {
    if (!db) return Promise.resolve();
    var ops = [], v = local(k);
    if (COLS[k]) {
      var col = db.collection(COLS[k]), arr = Array.isArray(v) ? v : [], seen = {}, b = base[k] = base[k] || {}, next = {};
      arr.forEach(function (r) { if (!r || !r.id) return; seen[r.id] = 1; var s = stable(clean(toDoc(r))); next[r.id] = s; if (b[r.id] !== s) ops.push(function (bt) { bt.set(col.doc(r.id), toDoc(r)); }); });
      Object.keys(b).forEach(function (id) { if (!seen[id]) ops.push(function (bt) { bt.delete(col.doc(id)); }); });
      return commitOps(ops).then(function () { base[k] = next; }).catch(function (e) { console.error("sync failed", k, e); });
    }
    if (k === SETTINGS) { if (!v) return Promise.resolve(); return db.collection("settings").doc("global").set(toDoc(v), { merge: true }).catch(function (e) { console.error(e); }); }
    var raw_ = ls.getItem(k), id = "wfkv_" + k, old = base[k] || 0, parts = [], n;
    if (raw_ !== null) for (var i = 0; i < raw_.length; i += CHUNK) parts.push(raw_.slice(i, i + CHUNK));
    n = parts.length;
    ops.push(function (bt) { n ? bt.set(db.collection("settings").doc(id), { n: n, dev: DEV, ts: Date.now() }) : bt.delete(db.collection("settings").doc(id)); });
    parts.forEach(function (p, i) { ops.push(function (bt) { bt.set(db.collection("settings").doc(id + "~" + i), { v: p }); }); });
    for (var j = n; j < old; j++) (function (j) { ops.push(function (bt) { bt.delete(db.collection("settings").doc(id + "~" + j)); }); })(j);
    return commitOps(ops).then(function () { base[k] = n; }).catch(function (e) { console.error(e); });
  }

  function extrasFrom(snap) { var meta = {}, ch = {}, out = {}; snap.forEach(function (d) { var i = d.id.indexOf("~"); if (d.id.indexOf("wfkv_") !== 0) return; if (i < 0) meta[d.id.slice(5)] = d.data(); else { var k = d.id.slice(5, i); (ch[k] = ch[k] || [])[+d.id.slice(i + 1)] = d.data().v; } }); Object.keys(meta).forEach(function (k) { var c = ch[k] || [], ok = true; for (var i = 0; i < meta[k].n; i++) if (c[i] == null) ok = false; if (ok) out[k] = { v: c.slice(0, meta[k].n).join(""), n: meta[k].n, dev: meta[k].dev }; }); return out; }

  function hydrate(user) {
    var keys = Object.keys(COLS);
    if (sessionStorage.getItem("wf_hyd_once") && ls.getItem(HYD) === user.uid) { // اتسحبت البيانات في الجلسة دي: كمّل من المحلي وبس
      keys.forEach(function (k) { base[k] = {}; (local(k) || []).forEach(function (r) { if (r && r.id) base[k][r.id] = stable(clean(toDoc(r))); }); });
      EXTRA.forEach(function (k) { var v = ls.getItem(k); base[k] = v ? Math.ceil(v.length / CHUNK) : 0; });
      ready = true; listen(); return Promise.resolve();
    }
    return Promise.all(keys.map(function (k) { return db.collection(COLS[k]).get(); }).concat([db.collection("settings").get()])).then(function (res) {
      var settingsSnap = res[keys.length], any = false, data = {};
      keys.forEach(function (k, i) { var arr = res[i].docs.map(fromDoc).sort(byCreated); if (arr.length) any = true; data[k] = arr; base[k] = {}; arr.forEach(function (r) { base[k][r.id] = stable(clean(toDoc(r))); }); });
      var ex = extrasFrom(settingsSnap), g = null; settingsSnap.forEach(function (d) { if (d.id === "global") g = clean(d.data()); });
      Object.keys(ex).forEach(function (k) { base[k] = ex[k].n; });
      if (!any && !g && !Object.keys(ex).length && ls.getItem(HYD) !== user.uid) { // السحابة فاضية تمامًا: ارفع اللي على الجهاز
        ready = true; return Promise.all(ALL.filter(function (k) { return ls.getItem(k) !== null; }).map(push)).then(function () { raw(HYD, user.uid); sessionStorage.setItem("wf_hyd_once", "1"); listen(); });
      }
      keys.forEach(function (k) { raw(k, JSON.stringify(data[k])); });
      if (g) { var cur = local(SETTINGS) || {}; raw(SETTINGS, JSON.stringify(Object.assign(cur, g))); }
      Object.keys(ex).forEach(function (k) { raw(k, ex[k].v); });
      raw(HYD, user.uid);
      if (!sessionStorage.getItem("wf_hyd_once")) { sessionStorage.setItem("wf_hyd_once", "1"); location.reload(); return; }
      ready = true; listen();
    });
  }

  function listen() {
    Object.keys(COLS).forEach(function (k) {
      db.collection(COLS[k]).onSnapshot(function (snap) {
        if (snap.metadata.hasPendingWrites || timers[k]) return;
        var arr = snap.docs.map(fromDoc).sort(byCreated), cur = local(k) || [];
        var nb = {}; arr.forEach(function (r) { nb[r.id] = stable(clean(toDoc(r))); });
        if (stable(arr.map(function (r) { return r.id + nb[r.id]; })) === stable(cur.map(function (r) { return r.id + stable(clean(toDoc(r))); }))) { base[k] = nb; return; }
        base[k] = nb; raw(k, JSON.stringify(arr)); banner();
      });
    });
  }

  window.wfCloudSignOut = function () { origRemove.call(ls, HYD); sessionStorage.removeItem("wf_hyd_once"); return firebase.auth().signOut().then(function () { location.href = "login.html"; }); };
  window.addEventListener("pagehide", function () { Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); push(k); }); });

  firebase.initializeApp(CFG); db = firebase.firestore();
  try { db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {}
  if (!isLogin) cover("جاري تحميل بيانات الورشة…");
  firebase.auth().onAuthStateChanged(function (u) {
    if (isLogin) { if (u) location.replace("index.html"); return; }
    if (!u) { location.replace("login.html"); return; }
    hydrate(u).then(uncover).catch(function (e) { console.error(e); cover("تعذّر الاتصال بقاعدة البيانات — راجع الإنترنت وصلاحيات Firestore ثم أعد التحميل"); });
  });
})();
