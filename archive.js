/* archive.js — الأرشيف على الأجهزة (batch96).
   السيرفر بينقل الأوامر القديمة اللي خلصت خالص (مقفولة/ملغية + متسددة + ضمانها خلص + عدّى عليها مدة الأرشفة) للأرشيف كل ليلة،
   ومعاها حركات المحافظ والخزنة بتاعتها، وبيسيب «رصيد مُرحّل» عشان الأرصدة ماتتغيرش. الملف ده:
   - بينزّل الملخصات (archSum) وأرقام الأوامر المتأرشفة (archMeta/nos) في wf_arch_cache — التقارير ورقم الأمر الجديد بيقروا منها حتى أوفلاين.
   - صفحة العميل: عدد أوامره القديمة وإجمالي اللي دفعه + زرار «عرض الأوامر القديمة».
   - صفحة الأمر: لو الأمر مش على الجهاز ← بيدوّر في الأرشيف ويعرضه، وزرار «رجّعه للشغل» (لو هتعدّل عليه).
   - البحث الشامل: «دوّر في الأرشيف» (برقم الأمر أو اسم/تليفون العميل أو الجهاز).
   - الإعدادات: مدة الأرشفة، آخر تشغيل، «أرشف دلوقتي»، «إعادة حساب الملخصات».
   - النسخة الاحتياطية: تصدير الأرشيف معاها واسترجاعه.
   الأرشيف مش متاح أوفلاين إلا اللي اتفتح قبل كده (بيتحفظ نسخة منه على الجهاز). */
