/* =========================================================
   الإعدادات ← ☁️ مساحة المرفقات (media-cleanup.js)
   - مسح مرفقات (صور/فيديو/صوت) أوامر الشغل المقفولة من أكتر من مدة تختارها:
     بتتمسح من السحابة نهائيًا وبتتشال من الأوامر، والأمر بيفضل عليه علامة
     «اتمسح N مرفق قديم».
   - الملفات اليتيمة: اترفعت ومحدش حفظها (عميل قفل الصفحة قبل ما يبعت، رفع
     اتقطع، حذف من غير نت…) — السيرفر بيدوّر عليها ويمسحها.
   ========================================================= */
(function (w) {
  "use strict";
  var d = w.document;
  function $(id) { return d.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function mb(b) { b = +b || 0; return b >= 1073741824 ? (b / 1073741824).toFixed(2) + " جيجا" : (b / 1048576).toFixed(1) + " ميجا"; }
  function isOwner() { try { return !w.WFPerm || !w.WFPerm.isOwner || w.WFPerm.isOwner(); } catch (e) { return false; } }
  function closedAt(r) { return Date.parse(r.paidAt || r.closedAt || r.completedAt || r.updatedAt || r.createdAt || "") || 0; }
  function isDone(r) { return !!(r && (r.closed || r.paid || r.status === "ملغي")); }
  function cands(days) {
    var cut = Date.now() - days * 86400000, list = [];
    (w.arr ? w.arr(w.K.r) : []).forEach(function (r) {
      if (!isDone(r) || closedAt(r) > cut) return;
      var m = w.WFMedia ? w.WFMedia.clean(r.media) : [];
      if (m.length) list.push({ r: r, m: m });
    });
    return list;
  }
  function say(html) { var o = $("mcOut"); if (o) o.innerHTML = html; }

  function render() {
    var box = $("mediaCleanupBody"); if (!box) return;
    if (!w.WFMedia) { box.innerHTML = '<p class="hint">جاري التحميل…</p>'; return; }
    if (!isOwner()) { box.innerHTML = '<p class="hint">🔒 الجزء ده للمالك بس.</p>'; return; }
    var days = +(($("mcDays") || {}).value || 90), c = cands(days), n = 0, bytes = 0;
    c.forEach(function (x) { n += x.m.length; x.m.forEach(function (m) { bytes += +m.bytes || 0; }); });
    box.innerHTML =
      '<h2 style="margin:18px 0 4px;font-size:18px">🧹 توفير المساحة</h2><p class="hint">الصور والفيديوهات والتسجيلات اللي على أوامر الشغل متخزنة على Cloudinary. امسح اللي ملوش لازمة عشان المساحة ماتخلصش.</p>' +
      '<h3 style="margin:14px 0 6px">🗂️ مرفقات الأوامر القديمة</h3>' +
      '<label>أوامر مقفولة (أو ملغية) من أكتر من <select id="mcDays">' + [30, 60, 90, 180, 365].map(function (x) { return '<option value="' + x + '"' + (x === days ? " selected" : "") + '>' + x + ' يوم</option>'; }).join("") + '</select></label>' +
      '<div class="hint" style="margin:6px 0">' + (n ? "📎 <b>" + n + "</b> مرفق في <b>" + c.length + "</b> أمر" + (bytes ? " — حوالي <b>" + mb(bytes) + "</b>" : "") : "✅ مفيش مرفقات على أوامر قديمة بالمدة دي.") + '</div>' +
      (n ? '<button type="button" class="danger-btn" id="mcOld">🗑️ امسح المرفقات دي من السحابة</button>' : "") +
      '<h3 style="margin:14px 0 6px">👻 ملفات يتيمة</h3><p class="hint">ملفات اترفعت ومحدش حفظها في أي أمر أو طلب (زي عميل رفع فيديو وقفل الصفحة من غير ما يبعت). بندوّر على اللي عدّى عليه أكتر من 3 أيام.</p>' +
      '<button type="button" class="secondary" id="mcOrph">🔍 دوّر على الملفات اليتيمة</button><div id="mcOut" style="margin-top:8px" role="status" aria-live="polite"></div>';
    $("mcDays").onchange = render;
    if ($("mcOld")) $("mcOld").onclick = function () { clearOld(days); };
    $("mcOrph").onclick = function () { orphans(false); };
  }

  function clearOld(days) {
    var c = cands(days), urls = [];
    c.forEach(function (x) { x.m.forEach(function (m) { urls.push(m.url); }); });
    if (!urls.length) return;
    if (!w.confirm("هيتمسح " + urls.length + " مرفق (صور/فيديو/صوت) من " + c.length + " أمر قديم من السحابة نهائيًا، ومش هينفع يرجعوا. متأكد؟")) return;
    var btn = $("mcOld"); if (btn) btn.disabled = true;
    say("⏳ جاري المسح… سيب الصفحة مفتوحة");
    w.WFMedia.removeRemote(urls).then(function (res) {
      var gone = {}; (res.done || []).forEach(function (u) { gone[u] = 1; });
      var all = w.arr(w.K.r), changed = 0;
      all.forEach(function (r) {
        if (!Array.isArray(r.media) || !r.media.some(function (m) { return m && gone[m.url]; })) return;
        var keep = r.media.filter(function (m) { return !(m && gone[m.url]); }), n = r.media.length - keep.length;
        if (keep.length) r.media = keep; else delete r.media;
        r.mediaCleared = (+r.mediaCleared || 0) + n; changed++;
      });
      var saved = changed ? (typeof w.putAsync === "function" ? w.putAsync(w.K.r, all) : Promise.resolve(w.put(w.K.r, all))) : Promise.resolve(true);
      return saved.then(function () {
        render();
        say("✅ اتمسح <b>" + res.deleted + "</b> مرفق من " + changed + " أمر." + (res.failed ? " ⚠️ " + res.failed + " ماتمسحوش — جرّب تاني بعدين." : "") + (res.denied ? " 🔒 " + res.denied + " مرفوض." : ""));
      });
    }, function (e) { if (btn) btn.disabled = false; say("⚠️ " + esc(e && e.message || "تعذّر المسح")); });
  }

  function orphans(apply) {
    say(apply ? "⏳ جاري المسح…" : "⏳ بندوّر…");
    w.WFMedia.call("mediaCleanup", { apply: !!apply, minAgeDays: 3 }).then(function (r) {
      r = r || {};
      if (!apply) {
        if (!r.orphans) return say("✅ مفيش ملفات يتيمة (اتفحص " + (r.checked || 0) + " ملف).");
        var k = r.kinds || {}, parts = [];
        if (k.image) parts.push(k.image + " صورة"); if (k.video) parts.push(k.video + " فيديو"); if (k.audio) parts.push(k.audio + " تسجيل");
        say("👻 لقينا <b>" + r.orphans + "</b> ملف يتيم" + (parts.length ? " (" + parts.join(" + ") + ")" : "") + ' <button type="button" class="danger-btn" id="mcOrphGo">🗑️ امسحهم</button>');
        $("mcOrphGo").onclick = function () { if (w.confirm("مسح " + r.orphans + " ملف يتيم من السحابة نهائيًا؟")) orphans(true); };
      } else say("✅ اتمسح <b>" + (r.deleted || 0) + "</b> ملف يتيم." + (r.failed ? " ⚠️ " + r.failed + " ماتمسحوش." : "") + (r.orphans > (r.deleted || 0) + (r.failed || 0) ? " فيه لسه — دوس تاني." : ""));
    }, function (e) { say("⚠️ " + esc(e && e.message || "تعذّر")); });
  }

  function boot() {
    var p = $("media-cleanup-panel"); if (!p) return;
    var det = p.querySelector("details");
    if (det) det.addEventListener("toggle", function () { if (det.open) render(); });
    render();
    if (w.WFPerm && w.WFPerm.onChange) try { w.WFPerm.onChange(render); } catch (e) {}
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot); else boot();
  w.WFMediaCleanup = { render: render, cands: cands };
})(window);
