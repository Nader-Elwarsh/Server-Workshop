/* error-log.js — تسجيل أخطاء التطبيق عند الموظفين وعرضها في الإعدادات (🐞 أخطاء التطبيق).
   - بيلتقط أخطاء الجافاسكريبت والوعود المرفوضة من غير ما يغيّر أي سلوك.
   - مفيش بيانات عملاء: الرسائل بتتنضّف (أرقام طويلة وإيميلات بتتخفي) وبتتقص.
   - نفس الخطأ يتسجّل مرة في اليوم بعدّاد، وحد أقصى للأخطاء في الجلسة، وكله داخل try/catch.
   - بيتبعت لمجموعة clientErrors (للموظفين بس) وبيتمسح بعد 30 يوم (TTL على expireAt). */
(function (w) {
  "use strict";
  var QKEY = "wf_err_queue", MAX_QUEUE = 30, MAX_PER_SESSION = 25, FLUSH_MS = 20000, KEEP_DAYS = 30;
  var NOISE = /ResizeObserver loop|^Script error\.?$|Non-Error promise rejection captured|The operation was aborted|Load failed$|NetworkError when attempting to fetch/i;
  var queue = [], timer = null, flushing = false, sessionCount = 0;

  function mask(v, max) {
    return String(v == null ? "" : v).replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]").replace(/\d{6,}/g, "#").replace(/\s+/g, " ").trim().slice(0, max);
  }
  function pageName() { try { return (w.location.pathname.split("/").pop() || "index.html").slice(0, 60); } catch (_) { return ""; } }
  function hash(str) { var h = 5381, i = str.length; while (i) h = (h * 33) ^ str.charCodeAt(--i); return (h >>> 0).toString(36); }
  function dayKey(t) { var d = new Date(t); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  function topFrame(stack) { var m = String(stack || "").match(/([\w.-]+\.(?:js|html)):(\d+)/); return m ? m[1] + ":" + m[2] : ""; }
  function load() { try { var r = w.sessionStorage.getItem(QKEY); if (r) { var a = JSON.parse(r); if (Array.isArray(a)) queue = a.slice(0, MAX_QUEUE); } } catch (_) {} }
  function save() { try { w.sessionStorage.setItem(QKEY, JSON.stringify(queue)); } catch (_) {} }

  function capture(kind, message, stack, source) {
    try {
      if (sessionCount >= MAX_PER_SESSION) return;
      var msg = mask(message, 300);
      if (!msg || NOISE.test(msg)) return;
      if (/extension:\/\//i.test(String(source || "") + " " + String(stack || ""))) return;
      var st = mask(stack, 900), pg = pageName(), fp = hash(kind + "|" + msg + "|" + pg + "|" + topFrame(stack));
      for (var i = 0; i < queue.length; i++) if (queue[i].fp === fp) { queue[i].n++; queue[i].at = Date.now(); save(); schedule(); return; }
      sessionCount++;
      queue.push({ fp: fp, kind: kind, msg: msg, stack: st, page: pg, n: 1, at: Date.now() });
      if (queue.length > MAX_QUEUE) queue.shift();
      save(); schedule();
    } catch (_) {}
  }

  function staffUser() {
    try {
      var f = w.firebase;
      if (!f || !f.apps || !f.apps.length || !f.auth || !f.firestore) return null;
      var u = f.auth().currentUser, flag = w.WFStorage && w.WFStorage.getItem && w.WFStorage.getItem("wf_is_staff_uid");
      return u && flag && flag === u.uid ? u : null;
    } catch (_) { return null; }
  }
  function schedule() { if (timer) return; timer = setTimeout(function () { timer = null; flush(); }, FLUSH_MS); }

  function flush() {
    try {
      if (flushing || !queue.length) return Promise.resolve(0);
      if (w.navigator && w.navigator.onLine === false) { schedule(); return Promise.resolve(0); }
      var user = staffUser(); if (!user) { schedule(); return Promise.resolve(0); }
      flushing = true;
      var items = queue.slice(0, 10), db = w.firebase.firestore(), FV = w.firebase.firestore.FieldValue, now = Date.now(), batch = db.batch();
      items.forEach(function (e) {
        batch.set(db.collection("clientErrors").doc(e.fp + "_" + dayKey(e.at)), {
          fp: e.fp, kind: e.kind, msg: e.msg, stack: e.stack, page: e.page, count: FV.increment(e.n), at: e.at, uid: user.uid,
          ua: mask(w.navigator && w.navigator.userAgent, 160), expireAt: new Date(now + KEEP_DAYS * 86400000)
        }, { merge: true });
      });
      return batch.commit().then(function () {
        queue = queue.filter(function (q) { return items.indexOf(q) < 0; }); save(); flushing = false;
        if (queue.length) schedule();
        return items.length;
      }, function () { flushing = false; schedule(); return 0; });
    } catch (_) { flushing = false; return Promise.resolve(0); }
  }

  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  window.wfRenderClientErrors = function () {
    var box = w.document && w.document.getElementById("clientErrorsResult"); if (!box) return Promise.resolve();
    if (!staffUser()) { box.textContent = "سجّل دخول بحساب موظف الأول."; return Promise.resolve(); }
    box.textContent = "جاري التحميل…";
    return w.firebase.firestore().collection("clientErrors").orderBy("at", "desc").limit(50).get().then(function (snap) {
      if (snap.empty) { box.innerHTML = '<div class="item">مفيش أخطاء مسجّلة 🎉</div>'; return; }
      box.innerHTML = snap.docs.map(function (d) {
        var x = d.data(), when = x.at ? new Date(x.at).toLocaleString("ar-EG") : "";
        return '<div class="item"><div class="kv"><b>' + esc(x.msg) + '</b><small>× ' + esc(x.count || 1) + '</small></div><div class="hint">📄 ' + esc(x.page) + " · " + esc(x.kind) + " · " + esc(when) + "</div>" +
          (x.stack ? '<details><summary>التفاصيل</summary><pre style="white-space:pre-wrap;direction:ltr;text-align:left;font-size:12px">' + esc(x.stack) + "\n" + esc(x.ua) + "</pre></details>" : "") + "</div>";
      }).join("");
    }, function () { box.textContent = "تعذر تحميل السجل (النت أو الصلاحيات)."; });
  };
  window.wfClearClientErrors = function () {
    if (!staffUser() || !w.confirm("مسح سجل الأخطاء كله؟")) return Promise.resolve();
    var db = w.firebase.firestore();
    return db.collection("clientErrors").limit(400).get().then(function (snap) {
      var b = db.batch(); snap.docs.forEach(function (d) { b.delete(d.ref); }); return b.commit();
    }).then(function () { return window.wfRenderClientErrors(); }, function () {});
  };

  load();
  w.addEventListener("error", function (ev) {
    if (ev && ev.target && ev.target !== w) return;
    capture("error", ev && (ev.message || (ev.error && ev.error.message)), ev && ev.error && ev.error.stack, ev && ev.filename);
  });
  w.addEventListener("unhandledrejection", function (ev) {
    var r = ev && ev.reason;
    capture("promise", (r && (r.message || (typeof r === "string" ? r : r.code))) || "unhandled rejection", r && r.stack, "");
  });
  w.addEventListener("pagehide", function () { try { flush(); } catch (_) {} });
  if (queue.length) schedule();
  w.WFErrorLog = { flush: flush, capture: capture, pending: function () { return queue.length; } };
})(window);