(function () {
  "use strict";
  var w = window, CACHE = "wf_arch_cache", CHECK_EVERY = 10 * 60 * 1000;
  var CARRY = "archive-carry";
  function S() { return w.WFStorage || null; }
  function rd(k) { try { var s = S(); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function wr(k, v) { try { var s = S(); if (s) s.setItem(k, v); } catch (e) {} }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]; }); }
  function money(n) { return (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ج"; }
  function cache() { try { return JSON.parse(rd(CACHE) || "null") || {}; } catch (e) { return {}; } }
  function saveCache(c) { c.at = Date.now(); wr(CACHE, JSON.stringify(c)); }
  function clean(v) { if (v && typeof v.toDate === "function") return v.toDate().toISOString(); if (Array.isArray(v)) return v.map(clean); if (v && typeof v === "object") { var o = {}; Object.keys(v).forEach(function (k) { o[k] = clean(v[k]); }); return o; } return v; }
  function rec(d) { var o = clean(d.data() || {}); delete o._ts; delete o._by; o.id = d.id; return o; }
  function online() { return navigator.onLine !== false; }
  function scoped() { return w.wfSyncMode === "scoped" || rd("wf_sync_mode") === "scoped"; }
  function fb() { return w.firebase && w.firebase.apps && w.firebase.apps.length ? w.firebase : null; }

  /* ---------- جاهزية Firebase (firebase-sync.js بيعمل initializeApp بعد ما التخزين يجهز) ---------- */
  var readyP = null;
  function ready() {
    if (readyP) return readyP;
    readyP = new Promise(function (res) {
      var tries = 0;
      (function wait() {
        var f = fb();
        if (f && f.auth) { var off = f.auth().onAuthStateChanged(function (u) { if (u) { try { off(); } catch (e) {} res(f); } }); return; }
        if (++tries > 120) return res(null);
        setTimeout(wait, 250);
      })();
    });
    return readyP;
  }
  function db() { return ready().then(function (f) { if (!f || !f.firestore) throw new Error("no-firebase"); return f.firestore(); }); }

  /* نداء دوال السيرفر (callable) بنفس طريقة باقي النظام */
  function callFn(name, data, timeoutMs) {
    return ready().then(function (f) {
      if (!f) throw new Error("no-firebase");
      var u = f.auth().currentUser; if (!u) throw new Error("sign_in_required");
      var url = "https://us-central1-" + encodeURIComponent(f.app().options.projectId) + ".cloudfunctions.net/" + encodeURIComponent(name);
      return u.getIdToken().then(function (tok) {
        return (w.WFAppCheck ? w.WFAppCheck.headers() : Promise.resolve({})).then(function (h) {
          var hdr = { "Content-Type": "application/json", Authorization: "Bearer " + tok };
          Object.keys(h || {}).forEach(function (k) { hdr[k] = h[k]; });
          var ctl = typeof AbortController === "function" ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs || 60000) : null;
          return fetch(url, { method: "POST", headers: hdr, body: JSON.stringify({ data: data || {} }), signal: ctl ? ctl.signal : undefined }).then(function (r) {
            if (t) clearTimeout(t);
            return r.json().catch(function () { return {}; }).then(function (j) {
              if (r.ok && j && j.result !== undefined) return j.result;
              var e = new Error((j && j.error && (j.error.message || j.error.status)) || ("HTTP " + r.status)); e.status = r.status; throw e;
            });
          }, function (e) { if (t) clearTimeout(t); throw e; });
        });
      });
    });
  }
  function errText(e) {
    var m = String((e && e.message) || e || "");
    if (/no_permission|permission/i.test(m)) return "مالكش صلاحية للعملية دي.";
    if (/404|NOT_FOUND/i.test(m)) return "دوال الأرشيف لسه ماترفعتش على السيرفر.";
    if (/abort|network|Failed to fetch/i.test(m)) return "النت ضعيف أو مقطوع — جرّب تاني.";
    return "حصل خطأ: " + m;
  }

  /* ---------- الملخصات وأرقام الأوامر (كاش على الجهاز) ---------- */
  var refreshing = null;
  function refresh(force) {
    if (refreshing) return refreshing;
    if (scoped() || !online()) return Promise.resolve(false);
    var c = cache();
    if (!force && c.checkAt && Date.now() - c.checkAt < CHECK_EVERY) return Promise.resolve(false);
    refreshing = db().then(function (d) {
      return d.collection("archMeta").doc("state").get().then(function (st) {
        var meta = st.exists ? clean(st.data() || {}) : {}, v = +meta.v || 0;
        c.meta = { v: v, months: meta.months || 0, cutDay: meta.cutDay || "", lastRun: meta.lastRun || "", lastResult: meta.lastResult || null, lastError: meta.lastError || "" };
        c.checkAt = Date.now();
        if (!force && c.v === v && c.sums) { saveCache(c); return false; }
        /* بنقرا بس اللي اتغيّر من آخر مرة (_ts)، إلا لو الملخصات اتحسبت من جديد (rebuild) أو أول مرة */
        var full = !c.sums || !c.cust || String(c.rebuiltAt || "") !== String(meta.rebuiltAt || ""), TS = w.firebase.firestore.Timestamp;
        var since = function (q, ms) { return full || !ms || !TS ? q : q.where("_ts", ">", TS.fromMillis(ms - 60000)); };
        var maxTs = function (docs, cur) { docs.forEach(function (x) { var t = x.get ? x.get("_ts") : null; t = t && t.toMillis ? t.toMillis() : 0; if (t > cur) cur = t; }); return cur; };
        return Promise.all([since(d.collection("archSum"), c.sumTs).get(), d.collection("archMeta").doc("nos").get(), since(d.collection("archCust"), c.custTs).get()]).then(function (res) {
          var sums = full ? {} : (c.sums || {}), cust = full ? {} : (c.cust || {});
          res[0].docs.forEach(function (x) { var dd = x.data() || {}; sums[x.id] = dd.d || {}; });
          res[2].docs.forEach(function (x) { var dd = x.data() || {}; if (!(+dd.n) && !(+dd.paid)) { delete cust[x.id]; return; } cust[x.id] = { n: +dd.n || 0, nc: +dd.nc || 0, paid: +dd.paid || 0, rev: +dd.rev || 0, first: dd.first || "", last: dd.last || "" }; });
          c.sums = sums; c.cust = cust; c.nos = res[1].exists ? ((res[1].data() || {}).d || {}) : {}; c.v = v; c.rebuiltAt = meta.rebuiltAt || "";
          c.sumTs = maxTs(res[0].docs, full ? 0 : (c.sumTs || 0)); c.custTs = maxTs(res[2].docs, full ? 0 : (c.custTs || 0));
          saveCache(c);
          try { document.dispatchEvent(new CustomEvent("wf-archive-updated")); } catch (e) {}
          return true;
        });
      });
    }).catch(function (e) { console.warn("[archive] refresh", e && e.message); return false; }).then(function (r) { refreshing = null; return r; });
    return refreshing;
  }
  function maxNo(prefix) { var c = cache(); return +((c.nos || {})[prefix]) || 0; }

  /* ---------- قراءة الأرشيف ---------- */
  var LOCAL_ORD = "wf_arch_orders"; // نسخ الأوامر المتأرشفة اللي اتفتحت قبل كده (عشان تتفتح أوفلاين)
  function remember(list) {
    try { var m = JSON.parse(rd(LOCAL_ORD) || "{}") || {}; list.forEach(function (o) { if (o && o.id) m[o.id] = o; }); var ids = Object.keys(m); if (ids.length > 300) ids.slice(0, ids.length - 300).forEach(function (k) { delete m[k]; }); wr(LOCAL_ORD, JSON.stringify(m)); } catch (e) {}
  }
  function remembered(id) { try { return (JSON.parse(rd(LOCAL_ORD) || "{}") || {})[id] || null; } catch (e) { return null; } }
  function getOrder(id) {
    var mem = remembered(id);
    if (!online()) return Promise.resolve(mem);
    return db().then(function (d) { return d.collection("archRequests").doc(String(id)).get(); }).then(function (s) { if (!s.exists) return null; var o = rec(s); remember([o]); return o; }).catch(function () { return mem; });
  }
  function customerOrders(customerId) {
    return db().then(function (d) { return d.collection("archRequests").where("customerId", "==", String(customerId)).get(); })
      .then(function (s) { var l = s.docs.map(rec).sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); }); remember(l); return l; });
  }
  function customerSummary(customerId) {
    return db().then(function (d) { return d.collection("archCust").doc(String(customerId)).get(); }).then(function (s) { return s.exists ? clean(s.data() || {}) : null; });
  }
  function orderTx(orderId) {
    return db().then(function (d) {
      return Promise.all([d.collection("archWalletTx").where("orderId", "==", orderId).get(), d.collection("archWalletTx").where("refKey", "in", ["order-deposit-" + orderId, "order-final-" + orderId]).get()]);
    }).then(function (r) { var seen = {}, out = []; r[0].docs.concat(r[1].docs).forEach(function (x) { if (seen[x.id]) return; seen[x.id] = 1; out.push(rec(x)); }); return out; }).catch(function () { return []; });
  }
  /* البحث: Firestore مابيدورش جوه النص، فبندور بالمفاتيح: رقم الأمر، أو العملاء/الأجهزة اللي على الجهاز وبيطابقوا الكلمة */
  function norm(v) { return String(v == null ? "" : v).toLowerCase().trim(); }
  function digits(v) { return String(v || "").replace(/[٠-٩]/g, function (c) { return c.charCodeAt(0) - 1632; }).replace(/\D/g, ""); }
  function search(q) {
    q = String(q || "").trim(); if (!q) return Promise.resolve([]);
    if (!online()) return Promise.reject(new Error("offline"));
    var K = w.K || {}, list = function (k) { try { return (typeof w.arrCached === "function" ? w.arrCached(k) : w.arr(k)) || []; } catch (e) { return []; } };
    var nq = norm(q), dq = digits(q);
    var cids = list(K.c).filter(function (c) { return c && (norm(c.name).indexOf(nq) > -1 || (dq.length >= 4 && digits(c.phone).indexOf(dq) > -1)); }).map(function (c) { return String(c.id); }).slice(0, 60);
    var dids = list(K.d).filter(function (x) { return x && [x.type, x.brand, x.model, x.serial].some(function (f) { return norm(f).indexOf(nq) > -1; }); }).map(function (x) { return String(x.id); }).slice(0, 30);
    return db().then(function (d) {
      var col = d.collection("archRequests"), jobs = [];
      var up = q.toUpperCase(); jobs.push(col.where("no", ">=", up).where("no", "<=", up + "").limit(30).get());
      for (var i = 0; i < cids.length; i += 30) jobs.push(col.where("customerId", "in", cids.slice(i, i + 30)).limit(60).get());
      for (var j = 0; j < dids.length; j += 30) jobs.push(col.where("deviceId", "in", dids.slice(j, j + 30)).limit(60).get());
      return Promise.all(jobs.map(function (p) { return p.catch(function () { return { docs: [] }; }); }));
    }).then(function (res) {
      var seen = {}, out = [];
      res.forEach(function (s) { s.docs.forEach(function (x) { if (seen[x.id]) return; seen[x.id] = 1; out.push(rec(x)); }); });
      out.sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); });
      remember(out.slice(0, 40)); return out.slice(0, 80);
    });
  }
  /* رجّعه للشغل: السيرفر بيرجّع الأمر وحركاته في معاملة واحدة ويخصمهم من الملخصات والرصيد المُرحّل */
  function restore(id) {
    return callFn("archiveRestoreOrder", { id: String(id) }).then(function (r) {
      if (!r || !r.revived) throw new Error("not_archived");
      var c = cache(); c.checkAt = 0; saveCache(c);
      var sync = typeof w.wfCloudSyncNow === "function" ? w.wfCloudSyncNow() : Promise.resolve();
      return Promise.race([sync, new Promise(function (r2) { setTimeout(r2, 15000); })]).catch(function () {}).then(function () { return r; });
    });
  }

  /* ---------- عرض ---------- */
  function custName(id) { try { return w.customerName ? w.customerName(id) : id; } catch (e) { return "—"; } }
  function devName(id) { try { return w.deviceName ? w.deviceName(id) : ""; } catch (e) { return ""; } }
  function fmt(v) { if (!v) return "—"; var d = new Date(v); return isNaN(d.getTime()) ? esc(v) : esc(d.toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" })); }
  function orderLine(o) {
    return '<a class="item" style="display:block;text-decoration:none;color:inherit" href="request.html?id=' + encodeURIComponent(o.id) + '"><b>📦 ' + esc(o.no || "—") + '</b> <span class="badge">' + esc(o.status || "") + (o.closed ? " 🔒" : "") + '</span><div>' + esc(devName(o.deviceId)) + " • " + fmt(o.closedAt || o.createdAt) + " • الإجمالي " + money(o.total) + "</div></a>";
  }
  function orderView(o, txs) {
    var parts = (o.parts || []).map(function (p) { var nm = p.name || (function () { try { var x = w.byIdCached && w.byIdCached(w.K.p).get(p.partId); return x && x.name; } catch (e) { return ""; } })() || "قطعة"; return "<li>" + esc(nm) + " × " + esc(p.qty || 1) + " — " + money((+p.qty || 0) * (+p.sell || 0)) + "</li>"; }).join("");
    var hist = (o.statusHistory || []).map(function (h) { return "<li>" + esc(h.to || "") + " — " + fmt(h.at) + (h.note ? " <small>(" + esc(h.note) + ")</small>" : "") + "</li>"; }).join("");
    var tx = (txs || []).map(function (x) { return "<li>" + (x.type === "in" ? "➕" : "➖") + " " + money(x.amount) + " — " + esc(x.wallet || "") + " <small>" + esc(x.reason || "") + " • " + esc(x.date || "") + "</small></li>"; }).join("");
    return '<div class="profile"><div class="hint" style="padding:8px 10px;border:1px dashed var(--border,#aaa);border-radius:10px;margin-bottom:10px">📦 الأمر ده في الأرشيف (أمر قديم خلص). بيانات للعرض بس — لو محتاج تعدّل عليه أو ترجّع عليه فلوس اضغط «رجّعه للشغل».</div>' +
      '<h1 class="profile-title">🛠️ ' + esc(o.no || "") + ' <span class="badge">' + esc(o.status || "") + (o.closed ? " 🔒" : "") + "</span></h1>" +
      '<div class="request-grid"><div class="kv"><b>👤 العميل</b><a href="customer.html?id=' + encodeURIComponent(o.customerId || "") + '">' + esc(custName(o.customerId)) + '</a></div><div class="kv"><b>🔧 الجهاز</b>' + (o.deviceId ? '<a href="device.html?id=' + encodeURIComponent(o.deviceId) + '">' + esc(devName(o.deviceId) || "جهاز") + "</a>" : "—") + '</div>' +
      '<div class="kv"><b>🕐 التسجيل</b>' + fmt(o.createdAt) + '</div><div class="kv"><b>🔒 القفل</b>' + fmt(o.closedAt) + '</div><div class="kv request-wide"><b>📝 العطل</b>' + esc(o.fault || "—") + '</div><div class="kv request-wide"><b>🔨 الأعمال</b>' + esc(o.work || "—") + "</div>" +
      (o.status === "ملغي" && o.cancelReason ? '<div class="kv request-wide"><b>❌ سبب الإلغاء</b>' + esc(o.cancelReason) + "</div>" : "") + "</div>" +
      '<table class="month-table compact-money"><tr><td>🔨 المصنعية</td><td>' + money(o.labor) + '</td></tr><tr><td>🔧 قطع الغيار</td><td>' + money(o.partsTotal) + '</td></tr><tr class="total-row"><td>💰 الإجمالي</td><td>' + money(o.total) + '</td></tr><tr><td>💵 العربون</td><td>' + money(o.deposit) + (o.depositWallet ? " <small>(" + esc(o.depositWallet) + ")</small>" : "") + "</td></tr>" + ((+o.depositRefunded || 0) > 0 ? "<tr><td>↩️ اترد للعميل</td><td>" + money(o.depositRefunded) + "</td></tr>" : "") + "<tr><td>🛡️ الضمان لحد</td><td>" + fmt(o.warrantyUntil) + "</td></tr></table>" +
      (parts ? "<h3>🔧 القطع</h3><ul>" + parts + "</ul>" : "") + (tx ? "<h3>💳 حركاته في المحافظ</h3><ul>" + tx + "</ul>" : "") + (hist ? "<h3>🧾 سجل الحالات</h3><ul>" + hist + "</ul>" : "") +
      '<p><button type="button" class="primary" id="wfArchRestore">↩️ رجّعه للشغل (عشان أعدّل عليه)</button> <span id="wfArchMsg" class="hint" role="status"></span></p></div>';
  }

  /* صفحة الأمر: الأمر مش على الجهاز ← دوّر في الأرشيف */
  function hookRequestPage() {
    var el = document.getElementById("requestProfile"); if (!el) return;
    var id = new URLSearchParams(location.search).get("id"); if (!id) return;
    var busy = false;
    function check() {
      if (busy || el.getAttribute("data-arch") === id) return;
      if (!/الأمر غير موجود/.test(el.textContent || "")) return;
      busy = true; el.setAttribute("data-arch", id); el.innerHTML = "<div class='item'>⏳ بدوّر على الأمر في الأرشيف…</div>";
      getOrder(id).then(function (o) {
        if (!o) { el.innerHTML = "<div class='item'>الأمر غير موجود" + (online() ? " (ولا في الأرشيف)." : " — ولو قديم ومتأرشف محتاج نت عشان يتفتح.") + "</div>"; return; }
        return (online() ? orderTx(o.id) : Promise.resolve([])).then(function (txs) {
          el.innerHTML = orderView(o, txs);
          var b = document.getElementById("wfArchRestore"), msg = document.getElementById("wfArchMsg");
          if (b) b.onclick = function () {
            if (!online()) { msg.textContent = "محتاج نت."; return; }
            if (!confirm("ترجّع الأمر " + (o.no || "") + " وحركاته من الأرشيف للشغل العادي؟\nلو مااتعدّلش هيرجع للأرشيف لوحده بعدين.")) return;
            b.disabled = true; msg.textContent = "⏳ جاري الترجيع…";
            restore(o.id).then(function () { msg.textContent = "✅ رجع — بفتح الأمر…"; setTimeout(function () { location.reload(); }, 600); })
              .catch(function (e) { b.disabled = false; msg.textContent = /not_archived/.test(String(e && e.message)) ? "الأمر ده رجع للشغل خلاص — حدّث الصفحة." : errText(e); });
          };
        });
      }).catch(function (e) { el.innerHTML = "<div class='item'>تعذّر فتح الأرشيف: " + esc(errText(e)) + "</div>"; }).then(function () { busy = false; });
    }
    check();
    try { new MutationObserver(check).observe(el, { childList: true, subtree: true }); } catch (e) {}
  }

  /* صفحة العميل: ملخص الأرشيف + «عرض الأوامر القديمة» */
  function hookCustomerPage() {
    var host = document.getElementById("customerProfile"); if (!host || document.getElementById("wfArchCust")) return;
    var id = new URLSearchParams(location.search).get("id"); if (!id) return;
    var box = document.createElement("section"); box.id = "wfArchCust"; box.className = "panel"; box.style.marginTop = "12px";
    box.innerHTML = "<h2 style='margin-top:0'>📦 الأوامر القديمة (الأرشيف)</h2><div id='wfArchCustSum' class='hint'>" + (online() ? "⏳ …" : "محتاج نت لعرض الأرشيف.") + "</div><button type='button' class='secondary' id='wfArchCustBtn'>📂 عرض الأوامر القديمة</button><div id='wfArchCustList' style='margin-top:8px'></div>";
    host.parentNode.insertBefore(box, host.nextSibling);
    var sum = box.querySelector("#wfArchCustSum"), btn = box.querySelector("#wfArchCustBtn"), listEl = box.querySelector("#wfArchCustList");
    if (online()) customerSummary(id).then(function (s) {
      if (!s || !s.n) { sum.textContent = "مفيش أوامر قديمة متأرشفة للعميل ده."; return; }
      sum.innerHTML = "<b>" + s.n + "</b> أمر قديم" + (s.nc ? " (منهم " + s.nc + " ملغي)" : "") + " • دفع إجمالي <b>" + money(s.paid) + "</b>" + (s.first ? " • من " + fmt(s.first) + " لـ " + fmt(s.last) : "");
    }).catch(function (e) { sum.textContent = errText(e); });
    btn.onclick = function () {
      if (!online()) { listEl.textContent = "محتاج نت."; return; }
      btn.disabled = true; listEl.textContent = "⏳ جاري التحميل…";
      customerOrders(id).then(function (l) { listEl.innerHTML = l.length ? l.map(orderLine).join("") : "<div class='item'>مفيش أوامر في الأرشيف.</div>"; })
        .catch(function (e) { listEl.textContent = errText(e); }).then(function () { btn.disabled = false; });
    };
  }

  /* صفحة الجهاز: أوامره القديمة اللي في الأرشيف */
  function deviceOrders(deviceId) {
    return db().then(function (d) { return d.collection("archRequests").where("deviceId", "==", String(deviceId)).get(); })
      .then(function (s) { var l = s.docs.map(rec).sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); }); remember(l); return l; });
  }
  function hookDevicePage() {
    var host = document.getElementById("deviceProfile"); if (!host || document.getElementById("wfArchDev")) return;
    var id = new URLSearchParams(location.search).get("id"); if (!id) return;
    var box = document.createElement("section"); box.id = "wfArchDev"; box.className = "panel"; box.style.marginTop = "12px";
    box.innerHTML = "<h2 style='margin-top:0'>📦 أوامر قديمة للجهاز ده (الأرشيف)</h2><button type='button' class='secondary' id='wfArchDevBtn'>📂 عرض الأوامر القديمة</button><div id='wfArchDevList' style='margin-top:8px'></div>";
    host.parentNode.insertBefore(box, host.nextSibling);
    var btn = box.querySelector("#wfArchDevBtn"), listEl = box.querySelector("#wfArchDevList");
    btn.onclick = function () {
      if (!online()) { listEl.textContent = "محتاج نت."; return; }
      btn.disabled = true; listEl.textContent = "⏳ جاري التحميل…";
      deviceOrders(id).then(function (l) { listEl.innerHTML = l.length ? l.map(orderLine).join("") : "<div class='item'>مفيش أوامر قديمة للجهاز ده في الأرشيف.</div>"; })
        .catch(function (e) { listEl.textContent = errText(e); }).then(function () { btn.disabled = false; });
    };
  }

  /* الإعدادات: مدة الأرشفة وحالة آخر تشغيل */
  function hookSettings() {
    var host = document.getElementById("archiveSettings"); if (!host) return;
    function paint() {
      var s = typeof w.settings === "function" ? w.settings() : {}, cur = +s.archiveMonths || 4, c = cache(), m = c.meta || {}, lr = m.lastResult || null;
      var opts = [3, 4, 6, 9, 12].map(function (n) { return "<option value='" + n + "'" + (n === cur ? " selected" : "") + ">" + n + " شهور</option>"; }).join("");
      host.innerHTML = "<p class='hint'>كل ليلة السيرفر بينقل للأرشيف أي أمر: <b>مقفول أو ملغي</b> + <b>متسدد بالكامل</b> + <b>ضمانه خلص</b> + <b>عدّى عليه المدة دي من قفله</b>، ومعاه حركات المحافظ والخزنة بتاعته. الأرصدة مابتتغيرش (بيتسجل «رصيد مُرحّل»)، والتقارير بتجمع الأرشيف. العملاء والأجهزة والمخزن والإعدادات مابيتأرشفوش أبدًا، ولا أوامر الفنيين لحد دلوقتي.</p>" +
        "<label>مدة الأرشفة <select id='wfArchMonths'>" + opts + "</select></label> " +
        "<label style='margin-inline-start:10px'><input type='checkbox' id='wfArchOff'" + (s.archiveOff === true ? " checked" : "") + "> إيقاف الأرشفة التلقائية</label>" +
        "<div class='hint' style='margin:8px 0'>" + (m.lastRun ? "آخر تشغيل: " + esc(new Date(m.lastRun).toLocaleString("ar-EG")) + (lr ? " — اتأرشف " + (lr.orders || 0) + " أمر و" + (lr.tx || 0) + " حركة محفظة و" + (lr.tr || 0) + " حركة خزنة" + (lr.more ? " (فيه لسه، هيكمّل الليلة الجاية)" : "") : "") + (m.cutDay ? "<br>بيتأرشف اللي اتقفل قبل " + esc(m.cutDay) : "") : "لسه ماشتغلش.") + (m.lastError ? "<br>⚠️ آخر خطأ: " + esc(m.lastError) : "") + "</div>" +
        (lr && lr.held ? "<details><summary class='hint'>ليه أوامر قديمة لسه ما اتأرشفتش؟</summary><div class='hint'>" + Object.keys(lr.held).filter(function (k) { return k !== "open" && k !== "recent"; }).map(function (k) { return ({ unpaid: "عليها باقي", warranty: "لسه في الضمان", tech: "معيّنة لفني (حساب الفني)", touched: "اتعدّلت في آخر أسبوعين", referenced: "عليها أمر ضمان مفتوح" }[k] || k) + ": " + lr.held[k]; }).join(" • ") + "</div></details>" : "") +
        "<p><button type='button' class='secondary' id='wfArchRun'>📦 أرشف دلوقتي</button> <button type='button' class='secondary' id='wfArchRebuild'>🔁 إعادة حساب ملخصات الأرشيف</button> <span id='wfArchSetMsg' class='hint' role='status'></span></p>";
      var msg = host.querySelector("#wfArchSetMsg");
      host.querySelector("#wfArchMonths").onchange = function () { var st = w.settings(); st.archiveMonths = +this.value; if (w.saveJSONSafe(w.K.s, st)) { msg.textContent = "✅ اتحفظ — هيتطبق من الليلة الجاية."; try { w.auditLog && w.auditLog("تعديل مدة الأرشفة", "إعدادات", "archive", this.value + " شهور"); } catch (e) {} } };
      host.querySelector("#wfArchOff").onchange = function () { var st = w.settings(); st.archiveOff = !!this.checked; if (w.saveJSONSafe(w.K.s, st)) msg.textContent = this.checked ? "⏸️ الأرشفة التلقائية واقفة." : "✅ الأرشفة التلقائية شغالة."; };
      host.querySelector("#wfArchRun").onclick = function () {
        var b = this; if (!online()) { msg.textContent = "محتاج نت."; return; }
        if (!confirm("تشغيل الأرشفة دلوقتي؟ (ممكن ياخد دقيقة أو اتنين)")) return;
        b.disabled = true; msg.textContent = "⏳ جاري الأرشفة…";
        var flush = typeof w.wfCloudSyncNow === "function" ? Promise.race([w.wfCloudSyncNow(), new Promise(function (r) { setTimeout(r, 20000); })]).catch(function () {}) : Promise.resolve(); // ارفع أي تعديل معلّق الأول
        flush.then(function () { return callFn("archiveRun", {}, 300000); }).then(function (r) {
          if (r && r.skipped) { msg.textContent = r.skipped === "busy" ? "الأرشفة شغالة دلوقتي من مكان تاني — استنى شوية." : "الأرشفة واقفة من الإعدادات."; return; }
          msg.textContent = "✅ اتأرشف " + (r.orders || 0) + " أمر و" + (r.tx || 0) + " حركة محفظة و" + (r.tr || 0) + " حركة خزنة" + (r.more ? " — وفيه لسه، اضغط تاني." : ".");
          return refresh(true).then(function () { return typeof w.wfCloudSyncNow === "function" ? w.wfCloudSyncNow().catch(function () {}) : null; }).then(paintKeepMsg);
        }).catch(function (e) { msg.textContent = errText(e); }).then(function () { b.disabled = false; });
      };
      host.querySelector("#wfArchRebuild").onclick = function () {
        var b = this; if (!online()) { msg.textContent = "محتاج نت."; return; }
        if (!confirm("إعادة حساب كل ملخصات الأرشيف والرصيد المُرحّل من الأوامر والحركات المتأرشفة نفسها؟ (للإصلاح بس)")) return;
        b.disabled = true; msg.textContent = "⏳ …";
        callFn("archiveRebuild", {}, 540000).then(function (r) { msg.textContent = "✅ اتحسب من جديد: " + r.orders + " أمر و" + r.tx + " حركة محفظة و" + r.tr + " حركة خزنة."; return refresh(true); })
          .catch(function (e) { msg.textContent = errText(e); }).then(function () { b.disabled = false; });
      };
      function paintKeepMsg() { var t = msg.textContent; paint(); var m2 = host.querySelector("#wfArchSetMsg"); if (m2) m2.textContent = t; }
    }
    paint();
    document.addEventListener("wf-archive-updated", paint);
    refresh(true).then(function () { paint(); });
  }

  /* ---------- النسخة الاحتياطية ---------- */
  function exportAll() {
    if (!online()) return Promise.resolve(null);
    return db().then(function (d) {
      return Promise.all(["archRequests", "archWalletTx", "archTreasury"].map(function (c) { return d.collection(c).get(); }));
    }).then(function (r) {
      var pack = function (s) { return s.docs.map(function (x) { var o = clean(x.data() || {}); delete o._ts; delete o._by; return { id: x.id, data: o }; }); };
      return { requests: pack(r[0]), walletTx: pack(r[1]), treasury: pack(r[2]), exportedAt: new Date().toISOString() };
    });
  }
  function importAll(a) {
    if (!a || typeof a !== "object") return Promise.resolve(null);
    var cols = ["requests", "walletTx", "treasury"], chunks = [];
    cols.forEach(function (c) { var l = Array.isArray(a[c]) ? a[c] : []; for (var i = 0; i < l.length; i += 300) { var o = {}; o[c] = l.slice(i, i + 300); chunks.push(o); } });
    if (!chunks.length) return Promise.resolve({ added: 0 });
    var added = 0, chain = Promise.resolve();
    chunks.forEach(function (ch) { chain = chain.then(function () { return callFn("archiveImport", ch, 300000); }).then(function (r) { added += (r && r.added) || 0; }); });
    return chain.then(function () { return added ? callFn("archiveRebuild", {}, 540000) : null; }).then(function () { return refresh(true); }).then(function () { return { added: added }; });
  }

  w.WFArchive = { refresh: refresh, maxNo: maxNo, getOrder: getOrder, customerOrders: customerOrders, deviceOrders: deviceOrders, customerSummary: customerSummary, search: search, restore: restore, exportAll: exportAll, importAll: importAll, orderLine: orderLine, isCarry: function (x) { return !!x && x.source === CARRY; } };

  function boot() {
    hookRequestPage(); hookCustomerPage(); hookDevicePage(); hookSettings();
    ready().then(function (f) { if (f) setTimeout(function () { refresh(false); }, 2500); }); // بعد ما الصفحة تفتح: قراءة واحدة بس لو مافيش جديد
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
