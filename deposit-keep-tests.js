// العربون مايضيعش: (1) تعارض مزامنة اتحل بنسخة السحابة، (2) زرار مراجعة الرصيد يرجّع المبلغ للأمر
const fs = require("fs"), assert = require("assert"), vm = require("vm");
const sync = fs.readFileSync("firebase-sync.js", "utf8");
const grab = (re) => { const m = sync.match(re); assert.ok(m, "مش لاقي " + re); return m[0]; };
const ctx = {}; vm.createContext(ctx);
vm.runInContext([grab(/var DEP_FIELDS = [^\n]+/), grab(/function depNum[^\n]+/), grab(/function keepLocalDeposit[\s\S]*?\n  }\n/), grab(/function conflictDiff[\s\S]*?\n  }\n/)].join("\n") + "\nthis.keep=keepLocalDeposit;this.diff=conflictDiff;", ctx);
const local = { id: "o1", no: "W5", total: 0, deposit: 1000, depositWallet: "فودافون", status: "جديد", fault: "x" };
const remote = { id: "o1", no: "W5", total: 0, deposit: 0, depositWallet: "", status: "تحت التنفيذ", fault: "y" };
let m = ctx.keep("wf_r", local, remote);
assert.strictEqual(m.deposit, 1000); assert.strictEqual(m.depositWallet, "فودافون"); assert.strictEqual(m.status, "تحت التنفيذ", "باقي الحقول من السحابة"); assert.strictEqual(m.remain, 0);
assert.strictEqual(ctx.keep("wf_r", remote, local), local, "لو السحابة فيها عربون أكبر تفضل زي ما هي");
assert.strictEqual(ctx.keep("wf_c", local, remote), remote, "غير أوامر الشغل مالهاش دعوة");
assert.strictEqual(ctx.keep("wf_r", local, null), null, "اتحذف من السحابة");
const d = ctx.diff({ local, remote });
assert.ok(/العربون: على الجهاز 1000.00 — في السحابة 0.00/.test(d) && /status/.test(d) && !/\bno\b/.test(d));
assert.ok(/var keep = keepLocalDeposit\(k, item\.local, item\.remote\)/.test(sync), "اختيار السحابة بيستخدم الدمج");

// المتبقي موحّد مع السيرفر: العربون اللي اترد للعميل مايتحسبش
{
  const sd = fs.readFileSync("shared-data.js", "utf8"), c3 = { window: {} }; vm.createContext(c3);
  vm.runInContext(sd.match(/var orderNetDeposit = [^\n]+\n  var orderRemainAmt = [^\n]+/)[0] + "\nthis.rem=orderRemainAmt;", c3);
  assert.strictEqual(c3.rem({ total: 1200, deposit: 1000, depositRefunded: 200 }), 400);
  assert.strictEqual(c3.rem({ total: 300.1, deposit: 100.2 }), 199.9);
  const w2 = fs.readFileSync("wallets.js", "utf8");
  assert.ok(/coll=orderRemainAmt\(r\)/.test(w2) && /orderMainDeposit\(r\):orderRemainAmt\(r\)/.test(w2), "الإصلاح التلقائي والمراجعة بنفس المعادلة");
}
// مراجعة الرصيد: حركة عربون 1000 والأمر عليه صفر → زرار يرجّع المبلغ للأمر
const w = fs.readFileSync("wallets.js", "utf8");
assert.ok(/type:"to-order"/.test(w) && /restoreOrderDepositFromTx/.test(w));
const store = { wf_r: [{ id: "o1", no: "W5", total: 0, deposit: 0, status: "جديد" }], wf_wallet_tx: [{ id: "order-deposit-o1", refKey: "order-deposit-o1", type: "in", amount: 1000, wallet: "فودافون" }] };
const c2 = { K: { r: "wf_r", wtx: "wf_wallet_tx" }, arr: (k) => store[k], put: (k, v) => { store[k] = v; return true }, confirm: () => true, alert: (x) => { throw new Error(x) }, window: {}, document: { getElementById: () => null }, renderWallets() {}, renderWalletAudit() {},
  updateRequestRecordAsync: async (id, fn) => { const r = store.wf_r.find((x) => x.id === id); fn(store.wf_r, r); return true; }, orderDepositExtra: (o) => +o.depositExtra || 0, orderRemainAmt: (o) => Math.max(0, Math.round(((+o.total || 0) - ((+o.deposit || 0) - (+o.depositRefunded || 0))) * 100) / 100) };
vm.createContext(c2);
vm.runInContext(w.match(/async function restoreOrderDepositFromTx[\s\S]*?\n}\n/)[0] + "\nthis.fix=restoreOrderDepositFromTx;", c2);
// أرقام أوامر مكررة: الأقدم بياخد الرقم والتاني بياخد أول رقم فاضي، وأسباب الحركات بتتحدث، والنتيجة ثابتة
{
  const st = { wf_r: [{ id: "b", no: "W26-10-22-5", createdAt: "2026-10-22T10:00:00Z" }, { id: "a", no: "W26-10-22-5", createdAt: "2026-10-22T09:00:00Z" }, { id: "c", no: "W26-10-22-6", createdAt: "2026-10-22T11:00:00Z" }],
    wf_wallet_tx: [{ id: "t", refKey: "order-deposit-b", reason: "💵 عربون أمر الشغل W26-10-22-5" }, { id: "t2", refKey: "order-deposit-a", reason: "💵 عربون أمر الشغل W26-10-22-5" }] };
  const c4 = { K: { r: "wf_r", wtx: "wf_wallet_tx" }, arr: (k) => st[k], _roArr: (k) => st[k], put: (k, v) => { st[k] = v; return true; }, window: {}, console };
  vm.createContext(c4);
  vm.runInContext(w.match(/let _dupNoAt=0;\nfunction fixDuplicateOrderNumbers[\s\S]*?\n}\n/)[0] + "\nthis.fix=fixDuplicateOrderNumbers;", c4);
  assert.strictEqual(c4.fix(true), 1);
  assert.strictEqual(st.wf_r.find((x) => x.id === "a").no, "W26-10-22-5", "الأقدم فضل برقمه");
  assert.strictEqual(st.wf_r.find((x) => x.id === "b").no, "W26-10-22-7"); assert.strictEqual(st.wf_r.find((x) => x.id === "b").renumberedFrom, "W26-10-22-5");
  assert.strictEqual(st.wf_wallet_tx[0].reason, "💵 عربون أمر الشغل W26-10-22-7"); assert.strictEqual(st.wf_wallet_tx[1].reason, "💵 عربون أمر الشغل W26-10-22-5");
  assert.strictEqual(c4.fix(true), 0, "مرة واحدة بس");
}
c2.fix("o1").then(() => {
  assert.strictEqual(store.wf_r[0].deposit, 1000); assert.strictEqual(store.wf_r[0].depositWallet, "فودافون"); assert.strictEqual(store.wf_wallet_tx.length, 1, "الحركة زي ما هي");
  console.log("deposit-keep-tests: PASS (تعارض المزامنة بيحافظ على العربون، زرار رجّع المبلغ للأمر)");
}).catch((e) => { console.error(e); process.exit(1); });
