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

  // 📞 تسجيل مكالمة: الصيغة لازم تبقى مدعومة، والصوت بيتبعت inline، والتكلفة بسعر الصوت
  await assert.rejects(ai.task("tech", { task: "callParse", audio: { mime: "audio/amr", data: "A".repeat(5000) }, lists }), /bad_audio/);
  await assert.rejects(ai.task("tech", { task: "callParse", audio: { mime: "audio/mp4", data: "A".repeat(17000000) }, lists }), /bad_audio/);
  reply = { transcript: [{ who: "العميل", text: "الغسالة بتفصل" }, { who: "حد", text: "تمام" }], heard: true, customerName: "أم أحمد", phone: "", center: "طما", village: "", villageRaw: "", street: "", deviceType: "غسالات", category: "أمامي أوتوماتيك", brand: "إل جي", model: "", fault: "بتفصل في نص الغسيل", visit: "السبت الصبح", price: "100 جنيه معاينة", summary: "الغسالة بتفصل في نص الغسيل\nاتفقنا على زيارة السبت الصبح", notes: "", missing: ["التليفون"] };
  r = await ai.task("tech", { task: "callParse", audio: { mime: "audio/mp4", data: "A".repeat(5000) }, lists, hint: "Call recording 01098765432_20261020.m4a" });
  assert.strictEqual(r.customerName, "أم أحمد"); assert.strictEqual(r.price, "100 جنيه معاينة"); assert.ok(Array.isArray(r.transcript)); assert.ok(/زيارة السبت/.test(r.summary)); assert.strictEqual(r.brand, "إل جي");
  const cp = calls[calls.length - 1].contents[0].parts;
  assert.strictEqual(cp[0].inlineData.mimeType, "audio/mp4"); assert.ok(/01098765432/.test(cp[1].text), "اسم الملف بيتبعت كتلميح");

  // 🏷️ لوحة البيانات
  actors.tech.perms["devices.add"] = 1;
  reply = { readable: true, type: "غسالات", typeRaw: "", category: "أمامي أوتوماتيك", brand: "إل جي", brandRaw: "", model: "F4J6TY0W", serial: "123ABC", specs: "7kg 220V", note: "" };
  r = await ai.task("tech", { task: "plate", image: IMG, lists });
  assert.strictEqual(r.model, "F4J6TY0W"); assert.strictEqual(r.category, "أمامي أوتوماتيك");

  // 🧾 الفاتورة: خطوتين — قراية بموديل قوي ودقة عالية من غير المخزن، وبعدين ربط بالمخزن (نص بس)
  let step = 0, invBodies = [];
  reply = (body) => {
    invBodies.push(body); step++;
    if (step === 1) return { layout: "م | البيان | العدد | الفئة | القيمة", supplier: "النور", date: "2026-10-19", invoiceNo: "55", subtotal: 600, discount: 0, total: 600, unclear: "",
      lines: [{ raw: "طلمبه طرد فريره", item: "طلمبة طرد فريرة", specs: "30 وات", unit: "قطعة", qty: 2, unitPrice: 0, lineTotal: 380, unsure: [], confidence: "عالي" },
              { raw: "ريلاى", item: "ريلاي بدء", specs: "", unit: "قطعة", qty: 4, unitPrice: 25, lineTotal: 150, unsure: [], confidence: "متوسط" }] };
    const t = body.contents[0].parts[0].text, code = (t.match(/(S\d+): طلمبة طرد/) || [])[1];
    return { lines: [{ index: 0, stock: code, matchConfidence: "عالي", newName: "", category: "", why: "نفس القطعة" }, { index: 1, stock: "S99", matchConfidence: "ضعيف", newName: "ريلاي بدء تلاجة", category: "غسالات", why: "" }] };
  };
  await assert.rejects(ai.task("tech", { task: "invoice", image: IMG }), /not_allowed/);
  r = await ai.task("store", { task: "invoice", images: [IMG, IMG], partCats: ["غسالات", "تكييف"], aliases: [{ text: "ريلاى", part: "ريلاي قديم" }] });
  assert.strictEqual(invBodies.length, 2);
  assert.strictEqual(invBodies[0].contents[0].parts.length, 3, "صورتين + النص");
  assert.ok(!/مخزن الورشة/.test(invBodies[0].contents[0].parts[2].text), "خطوة القراية من غير المخزن");
  assert.strictEqual(invBodies[0].generationConfig.mediaResolution, "MEDIA_RESOLUTION_HIGH");
  assert.strictEqual(invBodies[0].generationConfig.temperature, 0);
  assert.ok(/ربط سابق/.test(invBodies[1].contents[0].parts[0].text) && /«ريلاى» ← ريلاي قديم/.test(invBodies[1].contents[0].parts[0].text));
  assert.ok(!/قديم\]/.test(invBodies[1].contents[0].parts[0].text) && !/S\d+: قديم/.test(invBodies[1].contents[0].parts[0].text), "المؤرشف مش في القايمة");
  assert.strictEqual(r.lines[0].part.id, "p1"); assert.strictEqual(r.lines[0].unitPrice, 190, "سعر الوحدة من الإجمالي");
  assert.strictEqual(r.lines[1].part, null); assert.strictEqual(r.lines[1].newName, "ريلاي بدء تلاجة");
  assert.strictEqual(r.lines[1].mathOk, false, "4 × 25 ≠ 150"); assert.ok(r.lines[1].unsure.includes("lineTotal"));
  assert.strictEqual(r.sum, 530); assert.strictEqual(r.mismatch, true);
  assert.ok(/ \+ /.test(r.aiModel), "خطوتين متسجلين");

  // 📚 كتالوج الأكواد: موديل قوي، ومن غير «كمّل الناقص» الكلام اللي مش من الصفحة بيتشال
  actors.tech.perms["faultcodes.add"] = 1;
  reply = { deviceType: "غسالات", brand: "إل جي", model: "F4J6", unclear: "", codes: [{ code: "OE", title: "مشكلة صرف", cause: "فلتر مسدود", fix: "1) نضف", causeFromPage: true, fixFromPage: true, note: "", unsure: false }, { code: "o e", title: "مكرر", cause: "", fix: "", causeFromPage: false, fixFromPage: false, note: "", unsure: false }, { code: "IE", title: "مية مش داخلة", cause: "محبس مقفول", fix: "افتح المحبس", causeFromPage: false, fixFromPage: true, note: "", unsure: true }] };
  r = await ai.task("tech", { task: "codesBook", images: [IMG], types: ["غسالات"], brands: ["إل جي"] });
  assert.strictEqual(r.codes.length, 2, "الكود المكرر بيتشال"); assert.strictEqual(r.codes[1].cause, "", "السبب مش من الصفحة"); assert.strictEqual(r.codes[1].fix, "افتح المحبس");
  assert.strictEqual(r.brand, "إل جي"); assert.ok(r.codes[1].unsure);
  r = await ai.task("tech", { task: "codesBook", images: [IMG], types: ["غسالات"], brands: ["إل جي"], fillMissing: true });
  assert.strictEqual(r.codes[1].cause, "محبس مقفول"); assert.strictEqual(r.codes[1].aiCause, true);
  assert.strictEqual(calls[calls.length - 1].generationConfig.mediaResolution, "MEDIA_RESOLUTION_HIGH");
  // 📄 كتاب PDF: بيتبعت inline كـ application/pdf، والأكواد والتيست مود بيرجعوا منفصلين
  await assert.rejects(ai.task("tech", { task: "codesBook", pdf: { data: "QUJD" + "A".repeat(600) } }), /bad_image/, "مش PDF حقيقي");
  await assert.rejects(ai.task("tech", { task: "codesBook", pdf: { data: "JVBERi" + "A".repeat(19000000) } }), /bad_image/, "أكبر من الحد");
  reply = { deviceType: "غسالات", brand: "إل جي", model: "F4J6", unclear: "", codes: [{ code: "OE", title: "صرف", cause: "", fix: "", causeFromPage: true, fixFromPage: true, note: "", unsure: false }],
    testModes: [{ title: "تيست مود الغسالة", models: "F4J6", enter: "1) افصل\n2) دوس Spin + Temp", tests: "1) الموتور يلف", exit: "افصل", note: "", unsure: false }, { title: "تيست مود الغسالة", models: "", enter: "مكرر", tests: "", exit: "", note: "", unsure: false }, { title: "من غير طريقة دخول", models: "", enter: "", tests: "x", exit: "", note: "", unsure: false }] };
  r = await ai.task("tech", { task: "codesBook", pdf: { data: "JVBERi" + "A".repeat(2000) }, pageFrom: 40, pageTo: 55, types: ["غسالات"], brands: ["إل جي"] });
  const pb = calls[calls.length - 1].contents[0].parts;
  assert.strictEqual(pb[0].inlineData.mimeType, "application/pdf"); assert.ok(/من 40 لحد 55/.test(pb[1].text));
  assert.strictEqual(r.codes.length, 1); assert.strictEqual(r.testModes.length, 1, "المكرر واللي من غير طريقة دخول بيتشالوا");
  assert.ok(/\n2\) دوس/.test(r.testModes[0].enter), "السطور محفوظة");
  r = await ai.task("tech", { task: "codesBook", pdf: { data: "JVBERi" + "A".repeat(2000) }, want: "tests", types: ["غسالات"], brands: ["إل جي"] });
  assert.strictEqual(r.codes.length, 0, "طالب التيست مود بس"); assert.ok(/التيست مود بس/.test(calls[calls.length - 1].contents[0].parts[1].text));

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

  // 🎯 الدقة الأعلى: Pro الأول، ولو مش متاح بيرجع للعادي؛ ولو المالك قفلها بيروح للعادي على طول
  calls.length = 0;
  const seen = [];
  const ai4 = createAI({ db, getToken: async () => "t", projectId: "p", actor: async (u) => actors[u], inc: (n) => ({ __inc: n }), listParts: async () => PARTS, now: () => Date.UTC(2026, 9, 20, 9),
    fetchImpl: async (url, opt) => { const m = url.match(/models\/([^:]+):/)[1]; seen.push(m); if (/pro/.test(m)) return { status: 404, ok: false, json: async () => ({ error: { message: "not found" } }) }; return { status: 200, ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ deviceType: "", brand: "", model: "", codes: [], unclear: "" }) }] } }], usageMetadata: {} }) }; } });
  await ai4.task("own", { task: "codesBook", images: [IMG] });
  assert.deepStrictEqual(seen.slice(0, 4), ["gemini-2.5-pro", "gemini-3.1-pro-preview", "gemini-3-pro-preview", "gemini-2.5-flash"]);
  seen.length = 0; await ai4.task("own", { task: "codesBook", images: [IMG] });
  assert.strictEqual(seen[0], "gemini-2.5-flash", "الـ Pro اللي مش متاح ميتجربش تاني");
  await ai4.saveConfig("own", { precise: false });
  const ai5 = createAI({ db, getToken: async () => "t", projectId: "p", actor: async (u) => actors[u], inc: (n) => ({ __inc: n }), now: () => Date.UTC(2026, 9, 20, 9), fetchImpl: async (url) => { seen.push(url.match(/models\/([^:]+):/)[1]); return { status: 200, ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "{}" }] } }], usageMetadata: {} }) }; } });
  seen.length = 0; await ai5.task("own", { task: "codesBook", images: [IMG] });
  assert.strictEqual(seen[0], "gemini-2.5-flash", "الدقة الأعلى مقفولة");
  assert.strictEqual((await ai5.config("own")).precise, false);
  await ai5.saveConfig("own", { precise: true });

  // 🏷️ كتاب فيه كذا ماركة (زي مجموعة العربي): كل كود بماركاته وتصنيفه وموديلاته، والكود نظيف
  reply = { deviceType: "غسالات", brand: "", model: "", unclear: "", testModes: [{ title: "تيست مود تورنيدو DDM", brands: ["تورنيدو"], brandsRaw: [], category: "فوق أوتوماتيك", models: "TWT-TLD", enter: "1) ON + Rinse", tests: "x", exit: "افصل", note: "", unsure: false }],
    codes: [{ code: "E1", alsoShows: "E11", brands: ["توشيبا", "تورنيدو"], brandsRaw: ["العربي"], category: "فوق أوتوماتيك", models: "", title: "صرف", cause: "", fix: "", causeFromPage: true, fixFromPage: true, note: "", unsure: false },
            { code: "E01 (Front Load)", alsoShows: "", brands: ["شارب", "مش موجودة"], brandsRaw: [], category: "أمامي أوتوماتيك", models: "ES-FP", title: "باب", cause: "", fix: "", causeFromPage: true, fixFromPage: true, note: "", unsure: false },
            { code: "E01", alsoShows: "", brands: ["شارب"], brandsRaw: [], category: "غلط", models: "ES-DP102", title: "مية", cause: "", fix: "", causeFromPage: true, fixFromPage: true, note: "", unsure: false }] };
  r = await ai.task("tech", { task: "codesBook", pdf: { data: "JVBERi" + "A".repeat(2000) }, deviceType: "غسالات", types: ["غسالات"], categories: { "غسالات": ["فوق أوتوماتيك", "أمامي أوتوماتيك"] }, brands: ["توشيبا", "تورنيدو", "شارب"] });
  assert.deepStrictEqual(r.codes[0].brands, ["توشيبا", "تورنيدو"]); assert.deepStrictEqual(r.codes[0].brandsRaw, ["العربي"]); assert.strictEqual(r.codes[0].category, "فوق أوتوماتيك");
  assert.strictEqual(r.codes[1].code, "E01", "(Front Load) بيتشال"); assert.deepStrictEqual(r.codes[1].brands, ["شارب"], "ماركة مش في القايمة بتتشال");
  assert.strictEqual(r.codes.length, 3, "نفس الكود لسلسلتين مختلفين = عنصرين"); assert.strictEqual(r.codes[2].category, "", "تصنيف غلط بيتشال");
  assert.deepStrictEqual(r.testModes[0].brands, ["تورنيدو"]);
  assert.ok(/- غسالات: فوق أوتوماتيك، أمامي أوتوماتيك/.test(calls[calls.length - 1].contents[0].parts[1].text));
  // تصنيف القديم: id مش من المبعوت بيتشال، والكود بيتنضف
  actors.tech.perms["faultcodes.edit"] = 1;
  reply = { items: [{ id: "a1", brands: ["شارب", "تورنيدو"], category: "أمامي أوتوماتيك", models: "ES-FP", code: "E01", confidence: "عالي", why: "مكتوب شارب وتورنيدو" }, { id: "zz", brands: ["شارب"], category: "", models: "", code: "", confidence: "عالي", why: "" }, { id: "t1", brands: ["توشيبا"], category: "", models: "AEW", code: "X", confidence: "متوسط", why: "" }] };
  r = await ai.task("tech", { task: "codesClassify", items: [{ id: "a1", code: "E01 (Front Load)", title: "باب", note: "شارب وتورنيدو تحميل أمامي\n📚 من كتاب «x»", deviceType: "غسالات" }, { id: "t1", kind: "test", title: "تيست موود توشيبا", model: "AEW-8460", deviceType: "غسالات" }], types: ["غسالات"], categories: { "غسالات": ["أمامي أوتوماتيك"] }, brands: ["شارب", "تورنيدو", "توشيبا"] });
  assert.deepStrictEqual(r.items.map((x) => x.id), ["a1", "t1"]); assert.deepStrictEqual(r.items[0].brands, ["شارب", "تورنيدو"]); assert.strictEqual(r.items[0].code, "E01"); assert.strictEqual(r.items[1].code, "", "التيست مود مالوش كود");
  assert.ok(!/📚/.test(calls[calls.length - 1].contents[0].parts[0].text), "علامة المصدر مش بتتبعت");

  // 📑 فهرس المصدر + كل خطوة في سطر + الإجراءات المنفصلة متتدمجش
  reply = { deviceType: "غسالات", brand: "", model: "", unclear: "", sections: ["تيست مود ES-TD", "اختبار c0", "تيست مود أعطال الموتور", "اختبار MEMS", "اختبار الفرامل"], codes: [],
    testModes: ["تيست مود المهندس", "اختبار c0", "أعطال الموتور", "MEMS", "الفرامل والمروحة"].map((t) => ({ title: "شارب ES-TD — " + t, brands: ["شارب"], brandsRaw: [], category: "", models: "ES-TD", enter: "1) ON 3 ثواني. 2) Water Level + Super Spin Dry مرتين", tests: "1) Start/Pause ← بيظهر: فلاش ← الليدات 2) Delicate ← بيظهر: 41 12 ← الليفيل 3) Delay Start ← بيظهر: dP ← طلمبة الصرف", exit: "افصل", note: "", unsure: false })) };
  r = await ai.task("tech", { task: "codesBook", pdf: { data: "JVBERi" + "A".repeat(2000) }, types: ["غسالات"], brands: ["شارب"] });
  assert.strictEqual(r.sections.length, 5); assert.strictEqual(r.testModes.length, 5, "5 إجراءات منفصلة");
  assert.strictEqual(r.testModes[0].tests.split("\n").length, 3, "كل صف في سطر"); assert.ok(/41 12/.test(r.testModes[0].tests), "الأرقام اللي في الجدول متتقسمش");
  assert.strictEqual(r.testModes[0].enter.split("\n").length, 2);
  assert.ok(/كل إجراء ليه طريقة دخول مختلفة = عنصر لوحده/.test(calls[calls.length - 1].systemInstruction.parts[0].text));

  // ⏱️ لو جوجل اتأخر: رسالة واضحة (ai_timeout) بدل ما الدالة تتقفل والمتصفح يشوف «مقدرتش أوصل»
  const ai6 = createAI({ db, getToken: async () => "t", projectId: "p", actor: async (u) => actors[u], inc: (n) => ({ __inc: n }), now: () => Date.UTC(2026, 9, 20, 9),
    fetchImpl: async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; } });
  await assert.rejects(ai6.task("own", { task: "codesBook", images: [IMG] }), /ai_timeout/);
  const idx = fs.readFileSync("functions/index.js", "utf8");
  assert.ok(/exports\.aiTask = aiCallable\("aiTask"[^\n]*timeoutSeconds: 540/.test(idx), "الدالة ليها 9 دقايق");

  // العدّاد بيتسجل لكل ميزة
  const u = db.docs["serverConfig/aiUsage-2026-10"];
  const { costOf } = require("./functions/ai");
  assert.ok(Math.abs(costOf("gemini-2.5-flash", { promptTokenCount: 10000, candidatesTokenCount: 0, promptTokensDetails: [{ modality: "AUDIO", tokenCount: 9600 }] }).usd - (400 * 0.3 + 9600 * 1.0) / 1e6) < 1e-12, "الصوت بسعره");
  ["codes", "msg", "voice", "plate", "invoice", "stock", "summary"].forEach((k) => assert.ok(u.byFeature[k] && u.byFeature[k].calls >= 1, k));

  // الواجهة
  const read = (f) => fs.readFileSync(f, "utf8");
  ["faultcodes.html", "faultcode.html", "index.html", "devices.html", "inventory.html", "reports.html", "request.html", "share-target.html"].forEach((f) => assert.ok(read(f).includes('src="app-ai-tools.js"') && read(f).includes('src="app-ai.js"') && read(f).includes('src="wf-media.js"'), f));
  assert.ok(read("service-worker.js").includes('"./app-ai-tools.js"'));
  assert.ok(read("functions/index.js").includes("exports.aiTask ="));
  assert.ok(/window\.WFReportData=/.test(read("reports.js")));
  assert.ok(read("app-requests.js").includes('wf-ai-msg-slot no-print" data-ai-rid="${esc(r.id)}"'));
  assert.ok(/window\.__wfShareAudio = payload\.file/.test(read("share-target.js")) && /window\.__wfShareAudioRef = audioRef/.test(read("share-target.js")));
  const tools = read("app-ai-tools.js");
  const genMsg = tools.slice(tools.indexOf("function genMsg"), tools.indexOf("function msgSlots0"));
  assert.ok(!/customerName|cust\.name|\.phone/.test(genMsg), "الرسالة مش بتبعت اسم أو تليفون العميل");
  Object.keys(TASKS).forEach((k) => assert.ok(["diag", "codes", "msg", "voice", "plate", "invoice", "stock", "summary"].includes(TASKS[k].feature), k));
  console.log("ai-tasks-tests: PASS");
})().catch((e) => { console.error(e); process.exit(1); });
