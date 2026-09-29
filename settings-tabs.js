/* إعدادات النظام كشبكة أيقونات: الضغط على أيقونة يفتح محتواها تحت صفها مباشرة، وأي أيقونة تانية تقفل المفتوحة وتفتح اللي اتضغطت */
(function () {
  "use strict";
  var KEY = "wf_settings_tab", nav = null, active = "", timer = null, mq = window.matchMedia("(min-width:700px)");
  function cols() { return mq.matches ? 6 : 3; }
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
  function save() { try { sessionStorage.setItem(KEY, active); } catch (e) {} }
  function layout(list) {
    list = list || tops();
    var n = list.length, C = cols(), idx = -1;
    list.forEach(function (p, i) {
      var on = p.id === active;
      p.style.gridColumn = "1 / -1";
      p.classList.toggle("st-hide", !on);
      p.classList.toggle("st-active", on);
      if (on) { idx = i; var d = p.querySelector(":scope > details"); if (d && !d.open) d.open = true; }
    });
    if (idx >= 0) list[idx].style.order = String((Math.min(Math.floor(idx / C) * C + C - 1, n - 1)) * 10 + 5);
    if (!nav) {
      nav = document.createElement("nav"); nav.className = "st-nav"; nav.setAttribute("aria-label", "أقسام الإعدادات");
      var h1 = document.querySelector("main.page > h1");
      (h1 || document.querySelector("main.page")).insertAdjacentElement(h1 ? "afterend" : "afterbegin", nav);
    }
    var html = list.map(function (p, i) {
      var sp = split(titleOf(p));
      return '<button type="button" style="order:' + i * 10 + '" class="' + (p.id === active ? "on" : "") + (p.classList.contains("danger-panel") ? " danger" : "") + '" data-st="' + esc(p.id) + '" aria-expanded="' + (p.id === active) + '"><i>' + esc(sp[0]) + "</i><span>" + esc(sp[1]) + "</span></button>";
    }).join("");
    if (nav._h !== html) { nav._h = html; nav.innerHTML = html; }
  }
  function toggle(id) {
    active = (active === id) ? "" : id;
    save(); layout();
    if (active) setTimeout(function () { var b = nav.querySelector('[data-st="' + active + '"]'); if (b && b.scrollIntoView) b.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
  }
  function refresh() {
    var list = tops();
    if (!list.length) return;
    if (!active) { try { active = sessionStorage.getItem(KEY) || ""; } catch (e) {} }
    if (active && !list.some(function (p) { return p.id === active; })) active = "";
    layout(list);
  }
  function later() { clearTimeout(timer); timer = setTimeout(refresh, 120); }
  function fromHash() {
    var id = (location.hash || "").slice(1), el = id && document.getElementById(id);
    if (!el) return;
    var q = el.closest("section.panel");
    while (q && q.parentElement && q.parentElement.closest("section.panel")) q = q.parentElement.closest("section.panel");
    if (q) { active = q.id; save(); layout(); setTimeout(function () { var b = nav && nav.querySelector('[data-st="' + active + '"]'); if (b) b.scrollIntoView({ block: "start" }); }, 60); }
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-st]");
    if (b) toggle(b.dataset.st);
  });
  window.addEventListener("hashchange", fromHash);
  if (mq.addEventListener) mq.addEventListener("change", function () { layout(); });
  function init() {
    var main = document.querySelector("main.page"); if (!main) return;
    main.classList.add("st-on");
    var st = document.createElement("style");
    st.textContent = "main.page.st-on{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;align-items:start}" +
      "main.page.st-on>*{grid-column:1/-1}main.page.st-on>div:not(.page-topbar),main.page.st-on>.st-nav{display:contents}" +
      "main.page.st-on>p.hint{order:100000}.st-nav button{grid-column:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:10px 2px;min-height:70px;font-size:12px;line-height:1.25;border-radius:12px;background:var(--bg-elevated);color:var(--text);border:1px solid var(--border);font-weight:600}" +
      ".st-nav button i{font-style:normal;font-size:23px;line-height:1}.st-nav button.on{background:var(--primary,#0b57d0);color:#fff;border-color:transparent}.st-nav button.danger:not(.on){border-color:#c62828}" +
      ".st-hide{display:none!important}.st-active{margin:2px 0 8px}.st-active>details>summary{display:none}.st-active>details>.panel-body{padding-top:0}" +
      "@media(min-width:700px){main.page.st-on{grid-template-columns:repeat(6,minmax(0,1fr))}}";
    document.head.appendChild(st);
    var cp = document.getElementById("cloud-panel"), hh = document.querySelector("main.page > h1");
    if (cp && hh && (cp.compareDocumentPosition(hh) & 4)) hh.insertAdjacentElement("afterend", cp);
    new MutationObserver(later).observe(main, { childList: true, subtree: true });
    refresh(); setTimeout(function () { refresh(); fromHash(); }, 900);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
