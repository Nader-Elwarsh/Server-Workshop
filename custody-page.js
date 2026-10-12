/* custody-page.js — «الفنيون والعهدة» (custody.html). لمن عنده صلاحية custody.approve (والإيداع/التسوية بـ custody.settle).
   - كارت لكل فني: محفظة العهدة ورصيدها، أوامره المفتوحة، زياراته النهارده والجاية، مصروفاته المعلّقة.
   - اعتماد/رفض المصروفات: الاعتماد بيسجّل حركة صرف في محفظة الفني (مرتبطة بمفتاح ثابت: ما بتتسجلش مرتين).
   - إيداع عهدة (محفظة ورشة → محفظة الفني) وتسوية (محفظة الفني → محفظة ورشة): حركتين مترابطتين بنفس custodyId.
   كل النصوص بتتحط بـ textContent. */
(function () {
  "use strict";
  var waited = 0;
  function ready() { return window.WFPerm && window.WFTech && window.firebase && typeof window.arr === "function" && window.K && typeof window.put === "function" && typeof window.walletBalance === "function" && typeof window.settings === "function"; }
  function wait() {
    if (ready()) return start();
    if ((waited += 80) > 20000) { var m = document.getElementById("custodyRoot"); if (m) m.textContent = "تعذّر تحميل الصفحة. حدّث وجرّب تاني."; return; }
    setTimeout(wait, 80);
  }

  function start() {
    var root = document.getElementById("custodyRoot"), msgBox = document.getElementById("custodyMsg");
    var state = { users: [], pending: [], own: [], open: {}, err: "" };
    var CARD = "padding:12px;margin:0 0 12px;border-radius:14px;border:1px solid var(--border,#d5dbe8);background:var(--bg-elevated,#fff)";
    var BTN = "padding:8px 13px;border-radius:10px;border:0;background:#0b57d0;color:#fff;font-weight:700;font-size:14px";
    var BTN2 = "padding:8px 13px;border-radius:10px;border:1px solid #9aa7c2;background:transparent;color:inherit;font-size:14px";
    var INP = "width:100%;box-sizing:border-box;padding:8px;border-radius:10px;border:1px solid #9aa7c2;font-size:15px";
    function mk(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }
    function btn(label, css, fn) { var b = mk("button", css || "", label); b.type = "button"; if (fn) b.onclick = fn; return b; }
    function say(t, bad) { msgBox.textContent = ""; if (!t) return; msgBox.appendChild(mk("p", "padding:8px 10px;border-radius:10px;margin:8px 0;background:" + (bad ? "#fde2e2;color:#8a1c1c" : "#dff5e3;color:#14532d"), t)); }
    function A(k) { try { return window.arr(k) || []; } catch (e) { return []; } }
    function money(n) { return (Math.round((+n || 0) * 100) / 100).toLocaleString("ar-EG") + " ج"; }
    function myUid() { try { return window.firebase.auth().currentUser.uid; } catch (e) { return ""; } }
    function fsdb() { return window.firebase.firestore(); }
    function canApprove() { return window.WFPerm.can("custody.approve"); }
    function canSettle() { return window.WFPerm.can("custody.settle"); }
    function dayOf(v) { try { return window.dayKeyLocal(v); } catch (e) { return ""; } }
    function timeOf(v) { var d = new Date(v); return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }); }
    function monthOf(v) { var d = new Date(v); return isNaN(d.getTime()) ? "" : d.getFullYear() + "-" + (d.getMonth() + 1); }
    function custName(id) { var c = A(window.K.c).filter(function (x) { return x.id === id; })[0]; return (c && c.name) || "عميل"; }
    function techWallets() { var s = {}; state.users.forEach(function (u) { if (u.wallet) s[u.wallet] = 1; }); return s; }
    function workshopWallets() { var tw = techWallets(); return (window.settings().wallets || []).filter(function (w) { return !tw[String(w).trim()]; }); }

    /* ---------- الحركات المالية (محلية → بتتزامن زي أي حركة محفظة) ---------- */
    function nowParts() { var n = new Date(); return { date: window.localDateKey(n), time: n.toTimeString().slice(0, 5), iso: n.toISOString() }; }
    function addCustodyMove(fromWallet, toWallet, amount, reason, note) {
      var t = nowParts(), cid = window.id();
      var base = { refKey: null, manualOverride: true, deleted: false, amount: amount, category: "سلفة / تحويل", date: t.date, time: t.time, reason: reason, note: note || "", source: "custody", custodyId: cid, createdAt: t.iso };
      var out = Object.assign({ id: window.id(), type: "out", wallet: fromWallet }, base), inn = Object.assign({ id: window.id(), type: "in", wallet: toWallet }, base);
      if (!window.put(window.K.wtx, A(window.K.wtx).concat(out, inn))) return false;
      try { window.auditLog && window.auditLog("عهدة", "محفظة", cid, fromWallet + " ← " + toWallet + " " + amount + " ج"); } catch (e) {}
      return true;
    }
    var PAY_LBL = { custody: "💼 من عهدته", own: "👛 من جيبه — الورشة تردّهاله", workshop: "🏢 الإدارة دفعتها / اديته تمنها" };
    function payKind(e) { return PAY_LBL[e.pay] ? e.pay : "custody"; }
    /* الاعتماد حسب الفلوس اتدفعت منين:
       custody → بتتخصم من محفظة عهدته • own → مفيش حركة دلوقتي، بتتضاف لمستحقاته وبتتصرف له مع الأجور
       workshop → بتتخصم من محفظة الورشة اللي تختارها (أو من غير حركة لو اتسجلت قبل كده) */
    function approveExpense(e, noteText, workshopWallet) {
      var kind = payKind(e);
      if (kind === "own" || (kind === "workshop" && !workshopWallet)) return markDecision(e, "approved", noteText);
      var u = state.users.filter(function (x) { return x.uid === e.techId; })[0];
      var wallet = kind === "workshop" ? String(workshopWallet).trim() : String(e.wallet || (u && u.wallet) || "").trim();
      if (!wallet) return Promise.reject("الفني ده ملوش محفظة عهدة — حدّدها من «المستخدمون والصلاحيات».");
      if ((window.settings().wallets || []).map(String).indexOf(wallet) < 0) return Promise.reject("المحفظة «" + wallet + "» مش موجودة في قايمة المحافظ.");
      var ref = "custody-exp-" + e.id;
      if (!A(window.K.wtx).some(function (x) { return x && x.refKey === ref && !x.deleted; })) { // بنسجّل الحركة الأول (مفتاح ثابت = ما تتكررش لو الاعتماد اتعاد)
        var t = nowParts();
        var tx = { id: ref, refKey: ref, manualOverride: true, deleted: false, type: "out", amount: +e.amount, wallet: wallet, category: "مصروف تشغيل", reason: "🧾 " + e.note + (e.orderNo ? " (أمر " + e.orderNo + ")" : "") + " — " + (e.techName || "") + (kind === "workshop" ? " (دفعتها الإدارة)" : ""), note: "", date: t.date, time: t.time, source: "custody-expense", createdAt: t.iso };
        if (!window.put(window.K.wtx, A(window.K.wtx).concat(tx))) return Promise.reject("تعذّر حفظ حركة المحفظة.");
      }
      return markDecision(e, "approved", noteText, wallet).catch(function (err) { throw "الحركة اتسجلت لكن تحديث حالة المصروف فشل (" + String(err) + ") — اضغط اعتماد تاني (مش هيتكرر)."; });
    }
    function markDecision(e, status, noteText, wallet) {
      var upd = { status: status, decidedBy: myUid(), decidedAt: new Date().toISOString(), decisionNote: noteText || "" };
      if (wallet) upd.paidFrom = wallet;
      return fsdb().collection("techExpenses").doc(e.id).update(upd).then(function () {
        if (status === "approved") { try { window.auditLog && window.auditLog("اعتماد مصروف فني", "فني", e.id, (e.techName || "") + " " + e.amount + " ج — " + PAY_LBL[payKind(e)]); } catch (x) {} }
      }, function (err) { throw (err && err.code) || "شبكة"; });
    }
    function chooseWorkshopWallet(e, done) {
      var modal = mk("div", "position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px");
      var box = mk("div", "background:var(--bg-elevated,#fff);color:inherit;max-width:420px;width:100%;border-radius:14px;padding:16px");
      box.appendChild(mk("b", "font-size:17px", "🏢 الإدارة دفعت " + money(e.amount) + " منين؟"));
      box.appendChild(mk("p", "font-size:13px;opacity:.8", "الفني قال إن الإدارة هي اللي دفعت تمن «" + (e.note || "") + "». اختار المحفظة اللي الفلوس طلعت منها عشان تتسجل، أو «اتسجلت قبل كده» لو الحركة موجودة."));
      var ws = mk("select", INP), ww = workshopWallets();
      ww.forEach(function (w) { var o = mk("option", "", w); o.value = w; ws.appendChild(o); });
      var o0 = mk("option", "", "اتسجلت قبل كده — من غير حركة جديدة"); o0.value = ""; ws.appendChild(o0);
      var def = typeof window.resolveDefaultWallet === "function" ? window.resolveDefaultWallet() : ""; if (def && ww.indexOf(def) > -1) ws.value = def;
      var row = mk("div", "display:flex;gap:8px;margin-top:10px");
      row.appendChild(btn("اعتماد", BTN + ";flex:1;background:#15803d", function () { modal.remove(); done(ws.value); }));
      row.appendChild(btn("إلغاء", BTN2, function () { modal.remove(); }));
      box.appendChild(ws); box.appendChild(row); modal.appendChild(box);
      modal.onclick = function (ev) { if (ev.target === modal) modal.remove(); };
      document.body.appendChild(modal);
    }
    function rejectExpense(e, noteText) {
      return markDecision(e, "rejected", noteText).catch(function (err) { throw "فشل الرفض (" + err + ")"; });
    }

    /* ---------- أجور الفنيين ---------- */
    function P() { return window.WFTechPay; }
    function canPay() { return !!(P() && P().canPay()); }
    function r2(n) { return Math.round((+n || 0) * 100) / 100; }
    function payState(uid) { // المستحق = أجور الأوامر المقفولة − اللي اتصرف (حركات صرف أجور ليه مش محذوفة)
      var closed = A(window.K.r).filter(function (r) { return r && r.techId === uid && r.closed && r.status !== "ملغي"; });
      var priced = closed.filter(function (r) { return +r.techPay > 0 || r.jobType; });
      var earned = priced.reduce(function (s, r) { return s + (+r.techPay || 0); }, 0);
      var ym = monthOf(new Date()), earnedMonth = priced.filter(function (r) { return monthOf(r.closedAt || r.paidAt) === ym; }).reduce(function (s, r) { return s + (+r.techPay || 0); }, 0);
      var since = P().config().since;
      var pays = A(window.K.wtx).filter(function (x) { return x && !x.deleted && x.source === "techpay" && x.techPayFor === uid; });
      var paid = pays.reduce(function (s, x) { return s + (x.type === "out" ? +x.amount || 0 : -(+x.amount || 0)); }, 0);
      var reimb = state.own.filter(function (x) { return x.techId === uid && x.status === "approved"; }).reduce(function (s2, x) { return s2 + (+x.amount || 0); }, 0);
      return { earned: r2(earned), reimb: r2(reimb), earnedMonth: r2(earnedMonth), paid: r2(paid), due: r2(earned + reimb - paid), unpriced: closed.filter(function (r) { return !(+r.techPay > 0) && !r.jobType && since && String(r.closedAt || r.paidAt || "") >= since; }), priced: priced, pays: pays };
    }
    function addPayout(u, wallet, amount, note) {
      var t = nowParts(), fromCustody = wallet === u.wallet;
      var tx = { id: window.id(), refKey: null, manualOverride: true, deleted: false, type: "out", amount: amount, wallet: wallet, category: "أجور فنيين",
        reason: "👷 أجرة " + (u.name || "") + (fromCustody ? " (من عهدته)" : ""), note: note || "", source: "techpay", techPayFor: u.uid, techPayName: u.name || "", date: t.date, time: t.time, createdAt: t.iso };
      if (!window.put(window.K.wtx, A(window.K.wtx).concat(tx))) return false;
      try { window.auditLog && window.auditLog("صرف أجرة فني", "فني", u.uid, (u.name || "") + " " + amount + " ج من " + wallet); } catch (e) {}
      return true;
    }
    function payBox(u) {
      var ps = payState(u.uid), box = mk("div", "margin:10px 0;padding:10px;border-radius:12px;background:var(--bg-sunken,#f1f5ff)");
      box.appendChild(mk("div", "font-size:13px;opacity:.8", "💰 مستحقات الفني (أجور + مصاريف دفعها من جيبه)"));
      box.appendChild(mk("div", "font-size:24px;font-weight:800;color:" + (ps.due < 0 ? "#b91c1c" : "#0b57d0"), money(ps.due)));
      box.appendChild(mk("div", "font-size:13px", "أجور: " + money(ps.earned) + (ps.reimb ? " • من جيبه: " + money(ps.reimb) : "") + " • اتصرف: " + money(ps.paid) + " • أجور الشهر: " + money(ps.earnedMonth)));
      if (ps.unpriced.length) box.appendChild(mk("div", "font-size:13px;color:#b45309;margin-top:4px", "⚠️ " + ps.unpriced.length + " أمر مقفول لسه من غير أجرة"));
      var row = mk("div", "display:flex;gap:8px;flex-wrap:wrap;margin-top:8px");
      if (canSettle()) row.appendChild(btn("💸 صرف مستحقات", BTN, function () { payoutForm(u, ps); }));
      var k = "pay_" + u.uid;
      row.appendChild(btn(state.open[k] ? "إخفاء التفاصيل" : "🧾 تفاصيل الأجور", BTN2, function () { state.open[k] = !state.open[k]; draw(); }));
      box.appendChild(row);
      if (state.open[k]) {
        var cfg = P().config();
        if (ps.unpriced.length) {
          box.appendChild(mk("b", "display:block;margin-top:10px;font-size:14px", "أوامر من غير أجرة — حدّد نوع الشغل:"));
          if (!cfg.types.length) box.appendChild(mk("div", "font-size:13px;opacity:.8", "ضيف أنواع الشغل الأول من «⚙️ أجور الفنيين» فوق."));
          ps.unpriced.slice(0, 20).forEach(function (r) {
            var line = mk("div", "display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:13px;padding:5px 0;border-bottom:1px dashed #cbd5e1");
            var a = mk("a", "flex:1;min-width:140px", "#" + (r.no || "") + " " + custName(r.customerId) + " — " + money(r.total)); a.href = "request.html?id=" + encodeURIComponent(r.id);
            line.appendChild(a);
            if (cfg.types.length) {
              var sel = mk("select", "padding:5px;border-radius:8px;max-width:170px"); var o0 = mk("option", "", "نوع الشغل…"); o0.value = ""; sel.appendChild(o0);
              cfg.types.forEach(function (t) { var o = mk("option", "", t.name + " (" + P().payFor(t.id, u.uid) + ")"); o.value = t.id; sel.appendChild(o); });
              sel.onchange = function () { if (!sel.value) return; sel.disabled = true; P().setOrderPay(r.id, sel.value, null).then(function () { say("✅ اتحددت أجرة الأمر #" + (r.no || "")); draw(); }, function () { say("تعذّر الحفظ.", true); sel.disabled = false; }); };
              line.appendChild(sel);
            }
            box.appendChild(line);
          });
        }
        var recent = ps.priced.slice().sort(function (a, b) { return String(b.closedAt || "").localeCompare(String(a.closedAt || "")); }).slice(0, 15);
        if (recent.length) {
          box.appendChild(mk("b", "display:block;margin-top:10px;font-size:14px", "آخر الأجور:"));
          recent.forEach(function (r) {
            var line = mk("div", "display:flex;gap:6px;font-size:13px;padding:4px 0;border-bottom:1px dashed #cbd5e1");
            var a = mk("a", "flex:1", "#" + (r.no || "") + " " + custName(r.customerId) + " — " + (P().typeName(r.jobType) || (r.techPayManual ? "يدوي" : "")) ); a.href = "request.html?id=" + encodeURIComponent(r.id);
            line.appendChild(a); line.appendChild(mk("b", "", money(r.techPay))); box.appendChild(line);
          });
        }
        var pays = ps.pays.slice().sort(function (a, b) { return String((b.date || "") + (b.time || "")).localeCompare(String((a.date || "") + (a.time || ""))); }).slice(0, 10);
        if (pays.length) {
          box.appendChild(mk("b", "display:block;margin-top:10px;font-size:14px", "آخر مرات الصرف:"));
          pays.forEach(function (x) { box.appendChild(mk("div", "font-size:13px", "• " + (x.date || "") + " — " + money(x.amount) + " من " + (x.wallet || "") + (x.note ? " (" + x.note + ")" : ""))); });
        }
      }
      return box;
    }
    function payoutForm(u, ps) {
      var modal = mk("div", "position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px");
      var box = mk("div", "background:var(--bg-elevated,#fff);color:inherit;max-width:420px;width:100%;border-radius:14px;padding:16px;max-height:90vh;overflow:auto");
      box.appendChild(mk("b", "font-size:17px", "💸 صرف مستحقات " + (u.name || "")));
      box.appendChild(mk("p", "font-size:13px;opacity:.8", "المستحق دلوقتي: " + money(ps.due) + ". تقدر تصرف جزء أو الكل، من محفظة الورشة أو يخصمها من العهدة اللي معاه."));
      var ws = mk("select", INP), ww = workshopWallets();
      ww.forEach(function (w) { var o = mk("option", "", w); o.value = w; ws.appendChild(o); });
      if (u.wallet) { var oc = mk("option", "", "يخصمها من عهدته (" + u.wallet + ")"); oc.value = u.wallet; ws.appendChild(oc); }
      var def = typeof window.resolveDefaultWallet === "function" ? window.resolveDefaultWallet() : ""; if (def && ww.indexOf(def) > -1) ws.value = def;
      var amt = mk("input", INP + ";margin-top:8px"); amt.type = "number"; amt.min = "0"; amt.step = "any"; amt.inputMode = "decimal"; amt.placeholder = "المبلغ (ج)"; amt.value = Math.max(0, ps.due);
      var note = mk("input", INP + ";margin-top:8px"); note.placeholder = "ملاحظة (اختياري) — مثلًا: أجرة أسبوع";
      var msg = mk("p", "color:#b91c1c;min-height:20px;margin:6px 0");
      var row = mk("div", "display:flex;gap:8px");
      row.appendChild(btn("تأكيد الصرف", BTN + ";flex:1", function () {
        var v = r2(amt.value);
        if (!ws.value) { msg.textContent = "مفيش محفظة تختار منها."; return; }
        if (!isFinite(v) || v <= 0) { msg.textContent = "اكتب مبلغ صحيح."; return; }
        if (v > ps.due && !confirm("المبلغ أكبر من المستحق (" + money(ps.due) + "). تكمّل؟ (الزيادة هتبقى سلفة عليه)")) return;
        if (!addPayout(u, ws.value, v, note.value.trim())) { msg.textContent = "تعذّر الحفظ."; return; }
        modal.remove(); say("✅ اتصرف " + money(v) + " لـ " + (u.name || "")); draw();
      }));
      row.appendChild(btn("إلغاء", BTN2, function () { modal.remove(); }));
      box.appendChild(ws); box.appendChild(amt); box.appendChild(note); box.appendChild(msg); box.appendChild(row);
      modal.appendChild(box); modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
      document.body.appendChild(modal);
    }
    /* إعداد الأجور: أنواع الشغل بسعرها الأساسي، ولكل فني نسبة أو سعر خاص لنوع معيّن */
    function payConfigForm() {
      var cfg = JSON.parse(JSON.stringify(P().config())), techs = state.users.filter(function (u) { return u.scope === "assigned" || u.wallet; });
      var modal = mk("div", "position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:12px");
      var box = mk("div", "background:var(--bg-elevated,#fff);color:inherit;max-width:560px;width:100%;border-radius:14px;padding:16px;max-height:92vh;overflow:auto");
      modal.appendChild(box);
      var openT = {}, fresh = [];
      function refresh() { fresh.forEach(function (f) { f(); }); }
      function paint() {
        fresh = [];
        while (box.firstChild) box.removeChild(box.firstChild);
        box.appendChild(mk("b", "font-size:18px", "⚙️ أجور الفنيين"));
        box.appendChild(mk("p", "font-size:13px;opacity:.8;margin:4px 0 10px", "حدّد أنواع الشغل وسعر كل نوع. أجرة الفني على الأمر = سعر النوع × نسبته (أو سعر خاص ليه). وتقدر دايمًا تكتب مبلغ يدوي على أي أمر من صفحة الأمر. تغيير الأسعار هنا مش بيغيّر أوامر اتسعّرت قبل كده."));
        box.appendChild(mk("b", "display:block;margin:6px 0", "🧰 أنواع الشغل"));
        cfg.types.forEach(function (t, i) {
          var line = mk("div", "display:flex;gap:6px;margin:4px 0;align-items:center");
          var n = mk("input", INP + ";flex:2"); n.value = t.name; n.placeholder = "اسم النوع"; n.oninput = function () { t.name = n.value; }; n.onchange = refresh;
          var a = mk("input", INP + ";flex:1"); a.type = "number"; a.min = "0"; a.step = "any"; a.inputMode = "decimal"; a.value = t.amount; a.placeholder = "السعر"; a.oninput = function () { t.amount = a.value; }; a.onchange = refresh;
          line.appendChild(n); line.appendChild(a);
          line.appendChild(btn("🗑️", BTN2 + ";padding:6px 9px", function () { if (!confirm("تحذف نوع «" + t.name + "»؟ الأوامر اللي اتسعّرت بيه هتفضل بأجرتها.")) return; cfg.types.splice(i, 1); paint(); }));
          box.appendChild(line);
        });
        box.appendChild(btn("➕ نوع شغل", BTN2 + ";margin:4px 0 12px", function () { cfg.types.push({ id: "jt" + Date.now().toString(36), name: "", amount: "" }); paint(); }));
        if (!cfg.types.length) box.appendChild(mk("div", "font-size:13px;opacity:.75;margin-bottom:10px", "أمثلة: معاينة 100 • تركيب قطعة غيار 200 • عطل كبير 400"));
        box.appendChild(mk("b", "display:block;margin:6px 0", "👷 نسبة كل فني"));
        if (!techs.length) box.appendChild(mk("div", "font-size:13px;opacity:.75", "مفيش فنيين."));
        techs.forEach(function (u) {
          var tc = cfg.techs[u.uid] = cfg.techs[u.uid] || {}, d = mk("details", "margin:4px 0;padding:8px;border:1px solid var(--border,#d5dbe8);border-radius:10px");
          d.open = !!openT[u.uid]; d.ontoggle = function () { openT[u.uid] = d.open; };
          var pct = tc.pct === undefined || tc.pct === "" ? 100 : tc.pct, ov = Object.keys(tc.amounts || {}).filter(function (k) { return tc.amounts[k] !== "" && tc.amounts[k] != null; }).length;
          var sm = mk("summary", "cursor:pointer;font-weight:700"); d.appendChild(sm);
          fresh.push(function () { var pc = tc.pct === undefined || tc.pct === "" ? 100 : tc.pct, n = Object.keys(tc.amounts || {}).filter(function (k) { return tc.amounts[k] !== "" && tc.amounts[k] != null; }).length; sm.textContent = (u.name || u.uid) + " — " + pc + "%" + (n ? " • " + n + " سعر خاص" : ""); });
          var l1 = mk("label", "display:flex;gap:8px;align-items:center;margin-top:8px;font-size:14px", "النسبة من سعر النوع %");
          var pi = mk("input", INP + ";max-width:110px"); pi.type = "number"; pi.min = "0"; pi.step = "any"; pi.value = pct; pi.oninput = function () { tc.pct = pi.value === "" ? 100 : +pi.value; }; pi.onchange = refresh;
          l1.appendChild(pi); d.appendChild(l1);
          if (cfg.types.length) d.appendChild(mk("div", "font-size:12px;opacity:.75;margin-top:6px", "سعر خاص لنوع معيّن (سيبه فاضي = بالنسبة):"));
          cfg.types.forEach(function (t) {
            var l = mk("label", "display:flex;gap:8px;align-items:center;margin-top:4px;font-size:13px"), ln = mk("span", "flex:1"); l.appendChild(ln);
            var ai = mk("input", INP + ";max-width:110px"); ai.type = "number"; ai.min = "0"; ai.step = "any"; tc.amounts = tc.amounts || {};
            ai.value = tc.amounts[t.id] != null ? tc.amounts[t.id] : "";
            fresh.push(function () { var pc = tc.pct === undefined || tc.pct === "" ? 100 : +tc.pct; ln.textContent = (t.name || "—") + " (بالنسبة: " + r2((+t.amount || 0) * pc / 100) + ")"; ai.placeholder = String(r2((+t.amount || 0) * pc / 100)); });
            ai.oninput = function () { if (ai.value === "") delete tc.amounts[t.id]; else tc.amounts[t.id] = +ai.value; }; ai.onchange = refresh;
            l.appendChild(ai); d.appendChild(l);
          });
          box.appendChild(d);
        });
        var msg = mk("p", "color:#b91c1c;min-height:18px;margin:8px 0"), row = mk("div", "display:flex;gap:8px;position:sticky;bottom:0;background:var(--bg-elevated,#fff);padding-top:6px");
        row.appendChild(btn("💾 حفظ", BTN + ";flex:1", function () {
          var bad = cfg.types.filter(function (t) { return !String(t.name || "").trim() || !isFinite(+t.amount) || t.amount === "" || +t.amount < 0; });
          if (bad.length) { msg.textContent = "كل نوع لازم يبقى ليه اسم وسعر صحيح."; return; }
          cfg.types = cfg.types.map(function (t) { return { id: t.id, name: String(t.name).trim(), amount: r2(t.amount) }; });
          Object.keys(cfg.techs).forEach(function (k) { var tc = cfg.techs[k]; if (!isFinite(+tc.pct) || tc.pct === "" || tc.pct == null) tc.pct = 100; tc.pct = +tc.pct; var am = tc.amounts || {}; Object.keys(am).forEach(function (x) { if (!cfg.types.some(function (t) { return t.id === x; }) || !isFinite(+am[x])) delete am[x]; }); });
          if (!P().save(cfg)) { msg.textContent = "تعذّر الحفظ."; return; }
          try { window.auditLog && window.auditLog("إعداد أجور الفنيين", "إعدادات", "techpay", cfg.types.length + " نوع"); } catch (e) {}
          modal.remove(); say("✅ اتحفظ إعداد الأجور."); draw();
        }));
        row.appendChild(btn("إلغاء", BTN2, function () { modal.remove(); }));
        box.appendChild(msg); box.appendChild(row);
        refresh();
      }
      paint();
      modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
      document.body.appendChild(modal);
    }

    /* ---------- الرسم ---------- */
    function techCard(u) {
      var card = mk("div", CARD), wal = u.wallet;
      var head = mk("div", "display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap");
      head.appendChild(mk("b", "font-size:17px", "👷 " + (u.name || u.uid)));
      head.appendChild(mk("span", "font-size:13px;opacity:.8", u.roleName || ""));
      card.appendChild(head);
      var orders = A(window.K.r).filter(function (r) { return r && r.techId === u.uid && !r.closed && !r.paid && r.status !== "ملغي"; });
      var today = dayOf(new Date());
      var todays = orders.filter(function (r) { return r.visit && dayOf(r.visit) === today; }).sort(function (a, b) { return String(a.visit).localeCompare(String(b.visit)); });
      var late = orders.filter(function (r) { return r.visit && dayOf(r.visit) < today; }).length, soon = orders.filter(function (r) { return r.visit && dayOf(r.visit) > today; }).length, none = orders.filter(function (r) { return !r.visit; }).length;
      card.appendChild(mk("div", "font-size:14px;margin:6px 0", "🛠️ " + orders.length + " أمر مفتوح • 📅 اليوم " + todays.length + " • ⚠️ متأخر " + late + " • ⏭️ قادم " + soon + " • 🕓 بدون موعد " + none));
      todays.slice(0, 5).forEach(function (r) { card.appendChild(mk("div", "font-size:13px;margin-inline-start:12px", "• " + timeOf(r.visit) + " — #" + (r.no || "") + " " + custName(r.customerId))); });
      if (todays.length > 5) card.appendChild(mk("div", "font-size:13px;margin-inline-start:12px;opacity:.75", "… و" + (todays.length - 5) + " زيارة كمان النهارده"));
      // شغل الشهر: الأوامر اللي اتقفلت (منه أو من الإدارة) والمبلغ اللي اتحصّل فيها
      var ym = monthOf(new Date()), done = A(window.K.r).filter(function (r) { return r && r.techId === u.uid && r.closed; }).sort(function (a, b) { return String(b.closedAt || "").localeCompare(String(a.closedAt || "")); });
      var doneM = done.filter(function (r) { return monthOf(r.closedAt || r.paidAt) === ym; });
      var coll = doneM.reduce(function (s, r) { return s + (r.paid ? Math.max(0, Math.round(((+r.total || 0) - (+r.deposit || 0)) * 100) / 100) : 0); }, 0);
      card.appendChild(mk("div", "font-size:14px;margin:6px 0", "✅ اتقفل الشهر ده: " + doneM.length + " أمر • حصّل " + money(coll)));
      if (done.length) {
        var hist = mk("details", "margin:4px 0"); hist.appendChild(mk("summary", "cursor:pointer;font-size:13px;font-weight:700", "📜 آخر الأوامر المقفولة"));
        done.slice(0, 10).forEach(function (r) { hist.appendChild(mk("div", "font-size:13px;margin-inline-start:12px", "• " + (r.closedAt ? new Date(r.closedAt).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) : "") + " — #" + (r.no || "") + " " + custName(r.customerId) + " — " + money(r.total) + (r.closeWallet ? " (" + r.closeWallet + ")" : "") + (r.closedByTech ? "" : " • من الإدارة"))); });
        card.appendChild(hist);
      }

      var money1 = mk("div", "margin:10px 0;padding:10px;border-radius:12px;background:var(--bg-sunken,#f1f5ff)");
      if (!wal) { money1.appendChild(mk("div", "color:#b91c1c;font-size:14px", "مفيش محفظة عهدة لفني ده — حدّدها من «المستخدمون والصلاحيات».")); }
      else {
        var bal = window.walletBalance(wal);
        money1.appendChild(mk("div", "font-size:13px;opacity:.8", "💼 " + wal));
        money1.appendChild(mk("div", "font-size:26px;font-weight:800;color:" + (bal < 0 ? "#b91c1c" : "#15803d"), money(bal)));
        var mine = state.pending.filter(function (e) { return e.techId === u.uid; });
        if (mine.length) money1.appendChild(mk("div", "font-size:13px;color:#b45309", "⏳ " + mine.length + " مصروف معلّق بمجموع " + money(mine.reduce(function (s, e) { return s + (+e.amount || 0); }, 0))));
        var row = mk("div", "display:flex;gap:8px;flex-wrap:wrap;margin-top:8px");
        if (canSettle()) {
          row.appendChild(btn("💵 إيداع عهدة", BTN, function () { moveForm(u, "deposit"); }));
          row.appendChild(btn("🤝 تسوية / تسليم للورشة", BTN2, function () { moveForm(u, "settle"); }));
        }
        row.appendChild(btn(state.open[u.uid] ? "إخفاء الحركات" : "📒 الحركات", BTN2, function () { state.open[u.uid] = !state.open[u.uid]; draw(); }));
        money1.appendChild(row);
        if (state.open[u.uid]) {
          var txs = A(window.K.wtx).filter(function (x) { return x && !x.deleted && String(x.wallet || "").trim() === wal; }).sort(function (a, b) { return String((b.date || "") + (b.time || "")).localeCompare(String((a.date || "") + (a.time || ""))); }).slice(0, 25);
          var list = mk("div", "margin-top:8px");
          txs.forEach(function (x) { var r = mk("div", "display:flex;gap:8px;font-size:13px;padding:4px 0;border-bottom:1px dashed #cbd5e1"); r.appendChild(mk("span", "flex:1", (x.date || "") + " " + (x.reason || x.category || ""))); r.appendChild(mk("b", "color:" + (x.type === "in" ? "#15803d" : "#b91c1c"), (x.type === "in" ? "+" : "−") + money(x.amount))); list.appendChild(r); });
          if (!txs.length) list.appendChild(mk("div", "opacity:.7;font-size:13px", "مفيش حركات."));
          money1.appendChild(list);
        }
      }
      card.appendChild(money1);
      if (canPay()) card.appendChild(payBox(u));
      return card;
    }
    function moveForm(u, kind) {
      var modal = mk("div", "position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px");
      var box = mk("div", "background:var(--bg-elevated,#fff);color:inherit;max-width:420px;width:100%;border-radius:14px;padding:16px;max-height:90vh;overflow:auto");
      box.appendChild(mk("b", "font-size:17px", kind === "deposit" ? "💵 إيداع عهدة لـ " + u.name : "🤝 تسوية مع " + u.name));
      box.appendChild(mk("p", "font-size:13px;opacity:.8", kind === "deposit" ? "الفلوس بتتسحب من محفظة الورشة اللي تختارها وتتضاف لمحفظة عهدة الفني." : "الفلوس بتتسحب من محفظة عهدة الفني وتتضاف لمحفظة الورشة اللي تختارها (استلمت منه كاش مثلًا)."));
      var ws = mk("select", INP), ww = workshopWallets();
      ww.forEach(function (w) { var o = mk("option", "", w); o.value = w; ws.appendChild(o); });
      var def = typeof window.resolveDefaultWallet === "function" ? window.resolveDefaultWallet() : ""; if (def && ww.indexOf(def) > -1) ws.value = def;
      var amt = mk("input", INP + ";margin-top:8px"); amt.type = "number"; amt.min = "0"; amt.step = "any"; amt.inputMode = "decimal"; amt.placeholder = "المبلغ (ج)";
      if (kind === "settle") amt.value = Math.max(0, window.walletBalance(u.wallet));
      var note = mk("input", INP + ";margin-top:8px"); note.placeholder = "ملاحظة (اختياري)";
      var msg = mk("p", "color:#b91c1c;min-height:20px;margin:6px 0");
      var row = mk("div", "display:flex;gap:8px");
      row.appendChild(btn("تأكيد", BTN + ";flex:1", function () {
        var v = Math.round(+amt.value * 100) / 100;
        if (!ws.value) { msg.textContent = "مفيش محفظة ورشة تختار منها."; return; }
        if (!isFinite(v) || v <= 0) { msg.textContent = "اكتب مبلغ صحيح."; return; }
        var ok = kind === "deposit"
          ? addCustodyMove(ws.value, u.wallet, v, "💼 عهدة للفني " + u.name, note.value.trim())
          : addCustodyMove(u.wallet, ws.value, v, "🤝 تسوية عهدة " + u.name, note.value.trim());
        if (!ok) { msg.textContent = "تعذّر الحفظ."; return; }
        modal.remove(); say("✅ اتسجّلت الحركة (" + money(v) + ")."); draw();
      }));
      row.appendChild(btn("إلغاء", BTN2, function () { modal.remove(); }));
      box.appendChild(ws); box.appendChild(amt); box.appendChild(note); box.appendChild(msg); box.appendChild(row);
      modal.appendChild(box); modal.onclick = function (e) { if (e.target === modal) modal.remove(); };
      document.body.appendChild(modal);
    }
    function expenseRow(e) {
      var row = mk("div", CARD + ";display:flex;gap:10px;align-items:center;flex-wrap:wrap");
      var main = mk("div", "flex:1;min-width:180px");
      main.appendChild(mk("b", "", "👷 " + (e.techName || e.techId) + " — " + money(e.amount)));
      main.appendChild(mk("div", "", e.note || ""));
      main.appendChild(mk("div", "font-size:13px;font-weight:700;color:" + ({ custody: "#0b57d0", own: "#b45309", workshop: "#15803d" })[payKind(e)], PAY_LBL[payKind(e)]));
      main.appendChild(mk("div", "font-size:12px;opacity:.75", (e.orderNo ? "أمر " + e.orderNo + " • " : "") + (e.at ? new Date(e.at).toLocaleString("ar-EG") : "") + (e.wallet ? " • " + e.wallet : "")));
      row.appendChild(main);
      if (canApprove()) {
        var OK_MSG = { custody: "✅ اتعتمد واتخصم من عهدة الفني.", own: "✅ اتعتمد واتضاف لمستحقات الفني (هيتصرف له مع الأجور).", workshop: "✅ اتعتمد." };
        var go = btn("✅ اعتماد", BTN + ";background:#15803d", function () {
          var run = function (w) {
            go.disabled = true;
            approveExpense(e, "", w).then(function () { say(OK_MSG[payKind(e)] + (w ? " اتسجل في «" + w + "»." : "")); draw(); }, function (m) { say(String(m), true); go.disabled = false; });
          };
          if (payKind(e) === "workshop") chooseWorkshopWallet(e, run); else run("");
        });
        row.appendChild(go);
        row.appendChild(btn("❌ رفض", BTN2, function () {
          var why = prompt("سبب الرفض (هيظهر للفني):", ""); if (why === null) return;
          rejectExpense(e, why.trim()).then(function () { say("اتسجّل الرفض."); }, function (m) { say(String(m), true); });
        }));
      }
      return row;
    }
    function draw() {
      while (root.firstChild) root.removeChild(root.firstChild);
      if (state.err) root.appendChild(mk("p", "padding:8px 10px;border-radius:10px;background:#fff4e0;color:#8a5a00", state.err));
      root.appendChild(mk("h3", "margin:6px 0", "🧾 مصروفات بانتظار الاعتماد (" + state.pending.length + ")"));
      state.pending.forEach(function (e) { root.appendChild(expenseRow(e)); });
      if (!state.pending.length) root.appendChild(mk("p", "opacity:.7", "مفيش مصروفات معلّقة. 👌"));
      var th = mk("div", "display:flex;justify-content:space-between;align-items:center;gap:8px;margin:14px 0 6px;flex-wrap:wrap");
      th.appendChild(mk("h3", "margin:0", "👷 الفنيون"));
      if (canPay()) th.appendChild(btn("⚙️ أجور الفنيين", BTN2, payConfigForm));
      root.appendChild(th);
      var techs = state.users.filter(function (u) { return u.scope === "assigned" || u.wallet; });
      techs.forEach(function (u) { root.appendChild(techCard(u)); });
      if (!techs.length) root.appendChild(mk("p", "opacity:.7", "مفيش فنيين لسه: اعمل مستخدم بنطاق «أوامره المعيّنة فقط» أو حدد له محفظة عهدة من «المستخدمون والصلاحيات»."));
    }

    window.WFTech.directory(true).then(function (users) {
      state.users = users || []; if (!state.users.length && window.WFTech.lastError) state.err = "قايمة الفنيين: " + window.WFTech.lastError;
      draw();
    });
    function watch() {
      try {
        fsdb().collection("techExpenses").where("status", "==", "pending").onSnapshot(function (s) {
          state.pending = s.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }).sort(function (a, b) { return String(a.at || "").localeCompare(String(b.at || "")); });
          draw();
        }, function (e) { state.err = "تعذّر قراءة مصروفات الفنيين (" + ((e && e.code) || "شبكة") + ")"; draw(); });
        fsdb().collection("techExpenses").where("pay", "==", "own").onSnapshot(function (s) {
          state.own = s.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }); draw();
        }, function () {});
      } catch (e) { state.err = "تعذّر قراءة مصروفات الفنيين"; }
    }
    // الجلسة بترجع بعد تحميل الصفحة بشوية
    (function waitAuth(n) { if (myUid()) return watch(); if (n > 100) return; setTimeout(function () { waitAuth(n + 1); }, 100); })(0);
    draw();
  }
  wait();
})();
