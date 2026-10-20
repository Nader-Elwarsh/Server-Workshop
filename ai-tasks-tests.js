"use strict";
/* اختبارات مهام الذكاء الاصطناعي (أكواد، رسايل، أمر بالكلام، لوحة بيانات، فاتورة، مخزن، ملخص):
   التشغيل/الإيقاف لكل ميزة، الصلاحيات، التحقق من الصور، وإن الموديل ميقدرش يخترع قيم برا القوايم أو أصناف برا المخزن. */
const assert = require("assert");
const fs = require("fs");
const { createAI } = require("./functions/ai");
const { TASKS, egMobile, pick } = require("./functions/ai-tasks");

function fakeDb() {
  const docs = {};
  function merge(t, s) { Object.keys(s).forEach((k) => { const v = s[k]; if (v && v.__inc !== undefined) t[k] = (+t[k] || 0) + v.__inc; else if (v && typeof v === "object" && !Array.isArray(v)) { t[k] = t[k] && typeof t[k] === "object" ? t[k] : {}; merge(t[k], v); } else t[k] = v; }); }
  return { docs, doc: (p) => ({ get: async () => ({ exists: !!docs[p], data: () => docs[p] }), set: async (v, o) => { if (o && o.merge) { docs[p] = docs[p] || {}; merge(docs[p], v); } else docs[p] = JSON.parse(JSON.stringify(v)); } }) };
}
const IMG = { mime: "image/jpeg", data: "A".repeat(400) };
const PARTS = [
  { id: "p1", name: "طلمبة طرد 30 وات فريرة ايطالي", qty: 2, buy: 180, category: "غسالات" },
  { id: "p2", name: "طرمبة صرف 30 وات ايطالي", qty: 1, buy: 175, category: "غسالات" },
  { id: "p3", name: "كابستور 10 مايكرو", qty: 6, buy: 35, category: "تكييف" },
  { id: "p4", name: "قديم", qty: 0, archived: true }
];

