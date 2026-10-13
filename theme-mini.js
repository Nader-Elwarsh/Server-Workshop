/* theme-mini.js — زرار الوضع الليلي/النهاري للصفحات العامة (بوابة العملاء، الدخول، الخصوصية، الشروط).
   نفس اختيار المظهر بتاع باقي النظام (WFStorage/الكوكي wf_theme)، والزرار بيتحط لوحده في ترويسة الصفحة. */
(function () {
  "use strict";
  function isDark() { return document.documentElement.getAttribute("data-theme") === "dark"; }
  function apply(d) {
    try { document.documentElement.style.colorScheme = d ? "dark" : "light"; } catch (e) {}
    if (d) document.documentElement.setAttribute("data-theme", "dark"); else document.documentElement.removeAttribute("data-theme");
  }
  function save(v) {
    try { if (window.WFStorage && typeof window.WFStorage.setItem === "function") { window.WFStorage.setItem("wf_theme", v); return; } } catch (e) {}
    try { document.cookie = "wf_theme=" + v + ";path=/;max-age=31536000;SameSite=Lax" + (location.protocol === "https:" ? ";Secure" : ""); } catch (e) {}
  }
  function paint(b) { var d = isDark(); b.textContent = d ? "☀️" : "🌙"; b.setAttribute("aria-label", d ? "التبديل للوضع الفاتح" : "التبديل للوضع الداكن"); b.title = b.getAttribute("aria-label"); }
  function mount() {
    var host = document.querySelector(".wf-head-in"); if (!host || document.getElementById("wfThemeMini")) return;
    var b = document.createElement("button"); b.type = "button"; b.id = "wfThemeMini"; b.className = "sec wf-theme-mini";
    b.onclick = function () { var d = !isDark(); apply(d); save(d ? "dark" : "light"); paint(b); };
    paint(b);
    var out = host.querySelector("#outBtn"), grp = document.createElement("div"); grp.className = "wf-head-actions";
    if (out) { out.parentNode.insertBefore(grp, out); grp.appendChild(b); grp.appendChild(out); } else { grp.appendChild(b); host.appendChild(grp); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
