// تكرار الأكواد والتيست مود: E1 ≠ E01 (أجهزة مختلفة)، التصنيف بيفرّق، الماركة بالاسم الموحّد،
// التيست مود بنفس زراير الدخول = مكرر حتى لو العنوان مختلف، والدمج مابيضيّعش حاجة.
"use strict";
const assert = require("assert"), fs = require("fs"), vm = require("vm"), path = require("path");
let store = [];
const ctx = { K: { fc: "fc" }, arr: () => JSON.parse(JSON.stringify(store)), saveJSONSafe: (k, v) => { store = v; return true }, document: { addEventListener() {}, getElementById() { return null; } }, esc: (s) => String(s), console };
ctx.window = ctx;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "brand-unify.js"), "utf8"), ctx);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "app-fault-codes.js"), "utf8"), ctx);
const C = (id, o) => Object.assign({ id, deviceType: "غسالات", brand: "تورنيدو", title: "", cause: "", fix: "" }, o);
store = [
  C("a", { code: "E01", category: "أمامي أوتوماتيك", title: "قفل الباب" }),
  C("b", { code: "E1", category: "فوق أوتوماتيك", title: "الصرف" }),
  C("c", { code: "E6", category: "فوق أوتوماتيك", title: "تيار عالي" }),
  C("d", { code: "E6", category: "فوق أوتوماتيك", model: "ES-TN / TWE-TLN", title: "سحب مياه" }),
  C("e", { code: "E2", category: "فوق أوتوماتيك", title: "مفتاح الباب", cause: "مفتاح بايظ" }),
  C("f", { code: "e-2", brand: "Tornado", category: "فوق أوتوماتيك", title: "مفتاح الباب", fix: "غيّر المفتاح", media: [{ url: "https://x/1.jpg" }] }),
  { id: "t1", kind: "test", deviceType: "غسالات", brand: "توشيبا العربي", model: "AEW-9770, 9790", title: "تيست موود توشيبا 10 كيلو فأكثر", enter: "1) اضغط على زري ON + Rinse. 2) اضغط زر Start.", tests: "خطوات قديمة" },
  { id: "t2", kind: "test", deviceType: "غسالات", brand: "توشيبا العربي", model: "AEW-9770, 9790, 1170", title: "توشيبا 10 كيلو - تيست موود عام", enter: "1- نضغط على زري Rinse + ON. 2- نضغط زر Start.", tests: "خطوات تفصيلية أطول بكتير من القديمة", media: [{ url: "https://x/2.jpg" }] },
  { id: "t3", kind: "test", deviceType: "غسالات", brand: "توشيبا العربي", model: "AW-SD, DC, DG", title: "توشيبا الدفع المباشر - تيست موود عام", enter: "1- نضغط على زري Rinse + ON. 2- نضغط زر Start." }
];
// 1) E1 و E01 مختلفين، والتصنيف بيفرّق، والماركة بالاسم الموحّد
assert.strictEqual(ctx.findDuplicateFaultCode("غسالات", "تورنيدو", "E1", null, "", "أمامي أوتوماتيك"), null, "E1 أمامي مش مكرر مع E1 فوق");
assert.strictEqual(ctx.findDuplicateFaultCode("غسالات", "تورنيدو", "E1", null, "", "فوق أوتوماتيك").id, "b");
assert.strictEqual(ctx.findDuplicateFaultCode("غسالات", "Tornado", "E-1", null, "", "").id, "b", "Tornado = تورنيدو و E-1 = E1");
assert.strictEqual(ctx.findDuplicateFaultCode("غسالات", "تورنيدو", "E01", null, "", "فوق أوتوماتيك"), null);
// 2) التيست مود بنفس الزراير والموديل = مكرر، وموديل تاني = لأ
assert.ok(ctx.sameTestMode(store[6], store[7]));
assert.ok(!ctx.sameTestMode(store[7], store[8]), "نفس الزراير بس موديلات مختلفة");
// 3) المجموعات: e+f (نفس الكود بعد التوحيد)، t1+t2 — ومش E6 العام مع E6 بموديل
const g = ctx.findFaultDuplicateGroups().map((x) => x.items.map((f) => f.id).sort().join("+")).sort();
assert.strictEqual(JSON.stringify(g), JSON.stringify(["e+f", "t1+t2"]));
// 4) الدمج: الناقص بيتكمّل، المختلف في الملاحظات، الصور بتتجمع
assert.ok(ctx.mergeFaultRecords("e", ["f"]));
let e = store.find((f) => f.id === "e");
assert.strictEqual(e.fix, "غيّر المفتاح"); assert.strictEqual(e.media.length, 1); assert.ok(!store.find((f) => f.id === "f"));
assert.ok(ctx.mergeFaultRecords("t2", ["t1"]));
const t2 = store.find((f) => f.id === "t2");
assert.ok(/خطوات قديمة/.test(t2.note) && /📎/.test(t2.note), "خطوات النسخة التانية اتحفظت في الملاحظات");
assert.strictEqual(store.length, 7);
// 5) الحذف مابقاش في القوايم
const css = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
assert.ok(/#faultList \[data-wf-code\^="deleteFaultCodeRecord\("\]/.test(css) && /\.card-side-actions \[data-wf-code\^="deleteCustomerRecord\("\]/.test(css));
["customer.html", "device.html", "request.html", "part.html", "faultcode.html"].forEach((p) => assert.ok(fs.readFileSync(path.join(__dirname, p), "utf8").includes('src="quiet-delete.js"'), p));
console.log("fault-dup-tests: PASS (E1≠E01، التصنيف، توحيد الماركة، تيست مود بالزراير، الدمج، الحذف من خيارات أكتر)");
