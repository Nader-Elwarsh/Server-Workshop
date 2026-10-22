// حارس تعديلات الفني على أمر الشغل (functions/order-guard.js)
const assert = require("assert");
const { guardTechEdit } = require("./functions/order-guard");
const before = { techId: "t1", _by: "srv", labor: 200, deposit: 100, parts: [{ partId: "p1", name: "فلتر", qty: 1, sell: 50, cost: 30 }], partsTotal: 50, partsCost: 30, total: 250, remain: 150 };
const w = (x) => Object.assign({}, before, { _by: "t1" }, x);
// كتابة الإدارة أو السيرفر: مابتتفحصش
assert.strictEqual(guardTechEdit(before, Object.assign({}, before, { _by: "boss", labor: 999 })), null);
assert.strictEqual(guardTechEdit(before, Object.assign({}, before, { _by: "srv", parts: [] })), null);
// شغل عادي من الفني (وصف الشغل) ومن غير تلاعب: مفيش تصحيح
assert.strictEqual(guardTechEdit(before, w({ work: "غيرت الفلتر" })), null);
// الفني غيّر سعر قطعة مخزن لصفر: بترجع، والإجمالي يتحسب
let f = guardTechEdit(before, w({ parts: [{ partId: "p1", name: "فلتر", qty: 1, sell: 0, cost: 30 }], partsTotal: 0, total: 200, remain: 100 }));
assert.deepStrictEqual(f.patch.parts, before.parts); assert.strictEqual(f.patch.total, 250); assert.strictEqual(f.patch.remain, 150); assert.ok(f.why.includes("قطع المخزن"));
// ضاف قطعة مخزن مباشرة (من غير خصم): بتتشال، والقطعة اللي من بره بتفضل
f = guardTechEdit(before, w({ parts: before.parts.concat([{ partId: "p9", qty: 3, sell: 10 }, { external: true, name: "سلك", qty: 1, sell: 40, cost: 25 }]) }));
assert.deepStrictEqual(f.patch.parts.map((p) => p.partId || p.name), ["p1", "سلك"]); assert.strictEqual(f.patch.total, 290); assert.strictEqual(f.patch.partsCost, 55);
// كتب إجمالي غير مطابق: بيتصحح
f = guardTechEdit(before, w({ total: 100 })); assert.strictEqual(f.patch.total, 250); assert.ok(!f.patch.parts);
// المصنعية: مسموحة افتراضيًا، ومقفولة لو الإعدادات قافلاها
f = guardTechEdit(before, w({ labor: 300, total: 350, remain: 250 })); assert.strictEqual(f, null);
f = guardTechEdit(before, w({ labor: 300, total: 350, remain: 250 }), { laborLocked: true }); assert.strictEqual(f.patch.labor, 200); assert.strictEqual(f.patch.total, 250);
// أمر ضمان: مصنعية صفر
f = guardTechEdit(Object.assign({}, before, { warrantyDecision: "warranty" }), w({ warrantyDecision: "warranty", labor: 150, total: 200 })); assert.strictEqual(f.patch.labor, 0); assert.strictEqual(f.patch.total, 50);
// كتابة القفل نفسها (من السيرفر) مابتتفحصش هنا
assert.strictEqual(guardTechEdit(before, w({ closed: true, parts: [] })), null);
console.log("order-guard-tests: PASS (قطع المخزن من السيرفر، الإجمالي، المصنعية المقفولة، الضمان)");
