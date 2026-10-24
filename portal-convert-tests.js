/* تحويل طلبات البوابة على السيرفر (functions/portal-core.js) — نفس قرارات convertPortal القديمة */
const assert = require("assert");
const C = require("./functions/portal-core");

const cust = { name: "أحمد", portal: true }, dev = { customerId: "c1", type: "غسالة" };
const base = { customerId: "c1", deviceId: "d1", fault: "مش<b>بتعصر</b>", visit: "2026-10-25", note: "بعد العصر" };
assert.strictEqual(C.decide("bad\"id", base, {}).action, "reject");
assert.strictEqual(C.decide("r1", Object.assign({}, base, { hold: true }), { customer: cust, device: dev }).action, "wait");
assert.strictEqual(C.decide("r1", base, {}).action, "wait", "العميل/الجهاز لسه مانزلوش");
assert.strictEqual(C.decide("r1", base, { customer: cust, device: { customerId: "c2" } }).action, "reject");
assert.deepStrictEqual(C.decide("r1", base, { customer: cust, device: dev, existing: { no: "W1" } }).patch, { handled: true, orderId: "r1", orderNo: "W1" });
assert.strictEqual(C.decide("r1", base, { customer: cust, device: dev, openByCustomer: 2 }).patch.holdReason, "customer_open");
assert.strictEqual(C.decide("r1", base, { customer: cust, device: dev, lastDay: 5 }).patch.holdReason, "daily_limit");
assert.strictEqual(C.decide("r1", Object.assign({}, base, { hold: true, approved: true }), { customer: cust, device: dev, openByCustomer: 3 }).action, "convert", "الموافقة بتعدّي الحد");
const d = C.decide("r1", base, { customer: cust, device: dev });
assert.strictEqual(d.action, "convert"); assert.strictEqual(d.p.fault, "مشbبتعصر/b");
const r = C.orderFromRequest("r1", Object.assign({}, d.p, { visit: "بكرة", media: [{ url: "https://res.cloudinary.com/x/a.jpg", kind: "image" }, { url: "http://evil", kind: "image" }], loc: { lat: 28.1, lng: 30.7 } }), { no: "W26-10-24-3", now: "2026-10-24T10:00:00.000Z" });
assert.strictEqual(r.id, "r1"); assert.strictEqual(r.portalRequestId, "r1"); assert.strictEqual(r.source, "portal");
assert.strictEqual(r.visit, "", "ميعاد بشكل غلط بيتشال"); assert.strictEqual(r.executionPlace, "عند العميل"); assert.strictEqual(r.customerNote, "بعد العصر");
assert.strictEqual(r.media.length, 1); assert.deepStrictEqual(r.loc, { lat: 28.1, lng: 30.7, acc: 0 });
assert.deepStrictEqual(r.statusHistory, [{ from: "", to: "جديد", at: "2026-10-24T10:00:00.000Z", note: "" }]);
assert.strictEqual(C.dayPrefix(new Date("2026-10-23T22:30:00Z")), "W26-10-24-", "يوم القاهرة");
assert.strictEqual(C.nextNo("W26-10-24-", ["W26-10-24-2", "W26-10-24-9", "W26-10-2-50"], 3), "W26-10-24-10");
assert.strictEqual(C.nextNo("W26-10-24-", [], 7), "W26-10-24-8");
console.log("portal-convert-tests: PASS (رفض/استنى/سبام/موافقة/تنضيف/رقم الأمر)");
