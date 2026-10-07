/* شاشة دمج العملاء المكررين (نفس رقم التليفون). المنطق الفعلي في firebase-sync.js: wfMergeCustomers */
(function () {
  "use strict";
  var picked = {};
  function $(i) { return document.getElementById(i); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function count(key, id) { return window.arr(key).filter(function (x) { return x && x.customerId === id; }).length; }
  function info(c) {
    var K = window.K, a = c.mainAddress || {};
    return { c: c, ds: count(K.d, c.id), rs: count(K.r, c.id), ts: count(K.tasks, c.id),
      addr: [a.center, a.village, a.address || a.street].filter(Boolean).join(" - "),
      acct: !!(c.portalUid || c.portal),
      t: Date.parse(c.createdAt || "") || 0 };
  }
  function best(list) { return list.slice().sort(function (a, b) { return ((b.ds + b.rs + b.ts) - (a.ds + a.rs + a.ts)) || ((a.t || 9e15) - (b.t || 9e15)); })[0].c.id; }
  function say(t, ok) { $("mergeMsg").innerHTML = t ? '<div class="item" style="border-color:' + (ok ? "#2e7d32" : "#c62828") + '">' + esc(t) + '</div>' : ""; }
  function render() {
    var el = $("mergeList"); if (!el || !window.wfCustomerDupGroups) return;
    var groups = window.wfCustomerDupGroups();
    if (!groups.length) { el.innerHTML = '<div class="item">✅ مفيش عملاء مكررين بنفس الرقم.</div>'; return; }
    el.innerHTML = groups.map(function (g) {
      var rows = g.list.map(info), keep = picked[g.phone] && rows.some(function (r) { return r.c.id === picked[g.phone]; }) ? picked[g.phone] : best(rows);
      picked[g.phone] = keep;
      return '<section class="panel" style="margin-bottom:12px"><b>📞 ' + esc(g.phone) + '</b> <span class="hint">(' + rows.length + ' سجلات)</span>' +
        rows.map(function (r) {
          return '<label class="item" style="display:block;cursor:pointer;margin-top:8px"><input type="radio" name="k-' + esc(g.phone) + '" value="' + esc(r.c.id) + '" ' + (r.c.id === keep ? "checked" : "") + ' data-phone="' + esc(g.phone) + '"> <b>' + esc(r.c.name || "بدون اسم") + '</b>' +
            (r.acct ? ' <small>🌐 حساب بوابة</small>' : '') + (r.c.id === keep ? ' <small>← هيفضل</small>' : '') +
            '<br><small>' + r.ds + ' جهاز • ' + r.rs + ' أمر شغل' + (r.ts ? ' • ' + r.ts + ' مهمة' : '') + (r.addr ? ' • ' + esc(r.addr) : '') + (r.t ? ' • اتسجل ' + new Date(r.t).toLocaleDateString("ar-EG") : '') + '</small></label>';
        }).join("") +
        '<button type="button" class="primary" style="margin-top:10px" data-merge="' + esc(g.phone) + '">🧬 ادمج الباقي في السجل المختار</button></section>';
    }).join("");
    el.querySelectorAll('input[type=radio]').forEach(function (r) { r.onchange = function () { picked[r.dataset.phone] = r.value; render(); }; });
    el.querySelectorAll('button[data-merge]').forEach(function (b) { b.onclick = function () { run(b.dataset.merge, b); }; });
  }
  function run(phone, btn) {
    var g = window.wfCustomerDupGroups().find(function (x) { return x.phone === phone; }); if (!g) return;
    var keepId = picked[phone], dups = g.list.filter(function (c) { return c.id !== keepId; }), keep = g.list.find(function (c) { return c.id === keepId; });
    if (!window.wfMergeCustomers) return say("النظام لسه بيحمّل، جرّب بعد ثواني.");
    if (!confirm("هيتدمج " + dups.length + " سجل في «" + (keep.name || "") + "». الأجهزة والأوامر هتتنقل له والسجلات التانية هتتشال. تأكيد؟")) return;
    btn.disabled = true; var chain = Promise.resolve(), done = 0;
    dups.forEach(function (d) { chain = chain.then(function () { return window.wfMergeCustomers(keepId, d.id); }).then(function () { done++; }); });
    chain.then(function () { say("✅ تم دمج " + done + " سجل.", true); render(); }).catch(function (e) {
      var c = e && (e.code || e.message);
      say(c === "offline" ? "السجل ده عنده حساب بوابة، محتاج نت عشان الدمج يربط الحساب." : "تعذر الدمج (" + c + "). اللي اتدمج قبل الخطأ اتحفظ، جرّب تاني."); render();
    });
  }
  function init() { if (!window.arr || !window.K) return setTimeout(init, 150); render(); }
  function start() { var r = window.WFStorageReady; if (r && typeof r.then === "function") r.then(init, init); else init(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
