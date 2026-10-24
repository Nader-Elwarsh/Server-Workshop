const assert = require("assert");
const { needsStamp } = require("./functions/portal-stamp-core");
const T = (ms) => ({ toMillis: () => ms });
// عميل جديد من البوابة من غير _ts → يتختم
assert.strictEqual(needsStamp(null, { name: "أحمد", portal: true }), true);
// الختم نفسه (اتغير _ts بس) → مايتختمش تاني
assert.strictEqual(needsStamp({ name: "أحمد", portal: true }, { name: "أحمد", portal: true, _ts: T(5), _by: "portal" }), false);
// موظف عدّل (اتغير _ts) → لأ
assert.strictEqual(needsStamp({ name: "أ", _ts: T(1) }, { name: "ب", _ts: T(2), _by: "u" }), false);
// العميل عدّل سجل متختم قبل كده (الـ _ts زي ما هو) → يتختم
assert.strictEqual(needsStamp({ name: "أ", portal: true, _ts: T(1) }, { name: "ب", portal: true, _ts: T(1) }), true);
// إنشاء من موظف بـ _ts → لأ، والمسح → لأ
assert.strictEqual(needsStamp(null, { name: "x", _ts: T(1) }), false);
assert.strictEqual(needsStamp({ name: "x" }, null), false);
// كتابة مافيهاش تغيير → لأ
assert.strictEqual(needsStamp({ name: "x", portal: true, _ts: T(1) }, { name: "x", portal: true, _ts: T(1) }), false);
console.log("portal-stamp-tests: PASS (عميل جديد، الختم مايتكررش، الموظف، تعديل العميل)");
