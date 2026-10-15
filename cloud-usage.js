/* =========================================================
   الإعدادات ← ☁️ الاستهلاك والمساحة (cloud-usage.js) — للمالك
   كل مكان بنخزّن فيه حاجة برا الجهاز: المستهلك، الباقي من المجاني،
   وبعد المجاني الفلوس بتتحسب إزاي، وتقدير تكلفة الشهر ده.
   البيانات من دالة usageReport (Cloud Monitoring + Cloudinary + Artifact Registry).
   الأسعار تقريبية بالدولار — الفاتورة الحقيقية في Google Cloud Billing.
   ========================================================= */
(function (w) {
  "use strict";
  var d = w.document, last = null, busy = false, err = "";
  function $(id) { return d.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function n(v) { return (Math.round(+v || 0)).toLocaleString("en"); }
  function gb(b) { b = +b || 0; return b >= 1073741824 ? (b / 1073741824).toFixed(2) + " جيجا" : b >= 1048576 ? (b / 1048576).toFixed(1) + " ميجا" : Math.max(0, Math.round(b / 1024)) + " ك.ب"; }
  function usd(v) { v = +v || 0; return v < 0.005 ? "$0" : "$" + (v < 1 ? v.toFixed(2) : v.toFixed(1)); }
  function isOwner() { try { return !w.WFPerm || !w.WFPerm.isOwner || w.WFPerm.isOwner(); } catch (e) { return false; } }

  function css() {
    if ($("cuCss")) return;
    var s = d.createElement("style"); s.id = "cuCss";
    s.textContent = ".cu-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px}.cu-cost{border-radius:14px;padding:12px 14px;margin-bottom:12px;border:1px solid var(--border,#d6dbe4);background:var(--bg-soft,#f6f8fb)}.cu-cost b{font-size:24px;display:block}" +
      ".cu-grid{display:grid;gap:10px;grid-template-columns:minmax(0,1fr)}.cu-grid>*{min-width:0}@media(min-width:760px){.cu-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}.cu-card{border:1px solid var(--border,#d6dbe4);border-radius:14px;padding:12px 14px;background:var(--card,var(--bg-elevated,#fff))}.cu-card h3{margin:0 0 8px;font-size:16px}" +
      ".cu-m{margin:8px 0}.cu-m .cu-l{display:flex;justify-content:space-between;gap:8px;font-size:13px;margin-bottom:3px}.cu-bar{height:9px;border-radius:6px;background:rgba(127,127,127,.18);overflow:hidden}.cu-bar i{display:block;height:100%;border-radius:6px}" +
      ".cu-ok{background:#2e7d32}.cu-warn{background:#f59e0b}.cu-bad{background:#c62828}.cu-note{font-size:12.5px;opacity:.8;margin-top:6px;line-height:1.6}.cu-price{font-size:12.5px;margin-top:8px;padding:7px 9px;border-radius:9px;background:rgba(21,101,192,.08)}.cu-err{color:#c62828;font-size:13px}" +
      ".cu-cmd{max-width:100%;box-sizing:border-box;direction:ltr;text-align:left;font:12px/1.5 monospace;background:rgba(127,127,127,.12);padding:8px;border-radius:8px;white-space:pre-wrap;word-break:break-all;margin:6px 0;user-select:all}";
    (d.head || d.documentElement).appendChild(s);
  }
  function meter(label, used, free, fmt, extra) {
    fmt = fmt || n;
    var p = free > 0 ? Math.min(100, (used / free) * 100) : 0, cls = p >= 85 ? "cu-bad" : p >= 60 ? "cu-warn" : "cu-ok";
    return '<div class="cu-m"><div class="cu-l"><span>' + label + '</span><span><b>' + fmt(used) + '</b> من ' + fmt(free) + ' (' + Math.round(free > 0 ? (used / free) * 100 : 0) + '%)</span></div><div class="cu-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(p) + '"><i class="' + cls + '" style="width:' + Math.max(2, p) + '%"></i></div>' + (extra ? '<div class="cu-note">' + extra + '</div>' : "") + '</div>';
  }
  function cairo(ms) { try { return new Date(ms).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }); } catch (e) { return ""; } }

  /* حجم قاعدة البيانات تقريبًا: البيانات اللي على جهاز المالك (هي نفسها اللي على السحابة) × 2 للفهارس. */
  var DB_KEYS = ["wf_c", "wf_d", "wf_r", "wf_p", "wf_tr", "wf_tasks", "wf_wallet_tx", "wf_fault_codes", "wf_inv", "wf_m", "wf_e", "wf_trash", "wf_followup_log", "wf_pending_calls", "wf_comp_custom", "wf_comp_fav", "wf_techpay", "wf_s"];
  function dbEstimate() {
    var bytes = 0, enc = w.TextEncoder ? new TextEncoder() : null;
    DB_KEYS.forEach(function (k) { try { var v = w.WFStorage ? w.WFStorage.getItem(k) : null; if (v) bytes += enc ? enc.encode(v).length : v.length * 2; } catch (e) {} });
    return Math.round(bytes * 2);
  }
  var device = null;
  function deviceEstimate() {
    if (!navigator.storage || !navigator.storage.estimate) return;
    navigator.storage.estimate().then(function (e) { device = e; draw(); }, function () {});
  }

  function costs(r) {
    var out = { fs: 0, fn: 0, art: 0, total: 0 }, F = r.free || {}, P = r.prices || {}, fp = P.firestore || { reads: 0.03, writes: 0.09, deletes: 0.01, storageGiB: 0.15 };
    if (r.firestore && r.firestore.overDays) ["reads", "writes", "deletes"].forEach(function (k) { out.fs += (r.firestore.overDays[k] || 0) / 1e5 * fp[k]; });
    out.fs += Math.max(0, dbEstimate() - (F.storageBytes || 1073741824)) / 1073741824 * fp.storageGiB;
    if (r.functions) out.fn = Math.max(0, r.functions.monthRequests - (F.fnRequests || 2e6)) / 1e6 * (P.fnPerMillion || 0.4);
    var art = (r.artifacts || []).reduce(function (a, x) { return a + (+x.bytes || 0); }, 0);
    out.art = Math.max(0, art - (F.artifactBytes || 0.5 * 1073741824)) / 1e9 * (P.artifactPerGB || 0.1);
    out.total = out.fs + out.fn + out.art;
    return out;
  }
  function denied(what, role) {
    var p = (last && last.project) || "PROJECT_ID";
    return '<div class="cu-err">🔒 السيرفر مش مسموح له يقرا ' + what + '. افتح Cloud Shell واكتب:</div><div class="cu-cmd">gcloud projects add-iam-policy-binding ' + esc(p) + ' --member="serviceAccount:$(gcloud projects describe ' + esc(p) + ' --format=\'value(projectNumber)\')-compute@developer.gserviceaccount.com" --role=' + role + '</div>';
  }

  function draw() {
    var box = $("cloudUsageBody"); if (!box) return;
    css();
    if (!isOwner()) { box.innerHTML = '<p class="hint">🔒 الاستهلاك والتكاليف للمالك بس.</p>'; return; }
    var r = last, head = '<div class="cu-top"><span class="hint">' + (r ? "آخر تحديث: " + esc(cairo(r.at)) : "") + '</span><button type="button" class="secondary" id="cuRefresh"' + (busy ? " disabled" : "") + '>' + (busy ? "⏳ بنجيب الأرقام…" : "🔄 تحديث") + '</button></div>';
    if (!r) { box.innerHTML = head + (err ? '<p class="cu-err">⚠️ ' + esc(err) + '</p>' : '<p class="hint">⏳ جاري التحميل…</p>'); bind(); return; }
    var F = r.free || {}, P = r.prices || {}, fp = P.firestore || {}, E = r.errors || {}, c = costs(r), html = head;
    html += '<div class="cu-cost">' + (c.total < 0.005 ? '<b>✅ كله في المجاني لحد دلوقتي</b><span class="hint">التكلفة المتوقعة الشهر ده: $0</span>' : '<b>≈ ' + usd(c.total) + ' الشهر ده</b><span class="hint">قاعدة البيانات ' + usd(c.fs) + ' • الدوال ' + usd(c.fn) + ' • نسخ الدوال ' + usd(c.art) + ' — تقريبي، والفاتورة الحقيقية في Google Cloud Billing</span>') + '</div><div class="cu-grid">';

    // 1) Firestore
    html += '<div class="cu-card"><h3>🗄️ قاعدة البيانات (Firestore)</h3>';
    if (r.firestore) {
      var t = r.firestore.today, m = r.firestore.month;
      html += '<div class="hint">النهارده (الحصة المجانية يومية' + (r.firestore.resetAt ? ' وبتتجدد ' + esc(cairo(r.firestore.resetAt)) : "") + '):</div>' +
        meter("📖 قراءات", t.reads, F.reads) + meter("✏️ كتابات", t.writes, F.writes) + meter("🗑️ مسح", t.deletes, F.deletes) +
        '<div class="cu-note">الشهر ده: ' + n(m.reads) + ' قراءة • ' + n(m.writes) + ' كتابة • ' + n(m.deletes) + ' مسح</div>';
    } else html += E.firestore === "denied" ? denied("أرقام قاعدة البيانات", "roles/monitoring.viewer") : '<div class="cu-err">⚠️ تعذّر قراءة الأرقام' + (E.firestore ? " (" + esc(E.firestore) + ")" : "") + '</div>';
    html += meter("💾 المساحة (تقدير)", dbEstimate(), F.storageBytes || 1073741824, gb, "محسوبة من البيانات اللي على الجهاز ده + الفهارس.") +
      '<div class="cu-price">💵 بعد المجاني: كل 100 ألف قراءة ≈ $' + fp.reads + ' • كل 100 ألف كتابة ≈ $' + fp.writes + ' • كل 100 ألف مسح ≈ $' + fp.deletes + ' • كل 1 جيجا زيادة ≈ $' + fp.storageGiB + ' في الشهر' + (r.dbLocation ? ' <small>(' + esc(r.dbLocation) + ')</small>' : "") + '</div></div>';

    // 2) Cloudinary
    var cl = r.cloudinary;
    html += '<div class="cu-card"><h3>🖼️ الصور والفيديو والصوت (Cloudinary)</h3>';
    if (cl) {
      var lim = cl.creditsLimit || F.cloudinaryCredits || 25;
      html += meter("📊 الكريدت الشهر ده", cl.credits, lim, function (v) { return (+v || 0).toFixed(2); }) +
        '<div class="cu-note">💾 المساحة: <b>' + gb(cl.storage) + '</b> • 📤 العرض/التحميل: <b>' + gb(cl.bandwidth) + '</b> • 🔄 تحويلات: <b>' + n(cl.transformations) + '</b> • 📦 ملفات: <b>' + n(cl.resources) + '</b>' + (cl.plan ? ' • الباقة: ' + esc(cl.plan) : "") + '</div>' +
        '<div class="cu-price">💵 الكريدت الواحد = 1 جيجا مساحة أو 1 جيجا عرض أو 1000 تحويل. الباقة المجانية (25 كريدت) <b>مش بتسحب فلوس</b> — لو عدّيتها بيبعتوا تحذيرات وبعدين ممكن يوقفوا الرفع والعرض. الباقة اللي بعدها Plus بـ $' + (P.cloudinaryPlus || 99) + ' في الشهر (' + (P.cloudinaryPlusCredits || 225) + ' كريدت). امسح المرفقات القديمة من تحت 👇</div>';
    } else if (/403/.test(E.cloudinary || "")) html += '<div class="hint">🔐 مفتاح Cloudinary شغال للرفع، بس مش مسموح له يقرا أرقام الاستهلاك (صلاحيات المفتاح في Cloudinary). تقدر تشوف الاستهلاك من لوحة Cloudinary نفسها: <a href="https://console.cloudinary.com/" target="_blank" rel="noopener noreferrer">console.cloudinary.com</a> ← Usage.</div><div class="cu-price">💵 الكريدت الواحد = 1 جيجا مساحة أو 1 جيجا عرض أو 1000 تحويل. الباقة المجانية (25 كريدت) <b>مش بتسحب فلوس</b> — لو عدّيتها بيبعتوا تحذيرات وبعدين ممكن يوقفوا الرفع والعرض.</div>';
    else if (/401/.test(E.cloudinary || "")) html += '<div class="cu-err">🔑 Cloudinary رفض مفتاح السيرفر (API Key أو API Secret مش مطابقين). ده نفس المفتاح اللي بيرفع الصور، فلو الرفع مش شغال كمان صحّح المفتاح من Cloud Shell.<div class="cu-cmd">' + esc(E.cloudinary) + '</div></div>';
    else html += '<div class="cu-err">⚠️ تعذّر قراءة الاستهلاك من Cloudinary' + (E.cloudinary ? " (" + esc(E.cloudinary) + ")" : "") + '</div>';
    html += '</div>';

    // 3) Functions
    html += '<div class="cu-card"><h3>⚙️ السيرفر (الدوال)</h3>';
    if (r.functions) html += meter("📨 طلبات الشهر ده", r.functions.monthRequests, F.fnRequests || 2e6);
    else html += E.functions === "denied" ? denied("أرقام الدوال", "roles/monitoring.viewer") : '<div class="cu-err">⚠️ تعذّر قراءة الأرقام</div>';
    html += '<div class="cu-note">الإشعارات وتسجيل الدخول والرفع وقفل أوامر الفني كلها طلبات للسيرفر.</div><div class="cu-price">💵 بعد 2 مليون طلب في الشهر: كل مليون ≈ $' + (P.fnPerMillion || 0.4) + '</div></div>';

    // 4) Artifact Registry
    html += '<div class="cu-card"><h3>📦 نسخ الدوال المتخزنة</h3>';
    var arts = r.artifacts || [], artTotal = arts.reduce(function (a, x) { return a + (+x.bytes || 0); }, 0);
    if (arts.length) html += meter("💾 المساحة", artTotal, F.artifactBytes || 0.5 * 1073741824, gb, arts.map(function (a) { return esc(a.region) + ": " + (a.bytes == null ? "؟" : gb(a.bytes)); }).join(" • "));
    else if (E.artifacts === "denied") html += denied("حجم نسخ الدوال", "roles/artifactregistry.reader");
    else html += '<div class="hint">مفيش نسخ متخزنة.</div>';
    html += '<div class="cu-note">كل مرة بتنشر الدوال بيتخزن نسخة منها. عشان القديم يتمسح لوحده اكتب في Cloud Shell مرة واحدة:</div><div class="cu-cmd">' + (arts.length ? arts : [{ region: "us-central1" }]).map(function (a) { return "firebase functions:artifacts:setpolicy --days 7 --location " + esc(a.region) + " --project " + esc(r.project || "PROJECT_ID"); }).join("\n") + '</div><div class="cu-price">💵 بعد نص جيجا: كل 1 جيجا ≈ $' + (P.artifactPerGB || 0.1) + ' في الشهر</div></div>';

    // 5) Auth + device + hosting
    html += '<div class="cu-card"><h3>👤 الحسابات وتسجيل الدخول</h3><div>' + (r.authUsers != null ? "عدد الحسابات (موظفين + عملاء البوابة): <b>" + n(r.authUsers) + "</b>" : "—") + '</div><div class="cu-price">💵 مجاني لحد 50 ألف مستخدم نشط في الشهر (دخول بالإيميل وكلمة السر).</div></div>';
    html += '<div class="cu-card"><h3>📱 الجهاز ده</h3>' + (device && device.quota ? meter("💾 مساحة التطبيق على الجهاز", device.usage || 0, device.quota, gb) : '<div class="hint">المتصفح مش بيقول المساحة.</div>') +
      '<div class="cu-note">💾 النسخ الاحتياطية بتتحفظ <b>ملف على الجهاز</b> (في التنزيلات) — مش على السحابة، فمالهاش تكلفة. ونسخة البيانات الأساسية على السحابة هي قاعدة البيانات نفسها.</div>' +
      '<div class="cu-note">🌐 الموقع نفسه على GitHub Pages وCloudflare — مجاني. والإشعارات (Web Push) مجانية.</div></div>';
    html += '</div><div class="cu-price" style="margin-top:12px">🛡️ نصيحة: اعمل «ميزانية» في Google Cloud عشان يبعتلك إيميل لو الفاتورة قربت من رقم تحدده: console.cloud.google.com ← Billing ← Budgets &amp; alerts ← Create budget (مثلًا $5، وتنبيه عند 50% و90% و100%). وكمان هيوصلك إشعار هنا لو أي حاجة عدّت 80% من المجاني.</div>';
    box.innerHTML = html; bind();
  }
  function bind() { var b = $("cuRefresh"); if (b) b.onclick = function () { load(true); }; }

  function load(refresh) {
    if (busy || !isOwner() || !w.WFMedia || !w.WFMedia.call) { draw(); return; }
    busy = true; err = ""; draw();
    w.WFMedia.call("usageReport", { refresh: !!refresh }).then(function (r) { last = r; }, function (e) { err = e && e.message || "تعذّر"; }).then(function () { busy = false; draw(); });
  }
  function boot() {
    var p = $("media-cleanup-panel"); if (!p) return;
    var det = p.querySelector("details"), loaded = false;
    function go() { if (!loaded) { loaded = true; deviceEstimate(); load(false); } else draw(); }
    if (det) det.addEventListener("toggle", function () { if (det.open) go(); });
    if (!det || det.open) go(); else draw();
    if (w.WFPerm && w.WFPerm.onChange) try { w.WFPerm.onChange(draw); } catch (e) {}
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot); else boot();
  w.WFCloudUsage = { load: load, costs: costs, dbEstimate: dbEstimate };
})(window);
