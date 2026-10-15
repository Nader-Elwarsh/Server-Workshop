/* =========================================================
   الورشة الفنية — فيديو وصوت ولوكيشن (wf-media.js)
   =========================================================
   ملف مشترك بين بوابة العميل وصفحات الإدارة وبوابة الفني:
   - WFMedia: فيديو للعطل (كاميرا/من الاستوديو) أو صوت (تسجيل/ملف)،
     وبيترفع مباشرة على Cloudinary بتوقيع من دالة السيرفر mediaSign
     (المفتاح السري عمره ما بيوصل للمتصفح، والرفع ما بيعديش على
     الدالة نفسها فمفيش حد 12 ميجا).
   - WFLoc: لوكيشن العنوان — «موقعي الحالي» من GPS أو لصق لينك خرائط
     جوجل/واتساب، وروابط فتح الخريطة والملاحة.
   كل حاجة جاية من العميل بتتعرض بعد تحقق: لينكات Cloudinary https بس،
   وإحداثيات أرقام في المدى الصحيح.
   ========================================================= */
(function (w) {
  "use strict";
  var d = w.document;
  var MAX = { video: 100 * 1024 * 1024, audio: 25 * 1024 * 1024, image: 30 * 1024 * 1024 };
  var MAX_DUR = { video: 180, audio: 300 };
  var MEDIA_RE = /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_.\-]+\/(video|image)\/upload\/[^\s"'<>\\]+$/;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fb() { return w.firebase && w.firebase.apps && w.firebase.apps.length ? w.firebase : null; }

  /* ---------- ستايل مشترك ---------- */
  function css() {
    if (d.getElementById("wfMediaCss")) return;
    var s = d.createElement("style"); s.id = "wfMediaCss";
    s.textContent = ".wfm-list{display:grid;gap:8px;margin:6px 0}.wfm-item{position:relative;border:1px solid var(--border,var(--bd,#d6dbe4));border-radius:12px;padding:8px;background:var(--bg-soft,var(--bg,#f6f8fb))}" +
      ".wfm-img{width:100%;max-height:380px;object-fit:contain;border-radius:8px;background:#0001;display:block}.wfm-item video{width:100%;max-height:340px;border-radius:8px;background:#000;display:block}.wfm-item audio{width:100%;display:block}" +
      ".wfm-meta{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:12px;opacity:.8;margin-top:4px}.wfm-rm{border:0;background:transparent;color:#c62828;font-size:13px;cursor:pointer;padding:4px 6px;min-height:0}" +
      ".wfm-acts{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.wfm-acts button{flex:1 1 0;min-width:110px}.wfm-prog{height:6px;border-radius:4px;background:rgba(0,0,0,.1);overflow:hidden;margin:6px 0}.wfm-prog i{display:block;height:100%;width:0;background:#1565c0;transition:width .2s}" +
      ".wfm-sheet{position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center}.wfm-sheet>div{background:var(--bg-elevated,var(--card,#fff));color:var(--text,#111);border-radius:18px 18px 0 0;padding:16px;width:100%;max-width:440px;box-shadow:0 -6px 24px rgba(0,0,0,.25);box-sizing:border-box}" +
      ".wfm-sheet b{display:block;margin-bottom:10px}.wfm-row{display:flex;gap:8px}.wfm-row button{flex:1;min-height:52px}.wfm-full{width:100%;margin-top:8px;min-height:44px}.wfm-rec{font-size:34px;text-align:center;font-variant-numeric:tabular-nums;margin:8px 0}.wfm-dot{display:inline-block;width:12px;height:12px;border-radius:50%;background:#d32f2f;margin-inline-end:8px;animation:wfmb 1s infinite}@keyframes wfmb{50%{opacity:.2}}" +
      ".wfloc{border:1px dashed var(--border,var(--bd,#c9d1dd));border-radius:12px;padding:8px 10px;margin:4px 0 8px}.wfloc-st{font-size:13px;margin-bottom:6px}.wfloc-st.ok{color:#2e7d32;font-weight:700}.wfloc .wfm-acts button{min-width:0;padding:7px 10px;font-size:13px;min-height:0}" +
      ".wfloc-link{display:inline-flex;align-items:center;gap:4px;text-decoration:none;font-weight:700;margin-inline-start:6px;white-space:nowrap}";
    (d.head || d.documentElement).appendChild(s);
  }

  /* ---------- شيت اختيار بسيط ---------- */
  function sheet(title, buttons) {
    css();
    return new Promise(function (resolve) {
      var ov = d.createElement("div"); ov.className = "wfm-sheet"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
      ov.innerHTML = '<div><b>' + esc(title) + '</b><div class="wfm-row">' + buttons.map(function (b) { return '<button type="button" class="secondary sec" data-v="' + esc(b.v) + '">' + esc(b.t) + '</button>'; }).join("") + '</div><button type="button" class="secondary sec wfm-full" data-v="">إلغاء</button></div>';
      var done = false;
      function finish(v) { if (done) return; done = true; if (ov.parentNode) ov.parentNode.removeChild(ov); resolve(v); }
      ov.__wfBackClose = function () { finish(""); };
      ov.addEventListener("click", function (e) {
        if (e.target === ov) return finish("");
        var b = e.target.closest && e.target.closest("button[data-v]"); if (b) finish(b.getAttribute("data-v"));
      });
      d.body.appendChild(ov);
    });
  }
  // لازم الـ click على input الملف يحصل جوه ضغطة المستخدم نفسها، فالشيت بيفتح الملف من جوه الـ handler.
  function fileSheet(title, buttons) {
    css();
    return new Promise(function (resolve) {
      var ov = d.createElement("div"); ov.className = "wfm-sheet"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
      ov.innerHTML = '<div><b>' + esc(title) + '</b><div class="wfm-row">' + buttons.map(function (b, i) { return '<button type="button" class="secondary sec" data-i="' + i + '">' + esc(b.t) + '</button>'; }).join("") + '</div><button type="button" class="secondary sec wfm-full" data-i="-1">إلغاء</button></div>';
      var done = false;
      function finish(v) { if (done) return; done = true; resolve(v); }
      function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
      ov.__wfBackClose = function () { close(); finish(null); };
      ov.addEventListener("click", function (e) {
        if (e.target === ov) { close(); return finish(null); }
        var el = e.target.closest && e.target.closest("button[data-i]"); if (!el) return;
        var b = buttons[+el.getAttribute("data-i")]; close();
        if (!b) return finish(null);
        if (b.action) return finish({ action: b.action });
        var i = d.createElement("input"); i.type = "file"; i.accept = b.accept; i.hidden = true;
        if (b.capture) { i.setAttribute("capture", b.capture); }
        d.body.appendChild(i);
        i.addEventListener("change", function () { var f = i.files && i.files[0]; if (i.parentNode) i.parentNode.removeChild(i); finish(f ? { file: f } : null); });
        i.click();
      });
      d.body.appendChild(ov);
    });
  }

  /* ---------- تسجيل صوت ---------- */
  function recMime() {
    if (!w.MediaRecorder) return "";
    var list = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
    for (var i = 0; i < list.length; i++) { try { if (!MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) {} }
    return "";
  }
  function recordAudio() {
    css();
    if (!w.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error("الموبايل ده مش بيدعم التسجيل من هنا — اختار «ملف صوت» وسجّل من تطبيق التسجيل."));
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      return new Promise(function (resolve) {
        var mime = recMime(), rec, chunks = [], t0 = Date.now(), timer = null, blob = null, url = "";
        try { rec = mime ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48000 }) : new MediaRecorder(stream); } catch (e) { rec = new MediaRecorder(stream); }
        var ov = d.createElement("div"); ov.className = "wfm-sheet"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
        ov.innerHTML = '<div><b>🎙️ تسجيل صوت للعطل</b><div class="wfm-rec"><span class="wfm-dot"></span><span data-t>0:00</span></div><div class="wfm-pv"></div><div class="wfm-row"><button type="button" class="primary" data-a="stop">⏹️ إيقاف</button></div><button type="button" class="secondary sec wfm-full" data-a="cancel">إلغاء</button></div>';
        var tEl = ov.querySelector("[data-t]"), pv = ov.querySelector(".wfm-pv"), row = ov.querySelector(".wfm-row"), done = false;
        function stopAll() { clearInterval(timer); try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }
        function finish(v) { if (done) return; done = true; stopAll(); try { if (rec.state !== "inactive") rec.stop(); } catch (e) {} if (ov.parentNode) ov.parentNode.removeChild(ov); if (v !== blob && url) URL.revokeObjectURL(url); resolve(v); }
        ov.__wfBackClose = function () { finish(null); };
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = function () {
          stopAll(); if (done) return;
          var type = (rec.mimeType || mime || "audio/webm").split(";")[0];
          blob = new Blob(chunks, { type: type }); blob.duration = Math.round((Date.now() - t0) / 1000);
          url = URL.createObjectURL(blob);
          ov.querySelector(".wfm-rec").innerHTML = "✅ " + fmtDur(blob.duration);
          pv.innerHTML = '<audio controls src="' + url + '" style="width:100%"></audio>';
          row.innerHTML = '<button type="button" class="primary" data-a="use">✔️ استخدم التسجيل</button><button type="button" class="secondary sec" data-a="again">🔁 سجّل تاني</button>';
        };
        ov.addEventListener("click", function (e) {
          var b = e.target.closest && e.target.closest("button[data-a]"); if (!b) return;
          var a = b.getAttribute("data-a");
          if (a === "stop") { try { rec.stop(); } catch (er) {} }
          else if (a === "cancel") finish(null);
          else if (a === "use") finish(blob);
          else if (a === "again") finish("again"); // add() بتفتح تسجيل جديد
        });
        d.body.appendChild(ov);
        try { rec.start(1000); } catch (e) { finish(null); return; }
        timer = setInterval(function () { var s = Math.round((Date.now() - t0) / 1000); tEl.textContent = fmtDur(s); if (s >= MAX_DUR.audio) { try { rec.stop(); } catch (er) {} } }, 500);
      });
    }, function () { throw new Error("محتاج تسمح بالميكروفون عشان تسجّل — أو اختار «ملف صوت»."); });
  }
  function fmtDur(s) { s = Math.max(0, Math.round(+s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

  /* ---------- مدة الملف قبل الرفع ---------- */
  function probe(file, kind) {
    return new Promise(function (resolve) {
      if (file.duration) return resolve(file.duration);
      var el = d.createElement(kind === "video" ? "video" : "audio"), url = URL.createObjectURL(file), t = setTimeout(function () { end(0); }, 6000);
      function end(v) { clearTimeout(t); URL.revokeObjectURL(url); resolve(isFinite(v) ? v : 0); }
      el.preload = "metadata"; el.onloadedmetadata = function () { end(el.duration); }; el.onerror = function () { end(0); };
      el.src = url;
    });
  }

  /* تصغير الصورة قبل الرفع (أطول ضلع 1600 بكسل، جودة 0.78) عشان المساحة والنت. لو المتصفح ماعرفش يفتحها بنرفع الأصل. */
  function shrinkImage(file) {
    return new Promise(function (resolve) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type || "") || !w.HTMLCanvasElement) return resolve(file);
      var im = new Image(), url = URL.createObjectURL(file);
      im.onload = function () {
        var m = 1600, s = Math.min(1, m / Math.max(im.width, im.height));
        if (s === 1 && file.size < 900 * 1024) { URL.revokeObjectURL(url); return resolve(file); }
        var c = d.createElement("canvas"); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { if (!b || b.size >= file.size) return resolve(file); b.name = "photo.jpg"; resolve(b); }, "image/jpeg", 0.78);
      };
      im.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      im.src = url;
    });
  }

  /* ---------- الرفع ---------- */
  /* أول ما الصفحة تفتح، تسجيل الدخول بيرجع بعد لحظة: بنستنى لحد 15 ثانية بدل ما نقول «لازم تسجّل دخول» على طول. */
  function whenUser() {
    var f = fb();
    if (!f) return Promise.resolve(null);
    var u = f.auth().currentUser;
    if (u) return Promise.resolve(u);
    return new Promise(function (resolve) {
      var done = false, off = function () {};
      var t = setTimeout(function () { if (!done) { done = true; off(); resolve(f.auth().currentUser); } }, 15000);
      try { off = f.auth().onAuthStateChanged(function (x) { if (x && !done) { done = true; clearTimeout(t); setTimeout(function () { off(); }, 0); resolve(x); } }) || off; } catch (e) { clearTimeout(t); resolve(null); }
    });
  }
  function callFn(name, data) {
    return whenUser().then(function (u) {
    var f = fb();
    if (!u) throw new Error(name === "mediaSign" ? "لازم تكون مسجّل دخول عشان ترفع ملفات." : "لازم تكون مسجّل دخول.");
    var url = "https://us-central1-" + encodeURIComponent(f.app().options.projectId) + ".cloudfunctions.net/" + encodeURIComponent(name);
    return u.getIdToken().then(function (tok) {
      return (w.WFAppCheck && w.WFAppCheck.headers ? w.WFAppCheck.headers().catch(function () { return {}; }) : Promise.resolve({})).then(function (h) {
        var hdr = { "Content-Type": "application/json", Authorization: "Bearer " + tok };
        Object.keys(h || {}).forEach(function (k) { hdr[k] = h[k]; });
        return fetch(url, { method: "POST", headers: hdr, body: JSON.stringify({ data: data || {} }) }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (r.ok && j && j.result !== undefined) return j.result;
            var m = (j && j.error && j.error.message) || ("HTTP " + r.status);
            var M = { media_rate_limited: "وصلت لأقصى عدد ملفات النهارده — جرّب بكره.", upload_not_authorized: "حسابك مش مسموح له يرفع ملفات.", owner_only: "الجزء ده للمالك بس.", not_allowed: "مش مسموح لك بالعملية دي." };
            if (r.status === 404) throw new Error("الخدمة دي لسه ما اتنشرتش على السيرفر — انشر الدوال من Cloud Shell.");
            throw new Error(M[m] || (name === "mediaSign" ? "تعذّر تجهيز الرفع — جرّب تاني." : "تعذّر الاتصال بالسيرفر — جرّب تاني."));
          });
        });
      });
    });
    });
  }
  function upload(file, kind, onProgress) {
    if (navigator.onLine === false) return Promise.reject(new Error("محتاج إنترنت عشان ترفع الملف."));
    return callFn("mediaSign", { kind: kind }).then(function (s) {
      return new Promise(function (resolve, reject) {
        var fd = new FormData();
        fd.append("file", file, file.name || (kind + "." + ((file.type || "").split("/")[1] || "bin").split(";")[0]));
        fd.append("api_key", s.apiKey); fd.append("timestamp", String(s.timestamp));
        if (s.publicId) fd.append("public_id", s.publicId); else if (s.folder) fd.append("folder", s.folder);
        if (s.allowedFormats) fd.append("allowed_formats", s.allowedFormats);
        fd.append("signature", s.signature);
        var x = new XMLHttpRequest();
        x.open("POST", "https://api.cloudinary.com/v1_1/" + encodeURIComponent(s.cloud) + "/" + (s.resource === "image" ? "image" : "video") + "/upload");
        x.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
        x.onload = function () {
          var j = {}; try { j = JSON.parse(x.responseText); } catch (e) {}
          if (x.status >= 200 && x.status < 300 && j.secure_url) resolve(j);
          else reject(new Error(/format/i.test(j.error && j.error.message || "") ? "نوع الملف ده مش مدعوم — جرّب صورة jpg أو فيديو mp4 أو تسجيل صوت." : "الرفع فشل — جرّب تاني."));
        };
        x.onerror = function () { reject(new Error("الرفع وقف — اتأكد من النت وجرّب تاني.")); };
        x.send(fd);
      });
    });
  }

  /* اختيار + فحص + رفع. بترجع عنصر جاهز للحفظ: {url, kind, dur, bytes, at, by} أو null لو اتلغى. */
  function add(kind, opts) {
    opts = opts || {};
    var pick;
    if (kind === "image") pick = fileSheet("📷 صورة للعطل", [{ t: "📷 كاميرا", accept: "image/*", capture: "environment" }, { t: "🖼️ من الصور", accept: "image/*" }]);
    else if (kind === "video") pick = fileSheet("🎥 فيديو للعطل", [{ t: "📹 صوّر دلوقتي", accept: "video/*", capture: "environment" }, { t: "🖼️ من الاستوديو", accept: "video/*" }]);
    else pick = fileSheet("🎙️ صوت للعطل", [{ t: "🎙️ سجّل دلوقتي", action: "rec" }, { t: "🎵 ملف صوت", accept: "audio/*" }]);
    return pick.then(function (r) {
      if (!r) return null;
      if (r.action === "rec") { var again = function () { return recordAudio().then(function (v) { return v === "again" ? again() : v; }); }; return again(); }
      return r.file;
    }).then(function (file) {
      if (!file) return null;
      var isV = /^video\//.test(file.type || ""), isA = /^audio\//.test(file.type || ""), isI = /^image\//.test(file.type || "");
      if (kind === "image" && !isI && file.type) throw new Error("اختار صورة.");
      if (kind === "video" && !isV && file.type) throw new Error("اختار ملف فيديو.");
      if (kind === "audio" && !isA && file.type) throw new Error("اختار ملف صوت.");
      if (file.size > MAX[kind]) throw new Error(kind === "video" ? "الفيديو كبير (أكتر من 100 ميجا) — صوّر فيديو أقصر." : kind === "image" ? "الصورة كبيرة جدًا." : "ملف الصوت كبير (أكتر من 25 ميجا).");
      if (kind === "image") return shrinkImage(file).then(function (img) {
        if (opts.onStart) opts.onStart(img);
        return upload(img, "image", opts.onProgress).then(function (j) {
          var item = { url: j.secure_url, kind: "image", bytes: +j.bytes || img.size || 0, at: new Date().toISOString() };
          if (opts.by) item.by = String(opts.by).slice(0, 60);
          return item;
        });
      });
      return probe(file, kind).then(function (dur) {
        if (dur && dur > MAX_DUR[kind] + 2) throw new Error(kind === "video" ? "الفيديو طويل — خليه لحد 3 دقايق." : "الصوت طويل — خليه لحد 5 دقايق.");
        if (opts.onStart) opts.onStart(file);
        return upload(file, kind, opts.onProgress).then(function (j) {
          var item = { url: j.secure_url, kind: kind, dur: Math.round(+j.duration || dur || 0), bytes: +j.bytes || file.size || 0, at: new Date().toISOString() };
          if (opts.by) item.by = String(opts.by).slice(0, 60);
          return item;
        });
      });
    });
  }

  /* ---------- العرض ---------- */
  function valid(m) {
    if (!m || typeof m.url !== "string" || !MEDIA_RE.test(m.url)) return false;
    var img = m.url.indexOf("/image/upload/") > 0;
    return m.kind === "image" ? img : (m.kind === "video" || m.kind === "audio") && !img;
  }
  function clean(list) { return (Array.isArray(list) ? list : []).filter(valid).slice(0, 10).map(function (m) { var o = { url: m.url, kind: m.kind }; if (+m.dur > 0) o.dur = Math.round(+m.dur); if (+m.bytes > 0) o.bytes = Math.round(+m.bytes); if (m.at) o.at = String(m.at).slice(0, 40); if (m.by) o.by = String(m.by).slice(0, 60); return o; }); }
  function thumb(u) { return u.replace("/image/upload/", "/image/upload/c_limit,w_900,q_auto,f_auto/"); }
  function size(b) { b = +b || 0; return b >= 1048576 ? (b / 1048576).toFixed(1) + " م.ب" : Math.max(1, Math.round(b / 1024)) + " ك.ب"; }
  function poster(u) { return u.replace("/video/upload/", "/video/upload/so_1/").replace(/\.[A-Za-z0-9]+$/, ".jpg"); }
  // Cloudinary بيحوّل الصيغة من الامتداد: mp4 للفيديو وmp3 للصوت عشان يشتغلوا على أي موبايل (آيفون مش بيشغّل webm).
  function playable(u, kind) { return kind === "audio" ? u.replace(/\.(webm|ogg|oga|opus|m4a|aac|wav|amr|mp4|weba)$/i, ".mp3") : u.replace(/\.(mov|3gp|mkv|avi|m4v|webm)$/i, ".mp4"); }
  function listHtml(list, o) {
    o = o || {}; css();
    var ms = clean(list); if (!ms.length) return o.empty || "";
    return '<div class="wfm-list">' + ms.map(function (m, i) {
      var meta = (m.kind === "video" ? "🎥 فيديو" : m.kind === "image" ? "📷 صورة" : "🎙️ صوت") + (m.dur ? " • " + fmtDur(m.dur) : "") + (m.by ? " • " + esc(m.by) : "") + (m.bytes ? " • " + size(m.bytes) : "");
      var player = m.kind === "image" ? '<a href="' + esc(m.url) + '" target="_blank" rel="noopener noreferrer"><img class="wfm-img" loading="lazy" alt="صورة العطل" src="' + esc(thumb(m.url)) + '"></a>' : m.kind === "video" ? '<video controls playsinline preload="none" poster="' + esc(poster(m.url)) + '" src="' + esc(playable(m.url, "video")) + '"></video>' : '<audio controls preload="none" src="' + esc(playable(m.url, "audio")) + '"></audio>';
      return '<div class="wfm-item">' + player + '<div class="wfm-meta"><span>' + meta + '</span>' + (o.removable ? '<button type="button" class="wfm-rm" data-wfm-rm="' + i + '" data-wfm-url="' + esc(m.url) + '" data-wfm-key="' + esc(o.key || "") + '">🗑️ حذف</button>' : '<a href="' + esc(m.url) + '" target="_blank" rel="noopener noreferrer">⬇️ فتح</a>') + '</div></div>';
    }).join("") + '</div>';
  }
  function actsHtml(key, o) {
    o = o || {}; css();
    return '<div class="wfm-acts"><button type="button" class="secondary sec sm" data-wfm-add="image" data-wfm-key="' + esc(key) + '">📷 صورة</button><button type="button" class="secondary sec sm" data-wfm-add="video" data-wfm-key="' + esc(key) + '">🎥 فيديو</button><button type="button" class="secondary sec sm" data-wfm-add="audio" data-wfm-key="' + esc(key) + '">🎙️ صوت</button></div><div class="wfm-status" data-wfm-status="' + esc(key) + '"></div>';
  }

  /* مجموعة مرفقات مربوطة بمفتاح: الصفحة بتسجّل handlers (onAdd/onRemove/by)، والأزرار بتشتغل بالـ delegation. */
  var groups = {};
  function bind(key, h) { groups[key] = h || {}; }
  function status(key, html) { var el = d.querySelector('[data-wfm-status="' + (w.CSS && CSS.escape ? CSS.escape(key) : key) + '"]'); if (el) el.innerHTML = html; }
  d.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-wfm-add],[data-wfm-rm]"); if (!b) return;
    var key = b.getAttribute("data-wfm-key") || "", g = groups[key]; if (!g) return;
    e.preventDefault();
    if (b.hasAttribute("data-wfm-rm")) {
      if (!w.confirm("حذف المرفق ده؟ هيتمسح من السحابة نهائيًا.")) return;
      var url = b.getAttribute("data-wfm-url") || "";
      if (g.onRemove) g.onRemove(+b.getAttribute("data-wfm-rm"));
      // المسح من السحابة: لو فشل (مفيش نت) الملف بيتلم في «تنظيف الملفات اليتيمة» من الإعدادات.
      if (url) removeRemote([url]).catch(function () {});
      return;
    }
    if (g.busy) return;
    if (g.max && g.count && g.count() >= g.max) { w.alert("لحد " + g.max + " مرفقات بس."); return; }
    var kind = b.getAttribute("data-wfm-add");
    add(kind, {
      by: typeof g.by === "function" ? g.by() : g.by,
      onStart: function () { g.busy = true; status(key, '<div class="wfm-prog"><i></i></div><small>⏳ جاري الرفع… خليك على الصفحة</small>'); },
      onProgress: function (p) { var i = d.querySelector('[data-wfm-status="' + key + '"] .wfm-prog i'); if (i) i.style.width = Math.round(p * 100) + "%"; }
    }).then(function (item) {
      g.busy = false; status(key, "");
      if (item && g.onAdd) g.onAdd(item);
    }, function (err) {
      g.busy = false; status(key, '<small style="color:#c62828">⚠️ ' + esc(err && err.message || "تعذّر الرفع") + '</small>');
    });
  });

  function removeRemote(urls) {
    urls = (urls || []).filter(function (u) { return valid({ url: u, kind: u.indexOf("/image/upload/") > 0 ? "image" : "video" }); });
    if (!urls.length) return Promise.resolve({ deleted: 0, done: [] });
    var out = { deleted: 0, denied: 0, failed: 0, done: [] }, chunks = [];
    for (var i = 0; i < urls.length; i += 40) chunks.push(urls.slice(i, i + 40));
    return chunks.reduce(function (p, c) {
      return p.then(function () { return callFn("mediaDelete", { urls: c }).then(function (r) { r = r || {}; out.deleted += +r.deleted || 0; out.denied += +r.denied || 0; out.failed += +r.failed || 0; out.done = out.done.concat(r.done || []); }); });
    }, Promise.resolve()).then(function () { return out; });
  }
  function busy() { return Object.keys(groups).some(function (k) { return groups[k] && groups[k].busy; }); }
  w.WFMedia = { _busy: busy, removeRemote: removeRemote, call: callFn, size: size, add: add, upload: upload, recordAudio: recordAudio, valid: valid, clean: clean, listHtml: listHtml, actsHtml: actsHtml, bind: bind, fmtDur: fmtDur, _fileSheet: fileSheet };

  /* =========================================================
     WFLoc — اللوكيشن
     ========================================================= */
  function num(v) { var n = +v; return isFinite(n) ? n : NaN; }
  function okLL(lat, lng) { return isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0); }
  var MAPS_RE = /^https:\/\/((www\.|maps\.)?google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.[a-z.]+|www\.google\.[a-z.]+\/maps)[^\s"'<>\\]*$/i;
  function locClean(l) {
    if (!l || typeof l !== "object") return null;
    var lat = num(l.lat), lng = num(l.lng);
    if (okLL(lat, lng)) { var o = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 }; if (+l.acc > 0) o.acc = Math.round(+l.acc); if (l.at) o.at = String(l.at).slice(0, 40); return o; }
    if (typeof l.url === "string" && l.url.length <= 300 && MAPS_RE.test(l.url)) { var u = { url: l.url }; if (l.at) u.at = String(l.at).slice(0, 40); return u; }
    return null;
  }
  function parse(text) {
    var t = String(text || "").trim().replace(/[٠-٩]/g, function (x) { return x.charCodeAt(0) - 1632; }).replace(/،/g, ",");
    if (!t) return null;
    var m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(t) || /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(t) || /[?&](?:q|query|ll|destination|daddr|center)=(?:loc:)?(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i.exec(t) || /^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(t) || /geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(t);
    var at = new Date().toISOString();
    if (m) return locClean({ lat: m[1], lng: m[2], at: at });
    var u = /https:\/\/\S+/.exec(t);
    if (u) return locClean({ url: u[0].replace(/[),.]+$/, ""), at: at });
    return null;
  }
  function here() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) return reject(new Error("الموبايل ده مش بيدعم تحديد الموقع."));
      navigator.geolocation.getCurrentPosition(function (p) {
        var l = locClean({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: new Date().toISOString() });
        l ? resolve(l) : reject(new Error("تعذّر تحديد الموقع."));
      }, function (e) {
        reject(new Error(e && e.code === 1 ? "لازم تسمح بالوصول للموقع (Location) من إعدادات المتصفح." : e && e.code === 3 ? "تحديد الموقع أخد وقت طويل — اتأكد إن الـ GPS شغال وجرّب تاني." : "تعذّر تحديد الموقع — شغّل الـ GPS وجرّب تاني."));
      }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
    });
  }
  function href(l) { l = locClean(l); if (!l) return ""; return l.url || ("https://www.google.com/maps/search/?api=1&query=" + l.lat + "," + l.lng); }
  function navHref(l) { l = locClean(l); if (!l) return ""; return l.url || ("https://www.google.com/maps/dir/?api=1&destination=" + l.lat + "," + l.lng); }
  function label(l) { l = locClean(l); if (!l) return ""; return l.url ? "لينك خرائط" : ("📍 " + l.lat.toFixed(5) + ", " + l.lng.toFixed(5) + (l.acc ? " (دقة ~" + l.acc + " م)" : "")); }
  function linkHtml(l, text) { var u = href(l); if (!u) return ""; css(); return '<a class="wfloc-link" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(text || "🗺️ اللوكيشن") + '</a>'; }
  function shareText(l) { var u = href(l); return u ? "📍 اللوكيشن: " + u : ""; }

  /* ويدجت داخل الفورم: <div class="wfloc" id> وقيمته في data-loc. */
  function widgetInner(l, o) {
    l = locClean(l);
    var st = l ? '<div class="wfloc-st ok">✅ اللوكيشن متحدد — ' + esc(label(l)) + '</div>' : '<div class="wfloc-st">' + esc(o.hint || "اختياري: حدّد مكانك على الخريطة عشان الفني يوصلك بسهولة.") + '</div>';
    return st + '<div class="wfm-acts"><button type="button" class="secondary sec sm" data-wfloc-act="here">📍 موقعي الحالي</button><button type="button" class="secondary sec sm" data-wfloc-act="paste">🔗 لصق لينك</button>' + (l ? '<a class="secondary sec sm" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center;padding:7px 10px;border-radius:10px;font-size:13px" href="' + esc(href(l)) + '" target="_blank" rel="noopener noreferrer">🗺️ عرض</a><button type="button" class="secondary sec sm" data-wfloc-act="clear">✖ مسح</button>' : "") + '</div>';
  }
  function field(id, l, o) {
    o = o || {}; css(); l = locClean(l);
    return '<div class="wfloc" id="' + esc(id) + '" data-loc="' + esc(l ? JSON.stringify(l) : "") + '" data-hint="' + esc(o.hint || "") + '">' + widgetInner(l, o) + '</div>';
  }
  function getVal(id) { var el = typeof id === "string" ? d.getElementById(id) : id; if (!el) return null; try { return locClean(JSON.parse(el.getAttribute("data-loc") || "null")); } catch (e) { return null; } }
  function setVal(id, l) {
    var el = typeof id === "string" ? d.getElementById(id) : id; if (!el) return;
    l = locClean(l);
    el.setAttribute("data-loc", l ? JSON.stringify(l) : "");
    el.innerHTML = widgetInner(l, { hint: el.getAttribute("data-hint") || "" });
    try { el.dispatchEvent(new CustomEvent("wfloc-change", { bubbles: true, detail: l })); } catch (e) {}
  }
  d.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-wfloc-act]"); if (!b) return;
    var box = b.closest(".wfloc"); if (!box) return;
    e.preventDefault();
    var a = b.getAttribute("data-wfloc-act"), st = box.querySelector(".wfloc-st");
    if (a === "clear") return setVal(box, null);
    if (a === "paste") {
      var v = w.prompt("الصق لينك اللوكيشن (من خرائط جوجل أو واتساب) أو الإحداثيات زي 28.0871, 30.7618:");
      if (v == null) return;
      var l = parse(v);
      if (!l) { if (st) { st.className = "wfloc-st"; st.style.color = "#c62828"; st.textContent = "⚠️ اللينك ده مش لينك خرائط — افتح اللوكيشن في خرائط جوجل واعمل «مشاركة» وانسخ اللينك."; } return; }
      return setVal(box, l);
    }
    if (a === "here") {
      if (st) { st.className = "wfloc-st"; st.style.color = ""; st.textContent = "⏳ جاري تحديد موقعك… (اتأكد إن الـ GPS شغال)"; }
      b.disabled = true;
      here().then(function (l) { setVal(box, l); }, function (err) { b.disabled = false; if (st) { st.style.color = "#c62828"; st.textContent = "⚠️ " + err.message; } });
    }
  });

  w.WFLoc = { here: here, parse: parse, clean: locClean, href: href, navHref: navHref, label: label, linkHtml: linkHtml, shareText: shareText, field: field, get: getVal, set: setVal };
})(window);
