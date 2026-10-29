/* ui-keep.js — «ماتطلعنيش برّه»: لما جزء من الصفحة يترسم من جديد بعد حفظ/إضافة/حذف/ترتيب
   (innerHTML)، الأقسام القابلة للفتح (<details>) كانت بترجع مقفولة فتحس إنك خرجت من المكان اللي كنت فيه
   (أوضح مثال: الإعدادات ← الحسابات: كل تعديل كان بيقفل القايمة وترجع تدوّر عليها).
   الملف ده عام لكل الصفحات:
   1) بيفتكر كل قسم إنت فتحته أو قفلته بنفسك (في نفس الجلسة، لكل صفحة لوحدها).
   2) أي قسم يتعمل من جديد وكان مفتوح → بيتفتح تاني فورًا قبل ما الشاشة تترسم.
   3) لو الجزء اللي ضغطت فيه اترسم من جديد، بيثبّت القسم اللي كنت فيه في نفس مكانه على الشاشة
      (المتصفح كان بينطّ لفوق لما العناصر تتشال وترجع). مابيلمسش أي تحريك متعمد من الكود (scrollTo/scrollIntoView).
   4) خانة الكتابة اللي كنت فيها (مثلًا «إضافة حساب») بيرجع لها التركيز عشان تكمّل إضافة على طول.
   مفيش أي تغيير في البيانات ولا في التصميم. */
(function () {
  "use strict";
  if (window.WFKeepUI) return;
  var SKEY = "wf_ui_open:" + location.pathname, open = {}, closed = {};
  try { var saved = JSON.parse(sessionStorage.getItem(SKEY) || "{}"); open = saved.o || {}; closed = saved.c || {}; } catch (e) {}
  function persist() { try { sessionStorage.setItem(SKEY, JSON.stringify({ o: open, c: closed })); } catch (e) {} }

  // مفتاح ثابت للقسم: معرّفه أو معرّف أقرب أب ليه معرّف + عنوانه من غير الأرقام (العدّاد «(3)» بيتغير مع الإضافة)
  function title(d) {
    var s = d.querySelector(":scope > summary");
    return s ? (s.textContent || "").replace(/[0-9٠-٩]+/g, "").replace(/[()]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) : "";
  }
  function keyOf(d) {
    if (d.id) return "#" + d.id;
    var host = d.parentElement && d.parentElement.closest("[id]");
    var t = title(d);
    if (!t && !host) return "";
    return (host ? "#" + host.id : "") + "|" + t;
  }

  var applying = 0, lastUserAt = 0, userScrollAt = 0, intentAt = 0, lastFocus = null, rec = null;
  // أي تحريك متعمد من كود الصفحة = مانرجّعش مكانك فوقه
  function wrap(obj, name) { var f = obj && obj[name]; if (typeof f !== "function") return; obj[name] = function () { if (!applying) intentAt = Date.now(); return f.apply(this, arguments); }; }
  wrap(window, "scrollTo"); wrap(window, "scroll"); wrap(window, "scrollBy"); wrap(Element.prototype, "scrollIntoView");
  function anchorOf(el) { var a = el && el.closest ? el.closest("[id]") : null; while (a && (a === document.body || a === document.documentElement)) a = null; return a; }
  function note(e) {
    var t = e.target, a = anchorOf(t);
    rec = a ? { el: t, id: a.id, top: a.getBoundingClientRect().top, at: Date.now() } : null;
  }
  ["pointerdown", "keydown"].forEach(function (t) { document.addEventListener(t, note, true); });
  document.addEventListener("toggle", function (e) {
    var d = e.target;
    if (!d || d.tagName !== "DETAILS" || applying) return;
    var k = keyOf(d); if (!k) return;
    if (d.open) { open[k] = 1; delete closed[k]; } else { delete open[k]; closed[k] = 1; }
    persist();
  }, true);
  ["pointerdown", "keydown", "input", "change"].forEach(function (t) { document.addEventListener(t, function () { lastUserAt = Date.now(); }, true); });
  ["wheel", "touchmove"].forEach(function (t) { window.addEventListener(t, function () { userScrollAt = Date.now(); }, { passive: true }); });
  document.addEventListener("focusin", function (e) {
    var el = e.target;
    if (el && el.id && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) lastFocus = { id: el.id, at: Date.now() };
  }, true);

  function reopen(root) {
    var n = 0, list = [];
    if (root.tagName === "DETAILS") list.push(root);
    if (root.querySelectorAll) list = list.concat(Array.prototype.slice.call(root.querySelectorAll("details")));
    applying++;
    try {
      list.forEach(function (d) { if (!d.open) { var k = keyOf(d); if (k && open[k]) { d.open = true; n++; } } });
    } finally { applying--; }
    return n;
  }

  function pin(r) {
    if (!r || intentAt > r.at || userScrollAt > r.at) return;
    var a = document.getElementById(r.id); if (!a) return;
    var d = a.getBoundingClientRect().top - r.top;
    if (Math.abs(d) > 4) { applying++; try { window.scrollBy(0, d); } finally { applying--; } }
  }
  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var add = muts[i].addedNodes;
      for (var j = 0; j < add.length; j++) if (add[j].nodeType === 1) reopen(add[j]);
    }
    var at = Date.now();
    // الحتة اللي ضغطت فيها اترسمت من جديد (العنصر نفسه اتشال): ثبّت القسم مكانه — دلوقتي وبعد أي رسم متأخر
    if (rec && at - rec.at < 2000 && rec.el && !rec.el.isConnected && !rec.pinned) {
      var r = rec; r.pinned = true;
      requestAnimationFrame(function () { pin(r); setTimeout(function () { pin(r); }, 250); });
    }
    // خانة الكتابة اللي كنت فيها اتعملت من جديد: رجّع لها التركيز (بس لو ده لسه حاصل بعد تفاعل منك)
    var a = document.activeElement;
    if (lastFocus && at - lastUserAt < 1500 && at - lastFocus.at < 60000 && (!a || a === document.body)) {
      var el = document.getElementById(lastFocus.id);
      if (el && el.offsetParent !== null) { try { el.focus({ preventScroll: true }); } catch (e) {} }
    }
  });
  function start() { if (document.body) mo.observe(document.body, { childList: true, subtree: true }); reopen(document.body || document.documentElement); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  window.WFKeepUI = { keyOf: keyOf, isOpen: function (k) { return !!open[k]; }, forget: function () { open = {}; closed = {}; persist(); } };
})();
