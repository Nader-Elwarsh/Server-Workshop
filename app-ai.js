/* =========================================================
   🤖 الذكاء الاصطناعي (app-ai.js)
   - مساعد التشخيص: في صفحة أمر الشغل وبوابة الفني (أي عنصر .wf-ai-slot[data-ai-rid]).
     بيبعت للسيرفر الجهاز والعطل واللي اتعمل + سجل الورشة لنفس الجهاز وأعطال شبيهة — من غير اسم/تليفون/عنوان العميل.
     النتيجة بتتحفظ على الجهاز ده (wf_ai_diag) عشان فتح الأمر تاني ما يتحسبش مرة كمان.
   - إعدادات المالك (الإعدادات ← 🤖 الذكاء الاصطناعي): تشغيل/إيقاف عام ولكل ميزة، حد أقصى للصرف في الشهر،
     الموديل، واستهلاك الشهر (بيظهر كمان في «الاستهلاك والمساحة»).
   الأزرار بتظهر بس لو المالك مشغّل الميزة (الحالة متخزنة على الجهاز وبتتحدّث من السيرفر).
   ========================================================= */
(function (w) {
  "use strict";
  var d = w.document, CFG_KEY = "wf_ai_cfg", CACHE_KEY = "wf_ai_diag";
  var cfg = null, cfgAt = 0, lastTry = 0, cfgBusy = false, ownerData = null, busy = {}, errs = {}, open = {};
  var FEAT = { diag: { name: "🩺 مساعد التشخيص والقطع", desc: "يقترح الأسباب المحتملة وإزاي تتأكد منها، والقطع اللي تاخدها معاك، وأسئلة للعميل — من وصف العطل وسجل الورشة." } };
  var SOON = [["🎙️ أمر الشغل بالصوت", "تتكلم والأمر يتملي لوحده"], ["🧾 صورة فاتورة المورد", "تصوّر الفاتورة والأصناف والأسعار تتسجل"]];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function A(k) { try { return (typeof w.arr === "function" && k ? w.arr(k) : []) || []; } catch (e) { return []; } }
  function K() { return w.K || {}; }
  function rj(k) { try { var v = w.WFStorage && w.WFStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function wj(k, v) { try { if (w.WFStorage) w.WFStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function usd(v) { v = +v || 0; return v === 0 ? "$0" : v < 0.01 ? "أقل من سنت" : "$" + (v < 10 ? v.toFixed(2) : v.toFixed(1)); }
  function call(name, data) { if (!w.WFMedia || !w.WFMedia.call) return Promise.reject(new Error("الصفحة لسه بتحمّل — جرّب كمان ثانية.")); return w.WFMedia.call(name, data || {}); }
  function on(f) { return !!(cfg && cfg.enabled && cfg.features && cfg.features[f]); }

  /* ---------- حالة التشغيل ---------- */
  function setCfg(c, fromServer) {
    var before = JSON.stringify(cfg && { e: cfg.enabled, f: cfg.features, c: cfg.capReached });
    cfg = { enabled: !!c.enabled, features: c.features || {}, capReached: !!c.capReached };
    if (fromServer) { cfgAt = Date.now(); wj(CFG_KEY, { enabled: cfg.enabled, features: cfg.features, capReached: cfg.capReached, at: cfgAt }); }
    if (JSON.stringify({ e: cfg.enabled, f: cfg.features, c: cfg.capReached }) !== before) fillAll(true);
  }
  function refreshCfg(force) {
    if (cfgBusy || (!force && (Date.now() - cfgAt < 10 * 60000 || Date.now() - lastTry < 60000))) return Promise.resolve(cfg);
    if (navigator.onLine === false || !w.WFMedia) return Promise.resolve(cfg);
    cfgBusy = true; lastTry = Date.now();
    return call("aiConfig").then(function (c) { if (c && c.owner) ownerData = c; setCfg(c, true); return c; }, function () { return cfg; }).then(function (x) { cfgBusy = false; return x; });
  }

  /* ---------- السياق اللي بيتبعت (من غير بيانات العميل) ---------- */
  function norm(s) { return String(s || "").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[ً-ْـ]/g, ""); }
  var STOP = { "مش": 1, "فيه": 1, "في": 1, "من": 1, "علي": 1, "على": 1, "عند": 1, "بعد": 1, "قبل": 1, "خالص": 1, "جدا": 1, "شويه": 1, "العميل": 1, "الجهاز": 1, "بيقول": 1, "لما": 1, "اللي": 1, "ولا": 1, "وكمان": 1, "the": 1, "and": 1 };
  function words(s) { var o = {}; norm(s).replace(/[^؀-ۿa-z0-9]+/g, " ").split(" ").forEach(function (x) { if ((x.length > 2 || /^\d+$/.test(x)) && !STOP[x]) o[x.replace(/^(ال|وال|بال)/, "")] = 1; }); return o; }
  function overlap(a, b) { var n = 0; Object.keys(a).forEach(function (x) { if (b[x]) n++; }); return n; }
  function clip(s, n) { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; }
  function devOf(id, map) { return map[id] || {}; }
  function context(r) {
    var devs = {}, parts = {}, returned = {};
    A(K().d).forEach(function (x) { if (x) devs[x.id] = x; });
    A(K().p).forEach(function (x) { if (x) parts[x.id] = x; });
    var all = A(K().r);
    all.forEach(function (o) { if (o && o.warrantyOf) returned[o.warrantyOf] = 1; });
    var dv = devOf(r.deviceId, devs), fw = words(r.fault + " " + (r.work || "")), same = [], sim = [];
    function item(o) {
      return { fault: clip(o.fault, 200), work: clip(o.work, 300), when: String(o.createdAt || "").slice(0, 10), returned: !!returned[o.id],
        parts: (o.parts || []).map(function (x) { return x.external ? x.name : (parts[x.partId] || {}).name; }).filter(Boolean).slice(0, 8) };
    }
    all.forEach(function (o) {
      if (!o || o.id === r.id || o.status === "ملغي" || (!o.fault && !o.work)) return;
      if (r.deviceId && o.deviceId === r.deviceId) { same.push(o); return; }
      if (!o.work && !(o.parts || []).length) return;
      var od = devOf(o.deviceId, devs);
      if (dv.type && od.type && od.type !== dv.type) return;
      var s = overlap(fw, words(o.fault + " " + (o.work || "")));
      if (!s) return;
      if (dv.brand && od.brand === dv.brand) s += 0.5;
      if (dv.model && od.model === dv.model) s += 1;
      if (o.closed || o.status === "مكتمل") s += 0.25;
      sim.push({ s: s, o: o });
    });
    same.sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); });
    sim.sort(function (a, b) { return b.s - a.s || String(b.o.createdAt || "").localeCompare(String(a.o.createdAt || "")); });
    return {
      device: { type: dv.type || "", brand: dv.brand || "", model: dv.model || "", desc: clip(dv.desc || "", 150) },
      fault: clip(r.fault, 600), work: clip(r.work, 600),
      sameDevice: same.slice(0, 5).map(item), similar: sim.slice(0, 12).map(function (x) { return item(x.o); })
    };
  }
  function keyOf(ctx) { var s = JSON.stringify([ctx.device, ctx.fault, ctx.work]), h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); }
  function cacheGet(id) { var c = rj(CACHE_KEY) || {}; return c[id] || null; }
  function cachePut(id, v) {
    var c = rj(CACHE_KEY) || {}; c[id] = v;
    var ids = Object.keys(c); if (ids.length > 150) ids.sort(function (a, b) { return (c[a].at || 0) - (c[b].at || 0); }).slice(0, ids.length - 150).forEach(function (k) { delete c[k]; });
    wj(CACHE_KEY, c);
  }
  /* القطعة المقترحة موجودة في المخزن؟ (مطابقة كلمات الاسم) */
  function stockMatch(name) {
    var nw = words(name), need = Object.keys(nw).length, best = null, bs = 0;
    if (!need) return null;
    A(K().p).forEach(function (p) {
      if (!p || !p.name) return;
      var pw = words(p.name), ov = overlap(nw, pw), s = ov / need + 0.01 * ov / Math.max(1, Object.keys(pw).length);
      if (s > bs || (s === bs && best && (+p.qty || 0) > (+best.qty || 0))) { bs = s; best = p; }
    });
    return bs >= 0.5 ? best : null;
  }

  /* ---------- صندوق التشخيص ---------- */
  function css() {
    if (d.getElementById("wfAiCss")) return;
    var s = d.createElement("style"); s.id = "wfAiCss";
    s.textContent = ".wf-ai{margin-top:8px;border:1px dashed rgba(124,58,237,.45);border-radius:12px;padding:10px 12px;background:rgba(124,58,237,.05)}" +
      ".wf-ai-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:space-between}.wf-ai-top small{opacity:.7;font-size:12px}" +
      ".wf-ai-btn{background:#6d28d9;color:#fff;border:0;border-radius:10px;padding:8px 12px;font-weight:700;cursor:pointer}.wf-ai-btn[disabled]{opacity:.6}" +
      ".wf-ai-btn2{background:transparent;border:1px solid rgba(124,58,237,.5);color:inherit;border-radius:9px;padding:5px 9px;font-size:13px;cursor:pointer}" +
      ".wf-ai h4{margin:10px 0 4px;font-size:14.5px}.wf-ai ol,.wf-ai ul{margin:0;padding-inline-start:20px}.wf-ai li{margin:4px 0;line-height:1.6}" +
      ".wf-ai-chip{display:inline-block;font-size:11.5px;border-radius:8px;padding:1px 7px;margin-inline-start:6px;font-weight:700}.wf-ai-hi{background:#fde2e2;color:#991b1b}.wf-ai-md{background:#fef3c7;color:#92400e}.wf-ai-lo{background:#e5e7eb;color:#374151}" +
      ".wf-ai-ok{background:#dcfce7;color:#166534}.wf-ai-no{background:#f3f4f6;color:#6b7280}.wf-ai-chk{display:block;font-size:13px;opacity:.85}" +
      ".wf-ai-warn{margin-top:8px;padding:7px 9px;border-radius:9px;background:#fff7ed;color:#9a3412;font-size:13.5px}.wf-ai-hist{margin-top:8px;padding:7px 9px;border-radius:9px;background:rgba(21,101,192,.08);font-size:13.5px}" +
      ".wf-ai-foot{margin-top:8px;font-size:12px;opacity:.7}.wf-ai-err{color:#b91c1c;font-size:13.5px;margin-top:6px}" +
      ".wf-ai-set label.wf-ai-row{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid rgba(127,127,127,.15);cursor:pointer}.wf-ai-set label.wf-ai-row input{width:20px;height:20px;flex:none;margin-top:2px}" +
      ".wf-ai-set .wf-ai-soon{opacity:.55;cursor:default}.wf-ai-set .wf-ai-g{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}.wf-ai-set input[type=number]{width:90px}" +
      ".wf-ai-bar{height:9px;border-radius:6px;background:rgba(127,127,127,.18);overflow:hidden;margin:4px 0}.wf-ai-bar i{display:block;height:100%;background:#6d28d9}" +
      ".wf-ai-cmd{direction:ltr;text-align:left;font:12px/1.5 monospace;background:rgba(127,127,127,.12);padding:8px;border-radius:8px;white-space:pre-wrap;word-break:break-all;margin:6px 0;user-select:all}" +
      "[data-theme=dark] .wf-ai-warn{background:#3b2310;color:#fdba74}[data-theme=dark] .wf-ai-hi{background:#4c1d1d;color:#fca5a5}[data-theme=dark] .wf-ai-md{background:#422c0b;color:#fcd34d}[data-theme=dark] .wf-ai-lo,[data-theme=dark] .wf-ai-no{background:#2a2f3a;color:#cbd5e1}[data-theme=dark] .wf-ai-ok{background:#12351f;color:#86efac}";
    (d.head || d.documentElement).appendChild(s);
  }
  function lkCls(l) { return l === "عالي" ? "wf-ai-hi" : l === "ضعيف" ? "wf-ai-lo" : "wf-ai-md"; }
  function resultHtml(res) {
    var h = "";
    if (res.summary) h += "<div style='margin-top:8px'><b>" + esc(res.summary) + "</b></div>";
    if (res.fromHistory) h += "<div class='wf-ai-hist'>📚 من سجل الورشة: " + esc(res.fromHistory) + "</div>";
    if (res.causes && res.causes.length) h += "<h4>🔎 الأسباب المحتملة</h4><ol>" + res.causes.map(function (c) { return "<li><b>" + esc(c.title) + "</b><span class='wf-ai-chip " + lkCls(c.likelihood) + "'>" + esc(c.likelihood) + "</span>" + (c.checks ? "<span class='wf-ai-chk'>✔️ " + esc(c.checks) + "</span>" : "") + "</li>"; }).join("") + "</ol>";
    if (res.parts && res.parts.length) h += "<h4>🧰 خد معاك</h4><ul>" + res.parts.map(function (p) {
      var m = stockMatch(p.name), q = m ? +m.qty || 0 : 0;
      var chip = m ? (q > 0 ? "<span class='wf-ai-chip wf-ai-ok'>في المخزن: " + esc(m.name) + " (" + q + ")</span>" : "<span class='wf-ai-chip wf-ai-no'>خلصانة: " + esc(m.name) + "</span>") : "<span class='wf-ai-chip wf-ai-no'>مش في المخزن</span>";
      return "<li><b>" + esc(p.name) + "</b>" + chip + (p.why ? "<span class='wf-ai-chk'>" + esc(p.why) + "</span>" : "") + "</li>";
    }).join("") + "</ul>";
    if (res.questions && res.questions.length) h += "<h4>📞 اسأل العميل</h4><ul>" + res.questions.map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + "</ul>";
    if (res.safety) h += "<div class='wf-ai-warn'>⚠️ " + esc(res.safety) + "</div>";
    return h;
  }
  function boxHtml(r) {
    var id = r.id, cached = cacheGet(id), ctx = context(r), fresh = cached && cached.key === keyOf(ctx), b = busy[id];
    var h = "<div class='wf-ai'><div class='wf-ai-top'><b>🤖 مساعد التشخيص</b>";
    if (b) h += "<button type='button' class='wf-ai-btn' disabled>⏳ بيحلّل…</button>";
    else if (cached && open[id] !== false) h += "<span><button type='button' class='wf-ai-btn2' data-ai-act='run'>🔄 " + (fresh ? "تحليل من جديد" : "العطل اتغيّر — حلّل تاني") + "</button> <button type='button' class='wf-ai-btn2' data-ai-act='hide'>إخفاء</button></span>";
    else if (cached) h += "<button type='button' class='wf-ai-btn2' data-ai-act='show'>📋 عرض آخر تحليل</button>";
    else h += "<button type='button' class='wf-ai-btn' data-ai-act='run'>🤖 اقترح تشخيص وقطع</button>";
    h += "</div>";
    if (!cached && !b) h += "<small style='display:block;opacity:.7;font-size:12px;margin-top:4px'>بيتبعت الجهاز والعطل وسجل الورشة بس — من غير اسم أو تليفون العميل." + (cfg && cfg.capReached ? " ⚠️ حد الصرف الشهري اتعدّى." : "") + "</small>";
    if (errs[id]) h += "<div class='wf-ai-err'>⚠️ " + esc(errs[id]) + "</div>";
    if (cached && !b && open[id] !== false) {
      h += resultHtml(cached.res);
      h += "<div class='wf-ai-foot'>اقتراح مساعد — القرار النهائي للفني بعد الفحص • " + esc(new Date(cached.at).toLocaleString("ar-EG")) + (ctx.similar.length || ctx.sameDevice.length ? " • استفاد من " + (ctx.similar.length + ctx.sameDevice.length) + " أمر قديم" : "") + "</div>";
    }
    return h + "</div>";
  }
  function findOrder(id) { return A(K().r).filter(function (x) { return x && String(x.id) === String(id); })[0] || null; }
  function fill(slot, force) {
    var id = slot.getAttribute("data-ai-rid");
    if (!force && slot.getAttribute("data-ai-done") === "1") return;
    slot.setAttribute("data-ai-done", "1");
    var r = id && findOrder(id);
    refreshCfg(false);
    if (!r || !on("diag") || r.status === "ملغي") { slot.innerHTML = ""; slot.style.display = "none"; return; }
    css(); slot.style.display = ""; slot.innerHTML = boxHtml(r);
  }
  function fillAll(force) { var s = d.querySelectorAll(".wf-ai-slot[data-ai-rid]"); for (var i = 0; i < s.length; i++) fill(s[i], force); }
  function run(id) {
    var r = findOrder(id); if (!r || busy[id]) return;
    if (navigator.onLine === false) { errs[id] = "مفيش إنترنت — التحليل محتاج نت."; return fillAll(true); }
    var ctx = context(r);
    if (!ctx.fault && !ctx.work) { errs[id] = "اكتب العطل الأول."; return fillAll(true); }
    busy[id] = 1; errs[id] = ""; fillAll(true);
    call("aiDiagnose", ctx).then(function (res) {
      cachePut(id, { key: keyOf(ctx), at: Date.now(), res: res }); open[id] = true;
    }, function (e) {
      errs[id] = (e && e.message) || "تعذّر — جرّب تاني.";
      if (/مقفول|الحد الأقصى/.test(errs[id])) refreshCfg(true);
    }).then(function () { delete busy[id]; fillAll(true); });
  }
  d.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest("[data-ai-act]") : null; if (!b) return;
    var slot = b.closest(".wf-ai-slot"); if (!slot) return;
    ev.preventDefault(); ev.stopPropagation();
    var id = slot.getAttribute("data-ai-rid"), act = b.getAttribute("data-ai-act");
    if (act === "run") run(id); else { open[id] = act === "show"; fillAll(true); }
  }, true);

  /* ---------- إعدادات المالك ---------- */
  var setMsg = "", setBusy = false, ownerAt = 0, dirty = false, ownerBusy = false;
  function settingsHtml(c) {
    var u = c.usage || { cost: 0, calls: 0, byFeature: {}, byUser: {} }, cap = +c.capUsd || 0, pct = cap > 0 ? Math.min(100, (u.cost / cap) * 100) : 100;
    var h = "<div class='wf-ai-set'>";
    h += "<p class='hint'>الدفع على قد الاستخدام بس: لو محدش داس على زرار ذكاء اصطناعي، الشهر بيعدّي بـ $0. التكلفة بتتخصم من نفس حساب Google Cloud (والكريدت المجاني لو موجود).</p>";
    h += "<label class='wf-ai-row'><input type='checkbox' id='aiOn'" + (c.enabled ? " checked" : "") + "><span><b>تشغيل الذكاء الاصطناعي</b><br><small>لو اتقفل: كل الأزرار تختفي ومفيش أي طلب يتبعت.</small></span></label>";
    Object.keys(FEAT).forEach(function (k) { h += "<label class='wf-ai-row'><input type='checkbox' data-ai-feat='" + k + "'" + (c.features && c.features[k] ? " checked" : "") + "><span><b>" + esc(FEAT[k].name) + "</b><br><small>" + esc(FEAT[k].desc) + "</small></span></label>"; });
    SOON.forEach(function (s) { h += "<label class='wf-ai-row wf-ai-soon'><input type='checkbox' disabled><span><b>" + esc(s[0]) + "</b> <small>(قريبًا)</small><br><small>" + esc(s[1]) + "</small></span></label>"; });
    h += "<div class='wf-ai-g'><label>💵 أقصى صرف في الشهر ($): <input type='number' id='aiCap' min='0' max='500' step='0.5' value='" + esc(cap) + "'></label>";
    h += "<label>الموديل: <select id='aiModel'>" + (c.models || ["auto"]).map(function (m) { return "<option value='" + esc(m) + "'" + (m === c.model ? " selected" : "") + ">" + (m === "auto" ? "تلقائي (مُقترح)" : esc(m)) + "</option>"; }).join("") + "</select></label>";
    h += "<button type='button' class='primary' id='aiSave'" + (setBusy ? " disabled" : "") + ">💾 حفظ</button></div>";
    if (setMsg) h += "<div class='hint'>" + esc(setMsg) + "</div>";
    h += "<h3 style='margin:12px 0 4px'>📊 استهلاك الشهر (" + esc(u.month || "") + ")</h3>";
    h += "<div><b>" + usd(u.cost) + "</b> من " + usd(cap) + " • " + (u.calls || 0) + " مرة</div><div class='wf-ai-bar'><i style='width:" + Math.max(2, pct) + "%'></i></div>";
    var bf = Object.keys(u.byFeature || {}); if (bf.length) h += "<div class='hint'>" + bf.map(function (k) { var x = u.byFeature[k] || {}; return esc((FEAT[k] || { name: k }).name) + ": " + (x.calls || 0) + " مرة (" + usd(x.cost) + ")"; }).join(" • ") + "</div>";
    var bu = Object.keys(u.byUser || {}); if (bu.length) h += "<div class='hint'>👤 " + bu.map(function (k) { var x = u.byUser[k] || {}; return esc((c.names && c.names[k]) || "مستخدم") + ": " + (x.calls || 0); }).join(" • ") + "</div>";
    var p = encodeURIComponent(c.project || "");
    h += "<details style='margin-top:10px'><summary>⚙️ أول مرة / الإيقاف من جوجل</summary><div class='hint'>مرة واحدة: افتح Cloud Shell ونفّذ الأوامر دي واحد ورا التاني (بتفعّل Vertex AI وتدي الدوال صلاحية استخدامه):</div>" +
      "<div class='wf-ai-cmd'>gcloud services enable aiplatform.googleapis.com --project " + esc(c.project || "PROJECT_ID") + "</div>" +
      "<div class='wf-ai-cmd'>PN=$(gcloud projects describe " + esc(c.project || "PROJECT_ID") + " --format='value(projectNumber)')</div>" +
      "<div class='wf-ai-cmd'>gcloud projects add-iam-policy-binding " + esc(c.project || "PROJECT_ID") + " --member=\"serviceAccount:${PN}-compute@developer.gserviceaccount.com\" --role=\"roles/aiplatform.user\" --condition=None</div>" +
      "<div class='hint'>إيقاف نهائي من بره التطبيق: اقفل Vertex AI API من <a href='https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project=" + p + "' target='_blank' rel='noopener'>صفحة الخدمة</a>. وتنبيه بالإيميل لو الصرف عدّى رقم: <a href='https://console.cloud.google.com/billing/budgets' target='_blank' rel='noopener'>الميزانيات (Budgets)</a>.</div></details>";
    return h + "</div>";
  }
  function drawSettings() {
    var box = d.getElementById("aiSettingsBody"); if (!box) return;
    if (!ownerData) { box.innerHTML = "<div class='hint'>" + esc(setMsg || "⏳ بنحمّل الإعدادات…") + "</div>"; return; }
    css(); box.innerHTML = settingsHtml(ownerData); dirty = false;
    box.oninput = box.onchange = function () { dirty = true; };
    var sv = d.getElementById("aiSave");
    if (sv) sv.onclick = function () {
      var feats = {}; var fs = box.querySelectorAll("[data-ai-feat]"); for (var i = 0; i < fs.length; i++) feats[fs[i].getAttribute("data-ai-feat")] = fs[i].checked;
      var cap = +d.getElementById("aiCap").value;
      if (!(cap >= 0 && cap <= 500)) { setMsg = "الحد لازم يكون بين 0 و 500 دولار."; return drawSettings(); }
      var body = { enabled: d.getElementById("aiOn").checked, features: feats, capUsd: cap, model: d.getElementById("aiModel").value };
      setBusy = true; setMsg = "⏳ بنحفظ…"; drawSettings();
      call("aiConfigSave", body).then(function (c) {
        ownerData = c; ownerAt = Date.now(); setCfg(c, true); setMsg = "✅ اتحفظ" + (c.enabled ? "." : " — الذكاء الاصطناعي مقفول.");
      }, function (e) { setMsg = "⚠️ " + ((e && e.message) || "تعذّر الحفظ"); }).then(function () { setBusy = false; drawSettings(); drawUsageMini(); });
    };
  }
  function drawUsageMini() {
    var box = d.getElementById("aiUsageMini"); if (!box) return;
    if (!ownerData) { box.innerHTML = ""; return; }
    var u = ownerData.usage || {}, cap = +ownerData.capUsd || 0;
    css();
    box.innerHTML = "<div class='wf-ai' style='margin-bottom:10px'><b>🤖 الذكاء الاصطناعي</b> — " + (ownerData.enabled ? "شغال" : "مقفول") + "<div>الشهر ده: <b>" + usd(u.cost) + "</b> من حد " + usd(cap) + " • " + (u.calls || 0) + " مرة</div><div class='wf-ai-bar'><i style='width:" + Math.max(2, cap > 0 ? Math.min(100, (u.cost || 0) / cap * 100) : 100) + "%'></i></div></div>";
  }
  function loadOwner() {
    /* القرار للسيرفر (aiConfig بيرجّع owner) — صلاحيات الجهاز (WFPerm) بتتحمّل متأخر وممكن تبقى لسه مش جاهزة هنا. */
    if (ownerBusy || (ownerData && Date.now() - ownerAt < 60000)) return;
    ownerBusy = true;
    if (!ownerData) { setMsg = ""; drawSettings(); }
    call("aiConfig").then(function (c) { if (c && c.owner) { ownerData = c; ownerAt = Date.now(); setMsg = ""; setCfg(c, true); } else if (!ownerData) setMsg = "🔒 الجزء ده للمالك بس" + (c ? "." : " — مقدرناش نتأكد من الحساب، جرّب تاني."); },
      function (e) { if (!ownerData) setMsg = "⚠️ " + ((e && e.message) || "تعذّر التحميل"); }).then(function () { ownerBusy = false; if (!dirty) drawSettings(); drawUsageMini(); });
  }
  function wireSettings() {
    var opened = function () { var x = d.querySelectorAll("#ai-panel details, #media-cleanup-panel details"); for (var i = 0; i < x.length; i++) if (x[i].open) return true; return false; };
    (function hookPerm(n) {
      if (w.WFPerm && w.WFPerm.onChange) { try { w.WFPerm.onChange(function () { if (opened() && !ownerData) { ownerAt = 0; loadOwner(); } }); } catch (e) {} return; }
      if (n < 60) setTimeout(function () { hookPerm(n + 1); }, 500);
    })(0);
    [["ai-panel"], ["media-cleanup-panel"]].forEach(function (x) {
      var p = d.getElementById(x[0]), det = p && p.querySelector("details");
      if (!det) return;
      det.addEventListener("toggle", function () { if (det.open) loadOwner(); });
      if (det.open) loadOwner();
    });
  }

  /* ---------- البداية ---------- */
  function start() {
    var c = rj(CFG_KEY); if (c) { cfg = { enabled: !!c.enabled, features: c.features || {}, capReached: !!c.capReached }; cfgAt = +c.at || 0; }
    fillAll(false);
    try { new MutationObserver(function () { fillAll(false); }).observe(d.body, { childList: true, subtree: true }); } catch (e) {}
    if (cfg) setTimeout(function () { refreshCfg(false); }, 2500);
    wireSettings();
  }
  w.WFAI = { context: context, stockMatch: stockMatch, isOn: on, refresh: refreshCfg, _boxHtml: boxHtml, _settingsHtml: settingsHtml, _setCfg: setCfg };
  function boot() { Promise.resolve(w.WFStorageReady).then(start, start); }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot); else boot();
})(window);
