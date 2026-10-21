/* =========================================================
   🤖 أدوات الذكاء الاصطناعي في باقي الأقسام (app-ai-tools.js) — بيعتمد على app-ai.js (WFAI)
   - 🧯 أكواد الأعطال: معنى كود مش متسجّل، قراية الكود من صورة الشاشة، تكملة السبب/الحل للأكواد الناقصة.
   - 💬 رسالة واتساب للعميل من صفحة أمر الشغل (بيانات العميل بتتملي على الجهاز، مش بتتبعت).
   - 🎙️ أمر شغل سريع بالكلام (الرئيسية).
   - 🏷️ صورة لوحة بيانات الجهاز (إضافة جهاز).
   - 🧾 توريد من صورة فاتورة المورد + 🧹 تنظيف أسماء المخزن (المخزن).
   - 📊 ملخص التقارير بالكلام (التقارير).
   القاعدة: الذكاء الاصطناعي بيقترح ويملا — والحفظ دايمًا بإيدك بعد المراجعة.
   كل أداة بتظهر بس لو المالك مشغّل الميزة بتاعتها من الإعدادات.
   ========================================================= */
(function (w) {
  "use strict";
  var d = w.document;
  function AI() { return w.WFAI; }
  function on(f) { try { return !!(AI() && AI().isOn(f)); } catch (e) { return false; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return d.getElementById(id); }
  function A(k) { try { return (typeof w.arr === "function" && k ? w.arr(k) : []) || []; } catch (e) { return []; } }
  function K() { return w.K || {}; }
  function S() { try { return typeof w.settings === "function" ? w.settings() || {} : {}; } catch (e) { return {}; } }
  function task(name, data) { if (!AI()) return Promise.reject(new Error("الصفحة لسه بتحمّل — جرّب كمان ثانية.")); if (navigator.onLine === false) return Promise.reject(new Error("مفيش إنترنت — الأداة دي محتاجة نت.")); return AI().call("aiTask", Object.assign({ task: name }, data || {})); }
  function can(p) { try { return !w.WFPerm || !w.WFPerm.can || w.WFPerm.can(p); } catch (e) { return true; } }
  function conf(c) { var m = { "عالي": "wf-ai-ok", "متوسط": "wf-ai-md", "ضعيف": "wf-ai-hi" }; /* الثقة: أخضر = واضح، أحمر = راجعه */ return "<span class='wf-ai-chip " + (m[c] || "wf-ai-md") + "'>ثقة: " + esc(c || "متوسط") + "</span>"; }
  function setVal(id, v) { var e = $(id); if (e && v != null) { e.value = v; try { e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); } catch (x) {} } }
  /* الماركة بالكتابة الموحدة بتاعة النظام (LG → إل جي) */
  function canonBrand(v) { try { if (v && typeof w.wfCanonicalBrand === "function") return w.wfCanonicalBrand(v) || v; } catch (e) {} return v; }
  function setList(id, v) { if (/Brand$/.test(id)) v = canonBrand(v); if (!v || !$(id)) return false; if (typeof w.selectListOption === "function") w.selectListOption(id, v); else setVal(id, v); return true; }
  function lists() {
    var s = S(), types = Object.keys(s.types || {}), cats = {};
    types.forEach(function (t) { cats[t] = (s.types[t] || []).slice(0, 40); });
    var brands = typeof w.wfBrandList === "function" ? w.wfBrandList(s.brands) : (s.brands || []);
    return { types: types, categories: cats, brands: (brands || []).slice(0, 250), centers: (s.centers || []).slice(0, 80), villages: s.villages || {} };
  }

  /* ---------- مشترك: CSS + نافذة + صورة ---------- */
  function css() {
    try { AI() && AI().css(); } catch (e) {}
    if ($("wfAiToolsCss")) return;
    var st = d.createElement("style"); st.id = "wfAiToolsCss";
    st.textContent = ".wf-ai-tool{margin:8px 0;padding:10px 12px;border:1px dashed rgba(124,58,237,.45);border-radius:12px;background:rgba(124,58,237,.05)}.wf-ai-tool .wf-ai-row2{display:flex;gap:8px;flex-wrap:wrap;align-items:center}" +
      ".wf-ai-tool textarea,.wf-ai-modal textarea{width:100%;box-sizing:border-box;border-radius:10px;padding:8px;font:inherit;min-height:70px}.wf-ai-res{margin-top:8px;font-size:14px;line-height:1.7}.wf-ai-res ul{margin:4px 0;padding-inline-start:20px}" +
      ".wf-ai-mask{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;display:flex;align-items:flex-end;justify-content:center}@media(min-width:760px){.wf-ai-mask{align-items:center}}" +
      ".wf-ai-modal{background:var(--bg-elevated,#fff);color:inherit;width:100%;max-width:760px;max-height:92vh;overflow:auto;border-radius:16px 16px 0 0;padding:14px 14px 18px;box-sizing:border-box;overflow-wrap:anywhere}@media(min-width:760px){.wf-ai-modal{border-radius:16px}}" +
      "[data-theme=dark] .wf-ai-modal{background:#121a2b}.wf-ai-modal h3{margin:0 0 8px;display:flex;justify-content:space-between;gap:8px;align-items:center}.wf-ai-x{background:transparent;border:0;font-size:22px;cursor:pointer;color:inherit}" +
      ".wf-ai-card{border:1px solid rgba(127,127,127,.25);border-radius:12px;padding:9px 10px;margin:8px 0}.wf-ai-card.off{opacity:.5}.wf-ai-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:6px}.wf-ai-grid label{font-size:12.5px;display:block}.wf-ai-grid input,.wf-ai-grid select{width:100%;box-sizing:border-box}" +
      ".wf-ai-kinds{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.wf-ai-kinds button.on{background:#6d28d9;color:#fff;border-color:#6d28d9}.wf-ai-sum{padding:10px 0 0;border-top:1px solid rgba(127,127,127,.2);margin-top:10px}" +
      ".wf-ai-shots{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.wf-ai-shot{position:relative;width:96px;height:120px;border-radius:10px;overflow:hidden;border:1px solid rgba(127,127,127,.3)}.wf-ai-shot img{width:100%;height:100%;object-fit:cover;cursor:zoom-in}.wf-ai-shot .wf-ai-x{position:absolute;top:0;inset-inline-end:2px;background:rgba(0,0,0,.55);color:#fff;border-radius:50%;width:26px;height:26px;font-size:18px;line-height:24px;padding:0}" +
      ".wf-ai-unsure{outline:2px solid #f59e0b!important;background:rgba(245,158,11,.12)!important}" +
      ".wf-ai-mic.rec{background:#b91c1c!important;color:#fff;border-color:#b91c1c!important;animation:wfaipulse 1.2s infinite}@keyframes wfaipulse{50%{opacity:.6}}";
    (d.head || d.documentElement).appendChild(st);
  }
  function modal(title) {
    css();
    var mask = d.createElement("div"); mask.className = "wf-ai-mask";
    var box = d.createElement("div"); box.className = "wf-ai-modal"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    box.innerHTML = "<h3><span>" + esc(title) + "</span><button type='button' class='wf-ai-x' aria-label='إغلاق'>×</button></h3><div class='wf-ai-body'></div>";
    mask.appendChild(box); d.body.appendChild(mask);
    var close = function () { if (mask.parentNode) mask.parentNode.removeChild(mask); };
    box.querySelector(".wf-ai-x").onclick = close;
    mask.addEventListener("click", function (e) { if (e.target === mask) close(); });
    return { body: box.querySelector(".wf-ai-body"), close: close, box: box };
  }
  /* اختيار صورة (كاميرا أو معرض) وتصغيرها لـ 1600 بكسل JPEG — الصورة مش بتتخزن، بتتبعت للتحليل بس */
  function pickImage(max, limit) {
    return new Promise(function (resolve, reject) {
      var inp = d.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.style.display = "none"; d.body.appendChild(inp);
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; d.body.removeChild(inp);
        if (!f) return reject(new Error("cancel"));
        shrink(f, max || 1600, limit).then(resolve, reject);
      };
      inp.click();
    });
  }
  function shrink(f, max, limit) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(f), img = new Image();
      img.onload = function () {
        var sc = Math.min(1, max / Math.max(img.width, img.height)), c = d.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * sc)); c.height = Math.max(1, Math.round(img.height * sc));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        var q = 0.85, du = c.toDataURL("image/jpeg", q);
        if (limit) { q = 0.9; du = c.toDataURL("image/jpeg", q); }
        while (du.length > (limit || 2000000) && q > 0.4) { q -= 0.15; du = c.toDataURL("image/jpeg", q); }
        resolve({ mime: "image/jpeg", data: du.split(",")[1], dataURL: du });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("الملف ده مش صورة أو مش مدعوم.")); };
      img.src = url;
    });
  }
  function busyBtn(b, label) { if (!b) return function () {}; var old = b.innerHTML; b.disabled = true; b.innerHTML = "⏳ " + esc(label || "بيحلّل…"); return function () { b.disabled = false; b.innerHTML = old; }; }
  function fail(e, box) { var m = (e && e.message) || "تعذّر — جرّب تاني."; if (m === "cancel") return; if (box) box.innerHTML = "<div class='wf-ai-err'>⚠️ " + esc(m) + "</div>"; else w.alert(m); }
  function foot(r) { return "<div class='wf-ai-foot'>مقترح من الذكاء الاصطناعي — راجعه قبل الحفظ" + (r && r.cost ? " • التكلفة ≈ " + (r.cost < 0.01 ? "أقل من سنت" : "$" + (+r.cost).toFixed(3)) : "") + "</div>"; }

  /* =====================================================================
     🧯 أكواد الأعطال
     ===================================================================== */
  function codesPage() {
    var form = $("faultForm"); if (!form || !$("fcCode")) return;
    var bar = $("wfAiCodeBar");
    if (!on("codes")) { if (bar) bar.style.display = "none"; codesFillBtn(); bookBtn(); return; }
    css();
    if (!bar) {
      bar = d.createElement("div"); bar.id = "wfAiCodeBar"; bar.className = "wf-ai-tool wide";
      bar.innerHTML = "<div class='wf-ai-row2'><b>🤖 مساعد الأكواد</b><button type='button' class='wf-ai-btn' data-x='lookup'>🤖 املا المعنى والسبب والحل</button><button type='button' class='wf-ai-btn2' data-x='photo'>📷 اقرا الكود من صورة الشاشة</button></div><small class='hint'>اكتب الكود ونوع الجهاز والماركة (كل ما تحدد أكتر كل ما يبقى أدق)، وبعدين راجع وعدّل قبل الحفظ.</small><div class='wf-ai-res' id='wfAiCodeRes'></div>";
      var grid = form.querySelector(".form-grid"); (grid ? grid.parentNode : form).insertBefore(bar, grid || form.firstChild);
      bar.querySelector("[data-x=lookup]").onclick = function () { codeLookup(this); };
      bar.querySelector("[data-x=photo]").onclick = function () { codePhoto(this); };
    }
    bar.style.display = "";
    codesFillBtn(); bookBtn();
    var q = new URLSearchParams(location.search);
    if (q.get("ai") === "1" && q.get("code") && !codesPage._auto) {
      codesPage._auto = 1;
      codesPage._model = q.get("model") || "";
      // بعد ما الصفحة تخلص تجهيز الفورم (initFaultCodes بيفضّي النوع/الماركة)، وبعدين نملا ونسأل
      setTimeout(function () {
        form.classList.remove("hidden");
        setVal("fcCode", q.get("code"));
        var L = lists(), b = canonBrand(q.get("brand") || "");
        if (q.get("type") && L.types.indexOf(q.get("type")) > -1) setList("fcDeviceType", q.get("type"));
        if (b && L.brands.indexOf(b) > -1) setList("fcBrand", b);
        bar.scrollIntoView({ behavior: "smooth", block: "center" }); codeLookup(bar.querySelector("[data-x=lookup]"));
      }, 700);
    }
  }
  function codeLookup(btn) {
    var res = $("wfAiCodeRes"), code = ($("fcCode").value || "").trim();
    if (!code) { res.innerHTML = "<div class='wf-ai-err'>اكتب الكود الأول (أو صوّر الشاشة).</div>"; return; }
    var type = ($("fcDeviceType") || {}).value || "", brand = ($("fcBrand") || {}).value || "";
    var known = A(K().fc).filter(function (f) { return f && (!brand || f.brand === brand) && (!type || f.deviceType === type); }).slice(0, 30).map(function (f) { return { code: f.code, title: f.title }; });
    var done = busyBtn(btn, "بيدوّر…"); res.innerHTML = "";
    task("codeLookup", { code: code, deviceType: type, brand: brand, model: codesPage._model || "", symptom: ($("fcTitle") || {}).value || "", known: known }).then(function (r) {
      var filled = [];
      [["fcTitle", r.title], ["fcCause", r.cause], ["fcFix", r.fix]].forEach(function (x) {
        var e = $(x[0]); if (!e || !x[1]) return;
        if (!e.value.trim() || w.confirm("خانة «" + (x[0] === "fcTitle" ? "الوصف" : x[0] === "fcCause" ? "السبب" : "الحل") + "» فيها كلام. أستبدله باقتراح الذكاء الاصطناعي؟")) { setVal(x[0], x[1]); filled.push(x[0]); }
      });
      var tag = "🤖 مقترح من الذكاء الاصطناعي (ثقة " + r.confidence + ")" + (r.note ? " — " + r.note : "") + " — اتأكد قبل الاعتماد.";
      if ($("fcNote") && $("fcNote").value.indexOf("🤖 مقترح") < 0) setVal("fcNote", ($("fcNote").value ? $("fcNote").value + "\n" : "") + tag);
      res.innerHTML = conf(r.confidence) + (r.recognized ? "" : " <b>الكود مش معروف بالتأكيد للماركة دي</b>") + (r.note ? "<div class='hint'>" + esc(r.note) + "</div>" : "") + "<div class='hint'>" + (filled.length ? "✅ اتملت الخانات — راجعها وبعدين دوس حفظ." : "ماتغيّرش حاجة.") + "</div>" + foot(r);
    }, function (e) { fail(e, res); }).then(done);
  }
  function codePhoto(btn) {
    var res = $("wfAiCodeRes"), L = lists(), done = function () {};
    pickImage(1400).then(function (im) {
      done = busyBtn(btn, "بيقرا الصورة…"); res.innerHTML = "";
      return task("codePhoto", { image: { mime: im.mime, data: im.data }, types: L.types, brands: L.brands });
    }).then(function (r) {
      if (!r) return;
      if (!r.codes.length) { res.innerHTML = "<div class='wf-ai-err'>مالقيتش كود واضح في الصورة.</div>" + (r.note ? "<div class='hint'>" + esc(r.note) + "</div>" : ""); return; }
      if (r.deviceType && !($("fcDeviceType") || {}).value) setList("fcDeviceType", r.deviceType);
      if (r.brand && !($("fcBrand") || {}).value) setList("fcBrand", r.brand);
      var h = "<div>📷 اتقرا من الشاشة: " + r.codes.map(function (c, i) { return "<button type='button' class='wf-ai-btn2" + (i ? "" : " on") + "' data-code='" + esc(c) + "'>" + esc(c) + "</button>"; }).join(" ") + "</div>" + (r.note ? "<div class='hint'>" + esc(r.note) + "</div>" : "");
      res.innerHTML = h + "<div id='wfAiCodeHit'></div>";
      var choose = function (c) {
        setVal("fcCode", c);
        Array.prototype.forEach.call(res.querySelectorAll("[data-code]"), function (b) { b.classList.toggle("on", b.getAttribute("data-code") === c); });
        var n = function (v) { return String(v || "").toLowerCase().replace(/[\s\-_.]/g, ""); }, b2 = ($("fcBrand") || {}).value || "";
        var hit = A(K().fc).filter(function (f) { return f && n(f.code) === n(c) && (!b2 || !f.brand || f.brand === b2); })[0];
        $("wfAiCodeHit").innerHTML = hit ? "<div class='hint'>✅ الكود ده متسجّل عندك: <a href='faultcode.html?id=" + encodeURIComponent(hit.id) + "'><b>" + esc(hit.code) + " — " + esc(hit.title || "") + "</b></a></div>" : "<div class='hint'>مش متسجّل — دوس «🤖 املا المعنى» عشان تعرف معناه وتسجّله.</div>";
      };
      Array.prototype.forEach.call(res.querySelectorAll("[data-code]"), function (b) { b.onclick = function () { choose(b.getAttribute("data-code")); }; });
      choose(r.codes[0]);
    }, function (e) { fail(e, res); }).then(function () { done(); });
  }
  /* 📚 صفحة كتالوج/كتاب/جدول → أكواد منظمة بنفس شكل الدليل */
  function bookBtn() {
    var list = $("faultList"), b = $("wfAiBook"); if (!list) return;
    if (!on("codes") || !can("faultcodes.add")) { if (b) b.style.display = "none"; return; }
    css();
    if (!b) {
      b = d.createElement("div"); b.id = "wfAiBook"; b.className = "wf-ai-tool";
      b.innerHTML = "<div class='wf-ai-row2'><span>📚 عندك كتالوج خدمة أو كتاب (PDF أو صور)؟</span><button type='button' class='wf-ai-btn'>📚 استورد أكواد وتيست مود</button></div><small class='hint'>بيطلّع أكواد الأعطال والتيست مود كل واحد لوحده بنفس شكل الدليل، وتراجعهم قبل الحفظ.</small>";
      list.parentNode.insertBefore(b, $("wfAiCodeFill") || list);
      b.querySelector("button").onclick = bookFlow;
    }
    b.style.display = "";
  }
  var MAX_PDF = 13.5 * 1024 * 1024;
  function bookFlow() {
    var L = lists(), m = modal("📚 أكواد وتيست مود من كتالوج أو كتاب"), body = m.body, shots = [], pdf = null;
    var opt = function (arr, ph) { return "<option value=''>" + ph + "</option>" + arr.map(function (x) { return "<option>" + esc(x) + "</option>"; }).join(""); };
    body.innerHTML = "<div class='hint'>📄 ملف PDF (كتالوج خدمة / كتاب) أو 📷 صور صفحات. هيطلّع <b>أكواد الأعطال</b> و<b>التيست مود</b> كل واحد لوحده، وتراجعهم قبل الحفظ.</div>" +
      "<div class='wf-ai-grid'><label>نوع الجهاز<select data-k='type'>" + opt(L.types, "— من المصدر / عام —") + "</select></label><label>الماركة<select data-k='brand'>" + opt(L.brands, "— من المصدر / عام —") + "</select></label>" +
      "<label>عايز إيه؟<select data-k='want'><option value='both'>الاتنين: الأكواد والتيست مود</option><option value='codes'>أكواد الأعطال بس</option><option value='tests'>التيست مود بس</option></select></label><label style='align-self:end'><input type='checkbox' data-k='fill'> كمّل السبب/الحل الناقص من خبرته</label></div>" +
      "<div class='wf-ai-row2' style='margin-top:10px'><button type='button' class='wf-ai-btn2' data-src='pdf'>📄 اختار ملف PDF</button><button type='button' class='wf-ai-btn2' data-src='img'>📷 صورة صفحة (لحد 4)</button></div>" +
      "<div data-srcbox></div><div class='wf-ai-row2' style='margin-top:10px'><button type='button' class='wf-ai-btn' data-go disabled>🤖 طلّع الأكواد والتيست مود</button></div><div class='wf-ai-res' data-res></div>";
    var q = function (s) { return body.querySelector(s); }, res = q("[data-res]");
    function drawSrc() {
      var h = "";
      if (pdf) h = "<div class='wf-ai-card'>📄 <b>" + esc(pdf.name) + "</b> <small>(" + (pdf.size / 1048576).toFixed(1) + " ميجا)</small> <button type='button' class='wf-ai-x' data-rmpdf aria-label='شيل الملف'>×</button>" +
        "<div class='wf-ai-grid'><label>من صفحة <small>(اختياري)</small><input type='number' min='1' data-k='from' placeholder='1'></label><label>لحد صفحة<input type='number' min='1' data-k='to' placeholder='الآخر'></label></div>" +
        "<small class='hint'>كتالوج كبير؟ بص في الفهرس على صفحات Error codes / Trouble shooting / Test mode / Service mode / Self diagnosis واكتبها هنا — أدق وأسرع. سيبهم فاضيين = يدوّر في الملف كله.</small></div>";
      if (shots.length) h += "<div class='wf-ai-shots'>" + shots.map(function (s, i) { return "<div class='wf-ai-shot'><img src='" + s.dataURL + "' alt='صفحة'><button type='button' class='wf-ai-x' data-rm='" + i + "' aria-label='شيل الصورة'>×</button></div>"; }).join("") + "</div>";
      q("[data-srcbox]").innerHTML = h;
      q("[data-go]").disabled = !pdf && !shots.length;
      q("[data-src=img]").style.display = pdf || shots.length >= 4 ? "none" : "";
      q("[data-src=pdf]").style.display = shots.length ? "none" : "";
      var rp = q("[data-rmpdf]"); if (rp) rp.onclick = function () { pdf = null; drawSrc(); };
      Array.prototype.forEach.call(body.querySelectorAll("[data-rm]"), function (b) { b.onclick = function () { shots.splice(+b.getAttribute("data-rm"), 1); drawSrc(); }; });
    }
    q("[data-src=img]").onclick = function () { pickImage(2400, 3400000).then(function (im) { shots.push(im); drawSrc(); }, function (e) { fail(e, res); }); };
    q("[data-src=pdf]").onclick = function () {
      var inp = d.createElement("input"); inp.type = "file"; inp.accept = "application/pdf,.pdf"; inp.style.display = "none"; d.body.appendChild(inp);
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; d.body.removeChild(inp); if (!f) return;
        if (!/pdf$/i.test(f.type || "") && !/\.pdf$/i.test(f.name || "")) return fail(new Error("الملف ده مش PDF."), res);
        if (f.size > MAX_PDF) return fail(new Error("الملف كبير (" + (f.size / 1048576).toFixed(1) + " ميجا) — الحد 13 ميجا. قسّم الكتاب وخد الصفحات اللي فيها الأكواد والتيست مود بس (مثلًا من موقع ilovepdf.com ← Split PDF) وارفع الجزء ده."), res);
        res.innerHTML = ""; pdf = f; drawSrc();
      };
      inp.click();
    };
    q("[data-go]").onclick = function () {
      var go = this, type = q("[data-k=type]").value, brand = q("[data-k=brand]").value, want = q("[data-k=want]").value, fill = q("[data-k=fill]").checked;
      var from = q("[data-k=from]") ? +q("[data-k=from]").value || 0 : 0, to = q("[data-k=to]") ? +q("[data-k=to]").value || 0 : 0;
      if (from && to && to < from) return fail(new Error("«لحد صفحة» لازم تبقى بعد «من صفحة»."), res);
      var done = busyBtn(go, pdf ? "بيقرا الكتاب…" : "بيقرا الصفحات…");
      res.innerHTML = "<div class='hint'>⏳ بيقرا بدقة ويفصل الأكواد عن التيست مود — ممكن ياخد من دقيقة لـ 3 دقايق حسب حجم " + (pdf ? "الكتاب" : "الصفحات") + ". سيب الصفحة مفتوحة.</div>";
      var src = pdf ? new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok({ pdf: { data: String(r.result || "").split(",")[1] || "" } }); }; r.onerror = function () { no(new Error("مقدرتش أقرا الملف.")); }; r.readAsDataURL(pdf); })
        : Promise.resolve({ images: shots.map(function (x) { return { mime: x.mime, data: x.data }; }) });
      src.then(function (s) {
        return task("codesBook", Object.assign(s, { deviceType: type, brand: brand, want: want, fillMissing: fill, pageFrom: from, pageTo: to, types: L.types, brands: L.brands }));
      }).then(function (r) { done(); m.close(); if (type) r.deviceType = type; if (brand) r.brand = brand; bookReview(r, shots, pdf ? pdf.name : ""); }, function (e) { done(); fail(e, res); });
    };
    drawSrc();
  }
  function bookReview(r, shots, pdfName) {
    var m = modal("📚 مراجعة قبل الحفظ"), body = m.body, L = lists(), codes = r.codes || [], tms = r.testModes || [];
    if (!codes.length && !tms.length) { body.innerHTML = "<div class='wf-ai-err'>مالقيتش أكواد أو تيست مود واضحين.</div>" + (r.unclear ? "<div class='hint'>" + esc(r.unclear) + "</div>" : "") + foot(r); return; }
    var opt = function (arr, v, ph) { return "<option value=''>" + ph + "</option>" + arr.map(function (x) { return "<option" + (x === v ? " selected" : "") + ">" + esc(x) + "</option>"; }).join(""); };
    var nfx = function (v) { return typeof w.normalizeFaultText === "function" ? w.normalizeFaultText(v) : String(v || "").toLowerCase().trim(); };
    body.innerHTML = ((shots || []).length ? "<div class='wf-ai-shots'>" + shots.map(function (s2) { return "<div class='wf-ai-shot'><img src='" + s2.dataURL + "' data-zoom alt='الصفحة'></div>"; }).join("") + "</div>" : pdfName ? "<div class='hint'>📄 " + esc(pdfName) + "</div>" : "") +
      "<div class='wf-ai-grid'><label>نوع الجهاز للكل<select id='wfAiBkType'>" + opt(L.types, r.deviceType, "كل الأنواع (عام)") + "</select></label><label>الماركة<select id='wfAiBkBrand'>" + opt(L.brands, r.brand, "كل الماركات (عام)") + "</select></label></div>" +
      (r.brandRaw ? "<div class='hint'>الماركة في المصدر «" + esc(r.brandRaw) + "» مش في قايمتك — ضيفها من الإعدادات لو عايزها.</div>" : "") + (r.model ? "<div class='hint'>📄 الموديلات: " + esc(r.model) + "</div>" : "") + (r.unclear ? "<div class='wf-ai-warn'>👀 " + esc(r.unclear) + "</div>" : "") +
      "<div class='hint' id='wfAiBkCount'></div>" +
      (codes.length ? "<h4>🧯 أكواد الأعطال (" + codes.length + ")</h4>" + codes.map(function (c, i) {
        return "<div class='wf-ai-card' data-kind='code' data-i='" + i + "'><label><input type='checkbox' checked data-ok> <b data-codehead>" + esc(c.code) + "</b></label> " + (c.unsure ? "<span class='wf-ai-chip wf-ai-md'>مش واضح — راجعه</span>" : "") + "<span data-dup></span>" +
          "<div class='wf-ai-grid'><label>الكود<input data-code value='" + esc(c.code) + "'" + (c.unsure ? " class='wf-ai-unsure'" : "") + "></label><label>الوصف<input data-title value='" + esc(c.title) + "'></label></div>" +
          "<label>🔍 السبب" + (c.aiCause ? " <span class='wf-ai-chip wf-ai-np'>🤖 من خبرة الذكاء الاصطناعي</span>" : "") + "<textarea data-cause rows='2'>" + esc(c.cause) + "</textarea></label>" +
          "<label>🛠️ الحل" + (c.aiFix ? " <span class='wf-ai-chip wf-ai-np'>🤖 من خبرة الذكاء الاصطناعي</span>" : "") + "<textarea data-fix rows='3'>" + esc(c.fix) + "</textarea></label>" + (c.note ? "<div class='hint'>📝 " + esc(c.note) + "</div>" : "") + "</div>";
      }).join("") : "") +
      (tms.length ? "<h4>🧪 التيست مود (" + tms.length + ")</h4>" + tms.map(function (t, i) {
        return "<div class='wf-ai-card' data-kind='test' data-i='" + i + "'><label><input type='checkbox' checked data-ok> <b>🧪</b></label> " + (t.unsure ? "<span class='wf-ai-chip wf-ai-md'>مش واضح — راجعه</span>" : "") + "<span data-dup></span>" +
          "<div class='wf-ai-grid'><label>العنوان<input data-title value='" + esc(t.title) + "'></label><label>الموديلات<input data-models value='" + esc(t.models) + "'></label></div>" +
          "<label>🔑 طريقة الدخول<textarea data-enter rows='4'>" + esc(t.enter) + "</textarea></label><label>🧪 الخطوات / بيختبر إيه<textarea data-tests rows='5'>" + esc(t.tests) + "</textarea></label>" +
          "<label>🚪 الخروج<textarea data-exit rows='2'>" + esc(t.exit) + "</textarea></label>" + (t.note ? "<label>📝 ملاحظات<textarea data-tnote rows='2'>" + esc(t.note) + "</textarea></label>" : "") + "</div>";
      }).join("") : "") +
      "<div class='wf-ai-sum'><button type='button' class='primary' id='wfAiBkSave'>💾 احفظ المختار</button> <small class='hint'>الصور بتتضاف بعد كده من صفحة كل كود أو تيست مود.</small> " + foot(r) + "</div>";
    Array.prototype.forEach.call(body.querySelectorAll("[data-zoom]"), function (im) { im.onclick = function () { zoomImg(im.src); }; });
    function dupCode(c) { var type = $("wfAiBkType").value, brand = $("wfAiBkBrand").value; return typeof w.findDuplicateFaultCode === "function" ? w.findDuplicateFaultCode(type, brand, c) : null; }
    function dupTest(title) { var k = [$("wfAiBkType").value, $("wfAiBkBrand").value, title].map(nfx).join("|"); return A(K().fc).filter(function (f) { return f && f.kind === "test" && [f.deviceType, f.brand, f.title].map(nfx).join("|") === k; })[0] || null; }
    function refresh() {
      var n = 0, dn = 0, nt = 0, dt = 0;
      Array.prototype.forEach.call(body.querySelectorAll(".wf-ai-card[data-kind]"), function (card) {
        var ok = card.querySelector("[data-ok]").checked, kind = card.getAttribute("data-kind");
        if (kind === "code") {
          var code = card.querySelector("[data-code]").value.trim(), dup = code ? dupCode(code) : null;
          card.querySelector("[data-codehead]").textContent = code || "—";
          card.querySelector("[data-dup]").innerHTML = dup ? " <span class='wf-ai-chip wf-ai-lo'>متسجّل قبل كده — هيتكمّل الناقص فيه بس</span>" : "";
          if (ok) { n++; if (dup) dn++; }
        } else {
          var dupT = dupTest(card.querySelector("[data-title]").value.trim());
          card.querySelector("[data-dup]").innerHTML = dupT ? " <span class='wf-ai-chip wf-ai-lo'>نفس العنوان موجود — مش هيتكرر</span>" : "";
          if (ok) { nt++; if (dupT) dt++; }
        }
        card.classList.toggle("off", !ok);
      });
      $("wfAiBkCount").textContent = "هيتحفظ: " + (n - dn) + " كود جديد" + (dn ? " + تكملة " + dn + " موجود" : "") + " • " + (nt - dt) + " تيست مود جديد" + (dt ? " (" + dt + " متكرر هيتساب)" : "") + ".";
    }
    body.addEventListener("input", refresh); body.addEventListener("change", refresh); refresh();
    $("wfAiBkSave").onclick = function () {
      var type = $("wfAiBkType").value, brand = $("wfAiBkBrand").value, all = A(K().fc), at = new Date().toISOString(), added = 0, filled = 0, addedT = 0, seen = {}, seenT = {};
      var src = pdfName ? "كتاب «" + pdfName + "»" : "صورة " + (r.model ? "كتالوج (" + r.model + ")" : "كتالوج/كتاب");
      Array.prototype.forEach.call(body.querySelectorAll(".wf-ai-card[data-kind]"), function (card) {
        if (!card.querySelector("[data-ok]").checked) return;
        var i = +card.getAttribute("data-i"), v = function (s) { var e = card.querySelector(s); return e ? e.value.trim() : ""; };
        if (card.getAttribute("data-kind") === "test") {
          var t = tms[i], title = v("[data-title]"), enter = v("[data-enter]"); if (!title || !enter) return;
          var tk = nfx(title); if (seenT[tk] || dupTest(title)) return; seenT[tk] = 1;
          all.push({ id: w.id(), kind: "test", source: "ai-book", deviceType: type, brand: brand, model: v("[data-models]") || r.model || "", title: title, enter: enter, tests: v("[data-tests]"), exit: v("[data-exit]"), note: [v("[data-tnote]"), "📚 من " + src + " — 🤖 راجعه."].filter(Boolean).join("\n"), media: [], createdAt: at, updatedAt: at });
          addedT++; return;
        }
        var c = codes[i], code = v("[data-code]"), title2 = v("[data-title]"); if (!code) return;
        var key = nfx(code); if (seen[key]) return; seen[key] = 1;
        var cause = v("[data-cause]"), fix = v("[data-fix]");
        var tag = "📚 من " + src + " — 🤖" + (c.aiCause || c.aiFix ? " (فيه أجزاء من خبرة الذكاء الاصطناعي)" : "") + " — راجعه.";
        var dup = dupCode(code), ex = dup && all.filter(function (f) { return f.id === dup.id; })[0];
        if (ex) {
          var ch = false;
          if (!String(ex.title || "").trim() && title2) { ex.title = title2; ch = true; }
          if (!String(ex.cause || "").trim() && cause) { ex.cause = cause; ch = true; }
          if (!String(ex.fix || "").trim() && fix) { ex.fix = fix; ch = true; }
          if (ch) { if (String(ex.note || "").indexOf("📚") < 0) ex.note = (ex.note ? ex.note + "\n" : "") + tag; ex.updatedAt = at; filled++; }
          return;
        }
        all.push({ id: w.id(), source: "ai-book", deviceType: type, brand: brand, code: code, title: title2 || code, cause: cause, fix: fix, note: (c.note ? c.note + "\n" : "") + tag, addedBy: "", media: [], createdAt: at, updatedAt: at });
        added++;
      });
      if (!added && !filled && !addedT) return w.alert("مفيش جديد يتحفظ.");
      if (!(typeof w.saveFaultCodesRecords === "function" && w.saveFaultCodesRecords(all))) return;
      m.close();
      try { if (typeof w.renderFaultCodes === "function") w.renderFaultCodes(); if (w.WFTestModes) w.WFTestModes.render(); } catch (e) {}
      codesFillBtn();
      w.alert("✅ اتضاف " + added + " كود" + (filled ? " واتكمّل " + filled + " كود موجود" : "") + (addedT ? " و" + addedT + " تيست مود" : "") + ".");
    };
  }
  function missingCodes() { return A(K().fc).filter(function (f) { return f && f.code && (!String(f.cause || "").trim() || !String(f.fix || "").trim()); }); }
  function codesFillBtn() {
    var list = $("faultList"); if (!list) return;
    var b = $("wfAiCodeFill"), miss = on("codes") && can("faultcodes.edit") ? missingCodes() : [];
    if (!miss.length) { if (b) b.style.display = "none"; return; }
    css();
    if (!b) { b = d.createElement("div"); b.id = "wfAiCodeFill"; b.className = "wf-ai-tool"; list.parentNode.insertBefore(b, list); }
    b.style.display = "";
    b.innerHTML = "<div class='wf-ai-row2'><span>🧯 فيه <b>" + miss.length + "</b> كود ناقصهم السبب أو الحل.</span><button type='button' class='wf-ai-btn2'>🤖 كمّلهم (" + Math.min(10, miss.length) + " في المرة)</button></div>";
    b.querySelector("button").onclick = function () { fillCodes(miss.slice(0, 10)); };
  }
  function fillCodes(items) {
    var m = modal("🤖 تكملة السبب والحل"), body = m.body;
    body.innerHTML = "<div class='hint'>⏳ بيكتب السبب والحل لـ " + items.length + " كود…</div>";
    task("codeFill", { items: items.map(function (f) { return { id: f.id, code: f.code, title: f.title, deviceType: f.deviceType, brand: f.brand, cause: f.cause, fix: f.fix }; }) }).then(function (r) {
      var by = {}; items.forEach(function (f) { by[f.id] = f; });
      var rows = (r.items || []).filter(function (x) { return by[x.id]; });
      if (!rows.length) { body.innerHTML = "<div class='wf-ai-err'>مارجعش اقتراحات — جرّب تاني.</div>"; return; }
      body.innerHTML = "<div class='hint'>راجع وعدّل، وشيل العلامة من اللي مش عايزه. الخانات اللي فيها كلام عندك مش هتتغير إلا لو فاضية.</div>" + rows.map(function (x, i) {
        var f = by[x.id];
        return "<div class='wf-ai-card' data-i='" + i + "'><label><input type='checkbox' checked data-ok> <b>" + esc(f.code) + " — " + esc(f.title || "") + "</b></label> " + conf(x.confidence) + "<div class='hint'>" + esc(f.deviceType || "كل الأنواع") + " • " + esc(f.brand || "كل الماركات") + "</div>" +
          (String(f.cause || "").trim() ? "" : "<label>🔍 السبب<textarea data-cause rows='3'>" + esc(x.cause) + "</textarea></label>") + (String(f.fix || "").trim() ? "" : "<label>🛠️ الحل<textarea data-fix rows='4'>" + esc(x.fix) + "</textarea></label>") + "</div>";
      }).join("") + "<div class='wf-ai-sum'><button type='button' class='primary' data-save>💾 احفظ المختار</button> " + foot(r) + "</div>";
      body.querySelector("[data-save]").onclick = function () {
        var all = A(K().fc), n = 0, at = new Date().toISOString();
        Array.prototype.forEach.call(body.querySelectorAll(".wf-ai-card"), function (c) {
          if (!c.querySelector("[data-ok]").checked) return;
          var x = rows[+c.getAttribute("data-i")], f = all.filter(function (y) { return y.id === x.id; })[0]; if (!f) return;
          var ca = c.querySelector("[data-cause]"), fx = c.querySelector("[data-fix]");
          if (ca && ca.value.trim() && !String(f.cause || "").trim()) f.cause = ca.value.trim();
          if (fx && fx.value.trim() && !String(f.fix || "").trim()) f.fix = fx.value.trim();
          if (String(f.note || "").indexOf("🤖") < 0) f.note = (f.note ? f.note + "\n" : "") + "🤖 السبب/الحل مقترحين من الذكاء الاصطناعي (ثقة " + x.confidence + ") — اتأكد منهم.";
          f.updatedAt = at; n++;
        });
        if (!n) return m.close();
        var ok = typeof w.saveFaultCodesRecords === "function" ? w.saveFaultCodesRecords(all) : (typeof w.saveJSONSafe === "function" && w.saveJSONSafe(K().fc, all));
        if (!ok) return;
        m.close();
        try { if (typeof w.renderFaultCodes === "function") w.renderFaultCodes(); if (typeof w.faultCodeProfile === "function") w.faultCodeProfile(); } catch (e) {}
        codesFillBtn(); codeProfileBtn();
        w.alert("✅ اتحفظ " + n + " كود.");
      };
    }, function (e) { fail(e, body); });
  }
  function codeProfileBtn() {
    var el = $("faultCodeProfile"); if (!el) return;
    var old = $("wfAiCodeOne");
    var f = A(K().fc).filter(function (x) { return x && x.id === new URLSearchParams(location.search).get("id"); })[0];
    var want = on("codes") && can("faultcodes.edit") && f && !(String(f.cause || "").trim() && String(f.fix || "").trim());
    if (!want) { if (old) old.parentNode.removeChild(old); return; }
    if (old && el.contains(old)) return;
    css();
    var b = d.createElement("div"); b.id = "wfAiCodeOne"; b.className = "wf-ai-tool";
    b.innerHTML = "<div class='wf-ai-row2'><span>الكود ده ناقصه " + (!String(f.cause || "").trim() && !String(f.fix || "").trim() ? "السبب والحل" : !String(f.cause || "").trim() ? "السبب" : "الحل") + ".</span><button type='button' class='wf-ai-btn2'>🤖 كمّله</button></div>";
    b.querySelector("button").onclick = function () { fillCodes([f]); };
    el.appendChild(b);
  }

  /* =====================================================================
     💬 رسالة واتساب للعميل (صفحة أمر الشغل)
     ===================================================================== */
  var KINDS = [["price", "💰 التكلفة"], ["delay", "⏳ اعتذار عن تأخير"], ["parts", "📦 مستنيين قطعة"], ["ready", "✅ الجهاز جاهز"], ["visit", "📅 تأكيد الموعد"], ["pay", "💳 تذكير بالمتبقي"], ["follow", "📞 متابعة بعد الإصلاح"], ["maint", "🧽 صيانة دورية"], ["custom", "✍️ رسالة حرة"]];
  var MSG = {};
  function msgSlots() {
    var slots = d.querySelectorAll(".wf-ai-msg-slot[data-ai-rid]");
    for (var i = 0; i < slots.length; i++) msgSlot(slots[i]);
  }
  function msgSlot(slot) {
    if (slot.getAttribute("data-ai-done") === "1") return;
    slot.setAttribute("data-ai-done", "1");
    var id = slot.getAttribute("data-ai-rid"), r = A(K().r).filter(function (x) { return x && String(x.id) === String(id); })[0];
    if (!r || !on("msg") || typeof w.fillWaTemplate !== "function") { slot.style.display = "none"; slot.innerHTML = ""; return; }
    css(); slot.style.display = "";
    var st = MSG[id] = MSG[id] || { open: false, kind: "", note: "", raw: "", busy: false, err: "", info: "" };
    var h = "<div class='wf-ai-tool'><div class='wf-ai-row2'><b>💬 رسالة للعميل</b>" + (st.open ? "<button type='button' class='wf-ai-btn2' data-m='close'>إخفاء</button>" : "<button type='button' class='wf-ai-btn2' data-m='open'>🤖 اكتبلي رسالة</button>") + "</div>";
    if (st.open) {
      h += "<div class='wf-ai-kinds'>" + KINDS.map(function (k) { return "<button type='button' class='wf-ai-btn2" + (st.kind === k[0] ? " on" : "") + "' data-kind='" + k[0] + "'>" + k[1] + "</button>"; }).join("") + "</div>";
      h += "<input type='text' data-note placeholder='تفاصيل تحب تضيفها (اختياري) — مثلًا: التكلفة حوالي 650 ج، أو هنوصل الساعة 5' value='" + esc(st.note) + "' style='width:100%;box-sizing:border-box;margin:4px 0'>";
      h += "<button type='button' class='wf-ai-btn' data-m='gen'" + (st.busy ? " disabled" : "") + ">" + (st.busy ? "⏳ بيكتب…" : "✍️ اكتب الرسالة") + "</button>";
      if (st.err) h += "<div class='wf-ai-err'>⚠️ " + esc(st.err) + "</div>";
      if (st.raw) {
        h += "<textarea data-text rows='7' style='margin-top:8px'>" + esc(w.fillWaTemplate(st.raw, r)) + "</textarea><div class='wf-ai-row2' style='margin-top:6px'><button type='button' class='primary' data-m='wa'>💬 افتح واتساب</button><button type='button' class='wf-ai-btn2' data-m='copy'>📋 نسخ</button><button type='button' class='wf-ai-btn2' data-m='tpl'>💾 احفظها كقالب</button></div>";
        h += "<small class='hint'>اسم العميل والأرقام اتملوا من جهازك — ماتبعتوش للذكاء الاصطناعي. عدّل براحتك قبل الإرسال.</small>";
      }
      if (st.info) h += "<div class='hint'>" + esc(st.info) + "</div>";
    }
    slot.innerHTML = h + "</div>";
    var q = function (s) { return slot.querySelector(s); };
    Array.prototype.forEach.call(slot.querySelectorAll("[data-kind]"), function (b) { b.onclick = function () { st.kind = b.getAttribute("data-kind"); st.note = q("[data-note]").value; redraw(); }; });
    Array.prototype.forEach.call(slot.querySelectorAll("[data-m]"), function (b) {
      b.onclick = function () {
        var m = b.getAttribute("data-m"); if (q("[data-note]")) st.note = q("[data-note]").value; st.info = "";
        if (m === "open" || m === "close") { st.open = m === "open"; return redraw(); }
        if (m === "gen") return genMsg(r, st);
        var text = q("[data-text]") ? q("[data-text]").value : "";
        if (m === "copy") { copyText(text).then(function () { st.info = "✅ اتنسخت."; redraw(); }); return; }
        if (m === "wa") {
          var c = A(K().c).filter(function (x) { return x.id === r.customerId; })[0] || {}, wa = typeof w.waNumber === "function" ? w.waNumber(c.phone) : "";
          if (!wa) { st.info = "مفيش رقم موبايل للعميل — انسخ الرسالة وابعتها بنفسك."; return redraw(); }
          w.open("https://wa.me/" + wa + "?text=" + encodeURIComponent(text), "_blank", "noopener"); return;
        }
        if (m === "tpl") {
          var name = w.prompt("اسم القالب (هيظهر كزرار في كل أوامر الشغل):", (KINDS.filter(function (k) { return k[0] === st.kind; })[0] || ["", "رسالة"])[1].replace(/^\S+\s/, ""));
          if (!name) return;
          var s = S(); s.waTemplates = s.waTemplates || []; s.waTemplates.push({ name: name.trim(), text: st.raw, enabled: true });
          if (typeof w.saveJSONSafe === "function" ? w.saveJSONSafe(K().s, s) : false) { st.info = "✅ اتحفظ كقالب في الإعدادات ← رسائل واتساب."; try { if (typeof w.requestProfile === "function") w.requestProfile(); } catch (e) {} }
          redraw();
        }
      };
    });
    function redraw() { slot.setAttribute("data-ai-done", "0"); msgSlot(slot); }
  }
  function genMsg(r, st) {
    if (!st.kind) { st.err = "اختار نوع الرسالة الأول."; return msgSlots0(); }
    var dv = A(K().d).filter(function (x) { return x && x.id === r.deviceId; })[0] || {};
    var remain = Math.max(0, Math.round(((+r.total || 0) - (+r.deposit || 0)) * 100) / 100);
    st.busy = true; st.err = ""; msgSlots0();
    task("message", { kind: st.kind, note: st.note, order: { deviceType: [dv.type, dv.category].filter(Boolean).join(" "), status: r.paid ? "مدفوع بالكامل" : r.status, fault: r.fault, work: r.work, place: r.executionPlace, visit: r.visit ? new Date(r.visit).toLocaleString("ar-EG", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) : "", warrantyDays: r.warrantyDays || "", hasRemain: !r.paid && remain > 0, partsWaiting: !!r.partsWaiting } }).then(function (res) {
      st.raw = res.text || ""; if (!st.raw) st.err = "مارجعش نص — جرّب تاني.";
    }, function (e) { st.err = (e && e.message) || "تعذّر"; }).then(function () { st.busy = false; msgSlots0(); });
  }
  function msgSlots0() { var s = d.querySelectorAll(".wf-ai-msg-slot[data-ai-rid]"); for (var i = 0; i < s.length; i++) { s[i].setAttribute("data-ai-done", "0"); msgSlot(s[i]); } }
  function copyText(t) {
    return new Promise(function (res) {
      try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(res, fb); } catch (e) {}
      fb();
      function fb() { var ta = d.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0"; d.body.appendChild(ta); ta.select(); try { d.execCommand("copy"); } catch (e) {} d.body.removeChild(ta); res(); }
    });
  }

  /* =====================================================================
     🎙️ أمر شغل سريع بالكلام (الرئيسية)
     ===================================================================== */
  var rec = null;
  function voicePanel() {
    var body = $("quickOrderBody"), box = $("wfAiVoice");
    if (!body || !$("qoFault")) return;
    if (!on("voice") || !can("requests.add")) { if (box) box.style.display = "none"; return; }
    css();
    if (!box) {
      box = d.createElement("div"); box.id = "wfAiVoice"; box.className = "wf-ai-tool";
      var SR = w.SpeechRecognition || w.webkitSpeechRecognition;
      box.innerHTML = "<div class='wf-ai-row2'><b>🎙️ قول الأمر بالكلام</b>" + (SR ? "<button type='button' class='wf-ai-btn2 wf-ai-mic' data-v='mic'>🎙️ ابدأ الكلام</button>" : "") + "</div>" +
        "<textarea id='wfAiVoiceText' rows='3' placeholder='" + esc("مثال: الحاج محمود السيد 01012345678 من مركز طما قرية الشيخ زين الدين، غسالة توشيبا فوق أوتوماتيك مش بتعصر وبتطلع صوت عالي، عايز حد يجيله بكرة العصر") + "'></textarea>" +
        "<div class='wf-ai-row2' style='margin-top:6px'><button type='button' class='wf-ai-btn' data-v='go'>🤖 املا الخانات</button><button type='button' class='wf-ai-btn2' data-v='call'>📎 من تسجيل مكالمة</button><small class='hint'>" + (SR ? "دوس 🎙️ واتكلم، أو" : "استخدم 🎤 الميكروفون اللي في الكيبورد، أو") + " الصق رسالة العميل من واتساب.</small></div><div class='wf-ai-res' id='wfAiVoiceRes'></div>";
      body.insertBefore(box, body.firstChild);
      var mic = box.querySelector("[data-v=mic]"); if (mic) mic.onclick = function () { toggleMic(mic); };
      box.querySelector("[data-v=go]").onclick = function () { voiceFill(this); };
      box.querySelector("[data-v=call]").onclick = function () { var b = this; pickAudio().then(function (f) { callFill(b, function () { return Promise.resolve(f); }, $("wfAiVoiceRes"), f.name); }, function (e) { fail(e, $("wfAiVoiceRes")); }); };
    }
    box.style.display = "";
  }
  function toggleMic(btn) {
    var SR = w.SpeechRecognition || w.webkitSpeechRecognition, ta = $("wfAiVoiceText");
    if (rec) { try { rec.stop(); } catch (e) {} return; }
    try { rec = new SR(); } catch (e) { return w.alert("الميكروفون مش متاح هنا — استخدم ميكروفون الكيبورد."); }
    rec.lang = "ar-EG"; rec.continuous = true; rec.interimResults = true;
    var base = ta.value ? ta.value.replace(/\s*$/, " ") : "";
    rec.onresult = function (ev) { var fin = "", tmp = ""; for (var i = 0; i < ev.results.length; i++) { if (ev.results[i].isFinal) fin += ev.results[i][0].transcript + " "; else tmp += ev.results[i][0].transcript; } ta.value = base + fin + tmp; };
    rec.onerror = function (ev) { if (ev && ev.error === "not-allowed") w.alert("لازم تسمح للمتصفح باستخدام الميكروفون."); };
    rec.onend = function () { rec = null; btn.classList.remove("rec"); btn.textContent = "🎙️ ابدأ الكلام"; };
    try { rec.start(); btn.classList.add("rec"); btn.textContent = "⏹️ وقّف"; } catch (e) { rec = null; }
  }
  function voiceFill(btn) {
    var res = $("wfAiVoiceRes"), text = ($("wfAiVoiceText").value || "").trim();
    if (rec) try { rec.stop(); } catch (e) {}
    if (text.length < 6) { res.innerHTML = "<div class='wf-ai-err'>اتكلم أو اكتب تفاصيل الأمر الأول.</div>"; return; }
    var done = busyBtn(btn, "بيفهم الكلام…"); res.innerHTML = "";
    task("orderParse", { text: text, lists: lists() }).then(function (o) { res.innerHTML = applyOrder(o) + foot(o); }, function (e) { fail(e, res); }).then(done);
  }
  function openBox(id) { var b = $(id); if (b && b.classList.contains("hidden")) { if (typeof w.toggleQuickAdd === "function") w.toggleQuickAdd(id); else b.classList.remove("hidden"); } }
  /* ماركة الموديل رجّعها «خام» (زي LG) والنظام كاتبها «إل جي»؟ نوحّدها */
  function fixBrand(o) { if (o.brand) o.brand = canonBrand(o.brand); if (!o.brand && o.brandRaw) { var c = canonBrand(o.brandRaw); if (lists().brands.indexOf(c) > -1) { o.brand = c; o.brandRaw = ""; } } return o; }
  function applyOrder(o) {
    fixBrand(o);
    var out = [], warn = [];
    var cust = o.phone && typeof w.duplicateCustomerByPhone === "function" ? w.duplicateCustomerByPhone(o.phone) : null;
    if (cust) {
      if (typeof w.fillCustomerAutocomplete === "function") w.fillCustomerAutocomplete("qoCustomer", cust.id);
      if (typeof w.fillDevice === "function") w.fillDevice($("qoDevice"), cust.id, "");
      out.push("👤 العميل موجود: <b>" + esc(cust.name) + "</b> (اتختار)");
      var devs = A(K().d).filter(function (x) { return x.customerId === cust.id && (!o.deviceType || x.type === o.deviceType) && (!o.brand || !x.brand || x.brand === o.brand); });
      if (devs.length === 1 && $("qoDevice")) { $("qoDevice").value = devs[0].id; out.push("🔧 الجهاز: <b>" + esc([devs[0].type, devs[0].brand, devs[0].model].filter(Boolean).join(" ")) + "</b> (من أجهزته)"); }
      else newDevice();
    } else if (o.customerName || o.phone) {
      openBox("qoCustomerBox");
      if (o.customerName) setVal("qoName", o.customerName);
      if (o.phone) setVal("qoPhone", o.phone); else if (o.phoneRaw) warn.push("📞 الرقم «" + esc(o.phoneRaw) + "» مش رقم موبايل مصري صحيح — راجعه.");
      if (setList("qoCenter", o.center)) { if (o.village) setTimeout(function () { setList("qoVillage", o.village); }, 30); }
      if (o.street) setVal("qoStreet", o.street);
      out.push("👤 عميل جديد: <b>" + esc(o.customerName || "—") + "</b> " + esc(o.phone || "") + " — راجع ودوس «حفظ العميل واختياره»");
      if (!o.center && o.centerRaw) warn.push("📍 المركز «" + esc(o.centerRaw) + "» مش في القايمة — اختاره أو ضيفه.");
      if (o.center && !o.village && o.villageRaw) warn.push("📍 القرية «" + esc(o.villageRaw) + "» مش في قايمة " + esc(o.center) + " — اختارها أو ضيفها.");
      newDevice();
    } else warn.push("👤 مفيش اسم أو تليفون في الكلام — اختار العميل من البحث.");
    function newDevice() {
      if (!o.deviceType && !o.brand && !o.model && !o.deviceTypeRaw) return;
      openBox("qoDeviceBox");
      if (setList("qoType", o.deviceType) && o.category) setTimeout(function () { setList("qoCategory", o.category); }, 30);
      setList("qoBrand", o.brand); if (o.model) setVal("qoModel", o.model);
      out.push("🔧 جهاز جديد: <b>" + esc([o.deviceType || o.deviceTypeRaw, o.category, o.brand || o.brandRaw, o.model].filter(Boolean).join(" ")) + "</b> — راجع ودوس «حفظ الجهاز»");
      if (!o.deviceType && o.deviceTypeRaw) warn.push("🔧 النوع «" + esc(o.deviceTypeRaw) + "» مش في القايمة.");
      if (!o.brand && o.brandRaw) warn.push("🏷️ الماركة «" + esc(o.brandRaw) + "» مش في القايمة — اختارها أو ضيفها.");
    }
    if (o.summary !== undefined) {
      var ft = "📞 " + (o.fault || "بلاغ عن طريق مكالمة") + (o.summary ? "\n\n📝 ملخص المكالمة:\n" + o.summary : "") + (o.price ? "\n💰 مبلغ اتقال في المكالمة: " + o.price : "") + (o.visit ? "\n📅 الموعد: " + o.visit : "");
      setVal("qoFault", ft); if (o.fault) out.push("📝 العطل: " + esc(o.fault));
    } else if (o.fault) { setVal("qoFault", o.fault + (o.visit ? " (الموعد: " + o.visit + ")" : "")); out.push("📝 العطل: " + esc(o.fault)); }
    if (o.visit) out.push("📅 الموعد المذكور: <b>" + esc(o.visit) + "</b> — ظبطه من صفحة الأمر بعد الحفظ.");
    if (o.notes) out.push("🗒️ " + esc(o.notes));
    if (o.missing && o.missing.length) warn.push("ناقص: " + o.missing.map(esc).join("، "));
    return "<ul>" + out.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>" + (warn.length ? "<div class='wf-ai-warn'>" + warn.join("<br>") + "</div>" : "") + "<div class='hint'>✅ راجع الخانات تحت وبعدين احفظ الأمر زي العادي.</div>";
  }

  /* =====================================================================
     📞 تسجيل مكالمة → بيانات العميل والجهاز والعطل
     ===================================================================== */
  var AUDIO_EXT = { m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", mp3: "audio/mpeg", mpeg: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/opus", webm: "audio/webm", flac: "audio/flac" };
  var MAX_AUDIO = 12 * 1024 * 1024;
  function audioMime(f) {
    var t = String((f && f.type) || "").toLowerCase(), ext = String((f && f.name) || "").toLowerCase().split(".").pop();
    if (/amr|3gp/.test(t) || ext === "amr" || ext === "3gp") return "";
    if (AUDIO_EXT[ext]) return AUDIO_EXT[ext];
    if (/m4a|mp4|aac/.test(t)) return "audio/mp4";
    if (/mpeg|mp3/.test(t)) return "audio/mpeg";
    if (/wav/.test(t)) return "audio/wav"; if (/ogg/.test(t)) return "audio/ogg"; if (/opus/.test(t)) return "audio/opus"; if (/webm/.test(t)) return "audio/webm"; if (/flac/.test(t)) return "audio/flac";
    return "";
  }
  function pickAudio() {
    return new Promise(function (resolve, reject) {
      var inp = d.createElement("input"); inp.type = "file"; inp.accept = "audio/*,.m4a,.mp3,.aac,.wav,.ogg,.opus"; inp.style.display = "none"; d.body.appendChild(inp);
      inp.onchange = function () { var f = inp.files && inp.files[0]; d.body.removeChild(inp); f ? resolve(f) : reject(new Error("cancel")); };
      inp.click();
    });
  }
  function audioPayload(f) {
    return new Promise(function (resolve, reject) {
      if (!f) return reject(new Error("مفيش تسجيل مرفق."));
      var mime = audioMime(f);
      if (!mime) return reject(new Error("صيغة التسجيل دي (" + (String(f.name || "").split(".").pop() || f.type || "؟") + ") مش مدعومة — من إعدادات تسجيل المكالمات في الموبايل خليها M4A أو MP3."));
      if (f.size > MAX_AUDIO) return reject(new Error("التسجيل كبير (" + Math.round(f.size / 1048576) + " ميجا) — الحد 12 ميجا (حوالي 20 دقيقة)."));
      var r = new FileReader();
      r.onload = function () { resolve({ mime: mime, data: String(r.result || "").split(",")[1] || "" }); };
      r.onerror = function () { reject(new Error("مقدرتش أقرا ملف التسجيل.")); };
      r.readAsDataURL(f);
    });
  }
  function callFill(btn, getFile, res, hint) {
    var done = busyBtn(btn, "بيسمع المكالمة…"); res.innerHTML = "<div class='hint'>⏳ بيسمع المكالمة كلها ويكتبها الأول وبعدين يطلّع البيانات — ممكن ياخد دقيقة أو اتنين حسب طولها.</div>";
    getFile().then(audioPayload).then(function (au) { return task("callParse", { audio: au, lists: lists(), hint: hint || "" }); }).then(function (o) {
      if (o.heard === false) { res.innerHTML = "<div class='wf-ai-err'>التسجيل مش واضح أو مش مكالمة صيانة" + (o.notes ? ": " + esc(o.notes) : "") + ".</div>" + foot(o); return; }
      var tr = (o.transcript || []).map(function (t) { return "<div><b>" + (t.who === "العميل" ? "👤 العميل" : t.who === "الورشة" ? "🛠️ الورشة" : "❔") + ":</b> " + esc(t.text) + "</div>"; }).join("");
      res.innerHTML = (o.summary ? "<div class='wf-ai-hist'>📝 " + esc(o.summary).replace(/\n/g, "<br>") + (o.price ? "<br>💰 " + esc(o.price) : "") + "</div>" : "") + applyOrder(o) +
        (tr ? "<details style='margin-top:8px'><summary>📜 نص المكالمة زي ما اتسمع (" + o.transcript.length + " مقطع) — لو فيه حاجة غلط اتأكد منها هنا</summary><div class='wf-ai-res' style='max-height:260px;overflow:auto'>" + tr + "</div><button type='button' class='wf-ai-btn2' data-tr>📋 نسخ النص</button></details>" : "") + foot(o);
      var cb = res.querySelector("[data-tr]"); if (cb) cb.onclick = function () { copyText(o.transcript.map(function (t) { return t.who + ": " + t.text; }).join("\n")).then(function () { cb.textContent = "✅ اتنسخ"; }); };
    }, function (e) { fail(e, res); }).then(done);
  }
  function shareAudioFile() {
    if (w.__wfShareAudio) return Promise.resolve(w.__wfShareAudio);
    var ref = w.__wfShareAudioRef;
    if (!ref || !w.ImageStore || !w.ImageStore.resolveSrc) return Promise.reject(new Error("مفيش تسجيل مرفق بالمكالمة دي."));
    return Promise.resolve(w.ImageStore.resolveSrc(ref)).then(function (src) { if (!src) throw new Error("التسجيل مش موجود على الجهاز."); return fetch(src).then(function (r) { return r.blob(); }); }).then(function (b) {
      var nm = String((w.__wfShareHint || "").split(" — ").pop() || "call");
      try { return new File([b], /\.[a-z0-9]{2,4}$/i.test(nm) ? nm : nm + ".m4a", { type: b.type || "" }); } catch (e) { b.name = nm; return b; }
    });
  }
  function callSharePanel() {
    var anchor = $("shareAudioPreview"), box = $("wfAiCall");
    if (!anchor || !$("qoFault")) return;
    var has = !!(w.__wfShareAudio || w.__wfShareAudioRef);
    if (!on("voice") || !can("requests.add") || !has) { if (box) box.style.display = "none"; return; }
    css();
    if (!box) {
      box = d.createElement("div"); box.id = "wfAiCall"; box.className = "wf-ai-tool";
      box.innerHTML = "<div class='wf-ai-row2'><b>🤖 اسمع المكالمة واملا البيانات</b><button type='button' class='wf-ai-btn'>🎧 حلّل التسجيل</button></div><small class='hint'>بيطلّع اسم العميل والعنوان والجهاز والعطل وملخص اللي اتفقتوا عليه، وانت تراجع قبل الإنشاء.</small><div class='wf-ai-res'></div>";
      anchor.parentNode.insertBefore(box, anchor.nextSibling);
      box.querySelector("button").onclick = function () { callFill(this, shareAudioFile, box.querySelector(".wf-ai-res"), w.__wfShareHint || ""); };
    }
    box.style.display = "";
  }

  /* =====================================================================
     🏷️ صورة لوحة بيانات الجهاز
     ===================================================================== */
  function plateButtons() {
    [["qoDeviceBox", "qo"], ["deviceForm", "d"]].forEach(function (x) {
      var host = $(x[0]), id = "wfAiPlate-" + x[1], b = $(id);
      if (!host || !$(x[1] + "Type")) return;
      if (!on("plate") || !can("devices.add")) { if (b) b.style.display = "none"; return; }
      css();
      if (!b) {
        b = d.createElement("div"); b.id = id; b.className = "wf-ai-tool wide";
        b.innerHTML = "<div class='wf-ai-row2'><button type='button' class='wf-ai-btn2'>📷 صوّر ملصق بيانات الجهاز</button><small class='hint'>الماركة والموديل والمسلسل يتكتبوا لوحدهم.</small></div><div class='wf-ai-res'></div>";
        var grid = host.querySelector(".form-grid"); (grid ? grid.parentNode : host).insertBefore(b, grid || host.firstChild);
        b.querySelector("button").onclick = function () { plateRead(this, x[1], b.querySelector(".wf-ai-res")); };
      }
      b.style.display = "";
    });
  }
  function plateRead(btn, pre, res) {
    var done = function () {};
    pickImage(1600).then(function (im) { done = busyBtn(btn, "بيقرا الملصق…"); res.innerHTML = ""; return task("plate", { image: { mime: im.mime, data: im.data }, lists: lists() }); }).then(function (o) {
      if (!o) return;
      fixBrand(o);
      if (!o.readable) { res.innerHTML = "<div class='wf-ai-err'>الصورة مش واضحة كفاية" + (o.note ? ": " + esc(o.note) : "") + "</div>"; return; }
      var got = [], warn = [];
      if (setList(pre + "Type", o.type)) { got.push("النوع: " + esc(o.type)); if (o.category) setTimeout(function () { setList(pre + "Category", o.category); }, 30); }
      else if (o.typeRaw) warn.push("النوع «" + esc(o.typeRaw) + "» مش في القايمة");
      if (setList(pre + "Brand", o.brand)) got.push("الماركة: " + esc(o.brand)); else if (o.brandRaw) warn.push("الماركة «" + esc(o.brandRaw) + "» مش في القايمة — اختارها أو ضيفها");
      if (o.model && $(pre + "Model")) { setVal(pre + "Model", o.model); got.push("الموديل: " + esc(o.model)); }
      var extra = [o.serial ? "S/N: " + o.serial : "", o.specs].filter(Boolean).join(" • ");
      if (extra && $(pre + "Desc")) { var de = $(pre + "Desc"); if (de.value.indexOf(extra) < 0) setVal(pre + "Desc", (de.value ? de.value + "\n" : "") + extra); got.push("الوصف: " + esc(extra)); }
      else if (extra) got.push(esc(extra) + " <small>(مفيش خانة وصف هنا — هتلاقيها في صفحة الجهاز)</small>");
      res.innerHTML = (got.length ? "✅ " + got.join(" • ") : "مالقيتش بيانات واضحة.") + (warn.length ? "<div class='wf-ai-warn'>" + warn.join("<br>") + "</div>" : "") + foot(o);
    }, function (e) { fail(e, res); }).then(function () { done(); });
  }

  /* =====================================================================
     🧾 توريد من صورة فاتورة المورد + 🧹 تنظيف أسماء المخزن (المخزن)
     ===================================================================== */
  function inventoryButtons() {
    var anchor = d.querySelector("[data-wf-click='toggleRestockBox']"); if (!anchor || !$("restockBox")) return;
    var bar = $("wfAiInvBar"), showInv = on("invoice") && can("inventory.add"), showStock = on("stock") && can("inventory.edit");
    if (!showInv && !showStock) { if (bar) bar.style.display = "none"; return; }
    css();
    if (!bar) { bar = d.createElement("span"); bar.id = "wfAiInvBar"; anchor.parentNode.insertBefore(bar, anchor.nextSibling); }
    bar.style.display = "";
    var sig = (showInv ? "i" : "") + (showStock ? "s" : ""); if (bar.getAttribute("data-sig") === sig) return; bar.setAttribute("data-sig", sig);
    bar.innerHTML = (showInv ? " <button type='button' class='secondary small-btn' data-i='inv'>🧾 توريد من صورة فاتورة 🤖</button>" : "") + (showStock ? " <button type='button' class='secondary small-btn' data-i='clean'>🧹 نضّف أسماء المخزن 🤖</button>" : "");
    var bi = bar.querySelector("[data-i=inv]"), bc = bar.querySelector("[data-i=clean]");
    if (bi) bi.onclick = function () { invoiceFlow(bi); };
    if (bc) bc.onclick = function () { stockClean(bc); };
  }
  /* جمع صور (لحد 4): الفاتورة الطويلة أو الخط الصغير أحسن تتصوّر على أجزاء قريبة */
  function collectPhotos(title, tips, goLabel, onGo, extraHtml) {
    var m = modal(title), body = m.body, shots = [];
    function draw() {
      body.innerHTML = "<div class='hint'>" + tips + "</div>" + (extraHtml || "") +
        "<div class='wf-ai-shots'>" + shots.map(function (s, i) { return "<div class='wf-ai-shot'><img src='" + s.dataURL + "' alt='صورة " + (i + 1) + "'><button type='button' class='wf-ai-x' data-rm='" + i + "' aria-label='شيل الصورة'>×</button></div>"; }).join("") + "</div>" +
        "<div class='wf-ai-row2' style='margin-top:8px'>" + (shots.length < 4 ? "<button type='button' class='wf-ai-btn2' data-add>📷 " + (shots.length ? "ضيف صورة كمان (جزء تاني)" : "صوّر / اختار صورة") + "</button>" : "") +
        (shots.length ? "<button type='button' class='wf-ai-btn' data-go>" + goLabel + "</button>" : "") + "</div><div class='wf-ai-res' data-res></div>";
      var add = body.querySelector("[data-add]"); if (add) add.onclick = function () { pickImage(2400, 3400000).then(function (im) { shots.push(im); keepExtra(); draw(); }, function (e) { fail(e, body.querySelector("[data-res]")); }); };
      Array.prototype.forEach.call(body.querySelectorAll("[data-rm]"), function (b) { b.onclick = function () { keepExtra(); shots.splice(+b.getAttribute("data-rm"), 1); draw(); }; });
      var go = body.querySelector("[data-go]"); if (go) go.onclick = function () { onGo(shots, go, body.querySelector("[data-res]"), m, body); };
      restoreExtra();
    }
    var extraVals = {};
    function keepExtra() { Array.prototype.forEach.call(body.querySelectorAll("[data-keep]"), function (e) { extraVals[e.getAttribute("data-keep")] = e.type === "checkbox" ? e.checked : e.value; }); }
    function restoreExtra() { Array.prototype.forEach.call(body.querySelectorAll("[data-keep]"), function (e) { var v = extraVals[e.getAttribute("data-keep")]; if (v === undefined) return; if (e.type === "checkbox") e.checked = v; else e.value = v; }); }
    draw();
    return m;
  }
  function zoomImg(src) { var z = modal("🔍 الصورة"); z.body.innerHTML = "<div style='overflow:auto;max-height:80vh'><img src='" + src + "' style='width:180%;max-width:none;display:block'></div><small class='hint'>اسحب يمين وشمال عشان تقرا.</small>"; }
  function normT(s) { return String(s || "").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[ً-ْـ]/g, "").replace(/\s+/g, " ").trim(); }
  /* الربط اللي اتعلمه النظام من مراجعاتك: «كلام الفاتورة» ← صنف المخزن (متزامن مع الإعدادات) */
  function invAliases() { var a = S().aiInvAliases; return Array.isArray(a) ? a : []; }
  function invoiceFlow(btn) {
    collectPhotos("🧾 توريد من صورة فاتورة", "📸 صوّر الفاتورة كلها في نور كويس ومن فوقها على طول (من غير ميل أو ظل). لو طويلة أو الخط صغير: صوّرها على جزئين أو تلاتة قريبين — هيجمعهم لوحده.<br>⏱️ القراية بتاخد من نص دقيقة لدقيقة لأنه بيقرا بدقة ويراجع الحسابات.", "🤖 اقرا الفاتورة", function (shots, go, res, m) {
      var parts = A(K().p), byId = {}; parts.forEach(function (p) { byId[p.id] = p; });
      var aliases = invAliases().filter(function (a) { return byId[a.id]; }).slice(-250).map(function (a) { return { text: a.t, part: byId[a.id].name }; });
      var done = busyBtn(go, "بيقرا ويراجع الحسابات…"); res.innerHTML = "";
      task("invoice", { images: shots.map(function (s) { return { mime: s.mime, data: s.data }; }), partCats: S().partCats || [], aliases: aliases }).then(function (r) { done(); m.close(); invoiceReview(r, shots); }, function (e) { done(); fail(e, res); });
    });
  }
  function invoiceReview(r, shots) {
    var m = modal("🧾 مراجعة الفاتورة قبل التوريد"), body = m.body, parts = A(K().p).filter(function (p) { return p && !p.archived; });
    var cats = S().partCats || [], wallets = S().wallets || [], al = invAliases(), byIdAll = {};
    parts.forEach(function (p) { byIdAll[p.id] = p; });
    // ربط اتعلمناه قبل كده بيكسب لو الموديل ماربطش
    (r.lines || []).forEach(function (l) {
      if (l.part) return;
      var keys = [normT(l.raw), normT(l.item)], hit = al.filter(function (a) { return keys.indexOf(normT(a.t)) > -1 && byIdAll[a.id]; }).pop();
      if (hit) { var p = byIdAll[hit.id]; l.part = { id: p.id, name: p.name, qty: p.qty, buy: p.buy }; l.matchConfidence = "عالي"; l.why = "اتربط كده قبل كده"; }
    });
    var dl = "<datalist id='wfAiPartsDl'>" + parts.map(function (p) { return "<option value='" + esc(p.name) + "'>"; }).join("") + "</datalist>";
    var flags = (r.lines || []).filter(function (l) { return l.unsure && l.unsure.length; }).length;
    var head = "<div class='wf-ai-shots'>" + (shots || []).map(function (s, i) { return "<div class='wf-ai-shot'><img src='" + s.dataURL + "' data-zoom='" + i + "' alt='الفاتورة'></div>"; }).join("") + "</div><small class='hint'>دوس على الصورة تكبّرها وتقارن.</small>" +
      "<div class='hint'>" + [r.supplier ? "🏪 " + esc(r.supplier) : "", r.invoiceNo ? "رقم " + esc(r.invoiceNo) : "", r.date ? "📅 " + esc(r.date) : "", (r.lines || []).length + " سطر"].filter(Boolean).join(" • ") + "</div>" +
      (flags ? "<div class='wf-ai-warn'>🟧 فيه " + flags + " سطر عليهم علامة — الخانات البرتقالي اتقرت بصعوبة أو الحساب فيها مش مظبوط، قارنها بالصورة.</div>" : "<div class='hint'>✅ كل السطور حسابها مظبوط (الكمية × الفئة = القيمة).</div>") +
      (r.mismatch ? "<div class='wf-ai-warn'>⚠️ مجموع السطور (" + r.sum + " ج) مش زي مجموع الفاتورة (" + (r.subtotal || r.total) + " ج) — غالبًا فيه سطر ناقص أو رقم غلط.</div>" : "") + (r.discount ? "<div class='hint'>🏷️ خصم: " + r.discount + " ج — الصافي " + r.total + " ج</div>" : "") +
      (r.unclear ? "<div class='wf-ai-warn'>👀 " + esc(r.unclear) + "</div>" : "") + (r.matchError ? "<div class='wf-ai-warn'>الربط بالمخزن ماتمّش — اختار الأصناف بنفسك.</div>" : "");
    var U = function (l, f) { return l.unsure && l.unsure.indexOf(f) > -1 ? " wf-ai-unsure" : ""; };
    var rows = (r.lines || []).map(function (l, i) {
      var mode = l.part ? "ex" : "new";
      return "<div class='wf-ai-card' data-i='" + i + "'><label><input type='checkbox' checked data-ok> <b>" + esc(l.item) + "</b>" + (l.specs ? " <small>(" + esc(l.specs) + ")</small>" : "") + "</label> " + (l.confidence ? conf(l.confidence) : "") +
        (l.raw && normT(l.raw) !== normT(l.item) ? "<div class='hint'>✍️ مكتوب: «" + esc(l.raw) + "»</div>" : "") + (l.mathOk === false ? "<div class='wf-ai-err'>الحساب مش مظبوط: " + l.qty + " × " + l.unitPrice + " ≠ " + l.lineTotal + " — راجع الأرقام من الصورة.</div>" : "") +
        "<div class='wf-ai-grid'><label>الصنف في المخزن" + (l.part && l.matchConfidence ? " " + conf(l.matchConfidence) : "") + "<input list='wfAiPartsDl' data-part value='" + esc(l.part ? l.part.name : "") + "' placeholder='اختار صنف موجود أو سيبه فاضي = صنف جديد'></label>" +
        "<label>لو جديد: الاسم<input data-new value='" + esc(l.newName || l.item) + "'" + (mode === "ex" ? " disabled" : "") + "></label>" +
        "<label>التصنيف (للجديد)<select data-cat" + (mode === "ex" ? " disabled" : "") + "><option value=''>— اختار —</option>" + cats.map(function (c) { return "<option" + (c === l.category ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></label>" +
        "<label>الكمية" + (l.unit && l.unit !== "قطعة" ? " <small>(" + esc(l.unit) + ")</small>" : "") + "<input type='number' min='1' step='1' data-qty class='" + U(l, "qty") + "' value='" + (l.qty || 1) + "'></label><label>سعر الشراء للوحدة<input type='number' min='0' step='0.01' data-buy class='" + U(l, "unitPrice") + "' value='" + (l.unitPrice || "") + "'></label><label data-hint class='hint'></label></div>" +
        (l.why ? "<div class='hint'>🔗 " + esc(l.why) + "</div>" : "") + "</div>";
    }).join("");
    body.innerHTML = head + dl + (rows || "<div class='wf-ai-err'>مالقيتش أصناف في الصورة — جرّب صورة أوضح.</div>") +
      "<div class='wf-ai-sum'><label><input type='checkbox' id='wfAiInvPhoto' checked> احفظ صورة الفاتورة في «فواتير المخزن»</label><br>" +
      (can("wallets.add") ? "<label>💳 دفعتها من: <select id='wfAiInvWallet'><option value=''>— مش هسجّل دفع دلوقتي (آجل)</option>" + wallets.map(function (x) { return "<option>" + esc(x) + "</option>"; }).join("") + "</select></label><br>" : "") +
      "<b id='wfAiInvTotal'></b><div style='margin-top:8px'><button type='button' class='primary' id='wfAiInvSave'>📦 سجّل التوريد</button></div>" + foot(r) + "</div>";
    Array.prototype.forEach.call(body.querySelectorAll("[data-zoom]"), function (im) { im.onclick = function () { zoomImg(im.src); }; });
    var byName = {}; parts.forEach(function (p) { byName[String(p.name).trim()] = p; });
    function rowInfo(c) {
      var nm = c.querySelector("[data-part]").value.trim(), p = byName[nm] || null, l = (r.lines || [])[+c.getAttribute("data-i")] || {};
      return { c: c, l: l, ok: c.querySelector("[data-ok]").checked, p: p, typed: nm, newName: c.querySelector("[data-new]").value.trim(), cat: c.querySelector("[data-cat]").value, qty: +c.querySelector("[data-qty]").value, buy: c.querySelector("[data-buy]").value === "" ? null : +c.querySelector("[data-buy]").value };
    }
    function refresh(ev) {
      if (ev && ev.target && ev.target.classList) ev.target.classList.remove("wf-ai-unsure");
      var tot = 0;
      Array.prototype.forEach.call(body.querySelectorAll(".wf-ai-card"), function (c) {
        var x = rowInfo(c); c.classList.toggle("off", !x.ok);
        c.querySelector("[data-new]").disabled = !!x.p; c.querySelector("[data-cat]").disabled = !!x.p;
        var lineSum = x.qty > 0 ? Math.round(x.qty * (x.buy != null ? x.buy : (x.p ? +x.p.buy || 0 : 0)) * 100) / 100 : 0;
        c.querySelector("[data-hint]").innerHTML = (x.p ? "✅ موجود — الكمية دلوقتي " + (+x.p.qty || 0) + "، شراء " + (+x.p.buy || 0) + " ج" + (x.buy != null && +x.p.buy && x.buy > +x.p.buy ? " <b>📈 السعر زاد</b>" : "") : x.typed ? "⚠️ «" + esc(x.typed) + "» مش موجود بالاسم ده — هيتعمل صنف جديد" : "➕ هيتضاف صنف جديد") + "<br>= " + lineSum + " ج";
        if (x.ok) tot += lineSum;
      });
      var ref = r.subtotal || r.total;
      $("wfAiInvTotal").innerHTML = "الإجمالي: " + (Math.round(tot * 100) / 100) + " ج" + (ref ? " (الفاتورة: " + ref + " ج)" + (Math.abs(ref - tot) > Math.max(1, ref * 0.01) ? " ⚠️" : " ✅") : "");
    }
    body.addEventListener("input", refresh); body.addEventListener("change", refresh); refresh();
    $("wfAiInvSave").onclick = function () { saveInvoice(body, rowInfo, r, shots, m); };
  }
  var invBusy = false;
  function saveInvoice(body, rowInfo, r, shots, m) {
    if (invBusy) return;
    var lines = Array.prototype.map.call(body.querySelectorAll(".wf-ai-card"), rowInfo).filter(function (x) { return x.ok; });
    if (!lines.length) return w.alert("مفيش أصناف متعلّم عليها.");
    for (var i = 0; i < lines.length; i++) {
      var x = lines[i];
      if (!Number.isSafeInteger(x.qty) || x.qty < 1) return w.alert("الكمية لازم تكون عدد صحيح أكبر من صفر («" + (x.p ? x.p.name : x.newName) + "»).");
      if (x.buy != null && (!Number.isFinite(x.buy) || x.buy < 0)) return w.alert("سعر شراء غلط في «" + (x.p ? x.p.name : x.newName) + "».");
      if (!x.p) {
        if (!x.newName) return w.alert("اكتب اسم الصنف الجديد.");
        if (!x.cat) return w.alert("اختار تصنيف للصنف الجديد «" + x.newName + "».");
        var dup = typeof w.findDuplicatePartName === "function" ? w.findDuplicatePartName(x.newName) : null;
        if (dup) { x.p = dup; continue; }
      }
    }
    var dupNew = {}; for (var j = 0; j < lines.length; j++) { if (!lines[j].p) { var k = lines[j].newName.trim(); if (dupNew[k]) return w.alert("الصنف الجديد «" + k + "» متكرر في الفاتورة — اجمعهم في سطر واحد."); dupNew[k] = 1; } }
    var wallet = ($("wfAiInvWallet") || {}).value || "";
    if (!w.confirm("هيتسجل توريد " + lines.length + " صنف" + (wallet ? " ويتسجل صرف من «" + wallet + "»" : "") + ". تمام؟")) return;
    invBusy = true;
    var keepPhotos = $("wfAiInvPhoto") && $("wfAiInvPhoto").checked && shots && shots.length;
    var photoP = keepPhotos ? Promise.all(shots.map(function (sh) { return w.ImageStore ? w.ImageStore.save(sh.dataURL) : sh.dataURL; })) : Promise.resolve([]);
    var stored = "", allStored = [], committed = false;
    Promise.resolve(photoP).then(function (list) {
      allStored = (list || []).filter(Boolean); stored = allStored[0] || "";
      var all = A(K().p), moves = A(K().m), now = new Date(), at = now.toISOString(), ids = [], total = 0, sellNotes = [];
      var label = "فاتورة" + (r.supplier ? " " + r.supplier : "") + (r.invoiceNo ? " رقم " + r.invoiceNo : "");
      lines.forEach(function (x) {
        var p = x.p ? all.filter(function (y) { return y.id === x.p.id; })[0] : null;
        if (!p) { p = { id: w.id(), name: x.newName, category: x.cat, code: "", location: "", qty: 0, min: 0, buy: x.buy || 0, use: 0, photo: "", createdAt: at }; all.push(p); }
        var cur = Number(p.qty || 0); if (!Number.isSafeInteger(cur) || cur < 0) cur = 0;
        p.qty = cur + x.qty;
        if (x.buy != null && x.p) { var su = typeof w.restockSellUpdate === "function" ? w.restockSellUpdate(p, x.buy) : null; if (su) { p.use = su.newSell; sellNotes.push(p.name + ": " + su.oldSell + " → " + su.newSell); } p.buy = x.buy; }
        var mid = w.id(); moves.push({ id: mid, partId: p.id, type: "توريد", note: "🤖 " + label, qty: x.qty, invoice: stored, at: at });
        ids.push(p.id); total += x.qty * (+p.buy || 0);
      });
      total = Math.round(total * 100) / 100;
      var values = {}; values[K().p] = all; values[K().m] = moves;
      if (allStored.length) values[K().inv] = A(K().inv).concat(allStored.map(function (ph, i) { return { id: w.id(), photo: ph, note: "🤖 " + label + " — " + lines.length + " صنف" + (allStored.length > 1 ? " (صورة " + (i + 1) + " من " + allStored.length + ")" : ""), partIds: ids, at: at }; }));
      if (wallet && total > 0) values[K().wtx] = A(K().wtx).concat({ id: w.id(), refKey: null, manualOverride: true, deleted: false, type: "out", amount: total, wallet: wallet, category: "مشتريات قطع غيار", reason: "📦 " + label + " (" + lines.length + " صنف)", note: "", date: typeof w.localDateKey === "function" ? w.localDateKey(now) : at.slice(0, 10), time: now.toTimeString().slice(0, 5), source: "restock", createdAt: at });
      // نتعلم من مراجعتك: الكلام اللي في الفاتورة ← الصنف اللي اخترته (المرة الجاية يتربط لوحده)
      var learned = 0;
      try {
        var st = S(), al = Array.isArray(st.aiInvAliases) ? st.aiInvAliases.slice() : [];
        lines.forEach(function (x) {
          var pid = x.p ? x.p.id : null; if (!pid || !x.l) return;
          [x.l.raw, x.l.item].forEach(function (t) {
            var k = normT(t); if (!k || k === normT(x.p.name) || k.length < 3) return;
            al = al.filter(function (a) { return a.t !== k; }); al.push({ t: k, id: pid }); learned++;
          });
        });
        if (learned) { st.aiInvAliases = al.slice(-400); values[K().s] = st; }
      } catch (e) {}
      return (typeof w.commitStorageAsync === "function" ? w.commitStorageAsync(values) : Promise.resolve(false)).then(function (ok) {
        if (!ok) return;
        committed = true; m.close();
        try { if (typeof w.refreshAllScreens === "function") w.refreshAllScreens(); if (typeof w.renderParts === "function") w.renderParts(); } catch (e) {}
        w.alert("✅ اتسجل توريد " + lines.length + " صنف." + (values[K().wtx] ? "\n💳 واتسجل صرف " + total + " ج من «" + wallet + "»." : "") + (sellNotes.length ? "\n📈 سعر البيع اتزوّد بنفس نسبة زيادة الشراء:\n" + sellNotes.join("\n") : ""));
      });
    }).catch(function (e) { w.alert("تعذّر التسجيل: " + ((e && e.message) || "")); }).then(function () {
      if (!committed && w.ImageStore && w.ImageStore.delete) allStored.forEach(function (ph) { try { w.ImageStore.delete(ph); } catch (e) {} });
      invBusy = false;
    });
  }
  function stockClean(btn) {
    var done = busyBtn(btn, "بيراجع المخزن…");
    task("stockClean", {}).then(function (r) { done(); stockReview(r); }, function (e) { done(); fail(e); });
  }
  function stockReview(r) {
    var m = modal("🧹 تنظيف أسماء المخزن"), body = m.body, g = r.groups || [], rn = r.renames || [];
    if (!g.length && !rn.length) { body.innerHTML = "<div class='hint'>✅ المخزن نضيف — مالقيتش أصناف متكررة أو أسماء محتاجة توضيح.</div>" + foot(r); return; }
    var link = function (p) { return "<a href='part.html?id=" + encodeURIComponent(p.id) + "' target='_blank' rel='noopener'>" + esc(p.name) + "</a> <small>(" + (+p.qty || 0) + ")</small>"; };
    body.innerHTML = (g.length ? "<h4>🔁 أصناف شكلها متكررة (" + g.length + ")</h4><div class='hint'>افتح الصنفين واتأكد إنهم نفس القطعة. الأسهل: سمّي الأساسي بالاسم الموحد، وانقل الكمية بالجرد من ملف الصنف وأرشف التاني.</div>" + g.map(function (x, i) {
      return "<div class='wf-ai-card'><div>" + x.items.map(function (p) { return (p.id === x.keepId ? "⭐ " : "• ") + link(p); }).join("<br>") + "</div><div class='hint'>" + esc(x.reason) + "</div>" + (x.name ? "<button type='button' class='wf-ai-btn2' data-g='" + i + "'>✏️ سمّي ⭐ «" + esc(x.name) + "»</button>" : "") + "</div>";
    }).join("") : "") + (rn.length ? "<h4>✏️ أسماء ممكن تبقى أوضح (" + rn.length + ")</h4>" + rn.map(function (x, i) {
      return "<div class='wf-ai-card'>" + link(x.part) + " ← <b>" + esc(x.name) + "</b><div class='hint'>" + esc(x.reason) + "</div><button type='button' class='wf-ai-btn2' data-r='" + i + "'>✏️ غيّر الاسم</button></div>";
    }).join("") : "") + foot(r);
    Array.prototype.forEach.call(body.querySelectorAll("[data-g]"), function (b) { b.onclick = function () { var x = g[+b.getAttribute("data-g")]; renamePart(x.keepId, x.name, b); }; });
    Array.prototype.forEach.call(body.querySelectorAll("[data-r]"), function (b) { b.onclick = function () { var x = rn[+b.getAttribute("data-r")]; renamePart(x.part.id, x.name, b); }; });
  }
  function renamePart(pid, name, btn) {
    name = String(name || "").trim(); if (!name) return;
    name = w.prompt("الاسم الجديد:", name); if (!name || !name.trim()) return; name = name.trim();
    var all = A(K().p), p = all.filter(function (x) { return x.id === pid; })[0]; if (!p) return w.alert("الصنف مش موجود.");
    var dup = typeof w.findDuplicatePartName === "function" ? w.findDuplicatePartName(name) : null;
    if (dup && dup.id !== pid) return w.alert("⚠️ فيه صنف تاني بنفس الاسم «" + dup.name + "».");
    var old = p.name; p.name = name; p.updatedAt = new Date().toISOString();
    var values = {}; values[K().p] = all;
    (typeof w.commitStorageAsync === "function" ? w.commitStorageAsync(values) : Promise.resolve(false)).then(function (ok) {
      if (!ok) return;
      try { if (typeof w.auditLog === "function") w.auditLog("rename", "part", pid, old + " ← " + name + " (اقتراح الذكاء الاصطناعي)"); } catch (e) {}
      btn.disabled = true; btn.textContent = "✅ اتغيّر"; try { if (typeof w.renderParts === "function") w.renderParts(); } catch (e) {}
    });
  }

  /* =====================================================================
     📊 ملخص التقارير بالكلام
     ===================================================================== */
  var SUMKEY = "wf_ai_summary";
  function summaryPanel() {
    var host = $("reportsHost"); if (!host || typeof w.WFReportData !== "function") return;
    var p = $("wfAiSummary");
    if (!on("summary") || !can("reports.view")) { if (p) p.style.display = "none"; return; }
    css();
    if (!p) { p = d.createElement("section"); p.id = "wfAiSummary"; p.className = "panel no-print"; host.parentNode.insertBefore(p, host); }
    p.style.display = "";
    var rg = w.WFReportRange && w.WFReportRange(), key = rg && rg.valid ? rg.from + "_" + rg.to : "", saved = key ? (readJ(SUMKEY) || {})[key] : null;
    if (p.getAttribute("data-key") === key && p.firstChild && !summaryPanel._force) return;
    summaryPanel._force = false; p.setAttribute("data-key", key);
    p.innerHTML = "<div class='wf-ai-tool' style='margin:0'><div class='wf-ai-row2'><b>🤖 ملخص الفترة بالكلام</b><button type='button' class='wf-ai-btn" + (saved ? "2" : "") + "' id='wfAiSumBtn'>" + (saved ? "🔄 لخّص من جديد" : "🤖 لخّص الفترة دي") + "</button></div><div class='wf-ai-res' id='wfAiSumRes'>" + (saved ? sumHtml(saved.r) + "<div class='wf-ai-foot'>" + esc(new Date(saved.at).toLocaleString("ar-EG")) + "</div>" : "<small class='hint'>إيه اللي ماشي كويس، وإيه اللي محتاج انتباه، و3 لـ 5 خطوات تعملها — من أرقام الفترة المختارة.</small>") + "</div></div>";
    $("wfAiSumBtn").onclick = function () { runSummary(this, key, rg); };
  }
  function readJ(k) { try { var v = w.WFStorage && w.WFStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function writeJ(k, v) { try { if (w.WFStorage) w.WFStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function sumHtml(r) {
    var L = function (t, a) { return a && a.length ? "<h4>" + t + "</h4><ul>" + a.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : ""; };
    return "<div><b>" + esc(r.headline) + "</b></div>" + L("👍 ماشي كويس", r.good) + L("⚠️ محتاج انتباه", r.watch) + L("✅ تعمل إيه الأسبوع ده", r.actions);
  }
  function runSummary(btn, key, rg) {
    var res = $("wfAiSumRes"), data = w.WFReportData();
    if (!data) { res.innerHTML = "<div class='wf-ai-err'>اختار فترة صحيحة الأول.</div>"; return; }
    var stats = compactStats(data), done = busyBtn(btn, "بيلخّص…");
    task("monthSummary", { label: rg ? rg.from + " → " + rg.to : "", stats: stats }).then(function (r) {
      var all = readJ(SUMKEY) || {}; all[key] = { at: Date.now(), r: r }; var ks = Object.keys(all); if (ks.length > 24) ks.sort(function (a, b) { return all[a].at - all[b].at; }).slice(0, ks.length - 24).forEach(function (k) { delete all[k]; }); writeJ(SUMKEY, all);
      res.innerHTML = sumHtml(r) + foot(r);
      setTimeout(function () { btn.className = "wf-ai-btn2"; btn.textContent = "🔄 لخّص من جديد"; }, 0);
    }, function (e) { fail(e, res); }).then(done);
  }
  /* أرقام مختصرة من نفس حسابات صفحة التقارير (من غير أسماء عملاء أو تليفونات) */
  var SCALARS = ["created", "completed", "cancelled", "returns", "revenue", "orderRevenue", "labor", "partsSell", "partsCost", "gross", "totalExp", "techPay", "net", "collected", "avgDays", "avgTicket", "saleRev", "saleQty", "open", "waiting", "workshop", "low", "depositsHeld", "treasuryBalance", "overdueNow", "onTime", "late", "firstVisit", "repeat", "activeCust", "usedValue"];
  function compactStats(dt) {
    function n(v) { v = +v; return Number.isFinite(v) ? Math.round(v * 100) / 100 : undefined; }
    function pickScalars(o) { var out = {}; if (!o) return out; SCALARS.forEach(function (k) { var v = o[k]; if (Array.isArray(v)) v = v.length; v = n(v); if (v !== undefined) out[k] = v; }); if (Array.isArray(o.closedOrders)) out.closedOrders = o.closedOrders.length; return out; }
    function simple(v, depth) {
      if (v == null) return undefined; if (typeof v === "number") return n(v); if (typeof v === "string") return v.length > 80 ? v.slice(0, 80) : v; if (typeof v === "boolean") return v;
      if (depth > 2) return undefined;
      if (v instanceof Map) { var a = []; v.forEach(function (val, k) { a.push([k, val]); }); v = a.map(function (x) { var s = simple(x[1], depth + 1); return s && typeof s === "object" && !Array.isArray(s) ? Object.assign({ name: String(x[0]).slice(0, 60) }, s) : { name: String(x[0]).slice(0, 60), value: s }; }); }
      if (Array.isArray(v)) return v.slice(0, 8).map(function (x) { return simple(x, depth + 1); }).filter(function (x) { return x !== undefined; });
      if (typeof v === "object") { var o = {}, c = 0; Object.keys(v).forEach(function (k) { if (c > 12 || /phone|address|customerId|^id$|^c$|^d$|^o$|^r$|^p$|cust|photo|media/i.test(k)) return; var s = simple(v[k], depth + 1); if (s !== undefined && !(typeof s === "object" && !Array.isArray(s) && !Object.keys(s).length)) { o[k] = s; c++; } }); return o; }
      return undefined;
    }
    var out = { now: pickScalars(dt), previous: pickScalars(dt.prev) };
    try { out.receivables = { count: (dt.receivables || []).length, total: n((dt.receivables || []).reduce(function (a, x) { return a + (+x.due || 0); }, 0)) }; } catch (e) {}
    ["techs", "expByCat", "byType", "faultsByType", "partsByType", "weak", "runout", "warranty", "byWallet", "areas"].forEach(function (k) { try { var s = simple(dt[k], 0); if (s !== undefined) out[k] = s; } catch (e) {} });
    var j = JSON.stringify(out); if (j.length > 13000) { delete out.areas; delete out.partsByType; delete out.byWallet; }
    return out;
  }

  /* ---------- البداية ---------- */
  function all() { try { codesPage(); codeProfileBtn(); msgSlots(); voicePanel(); callSharePanel(); plateButtons(); inventoryButtons(); summaryPanel(); } catch (e) { try { console.warn("[ai-tools]", e); } catch (x) {} } }
  var tm = null;
  function soon() { clearTimeout(tm); tm = setTimeout(all, 120); }
  function start() {
    if (!AI()) return setTimeout(start, 200);
    AI().onChange(function () { var s = d.querySelectorAll(".wf-ai-msg-slot"); for (var i = 0; i < s.length; i++) s[i].setAttribute("data-ai-done", "0"); soon(); });
    var need = $("faultForm") || $("faultCodeProfile") || $("quickOrderBody") || $("shareSummaryBox") || $("deviceForm") || $("restockBox") || $("reportsHost") || d.querySelector(".wf-ai-msg-slot");
    if (need) setTimeout(function () { AI().refresh(false); }, 1200);
    all();
    try { new MutationObserver(function (ms) { for (var i = 0; i < ms.length; i++) { var t = ms[i].target; if (t && t.closest && t.closest("audio,#wfAiBook,.wf-ai-tool,.wf-ai-modal,.wf-ai-mask,.wf-ai-msg-slot,#wfAiSummary,#wfAiInvBar,#wfAiCodeOne")) continue; return soon(); } }).observe(d.body, { childList: true, subtree: true }); } catch (e) {}
    var ap = $("repApply"); if (ap) ap.addEventListener("click", function () { setTimeout(summaryPanel, 400); });
  }
  w.WFAITools = { compactStats: compactStats, applyOrder: applyOrder, _all: all };
  function boot() { Promise.resolve(w.WFStorageReady).then(start, start); }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot); else boot();
})(window);
