/* pw-eye.js — زر «عين» صغير بجانب أي خانة كلمة مرور لإظهارها/إخفائها.
   بيشتغل تلقائيًا على كل input[type=password] (حتى اللي بيتحط في الصفحة بعدين، زي شاشات البوابة اللي بتترسم بـ innerHTML).
   الاستخدام: <script src="pw-eye.js"></script> وبس. */
(function (root) {
  "use strict";
  if (root.PwEye || !root.document) return;
  var d = root.document, HIDE_AFTER = 15000;
  var CSS = ".pwe{position:relative;display:block}.pwe>input{width:100%;box-sizing:border-box;padding-inline-end:46px!important}" +
    ".pwe-b{position:absolute;inset-inline-end:2px;top:0;bottom:0;margin:auto 0;width:42px;height:38px;max-height:100%;padding:0;border:0;background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer;opacity:.7;box-shadow:none}" +
    ".pwe-b:hover,.pwe-b:focus-visible{opacity:1}";
  function css() {
    if (d.getElementById("pwe-css")) return;
    var s = d.createElement("style"); s.id = "pwe-css"; s.textContent = CSS;
    (d.head || d.documentElement).appendChild(s);
  }
  function set(inp, btn, show) {
    inp.type = show ? "text" : "password";
    btn.textContent = show ? "🙈" : "👁️";
    btn.setAttribute("aria-pressed", show ? "true" : "false");
    btn.setAttribute("aria-label", show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
    clearTimeout(btn._t);
    if (show) btn._t = setTimeout(function () { set(inp, btn, false); }, HIDE_AFTER); // بيرجع يتخفى لوحده
  }
  function enhance(inp) {
    if (!inp || inp.dataset.pwe || inp.type !== "password" || !inp.parentNode) return;
    inp.dataset.pwe = "1"; css();
    var cs = root.getComputedStyle(inp), wrap = d.createElement("span"), btn = d.createElement("button");
    wrap.className = "pwe"; wrap.style.margin = cs.margin; inp.style.margin = "0";
    btn.type = "button"; btn.className = "pwe-b";
    inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp); wrap.appendChild(btn);
    inp.setAttribute("autocapitalize", "off"); inp.setAttribute("spellcheck", "false");
    set(inp, btn, false);
    btn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); var show = inp.type === "password"; set(inp, btn, show); try { inp.focus(); } catch (x) {} });
    inp.addEventListener("blur", function () { if (inp.type === "text") setTimeout(function () { if (d.activeElement !== btn && d.activeElement !== inp) set(inp, btn, false); }, 300); });
  }
  function scan(scope) { Array.prototype.forEach.call((scope || d).querySelectorAll("input[type=password]"), enhance); }
  var q = 0;
  function later() { if (q) return; q = setTimeout(function () { q = 0; scan(); }, 0); }
  function init() { scan(); try { new MutationObserver(later).observe(d.documentElement, { childList: true, subtree: true }); } catch (e) {} }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", init); else init();
  root.PwEye = { enhance: enhance, scan: scan };
})(typeof window !== "undefined" ? window : this);