(async () => {
  // مساعدين
  assert.strictEqual(egMobile("٠١٠١٢٣٤٥٦٧٨"), "01012345678");
  assert.strictEqual(egMobile("+20 101 234 5678"), "01012345678");
  assert.strictEqual(egMobile("0123"), "");
  assert.strictEqual(pick(["غسالات", "تكييفات"], "غساﻻت"), "", "مش في القايمة = فاضي");
  assert.strictEqual(pick(["غسالة أمامي"], "غسالة امامي"), "غسالة أمامي", "تطبيع الهمزات");

  const db = fakeDb(), calls = [];
  let reply = {};
  const fetchImpl = async (url, opt) => {
    const body = JSON.parse(opt.body); calls.push(body);
    return { status: 200, ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(typeof reply === "function" ? reply(body) : reply) }] } }], usageMetadata: { promptTokenCount: 2000, candidatesTokenCount: 300 } }) };
  };
  const actors = { own: { role: "staff", owner: true, perms: {} }, tech: { role: "staff", owner: false, perms: { "requests.view": 1, "faultcodes.view": 1 } }, store: { role: "staff", owner: false, perms: { "inventory.add": 1 } } };
  const ai = createAI({ db, getToken: async () => "t", projectId: "p", actor: async (u) => actors[u] || { role: "" }, inc: (n) => ({ __inc: n }), fetchImpl, listParts: async () => PARTS, now: () => Date.UTC(2026, 9, 20, 9) });

  // مقفول = مفيش طلب
  await assert.rejects(ai.task("own", { task: "codeLookup", code: "E1" }), /ai_off/);
  await ai.saveConfig("own", { enabled: true });
  await assert.rejects(ai.task("own", { task: "nope" }), /bad_task/);
  await assert.rejects(ai.task("own", { task: "__proto__" }), /bad_task/);
  await assert.rejects(ai.task("own", { task: "toString" }), /bad_task/);
  // الصلاحيات
  await assert.rejects(ai.task("tech", { task: "invoice", image: IMG }), /not_allowed/);
  await assert.rejects(ai.task("tech", { task: "monthSummary", stats: { a: 1 } }), /not_allowed/);
  // كل ميزة ليها زرارها
  await ai.saveConfig("own", { features: { codes: false } });
  await assert.rejects(ai.task("tech", { task: "codeLookup", code: "E1" }), /feature_off/);
  await ai.saveConfig("own", { features: { codes: true } });
  assert.strictEqual(calls.length, 0, "مفيش أي طلب لجوجل في كل اللي فات");

  // 🧯 كود
  reply = { recognized: true, confidence: "عالي", title: "مشكلة في الصرف", cause: "فلتر مسدود", fix: "1) افتح الفلتر\n2) شغّل صرف", note: "" };
  let r = await ai.task("tech", { task: "codeLookup", code: "OE", deviceType: "غسالات", brand: "إل جي", known: [{ code: "IE", title: "مشكلة دخول مية" }] });
  assert.strictEqual(r.title, "مشكلة في الصرف"); assert.ok(/افتح الفلتر\n2\)/.test(r.fix), "السطور محفوظة");
  assert.ok(/الكود: OE/.test(calls[0].contents[0].parts[0].text) && /IE: مشكلة دخول مية/.test(calls[0].contents[0].parts[0].text));
  await assert.rejects(ai.task("tech", { task: "codeLookup", code: " " }), /no_code/);
  // تكملة: id مش من المبعوت بيتشال
  reply = { items: [{ id: "f1", cause: "س", fix: "ح", confidence: "متوسط" }, { id: "hack", cause: "x", fix: "y", confidence: "عالي" }] };
  await assert.rejects(ai.task("tech", { task: "codeFill", items: [{ id: "f1", code: "E1" }] }), /not_allowed/, "التكملة محتاجة صلاحية تعديل");
  r = await ai.task("own", { task: "codeFill", items: [{ id: "f1", code: "E1", title: "حساس" }] });
  assert.deepStrictEqual(r.items.map((x) => x.id), ["f1"]);
  // صورة الشاشة: صورة غلط مرفوضة، والماركة لازم تبقى من القايمة
  await assert.rejects(ai.task("tech", { task: "codePhoto", image: { mime: "text/html", data: "x" } }), /bad_image/);
  reply = { codes: ["e 1", "F05"], screenText: "E1", deviceType: "غسالات", brand: "سامسونج الأصلية", note: "" };
  r = await ai.task("tech", { task: "codePhoto", image: IMG, types: ["غسالات"], brands: ["سامسونج"] });
  assert.deepStrictEqual(r.codes, ["E1", "F05"]); assert.strictEqual(r.brand, ""); assert.strictEqual(r.deviceType, "غسالات");
  assert.ok(calls[calls.length - 1].contents[0].parts[0].inlineData, "الصورة بتتبعت inline");

  // 💬 رسالة: مفيش اسم عميل في الطلب
  reply = { text: "أهلًا {اسم_العميل} 👋\nجهازك {اسم_الجهاز} جاهز.\n{اسم_الورشة}" };
  r = await ai.task("tech", { task: "message", kind: "ready", order: { deviceType: "غسالة", status: "مكتمل", hasRemain: true } });
  assert.ok(/\{اسم_العميل\}/.test(r.text));
  const mp = calls[calls.length - 1].contents[0].parts[0].text;
  assert.ok(/الجهاز جاهز/.test(mp) && /فيه مبلغ متبقي: أيوه/.test(mp));

  // 🎙️ أمر بالكلام: القيم لازم تبقى من القوايم، والتليفون بيتظبط
  const lists = { types: ["غسالات", "تكييفات"], categories: { "غسالات": ["فوق أوتوماتيك", "أمامي أوتوماتيك"] }, brands: ["توشيبا", "إل جي"], centers: ["طما"], villages: { "طما": ["الشيخ زين الدين"] } };
  await assert.rejects(ai.task("tech", { task: "orderParse", text: "غسالة", lists }), /not_allowed/);
  actors.tech.perms["requests.add"] = 1;
  reply = { customerName: "محمود السيد", phone: "٠١٠١٢٣٤٥٦٧٨", center: "طما", centerRaw: "", village: "الشيخ زين الدين", villageRaw: "", street: "", deviceType: "غسالات", deviceTypeRaw: "", category: "فوق أوتوماتيك", brand: "توشيبا العربي", brandRaw: "", model: "", fault: "مش بتعصر", visit: "بكرة العصر", notes: "", missing: [] };
  r = await ai.task("tech", { task: "orderParse", text: "الحاج محمود السيد ٠١٠١٢٣٤٥٦٧٨ من طما الشيخ زين الدين غسالة توشيبا فوق مش بتعصر بكرة العصر", lists });
  assert.strictEqual(r.phone, "01012345678"); assert.strictEqual(r.center, "طما"); assert.strictEqual(r.village, "الشيخ زين الدين");
  assert.strictEqual(r.category, "فوق أوتوماتيك"); assert.strictEqual(r.brand, ""); assert.strictEqual(r.brandRaw, "توشيبا العربي", "ماركة مش في القايمة بترجع خام");
  assert.ok(/- طما: الشيخ زين الدين/.test(calls[calls.length - 1].contents[0].parts[0].text));

  // 🏷️ لوحة البيانات
  actors.tech.perms["devices.add"] = 1;
  reply = { readable: true, type: "غسالات", typeRaw: "", category: "أمامي أوتوماتيك", brand: "إل جي", brandRaw: "", model: "F4J6TY0W", serial: "123ABC", specs: "7kg 220V", note: "" };
  r = await ai.task("tech", { task: "plate", image: IMG, lists });
  assert.strictEqual(r.model, "F4J6TY0W"); assert.strictEqual(r.category, "أمامي أوتوماتيك");

  // 🧾 الفاتورة: الربط بالمخزن بالكود، المؤرشف مش بيظهر، والمجموع بيتراجع
  reply = (body) => {
    const t = body.contents[0].parts[1].text;
    assert.ok(!/قديم/.test(t), "المؤرشف مش في القايمة");
    const code = (t.match(/(S\d+): طلمبة طرد/) || [])[1];
    return { supplier: "النور", date: "2026-10-19", invoiceNo: "55", total: 600, lines: [{ text: "طلمبة طرد فريرة", qty: 2, unitPrice: 0, lineTotal: 380, stock: code, newName: "", category: "" }, { text: "ريلاي", qty: 4, unitPrice: 25, lineTotal: 100, stock: "S99", newName: "ريلاي بدء", category: "غسالات" }] };
  };
  r = await ai.task("store", { task: "invoice", image: IMG, partCats: ["غسالات", "تكييف"] });
  assert.strictEqual(r.lines[0].part.id, "p1"); assert.strictEqual(r.lines[0].unitPrice, 190, "سعر الوحدة من الإجمالي");
  assert.strictEqual(r.lines[1].part, null, "كود مش موجود = صنف جديد"); assert.strictEqual(r.lines[1].newName, "ريلاي بدء");
  assert.strictEqual(r.sum, 480); assert.strictEqual(r.mismatch, true);

  // 🧹 المخزن: صنف واحد في مجموعة واحدة بس، والمجموعة لازم صنفين
  reply = (body) => { const t = body.contents[0].parts[0].text; const c1 = t.match(/(S\d+): طلمبة/)[1], c2 = t.match(/(S\d+): طرمبة/)[1], c3 = t.match(/(S\d+): كابستور/)[1]; return { groups: [{ codes: [c1, c2], keep: c1, name: "طلمبة صرف غسالة 30 وات ايطالي", reason: "نفس القطعة" }, { codes: [c1, c3], keep: c3, name: "x", reason: "" }], renames: [{ code: c3, name: "كابستور 10 مايكرو", reason: "" }, { code: c3, name: "كابستور تكييف 10 مايكرو", reason: "أوضح" }] }; };
  await assert.rejects(ai.task("store", { task: "stockClean" }), /not_allowed/);
  r = await ai.task("own", { task: "stockClean" });
  assert.strictEqual(r.groups.length, 1); assert.deepStrictEqual(r.groups[0].items.map((p) => p.id).sort(), ["p1", "p2"]);
  assert.strictEqual(r.renames.length, 1, "اسم زي القديم بيتشال"); assert.strictEqual(r.renames[0].name, "كابستور تكييف 10 مايكرو");

  // 📊 الملخص
  reply = { headline: "شهر كويس", good: ["الإيراد زاد"], watch: [], actions: ["تابع المتأخر"] };
  r = await ai.task("own", { task: "monthSummary", label: "أكتوبر", stats: { now: { revenue: 1000 }, previous: { revenue: 800 } } });
  assert.strictEqual(r.headline, "شهر كويس");
  await assert.rejects(ai.task("own", { task: "monthSummary", stats: {} }), /no_stats/);

  // العدّاد بيتسجل لكل ميزة
  const u = db.docs["serverConfig/aiUsage-2026-10"];
  ["codes", "msg", "voice", "plate", "invoice", "stock", "summary"].forEach((k) => assert.ok(u.byFeature[k] && u.byFeature[k].calls >= 1, k));

  // الواجهة
  const read = (f) => fs.readFileSync(f, "utf8");
  ["faultcodes.html", "faultcode.html", "index.html", "devices.html", "inventory.html", "reports.html", "request.html"].forEach((f) => assert.ok(read(f).includes('src="app-ai-tools.js"') && read(f).includes('src="app-ai.js"') && read(f).includes('src="wf-media.js"'), f));
  assert.ok(read("service-worker.js").includes('"./app-ai-tools.js"'));
  assert.ok(read("functions/index.js").includes("exports.aiTask ="));
  assert.ok(/window\.WFReportData=/.test(read("reports.js")));
  assert.ok(read("app-requests.js").includes('wf-ai-msg-slot no-print" data-ai-rid="${esc(r.id)}"'));
  const tools = read("app-ai-tools.js");
  const genMsg = tools.slice(tools.indexOf("function genMsg"), tools.indexOf("function msgSlots0"));
  assert.ok(!/customerName|cust\.name|\.phone/.test(genMsg), "الرسالة مش بتبعت اسم أو تليفون العميل");
  Object.keys(TASKS).forEach((k) => assert.ok(["diag", "codes", "msg", "voice", "plate", "invoice", "stock", "summary"].includes(TASKS[k].feature), k));
  console.log("ai-tasks-tests: PASS");
})().catch((e) => { console.error(e); process.exit(1); });
