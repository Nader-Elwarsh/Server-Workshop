/* إعدادات النظام كشبكة أيقونات (أيقونة فوق واسم تحت) — بدل قايمة طويلة من الأكورديون */
(function () {
  "use strict";
  var KEY = "wf_settings_tab", nav = null, active = "", timer = null;
  function tops() {
    var out = [], all = document.querySelectorAll("main.page section.panel");
    for (var i = 0; i < all.length; i++) {
      var p = all[i];
      if (p.parentElement && p.parentElement.closest("section.panel")) continue;
      if (!p.id) p.id = "st-auto-" + i;
      out.push(p);
    }
    return out;
  }
  function titleOf(p) {
    var s = p.querySelector(":scope > details > summary"), h = p.querySelector(":scope > h2");
    return ((s || h || {}).textContent || "").replace(/\s+/g, " ").trim();
  }
  function split(t) {
    var m = t.match(/^(\S+)\s+(.*)$/);
    if (m && !/^[A-Za-z0-9\u0600-\u06FF]/.test(m[1])) return [m[1], m[2]];
    return ["⚙️", t];
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function show(id) {
    var list = tops();
    if (!list.some(function (p) { return p.id === id; })) id = list.length ? list[0].id : "";
    active = id;
    try { sessionStorage.setItem(KEY, id); } catch (e) {}
    list.forEach(function (p) {
      var on = p.id === id;
      p.classList.toggle("st-hide", !on);
      p.classList.toggle("st-active", on);
      if (on) { var d = p.querySelector(":scope > details"); if (d) d.open = true; }
    });
    build(list);
  }
  function build(list) {
    list = list || tops();
    if (!nav) { nav = document.createElement("nav"); nav.className = "st-nav"; nav.setAttribute("aria-label", "أقسام الإعدادات"); var h1 = document.querySelector("main.page > h1"); (h1 || document.querySelector("main.page")).insertAdjacentElement(h1 ? "afterend" : "afterbegin", nav); }
    var html = list.map(function (p) {
      var sp = split(titleOf(p));
      return '<button type="button" class="' + (p.id === active ? "on" : "") + (p.classList.contains("danger-panel") ? " danger" : "") + '" data-st="' + esc(p.id) + '"><i>' + esc(sp[0]) + "</i><span>" + esc(sp[1]) + "</span></button>";
    }).join("");
    if (nav._h !== html) { nav._h = html; nav.innerHTML = html; }
  }
  function refresh() {
    var list = tops();
    if (!list.length) return;
    list.forEach(function (p) {
      if (!p.classList.contains("st-active")) p.classList.add("st-hide");
      else { var d = p.querySelector(":scope > details"); if (d && !d.open) d.open = true; }
    });
    var want = active || (function () { try { return sessionStorage.getItem(KEY); } catch (e) { return ""; } })();
    if (!want || !list.some(function (p) { return p.id === want; })) want = list[0].id;
    if (want !== active || !document.querySelector(".st-active")) show(want); else build(list);
  }
  function later() { clearTimeout(timer); timer = setTimeout(refresh, 120); }
  function fromHash() {
    var id = (location.hash || "").slice(1);
    if (!id) return;
    var el = document.getElementById(id), p = el && el.closest("main.page section.panel:not(.panel .panel)");
    if (!p && el) { var q = el.closest("section.panel"); while (q && q.parentElement && q.parentElement.closest("section.panel")) q = q.parentElement.closest("section.panel"); p = q; }
    if (p) show(p.id);
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-st]");
    if (b) { show(b.dataset.st); window.scrollTo({ top: 0, behavior: "smooth" }); }
  });
  window.addEventListener("hashchange", fromHash);
  function init() {
    var st = document.createElement("style");
    st.textContent = ".st-hide{display:none!important}.st-nav{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0 14px}.st-nav button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:10px 2px;min-height:70px;font-size:12px;line-height:1.25;border-radius:12px;background:var(--bg-elevated);color:var(--text);border:1px solid var(--border);font-weight:600}.st-nav button i{font-style:normal;font-size:23px;line-height:1}.st-nav button.on{background:var(--primary,#0b57d0);color:#fff;border-color:transparent}.st-nav button.danger:not(.on){border-color:#c62828}.st-active>details>summary{display:none}.st-active>details>.panel-body{padding-top:0}@media(min-width:700px){.st-nav{grid-template-columns:repeat(6,1fr)}}";
    document.head.appendChild(st);
    var cp = document.getElementById("cloud-panel"), hh = document.querySelector("main.page > h1");
    if (cp && hh && (cp.compareDocumentPosition(hh) & 4)) hh.insertAdjacentElement("afterend", cp);
    new MutationObserver(later).observe(document.querySelector("main.page"), { childList: true, subtree: true });
    refresh(); setTimeout(function () { refresh(); fromHash(); }, 900);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
