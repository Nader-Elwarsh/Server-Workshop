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
    var state = { users: [], pending: [], open: {}, err: "" };
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
    function approveExpense(e, noteText) {
      var u = state.users.filter(function (x) { return x.uid === e.techId; })[0];
      var wallet = String(e.wallet || (u && u.wallet) || "").trim();
      if (!wallet) return Promise.reject("الفني ده ملوش محفظة عهدة — حدّدها من «المستخدمون والصلاحيات».");
      if ((window.settings().wallets || []).map(String).indexOf(wallet) < 0) return Promise.reject("المحفظة «" + wallet + "» مش موجودة في قايمة المحافظ.");
      var ref = "custody-exp-" + e.id;
      if (!A(window.K.wtx).some(function (x) { return x && x.refKey === ref && !x.deleted; })) { // بنسجّل الحركة الأول (مفتاح ثابت = ما تتكررش لو الاعتماد اتعاد)
        var t = nowParts();
        var tx = { id: ref, refKey: ref, manualOverride: true, deleted: false, type: "out", amount: +e.amount, wallet: wallet, category: "مصروف تشغيل", reason: "🧾 " + e.note + (e.orderNo ? " (أمر " + e.orderNo + ")" : "") + " — " + (e.techName || ""), note: "", date: t.date, time: t.time, source: "custody-expense", createdAt: t.iso };
        if (!window.put(window.K.wtx, A(window.K.wtx).concat(tx))) return Promise.reject("تعذّر حفظ حركة المحفظة.");
      }
      return fsdb().collection("techExpenses").doc(e.id).update({ status: "approved", decidedBy: myUid(), decidedAt: new Date().toISOString(), decisionNote: noteText || "" }).then(function () { try { window.auditLog && window.auditLog("اعتماد مصروف عهدة", "فني", e.id, (e.techName || "") + " " + e.amount + " ج"); } catch (x) {} }, function (err) { throw "الحركة اتسجلت لكن تحديث حالة المصروف فشل (" + ((err && err.code) || "شبكة") + ") — اضغط اعتماد تاني (مش هيتكرر)."; });
    }
    function rejectExpense(e, noteText) {
      return fsdb().collection("techExpenses").doc(e.id).update({ status: "rejected", decidedBy: myUid(), decidedAt: new Date().toISOString(), decisionNote: noteText || "" }).catch(function (err) { throw "فشل الرفض (" + ((err && err.code) || "شبكة") + ")"; });
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
      main.appendChild(mk("div", "font-size:12px;opacity:.75", (e.orderNo ? "أمر " + e.orderNo + " • " : "") + (e.at ? new Date(e.at).toLocaleString("ar-EG") : "") + (e.wallet ? " • " + e.wallet : "")));
      row.appendChild(main);
      if (canApprove()) {
        var go = btn("✅ اعتماد", BTN + ";background:#15803d", function () {
          go.disabled = true;
          approveExpense(e, "").then(function () { say("✅ اتعتمد وسُجّل في محفظة الفني."); }, function (m) { say(String(m), true); go.disabled = false; });
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
      root.appendChild(mk("h3", "margin:14px 0 6px", "👷 الفنيون"));
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
      } catch (e) { state.err = "تعذّر قراءة مصروفات الفنيين"; }
    }
    // الجلسة بترجع بعد تحميل الصفحة بشوية
    (function waitAuth(n) { if (myUid()) return watch(); if (n > 100) return; setTimeout(function () { waitAuth(n + 1); }, 100); })(0);
    draw();
  }
  wait();
})();
