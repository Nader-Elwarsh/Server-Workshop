/* quiet-delete.js — زرار «حذف» مابقاش قدامك على طول (batch96).
   - في القوايم (العملاء، الأجهزة، المخزن، الأكواد): زرار الحذف اتشال (style.css).
   - في صفحة السجل نفسه: الحذف بقى تحت في «⚙️ خيارات أكتر» (مقفولة لحد ما تفتحها)، وبنفس التأكيد اللي كان قبل كده.
   الملف ده بيلف على صفحة السجل بعد كل رسم، يخفي زرار الحذف اللي فوق ويحط واحد في الخيارات تحت. */
(function () {
  "use strict";
  var w = window, d = document;
  var MAP = {
    customerProfile: { fn: "deleteCustomerRecord", perm: "customers.delete", key: "c", back: "customers.html", label: "العميل" },
    deviceProfile: { fn: "deleteDeviceRecord", perm: "devices.delete", key: "d", back: "devices.html", label: "الجهاز" },
    requestProfile: { fn: "deleteRequestRecord", perm: "requests.delete", key: "r", back: "requests.html", label: "أمر الشغل" },
    partProfile: { fn: "deletePartRecord", perm: "inventory.delete", key: "p", back: "inventory.html", label: "الصنف" },
    faultCodeProfile: { fn: "deleteFaultCodeRecord", perm: "faultcodes.delete", key: "fc", back: "faultcodes.html", label: "" }
  };
  function can(p) { try { return !w.WFPerm || !w.WFPerm.can || w.WFPerm.can(p); } catch (e) { return true; } }
  function exists(key, id) { try { return (w.arr(w.K[key]) || []).some(function (x) { return x && String(x.id) === String(id); }); } catch (e) { return true; } }
  function apply(host, cfg, id) {
    var top = host.querySelectorAll('[data-wf-code^="' + cfg.fn + '("]:not([data-qd])');
    Array.prototype.forEach.call(top, function (b) { b.style.display = "none"; b.setAttribute("aria-hidden", "true"); });
    if (host.querySelector(".wf-more-zone") || !host.querySelector(".profile")) return; // صفحة «غير موجود» مفيهاش .profile
    if (host.getAttribute("data-arch")) return; // أمر متأرشف معروض من الأرشيف: مفيش حذف
    if (!can(cfg.perm) || typeof w[cfg.fn] !== "function") return;
    var label = cfg.label || (host.querySelector(".tm-steps") ? "التيست مود" : "الكود");
    var z = d.createElement("details"); z.className = "wf-more-zone no-print";
    z.style.cssText = "margin:18px 0 6px;border-top:1px dashed var(--border,#ccd);padding-top:10px";
    z.innerHTML = "<summary style='cursor:pointer;color:var(--text-muted,#667);font-size:14px'>⚙️ خيارات أكتر</summary><div style='margin-top:10px'><button type='button' class='danger-btn small-btn' data-qd='1'>🗑️ حذف " + label + "</button></div>";
    z.querySelector("button").onclick = function () {
      Promise.resolve(w[cfg.fn](id)).then(function () {
        setTimeout(function () { if (!exists(cfg.key, id) && /\b(customer|device|part|request|faultcode)\.html/.test(location.pathname)) location.href = cfg.back; }, 300);
      }).catch(function (e) { console.warn("delete", e); });
    };
    host.appendChild(z);
  }
  function boot() {
    var id = new URLSearchParams(location.search).get("id"); if (!id) return;
    Object.keys(MAP).forEach(function (hid) {
      var host = d.getElementById(hid); if (!host) return;
      var run = function () { try { apply(host, MAP[hid], id); } catch (e) {} };
      run();
      try { new MutationObserver(run).observe(host, { childList: true, subtree: true }); } catch (e) {}
    });
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot); else boot();
})();
