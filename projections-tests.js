/* اختبارات نسخ العرض على السيرفر (functions/projections-core.js): نفس نتيجة الأجهزة القديمة */
const assert = require("assert");
const P = require("./functions/projections-core");

const c = { id: "c1", name: "أحمد", phone: "010", portal: true, portalUid: "u9", email: "a@b" };
const d = { id: "d1", type: "غسالة", brand: "توشيبا", model: "X", portal: true };
const r = { id: "r1", no: "W1", customerId: "c1", deviceId: "d1", techId: "t1", closed: false, status: "جاري التنفيذ", fault: "مابتعصرش", work: "غيرت سير", labor: 100, total: 180, deposit: 50, depositRefunded: 0,
  parts: [{ partId: "p1", qty: 1, sell: 80, cost: 40 }], statusHistory: [{ from: "", to: "جديد", at: "2026-10-01T10:00:00.000Z", note: "x" }], visit: "2026-10-24", createdAt: "2026-10-01T10:00:00.000Z" };
const names = { p1: "سير" };

// الفني
const t = P.techView(r, c, d);
assert.deepStrictEqual(t.customer, { name: "أحمد", phone: "010", id: "c1" });
assert.deepStrictEqual(t.device, { type: "غسالة", brand: "توشيبا", model: "X", id: "d1" });
assert.strictEqual(P.techView(Object.assign({}, r, { closed: true }), c, d), null);
assert.strictEqual(P.techView(Object.assign({}, r, { techId: "" }), c, d), null);

// البوابة
let p = P.portalView(r, c, d, {}, (id) => names[id]);
assert.strictEqual(p.deviceLabel, "غسالة توشيبا X");
assert.strictEqual(p.remain, 130); assert.strictEqual(p.deposit, 50); assert.strictEqual(p.labor, 100);
assert.deepStrictEqual(p.parts, [{ name: "سير", qty: 1, price: 80 }], "من غير تكلفة");
assert.deepStrictEqual(p.history, [{ to: "جديد", at: "2026-10-01T10:00:00.000Z" }], "من غير الملاحظات");
assert.ok(!JSON.stringify(p).includes("cost"));
p = P.portalView(r, c, d, { price: false }, (id) => names[id]);
assert.ok(!("total" in p) && !("remain" in p) && p.parts[0].price === undefined);
p = P.portalView(Object.assign({}, r, { portalVis: { remain: true } }), c, d, { price: false }, (id) => names[id]);
assert.strictEqual(p.remain, 130, "إعداد الأمر بيغلب");
assert.strictEqual(P.portalView(r, Object.assign({}, c, { portal: false }), d, {}, () => ""), null);
p = P.portalView(Object.assign({}, r, { closed: true, warrantyUntil: "2026-12-01T00:00:00.000Z" }), c, d, {}, (id) => names[id]);
assert.strictEqual(p.status, "مكتمل"); assert.strictEqual(p.remain, 0); assert.strictEqual(p.warrantyScope, "🛠️ غيرت سير\n🔩 القطع: سير");
// مقارنة من غير updatedAt + تحويل التواريخ
assert.ok(P.same({ a: 1, updatedAt: 5 }, { a: 1 }));
assert.strictEqual(P.plain({ x: { toDate: () => new Date("2026-01-01T00:00:00Z") } }).x, "2026-01-01T00:00:00.000Z");

// الدالة نفسها بـ mock
(async () => {
  const data = { "customers/c1": c, "devices/d1": d, "settings/global": { portalVis: {} }, "parts/p1": { name: "سير" } };
  const db = {
    doc: (path) => ({ path, get: async () => ({ id: path.split("/").pop(), exists: data[path] !== undefined, data: () => data[path] }) }),
    batch: () => { const ops = []; return { set: (ref, v) => ops.push(["set", ref.path, v]), delete: (ref) => ops.push(["del", ref.path]), commit: async () => ops.forEach(([k, p, v]) => { if (k === "set") data[p] = JSON.parse(JSON.stringify(Object.assign({}, v, { updatedAt: null }))); else delete data[p]; }) }; }
  };
  const _project = P.makeProject(() => null);
  assert.strictEqual(await _project(db, "r1", r), 2);
  assert.ok(data["techOrders/r1"] && data["portalOrders/r1"]);
  assert.strictEqual(await _project(db, "r1", r), 0, "مفيش كتابة لو مفيش تغيير");
  assert.strictEqual(await _project(db, "r1", Object.assign({}, r, { closed: true, paid: true })), 2, "القفل: نسخة الفني تتشال والبوابة تتحدث");
  assert.ok(!data["techOrders/r1"]);
  data["syncDeletes/requests__r1"] = { arch: true };
  assert.strictEqual(await _project(db, "r1", null), 0, "اتأرشف: نسخة البوابة تفضل");
  data["syncDeletes/requests__r1"] = { c: "requests" };
  assert.strictEqual(await _project(db, "r1", null), 1); assert.ok(!data["portalOrders/r1"]);
  console.log("projections-tests: PASS (نسخة الفني، نسخة البوابة، الإظهار، الضمان، مفيش كتابة زيادة، الأرشيف)");
})().catch((e) => { console.error(e); process.exit(1); });
