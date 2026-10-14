/* app-supplier-order.js — 🧾 طلبية للمورد
   بتجمع النواقص من المخزن (أو أي صنف تختاره، أو صنف مش موجود عندك أصلًا) في قائمة:
   اسم القطعة + نوعها + الكود + العدد + صورة (صورة الصنف أو صورة تصوّرها) + ملاحظة.
   وبعدين بتطلّعها «صورة» مترتبة تتبعت للمورد على واتساب (أو كنص لو حابب).
   المسودة بتتحفظ على الجهاز لحد ما تفرّغها، فتقدر تكمّلها على مراحل. */
(function () {
  "use strict";
  var DRAFT_KEY = "wf_supplier_order_draft", HIST_KEY = "wf_supplier_order_history", SUP_KEY = "wf_supplier_contacts";
  var MAX_LINES = 120;

  function load(k, f) { try { var v = JSON.parse(WFStorage.getItem(k)); return v == null ? f : v; } catch (e) { return f; } }
  function save(k, v) { try { WFStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function newKey() { return "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function emptyDraft() { return { supplier: "", phone: "", note: "", lines: [], updatedAt: 0 }; }
  function getDraft() { var d = load(DRAFT_KEY, null); if (!d || typeof d !== "object" || !Array.isArray(d.lines)) d = emptyDraft(); return d; }
  function setDraft(d) { d.updatedAt = Date.now(); return save(DRAFT_KEY, d); }
  function partsList() { return arr(K.p).filter(function (p) { return p && !p.archived; }); }
  function num(v) { v = +v; return Number.isFinite(v) ? v : 0; }
  function e(s) { return typeof esc === "function" ? esc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ---------------- النواقص والكمية المقترحة ----------------
     معدل السحب آخر 60 يوم (خروج − إرجاع). الصنف ناقص لو: الكمية ≤ الحد الأدنى، أو خلصان واتسحب منه قبل كده،
     أو هيخلص خلال 14 يوم بالمعدل ده. المقترح = يكفي شهر + الحد الأدنى − الموجود (وأقل حاجة 1). */
  function usageRates() {
    var now = Date.now(), from = now - 60 * 864e5, rate = {};
    arr(K.m).forEach(function (m) {
      if (!m || !m.partId) return;
      var t = new Date(m.at).getTime(); if (!(t >= from && t <= now)) return;
      var ty = String(m.type || ""), q = Math.abs(num(m.qty));
      if (/توريد|دخول/.test(ty) && !/خروج/.test(ty)) return;
      if (/جرد|تعديل الكمية|نقص|زيادة/.test(ty) && !/خروج|إرجاع/.test(ty)) return;
      rate[m.partId] = (rate[m.partId] || 0) + (/إرجاع|ارجاع/.test(ty) ? -q : q);
    });
    return rate;
  }
  function shortages() {
    var rate = usageRates();
    return partsList().map(function (p) {
      var qty = num(p.qty), min = num(p.min), used = Math.max(0, rate[p.id] || 0), perDay = used / 60;
      var days = perDay > 0 ? qty / perDay : null;
      var short = (min > 0 && qty <= min) || (qty <= 0 && used > 0) || (days !== null && days <= 14);
      var need = Math.max(1, Math.ceil(perDay * 30 + min - qty));
      return { p: p, short: short, need: need, days: days, qty: qty };
    }).filter(function (x) { return x.short; })
      .sort(function (a, b) { return (a.qty - b.qty) || ((a.days == null ? 999 : a.days) - (b.days == null ? 999 : b.days)); });
  }
  function suggestQty(p) {
    var rate = usageRates(), used = Math.max(0, rate[p.id] || 0);
    return Math.max(1, Math.ceil(used / 60 * 30 + num(p.min) - num(p.qty)));
  }
  function lineFromPart(p, qty) {
    return { key: newKey(), partId: p.id, name: String(p.name || ""), cat: String(p.category || ""), code: String(p.code || ""), qty: Math.max(1, Math.round(num(qty) || 1)), note: "", photo: "", usePartPhoto: !!p.photo };
  }
  /* بيضيف النواقص اللي مش موجودة في الطلبية. بيرجّع عدد اللي اتضاف. */
  function addShortages(d) {
    var have = {}, n = 0; d.lines.forEach(function (l) { if (l.partId) have[l.partId] = 1; });
    shortages().forEach(function (x) { if (!have[x.p.id] && d.lines.length < MAX_LINES) { d.lines.push(lineFromPart(x.p, x.need)); n++; } });
    return n;
  }
  function addPartToDraft(d, pid, qty) {
    var p = arr(K.p).find(function (x) { return String(x.id) === String(pid); }); if (!p) return false;
    var ex = d.lines.find(function (l) { return l.partId === p.id; });
    if (ex) { ex.qty = Math.max(1, Math.round(num(ex.qty))) + (qty ? Math.max(1, Math.round(num(qty))) : 1); return true; }
    if (d.lines.length >= MAX_LINES) return false;
    d.lines.push(lineFromPart(p, qty || suggestQty(p))); return true;
  }

  /* ---------------- النص (واتساب) ---------------- */
  function brandName() { try { return window.WL && WL.name ? WL.name() : (document.title || "الورشة"); } catch (x) { return "الورشة"; } }
  function dateLabel(d) { try { return (d || new Date()).toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" }); } catch (x) { return typeof dayKeyLocal === "function" ? dayKeyLocal(new Date()) : ""; } }
  function validLines(d) { return d.lines.filter(function (l) { return String(l.name || "").trim() && num(l.qty) > 0; }); }
  function orderText(d) {
    var ls = validLines(d), out = ["🧾 *طلبية قطع غيار* — " + brandName(), "📅 " + dateLabel()];
    if (d.supplier) out.push("إلى: " + d.supplier);
    out.push("");
    ls.forEach(function (l, i) {
      out.push((i + 1) + ") *" + String(l.name).trim() + "*" + (l.cat ? " — " + l.cat : "") + (l.code ? " (كود " + l.code + ")" : "") + " ← العدد: *" + Math.round(num(l.qty)) + "*" + (l.note ? "\n    📝 " + l.note : ""));
    });
    out.push("", "إجمالي: " + ls.length + " صنف • " + ls.reduce(function (a, l) { return a + Math.round(num(l.qty)); }, 0) + " قطعة");
    if (d.note) out.push("📝 " + d.note);
    out.push("", "برجاء تأكيد المتوفر والأسعار 🙏");
    return out.join("\n");
  }
  function waPhone(p) {
    var s = String(p || "").replace(/[^\d+]/g, "");
    if (!s) return "";
    if (s.charAt(0) === "+") return s.slice(1);
    if (/^00/.test(s)) return s.slice(2);
    if (/^01\d{9}$/.test(s)) return "20" + s.slice(1); // موبايل مصري
    return s;
  }

  /* ---------------- رسم الصورة ---------------- */
  function loadImg(src) {
    return new Promise(function (res) {
      if (!src) return res(null);
      var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = src;
    });
  }
  function lineSrc(l) {
    if (l.photo) return Promise.resolve(l.photo);
    if (!l.usePartPhoto || !l.partId) return Promise.resolve("");
    var p = arr(K.p).find(function (x) { return x.id === l.partId; });
    if (!p || !p.photo) return Promise.resolve("");
    if (window.ImageStore && ImageStore.resolveSrc) return Promise.resolve(ImageStore.resolveSrc(p.photo)).catch(function () { return ""; });
    return Promise.resolve(p.photo);
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function wrap(c, text, maxW, maxLines) {
    var words = String(text || "").split(/\s+/), lines = [], cur = "";
    words.forEach(function (w) { var t = cur ? cur + " " + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); var last = lines[maxLines - 1]; while (last.length > 1 && c.measureText(last + "…").width > maxW) last = last.slice(0, -1); lines[maxLines - 1] = last + "…"; }
    return lines;
  }
  function cssVar(n, f) { try { var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || f; } catch (x) { return f; } }
  var PER_PAGE = 18;
  /* بيرجّع Array من canvas (صفحة لكل 18 صنف) */
  function renderPages(d) {
    var ls = validLines(d); if (!ls.length) return Promise.resolve([]);
    var font = "system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif";
    try { var bf = getComputedStyle(document.body).fontFamily; if (bf) font = bf; } catch (x) {}
    var pri = cssVar("--wl-primary", "") || cssVar("--pri", "") || "#17324d";
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready.catch(function () {}) : Promise.resolve();
    var logoP = window.WFBrand && WFBrand.iconPng ? Promise.resolve(WFBrand.iconPng(120, "any")).catch(function () { return null; }) : Promise.resolve(null);
    return Promise.all([ready, logoP, Promise.all(ls.map(function (l) { return lineSrc(l).then(loadImg); }))]).then(function (res) {
      var logo = res[1], imgs = res[2], pages = [], total = Math.ceil(ls.length / PER_PAGE);
      var totalQty = ls.reduce(function (a, l) { return a + Math.round(num(l.qty)); }, 0);
      for (var pg = 0; pg < total; pg++) {
        var slice = ls.slice(pg * PER_PAGE, (pg + 1) * PER_PAGE), W = 1080, PAD = 40, HEAD = 230, ROW = 150, last = pg === total - 1;
        var noteLines = 0, cv = document.createElement("canvas"), c = cv.getContext("2d");
        c.font = "500 28px " + font;
        if (last && d.note) noteLines = wrap(c, "📝 " + d.note, W - PAD * 2 - 40, 4).length;
        var FOOT = last ? 150 + noteLines * 40 : 80, H = HEAD + 70 + slice.length * ROW + FOOT;
        cv.width = W; cv.height = H; c = cv.getContext("2d"); c.direction = "rtl"; c.textBaseline = "middle";
        c.fillStyle = "#f4f6fa"; c.fillRect(0, 0, W, H);
        // الهيدر
        c.fillStyle = pri; rr(c, 0, 0, W, HEAD, 0); c.fill();
        var tx = W - PAD;
        if (logo) { try { c.save(); rr(c, W - PAD - 120, 55, 120, 120, 28); c.clip(); c.drawImage(logo, W - PAD - 120, 55, 120, 120); c.restore(); tx = W - PAD - 145; } catch (x) {} }
        c.fillStyle = "#fff"; c.textAlign = "right";
        c.font = "800 50px " + font; c.fillText("🧾 طلبية قطع غيار", tx, 85);
        c.font = "600 32px " + font; c.globalAlpha = .92; c.fillText(brandName(), tx, 140);
        c.font = "500 26px " + font; c.globalAlpha = .8; c.fillText(dateLabel() + (d.supplier ? "  •  إلى: " + d.supplier : ""), tx, 188); c.globalAlpha = 1;
        c.textAlign = "left"; c.font = "700 26px " + font;
        c.fillText(ls.length + " صنف • " + totalQty + " قطعة", PAD, 85);
        if (total > 1) c.fillText("صفحة " + (pg + 1) + " من " + total, PAD, 130);
        // رأس الجدول
        var y = HEAD + 18; c.fillStyle = "#64748b"; c.font = "700 24px " + font; c.textAlign = "right";
        c.fillText("#", W - PAD - 10, y + 16); c.fillText("الصنف", W - PAD - 230, y + 16); c.textAlign = "center"; c.fillText("العدد", PAD + 80, y + 16);
        y += 52;
        slice.forEach(function (l, i) {
          var idx = pg * PER_PAGE + i, im = imgs[idx], top = y + i * ROW;
          c.fillStyle = "#fff"; rr(c, PAD, top + 6, W - PAD * 2, ROW - 12, 22); c.fill();
          c.strokeStyle = "#e2e8f0"; c.lineWidth = 2; c.stroke();
          // الرقم
          c.fillStyle = pri; c.beginPath(); c.arc(W - PAD - 38, top + ROW / 2, 24, 0, Math.PI * 2); c.fill();
          c.fillStyle = "#fff"; c.textAlign = "center"; c.font = "800 24px " + font; c.fillText(String(idx + 1), W - PAD - 38, top + ROW / 2 + 1);
          // الصورة
          var ix = W - PAD - 82 - 118, iy = top + 16, is = ROW - 32;
          c.save(); rr(c, ix, iy, is, is, 16); c.clip();
          if (im) { var s = Math.max(is / im.width, is / im.height), dw = im.width * s, dh = im.height * s; c.drawImage(im, ix + (is - dw) / 2, iy + (is - dh) / 2, dw, dh); }
          else { c.fillStyle = "#eef2f7"; c.fillRect(ix, iy, is, is); c.fillStyle = "#94a3b8"; c.font = "54px " + font; c.fillText("📦", ix + is / 2, iy + is / 2 + 4); }
          c.restore();
          // الاسم والنوع
          var nx = ix - 24, maxW = nx - (PAD + 190);
          c.textAlign = "right"; c.fillStyle = "#0f172a"; c.font = "800 34px " + font;
          var nl = wrap(c, String(l.name).trim(), maxW, 2), subs = [];
          if (l.cat) subs.push("النوع: " + l.cat); if (l.code) subs.push("كود " + l.code);
          var sub = subs.join("  •  "), lineH = 40, blockH = nl.length * lineH + (sub ? 34 : 0) + (l.note ? 32 : 0), sy = top + ROW / 2 - blockH / 2 + lineH / 2;
          nl.forEach(function (t, k) { c.fillText(t, nx, sy + k * lineH); });
          var yy = sy + nl.length * lineH - 4;
          if (sub) { c.fillStyle = "#475569"; c.font = "600 25px " + font; c.fillText(wrap(c, sub, maxW, 1)[0], nx, yy); yy += 32; }
          if (l.note) { c.fillStyle = "#b45309"; c.font = "500 24px " + font; c.fillText(wrap(c, "📝 " + l.note, maxW, 1)[0], nx, yy); }
          // العدد
          c.fillStyle = pri; rr(c, PAD + 18, top + ROW / 2 - 44, 124, 88, 20); c.fill();
          c.fillStyle = "#fff"; c.textAlign = "center"; c.font = "800 44px " + font; c.fillText(String(Math.round(num(l.qty))), PAD + 80, top + ROW / 2 - 4);
          c.font = "600 18px " + font; c.globalAlpha = .85; c.fillText("قطعة", PAD + 80, top + ROW / 2 + 30); c.globalAlpha = 1;
        });
        // الفوتر
        var fy = y + slice.length * ROW + 20; c.textAlign = "right";
        if (last) {
          if (d.note) { c.fillStyle = "#0f172a"; c.font = "500 28px " + font; wrap(c, "📝 " + d.note, W - PAD * 2 - 40, 4).forEach(function (t, k) { c.fillText(t, W - PAD - 10, fy + 20 + k * 40); }); fy += noteLines * 40 + 10; }
          c.fillStyle = pri; c.font = "700 30px " + font; c.fillText("برجاء تأكيد المتوفر والأسعار 🙏", W - PAD - 10, fy + 40);
        }
        c.fillStyle = "#94a3b8"; c.font = "500 20px " + font; c.textAlign = "center"; c.fillText(brandName(), W / 2, H - 28);
        pages.push(cv);
      }
      return pages;
    });
  }
  function toBlob(cv) { return new Promise(function (res) { if (cv.toBlob) cv.toBlob(function (b) { res(b); }, "image/png"); else res(null); }); }
  function fileName(i, n) { var dt = new Date(), k = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0"); return "طلبية-" + k + (n > 1 ? "-" + (i + 1) : "") + ".png"; }

  /* ---------------- السجل وجهات الاتصال ---------------- */
  function rememberSupplier(d) {
    var name = String(d.supplier || "").trim(), phone = String(d.phone || "").trim(); if (!name && !phone) return;
    var list = load(SUP_KEY, []).filter(function (s) { return s && !(s.name === name && (s.phone || "") === phone); });
    list.unshift({ name: name, phone: phone }); save(SUP_KEY, list.slice(0, 15));
  }
  function logSent(d, how) {
    var h = load(HIST_KEY, []); if (!Array.isArray(h)) h = [];
    h.unshift({ id: newKey(), at: new Date().toISOString(), how: how, supplier: d.supplier || "", phone: d.phone || "", note: d.note || "",
      lines: validLines(d).map(function (l) { return { partId: l.partId || null, name: l.name, cat: l.cat || "", code: l.code || "", qty: Math.round(num(l.qty)), note: l.note || "" }; }) });
    save(HIST_KEY, h.slice(0, 30)); rememberSupplier(d);
  }

  /* ---------------- الواجهة ---------------- */
  function css() {
    if (document.getElementById("wfPoCss")) return;
    var s = document.createElement("style"); s.id = "wfPoCss";
    s.textContent = ".wf-po{position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}" +
      "@media(min-width:700px){.wf-po{align-items:center;padding:12px}}" +
      ".wf-po-card{background:var(--bg-elevated,#fff);color:var(--text,#111);border-radius:18px 18px 0 0;width:100%;max-width:620px;max-height:94vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,.4)}" +
      "@media(min-width:700px){.wf-po-card{border-radius:18px}}" +
      ".wf-po-head{padding:14px 16px 8px;border-bottom:1px solid var(--border,#e5e7eb)}.wf-po-head h3{margin:0;display:flex;justify-content:space-between;align-items:center;gap:8px}" +
      ".wf-po-body{padding:10px 16px;overflow:auto;flex:1}.wf-po-foot{padding:10px 16px 14px;border-top:1px solid var(--border,#e5e7eb);display:flex;flex-wrap:wrap;gap:8px}" +
      ".wf-po-foot button{flex:1 1 45%;min-height:46px}" +
      ".wf-po-row2{display:flex;gap:8px}.wf-po-row2>*{flex:1;min-width:0}.wf-po input,.wf-po textarea{width:100%;box-sizing:border-box}" +
      ".wf-po label{display:block;font-size:13px;font-weight:700;margin:8px 0 4px}" +
      ".wf-po-tools{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 6px}.wf-po-tools button{flex:1 1 auto}" +
      ".wf-po-res{max-height:200px;overflow:auto;border:1px solid var(--border,#ddd);border-radius:10px;margin-top:4px}" +
      ".wf-po-res button{display:flex;justify-content:space-between;gap:8px;width:100%;text-align:start;background:none;border:0;border-bottom:1px solid var(--border,#eee);padding:9px 10px;color:inherit;cursor:pointer;font:inherit}" +
      ".wf-po-res small{color:var(--text-muted,#666)}" +
      ".wf-po-line{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border,#eee)}" +
      ".wf-po-ph{flex:0 0 64px;width:64px;height:64px;border-radius:12px;background:var(--surface-2,rgba(127,127,127,.12));display:flex;align-items:center;justify-content:center;font-size:26px;overflow:hidden;cursor:pointer;border:1px dashed var(--border,#ccc);padding:0}" +
      ".wf-po-ph img{width:100%;height:100%;object-fit:cover}" +
      ".wf-po-mid{flex:1;min-width:0}.wf-po-mid b{display:block;font-size:15px}.wf-po-mid small{color:var(--text-muted,#666)}" +
      ".wf-po-mid input{margin-top:6px;font-size:13px;padding:6px 8px}" +
      ".wf-po-qty{display:flex;align-items:center;gap:4px}.wf-po-qty button{width:34px;height:34px;padding:0;border-radius:10px}.wf-po-qty input{width:52px;text-align:center;padding:6px 2px}" +
      ".wf-po-x{background:none;border:0;color:#c0392b;font-size:18px;cursor:pointer;padding:4px}" +
      ".wf-po-empty{text-align:center;color:var(--text-muted,#666);padding:24px 8px}" +
      ".wf-po-prev{text-align:center}.wf-po-prev img{max-width:100%;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.2);margin-bottom:8px}" +
      ".wf-po-count{font-size:13px;font-weight:600;color:var(--text-muted,#666)}";
    document.head.appendChild(s);
  }

  function open(opts) {
    opts = opts || {};
    css(); var old = document.querySelector(".wf-po"); if (old) old.remove();
    var d = getDraft(), autoAdded = 0;
    if (opts.addPartId) addPartToDraft(d, opts.addPartId);
    if (!d.lines.length && !opts.addPartId) autoAdded = addShortages(d);
    setDraft(d);
    var ov = document.createElement("div"); ov.className = "wf-po"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
    var sups = load(SUP_KEY, []);
    ov.innerHTML = '<div class="wf-po-card"><div class="wf-po-head"><h3><span>🧾 طلبية للمورد</span><button type="button" class="secondary small-btn" data-po="close">✕</button></h3>' +
      '<div class="hint">النواقص بتتضاف لوحدها. عدّل العدد، صوّر أي قطعة لو حابب، وابعتها للمورد صورة على واتساب.</div></div>' +
      '<div class="wf-po-body" data-po="body"></div>' +
      '<div class="wf-po-foot"><button type="button" class="primary" data-po="share">📤 ابعت صورة (واتساب)</button><button type="button" class="secondary" data-po="text">💬 ابعت كنص</button>' +
      '<button type="button" class="secondary" data-po="preview">🖼️ معاينة الصورة</button><button type="button" class="secondary" data-po="clear">🗑️ طلبية جديدة</button></div></div>';
    document.body.appendChild(ov);
    var body = ov.querySelector('[data-po="body"]'), picker = document.createElement("input");
    picker.type = "file"; picker.accept = "image/*"; picker.className = "hidden"; ov.appendChild(picker);
    var pickFor = null, searchQ = "", showSearch = false;
    function close() { ov.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(ev) { if (ev.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", function (ev) { if (ev.target === ov) close(); });

    function thumb(l) {
      return lineSrc(l).then(function (src) {
        var el = body.querySelector('[data-ph="' + l.key + '"]'); if (el && src) el.innerHTML = '<img alt="" src="' + e(src) + '">';
      });
    }
    function resHtml() {
      var q = searchQ.trim().toLowerCase(), have = {}; d.lines.forEach(function (l) { if (l.partId) have[l.partId] = 1; });
      var list = partsList().filter(function (p) { return !q || String(p.name || "").toLowerCase().indexOf(q) >= 0 || String(p.code || "").toLowerCase().indexOf(q) >= 0; }).slice(0, 40);
      return '<div class="wf-po-res">' + list.map(function (p) { return '<button type="button" data-add="' + e(p.id) + '"><span>' + (have[p.id] ? "✅ " : "📦 ") + e(p.name) + (p.category ? ' <small>' + e(p.category) + '</small>' : "") + '</span><small>عندك ' + num(p.qty) + '</small></button>'; }).join("") +
        (q ? '<button type="button" data-addnew="1"><span>➕ «' + e(searchQ.trim()) + '» — صنف مش في المخزن</span></button>' : "") +
        (!list.length && !q ? '<div class="wf-po-empty">مفيش أصناف.</div>' : "") + '</div>';
    }
    function render() {
      var ls = d.lines, tq = ls.reduce(function (a, l) { return a + Math.round(num(l.qty)); }, 0);
      body.innerHTML =
        '<div class="wf-po-row2"><div><label>المورد</label><input data-f="supplier" list="wfPoSup" maxlength="60" placeholder="اسم المورد (اختياري)" value="' + e(d.supplier) + '"></div>' +
        '<div><label>رقم واتساب المورد</label><input data-f="phone" type="tel" inputmode="tel" dir="ltr" maxlength="20" placeholder="01xxxxxxxxx" value="' + e(d.phone) + '"></div></div>' +
        '<datalist id="wfPoSup">' + sups.map(function (s) { return '<option value="' + e(s.name) + '">' + e(s.phone || "") + '</option>'; }).join("") + '</datalist>' +
        '<div class="wf-po-tools"><button type="button" class="secondary small-btn" data-po="short">⚠️ ضيف النواقص</button><button type="button" class="secondary small-btn" data-po="search">' + (showSearch ? "✕ قفل البحث" : "➕ ضيف صنف") + '</button></div>' +
        (showSearch ? '<input data-po="q" type="search" placeholder="🔍 اسم القطعة أو الكود — أو اكتب اسم صنف جديد" autocomplete="off" value="' + e(searchQ) + '"><div data-po="res">' + resHtml() + '</div>' : "") +
        '<div class="wf-po-count">' + (ls.length ? ls.length + " صنف • " + tq + " قطعة" : "") + '</div>' +
        (ls.length ? ls.map(function (l) {
          return '<div class="wf-po-line" data-k="' + e(l.key) + '"><button type="button" class="wf-po-ph" data-ph="' + e(l.key) + '" title="صورة القطعة">📷</button>' +
            '<div class="wf-po-mid"><b>' + e(l.name) + '</b><small>' + e([l.cat ? "النوع: " + l.cat : "", l.code ? "كود " + l.code : "", l.partId ? "" : "صنف جديد"].filter(Boolean).join(" • ")) + '</small>' +
            (l.partId ? "" : '<input data-lf="cat" placeholder="النوع / الماركة (اختياري)" maxlength="40" value="' + e(l.cat) + '">') +
            '<input data-lf="note" placeholder="ملاحظة للمورد (مقاس، ماركة...)" maxlength="80" value="' + e(l.note) + '"></div>' +
            '<div><div class="wf-po-qty"><button type="button" class="secondary" data-q="1">+</button><input data-lf="qty" type="number" inputmode="numeric" min="1" step="1" value="' + Math.round(num(l.qty)) + '"><button type="button" class="secondary" data-q="-1">−</button></div>' +
            '<div style="text-align:center"><button type="button" class="wf-po-x" data-del="1" title="شيل الصنف">🗑️</button>' + (l.photo || (l.usePartPhoto && l.partId) ? '<button type="button" class="wf-po-x" data-rmph="1" title="شيل الصورة" style="font-size:13px">✕ الصورة</button>' : "") + '</div></div></div>';
        }).join("") : '<div class="wf-po-empty">الطلبية فاضية 👌<br>مفيش نواقص دلوقتي — اضغط «➕ ضيف صنف» لو عايز تطلب حاجة.</div>') +
        '<label>ملاحظة عامة (اختياري)</label><textarea data-f="note" rows="2" maxlength="300" placeholder="مثلًا: محتاجها قبل الخميس، ابعت الأسعار الأول">' + e(d.note) + '</textarea>' +
        '<div class="wf-po-prev" data-po="prev"></div>';
      ls.forEach(thumb);
      if (showSearch) { var qi = body.querySelector('[data-po="q"]'); if (qi) { qi.focus(); try { qi.setSelectionRange(qi.value.length, qi.value.length); } catch (x) {} } }
    }
    function persist() { return setDraft(d); }
    function lineOf(el) { var row = el.closest("[data-k]"); return row ? d.lines.find(function (l) { return l.key === row.getAttribute("data-k"); }) : null; }

    body.addEventListener("input", function (ev) {
      var t = ev.target;
      if (t.matches('[data-po="q"]')) { searchQ = t.value; var rb = body.querySelector('[data-po="res"]'); if (rb) rb.innerHTML = resHtml(); return; }
      if (t.hasAttribute("data-f")) {
        var f = t.getAttribute("data-f"); d[f] = t.value;
        if (f === "supplier") { var m = sups.find(function (s) { return s.name === t.value; }); if (m && m.phone && !d.phone) { d.phone = m.phone; var pi = body.querySelector('[data-f="phone"]'); if (pi) pi.value = m.phone; } }
        persist(); return;
      }
      var l = lineOf(t); if (!l || !t.hasAttribute("data-lf")) return;
      var k = t.getAttribute("data-lf");
      if (k === "qty") { var v = Math.round(num(t.value)); if (v >= 1) l.qty = v; } else l[k] = t.value;
      persist();
      if (k === "qty") { var c = body.querySelector(".wf-po-count"); if (c) c.textContent = d.lines.length + " صنف • " + d.lines.reduce(function (a, x) { return a + Math.round(num(x.qty)); }, 0) + " قطعة"; }
    });
    body.addEventListener("click", function (ev) {
      var t = ev.target.closest("button"); if (!t) return;
      var po = t.getAttribute("data-po");
      if (po === "short") { var n = addShortages(d); persist(); render(); if (!n) alert("مفيش نواقص جديدة غير اللي في الطلبية 👌"); return; }
      if (po === "search") { showSearch = !showSearch; searchQ = ""; render(); return; }
      if (t.hasAttribute("data-add")) { addPartToDraft(d, t.getAttribute("data-add")); persist(); searchQ = ""; render(); return; }
      if (t.hasAttribute("data-addnew")) { var nm = searchQ.trim(); if (nm && d.lines.length < MAX_LINES) d.lines.push({ key: newKey(), partId: null, name: nm, cat: "", code: "", qty: 1, note: "", photo: "", usePartPhoto: false }); persist(); searchQ = ""; showSearch = false; render(); return; }
      var l = lineOf(t); if (!l) return;
      if (t.hasAttribute("data-q")) { l.qty = Math.max(1, Math.round(num(l.qty)) + (+t.getAttribute("data-q"))); persist(); var inp = t.parentNode.querySelector("input"); if (inp) inp.value = l.qty; var c = body.querySelector(".wf-po-count"); if (c) c.textContent = d.lines.length + " صنف • " + d.lines.reduce(function (a, x) { return a + Math.round(num(x.qty)); }, 0) + " قطعة"; return; }
      if (t.hasAttribute("data-del")) { d.lines = d.lines.filter(function (x) { return x !== l; }); persist(); render(); return; }
      if (t.hasAttribute("data-rmph")) { l.photo = ""; l.usePartPhoto = false; persist(); render(); return; }
      if (t.hasAttribute("data-ph")) { pickFor = l.key; picker.value = ""; picker.click(); }
    });
    picker.addEventListener("change", function () {
      var f = picker.files && picker.files[0], l = d.lines.find(function (x) { return x.key === pickFor; }); if (!f || !l) return;
      Promise.resolve(typeof imageToDataURL === "function" ? imageToDataURL(f, 640, 0.72) : "").then(function (url) {
        if (!url) return; l.photo = url; l.usePartPhoto = false;
        if (!persist()) alert("الصورة كبيرة على مساحة الجهاز — جرّب صورة تانية.");
        render();
      }).catch(function () { alert("تعذّر قراءة الصورة."); });
    });
    function needLines() { if (!validLines(d).length) { alert("الطلبية فاضية — ضيف أصناف الأول."); return false; } return true; }
    function busy(btn, on) { if (btn) { btn.disabled = on; if (on) { btn.dataset.t = btn.textContent; btn.textContent = "⏳ ..."; } else if (btn.dataset.t) btn.textContent = btn.dataset.t; } }
    function afterSend(how) {
      logSent(d, how);
      if (confirm("✅ تمام! تفرّغ الطلبية دي وتبدأ واحدة جديدة المرة الجاية؟\n\n(إلغاء = تسيبها زي ما هي)")) { d = emptyDraft(); persist(); close(); }
    }
    ov.querySelector(".wf-po-foot").addEventListener("click", function (ev) {
      var t = ev.target.closest("button"); if (!t) return; var po = t.getAttribute("data-po");
      if (po === "clear") { if (!d.lines.length || confirm("تفريغ الطلبية الحالية والبدء من جديد؟")) { d = emptyDraft(); addShortages(d); persist(); render(); } return; }
      if (po === "text") {
        if (!needLines()) return;
        var url = "https://wa.me/" + waPhone(d.phone) + "?text=" + encodeURIComponent(orderText(d));
        window.open(url, "_blank", "noopener"); afterSend("text"); return;
      }
      if (po === "preview") {
        if (!needLines()) return; busy(t, true);
        renderPages(d).then(function (pages) {
          var box = body.querySelector('[data-po="prev"]'); if (!box) return;
          box.innerHTML = pages.map(function (cv) { return '<img alt="معاينة الطلبية" src="' + cv.toDataURL("image/png") + '">'; }).join("");
          box.scrollIntoView({ behavior: "smooth", block: "start" });
        }).catch(function () { alert("تعذّر تجهيز الصورة."); }).then(function () { busy(t, false); });
        return;
      }
      if (po === "share") {
        if (!needLines()) return; busy(t, true);
        renderPages(d).then(function (pages) { return Promise.all(pages.map(toBlob)); }).then(function (blobs) {
          var files = blobs.filter(Boolean).map(function (b, i) { return new File([b], fileName(i, blobs.length), { type: "image/png" }); });
          var text = "🧾 طلبية قطع غيار — " + brandName() + (d.supplier ? " إلى " + d.supplier : "");
          if (files.length && navigator.canShare && navigator.canShare({ files: files })) {
            return navigator.share({ files: files, text: text }).then(function () { afterSend("image"); }, function (err) { if (err && err.name !== "AbortError") throw err; });
          }
          // المتصفح مش بيدعم مشاركة الصور: نحمّلها ونفتح شات المورد
          files.forEach(function (f) { var a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); });
          alert("✅ الصورة اتحفظت على جهازك.\nهفتحلك واتساب" + (d.phone ? " على شات المورد" : "") + " — ابعتها له من المعرض 📎.");
          window.open("https://wa.me/" + waPhone(d.phone) + "?text=" + encodeURIComponent(text), "_blank", "noopener");
          afterSend("image");
        }).catch(function () { alert("تعذّر تجهيز الصورة — جرّب «ابعت كنص»."); }).then(function () { busy(t, false); });
      }
    });
    ov.querySelector('[data-po="close"]').addEventListener("click", close);
    render();
    if (autoAdded) { var c = body.querySelector(".wf-po-count"); if (c) c.textContent = "⚠️ اتضاف " + autoAdded + " صنف ناقص لوحده — " + c.textContent; }
  }

  window.openSupplierOrder = function () { open(); };
  window.addPartToSupplierOrder = function (pid) { open({ addPartId: pid }); };
  window.WFSupplierOrder = { shortages: shortages, suggestQty: suggestQty, orderText: orderText, waPhone: waPhone, getDraft: getDraft, addShortages: addShortages, addPartToDraft: addPartToDraft, renderPages: renderPages, open: open };
})();
