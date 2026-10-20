"use strict";
/* اختبارات الذكاء الاصطناعي: إعدادات المالك، القفل، الحد الشهري، اختيار الموديل، حساب التكلفة، والسياق اللي بيتبعت. */
const assert = require("assert");
const fs = require("fs");
const { createAI, normalizeCfg, costOf, sanitizeDiagInput, diagPrompt, sanitizeDiagOut, pickStock } = require("./functions/ai");

function fakeDb() {
  const docs = {};
  function merge(t, s) { Object.keys(s).forEach((k) => { const v = s[k]; if (v && v.__inc !== undefined) t[k] = (+t[k] || 0) + v.__inc; else if (v && typeof v === "object" && !Array.isArray(v)) { t[k] = t[k] && typeof t[k] === "object" ? t[k] : {}; merge(t[k], v); } else t[k] = v; }); }
  return {
    docs,
    doc: (p) => ({
      get: async () => ({ exists: !!docs[p], data: () => docs[p] }),
      set: async (v, o) => { if (o && o.merge) { docs[p] = docs[p] || {}; merge(docs[p], v); } else docs[p] = JSON.parse(JSON.stringify(v)); }
    })
  };
}
const inc = (n) => ({ __inc: n });
const actors = { own: { role: "staff", owner: true }, tech: { role: "staff", owner: false }, cust: { role: "customer" } };
function reply(obj, usage) { return { status: 200, ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }], usageMetadata: usage || { promptTokenCount: 1000, candidatesTokenCount: 500 } }) }; }

(async () => {
  // الإعدادات الافتراضية: مقفول، حد 5$
  const n = normalizeCfg(null);
  assert.strictEqual(n.enabled, false); assert.strictEqual(n.capUsd, 5); assert.strictEqual(n.features.diag, true); assert.strictEqual(n.model, "auto");
  assert.strictEqual(normalizeCfg({ capUsd: 9999 }).capUsd, 500);
  assert.strictEqual(normalizeCfg({ model: "evil" }).model, "auto");
  // التكلفة: 1000 دخل + 500 خرج على 2.5 flash
  assert.ok(Math.abs(costOf("gemini-2.5-flash", { promptTokenCount: 1000, candidatesTokenCount: 500 }).usd - (1000 * 0.3 + 500 * 2.5) / 1e6) < 1e-12);
  assert.ok(costOf("gemini-2.5-flash", { promptTokenCount: 0, candidatesTokenCount: 10, thoughtsTokenCount: 10 }).outT === 20, "التفكير بيتحسب خرج");

  const db = fakeDb(), calls = [];
  let mode = "ok";
  const fetchImpl = async (url, opt) => {
    calls.push({ url, body: JSON.parse(opt.body) });
    if (mode === "404first" && /gemini-2\.5-flash:/.test(url)) return { status: 404, ok: false, json: async () => ({ error: { message: "not found" } }) };
    if (mode === "denied") return { status: 403, ok: false, json: async () => ({ error: { message: "API not enabled" } }) };
    return reply({ summary: "غالبًا ثرموستات", causes: [{ title: "ثرموستات بايظ", likelihood: "عالي", checks: "قيس التوصيل" }, { title: "x", likelihood: "غلط", checks: "" }], parts: [{ name: "ثرموستات", why: "الأرجح" }], questions: ["التلاجة بتفصل؟"], safety: "" });
  };
  const ai = createAI({ db, getToken: async () => "tok", projectId: "proj", actor: async (u) => actors[u] || { role: "" }, inc, fetchImpl, now: () => Date.UTC(2026, 9, 19, 12) });

  // العميل/الغريب ممنوع
  await assert.rejects(ai.config("cust"), /not_allowed/);
  // الموظف بيشوف التشغيل بس، من غير أرقام الصرف
  let c = await ai.config("tech");
  assert.strictEqual(c.enabled, false); assert.strictEqual(c.capUsd, undefined); assert.strictEqual(c.usage, undefined);
  // مقفول = مفيش أي طلب لجوجل
  await assert.rejects(ai.diagnose("tech", { fault: "مش بتبرّد" }), /ai_off/);
  assert.strictEqual(calls.length, 0);
  // غير المالك ميقدرش يشغّل
  await assert.rejects(ai.saveConfig("tech", { enabled: true }), /owner_only/);
  c = await ai.saveConfig("own", { enabled: true, capUsd: 2 });
  assert.strictEqual(c.enabled, true); assert.strictEqual(c.capUsd, 2); assert.ok(c.owner);
  // من غير عطل
  await assert.rejects(ai.diagnose("tech", { fault: "  " }), /no_fault/);
  // تشخيص شغال + تسجيل التكلفة
  let r = await ai.diagnose("tech", { device: { type: "تلاجة", brand: "شارب" }, fault: "مش بتبرّد", similar: [{ fault: "مش بتبرد", work: "غيرت ثرموستات", parts: ["ثرموستات"] }] });
  assert.strictEqual(r.summary, "غالبًا ثرموستات"); assert.strictEqual(r.causes[1].likelihood, "متوسط", "درجة غلط بتتصلّح");
  assert.strictEqual(calls.length, 1);
  assert.ok(/locations\/global\/publishers\/google\/models\/gemini-2\.5-flash:generateContent/.test(calls[0].url));
  assert.deepStrictEqual(calls[0].body.generationConfig.thinkingConfig, { thinkingBudget: 1024 });
  assert.ok(/غيرت ثرموستات/.test(calls[0].body.contents[0].parts[0].text), "سجل الورشة بيتبعت");
  const u = db.docs["serverConfig/aiUsage-2026-10"];
  assert.strictEqual(u.calls, 1); assert.ok(u.cost > 0); assert.strictEqual(u.byFeature.diag.calls, 1); assert.strictEqual(u.byUser.tech.calls, 1);
  // الميزة لوحدها مقفولة
  await ai.saveConfig("own", { features: { diag: false } });
  await assert.rejects(ai.diagnose("tech", { fault: "x" }), /feature_off/);
  await ai.saveConfig("own", { features: { diag: true } });
  // الحد الشهري: لما الصرف يوصل للحد يقف من غير ما يكلم جوجل
  u.cost = 2;
  const before = calls.length;
  await assert.rejects(ai.diagnose("tech", { fault: "x" }), /ai_cap/);
  assert.strictEqual(calls.length, before);
  assert.strictEqual((await ai.config("tech")).capReached, true);
  u.cost = 0;
  // الموديل اتوقف عند جوجل → بيعدّي للي بعده لوحده
  const ai2 = createAI({ db, getToken: async () => "tok", projectId: "proj", actor: async (x) => actors[x], inc, fetchImpl, now: () => Date.UTC(2026, 9, 19, 12) });
  mode = "404first"; calls.length = 0;
  r = await ai2.diagnose("tech", { fault: "x" });
  assert.ok(/gemini-3\.1-flash-lite/.test(calls[1].url)); assert.strictEqual(r.model, "gemini-3.1-flash-lite");
  // الخدمة مش متفعّلة
  mode = "denied";
  await assert.rejects(ai2.diagnose("tech", { fault: "x" }), /ai_not_setup/);
  // تنظيف المدخلات
  const x = sanitizeDiagInput({ fault: "a".repeat(5000), similar: new Array(50).fill({ fault: "f", parts: new Array(30).fill("p") }), orderId: "../evil" });
  assert.strictEqual(x.fault.length, 600); assert.strictEqual(x.similar.length, 14); assert.strictEqual(x.similar[0].parts.length, 8); assert.strictEqual(x.orderId, "");
  assert.ok(!/undefined|null/.test(diagPrompt(x, [])));

  // المخزن: من السيرفر، الأقرب للجهاز الأول، والموديل بيختار بالكود — كود مش في القائمة بيتشال، ونفس القطعة متتكررش
  const PARTS = [
    { id: "p1", name: "خرطوم صرف تكييف انواع", qty: 14, category: "تكييف" },
    { id: "p2", name: "طرمبة صرف غسالة فول أوتوماتيك أمامي", qty: 3, category: "غسالات" },
    { id: "p3", name: "موتور المروحة", qty: 5, category: "تكييف" },
    { id: "p4", name: "كابستور غسالة 10 مايكرو", qty: 0, category: "غسالات" },
    { id: "p5", name: "قطعة قديمة", qty: 2, archived: true }
  ];
  const sx = sanitizeDiagInput({ device: { type: "غسالات", category: "أمامي أوتوماتيك", brand: "إل جي" }, fault: "مش بتصفي المية", preferIds: ["p4"] });
  const st = pickStock(PARTS, sx);
  assert.deepStrictEqual(st.map((p) => p.id).slice(0, 2).sort(), ["p2", "p4"], "قطع الغسالات واللي اتركبت قبل كده الأول");
  assert.ok(!st.some((p) => p.id === "p5"), "المؤرشف مش بيتعرض");
  const pr = diagPrompt(sx, st);
  assert.ok(/التصنيف: أمامي أوتوماتيك/.test(pr) && /مخزن الورشة/.test(pr) && /S1: /.test(pr) && /— خلصانة/.test(pr));
  const code = (id) => st.find((p) => p.id === id).code;
  const so = sanitizeDiagOut({ confidence: "عالي", steps: ["افتح فلتر الطرمبة"], causes: [{ title: "فلتر مسدود", likelihood: "عالي", checks: "افتحه", noPart: true }],
    parts: [{ name: "طرمبة صرف", why: "", priority: "احتياطي", stock: code("p2") }, { name: "طرمبة صرف", stock: code("p2") }, { name: "كابستور", priority: "أساسي", stock: "S999" }, { name: "خرطوم", stock: "خرطوم صرف تكييف انواع" }] }, st);
  assert.strictEqual(so.parts.length, 3, "اسم متكرر بيتشال");
  assert.strictEqual(so.parts[0].name, "كابستور", "الأساسي قبل الاحتياطي"); assert.strictEqual(so.parts[0].stock, null, "كود مش موجود بيتشال");
  assert.deepStrictEqual(so.parts.find((p) => p.name === "طرمبة صرف").stock, { id: "p2", name: "طرمبة صرف غسالة فول أوتوماتيك أمامي", qty: 3 });
  assert.strictEqual(so.causes[0].noPart, true); assert.strictEqual(so.confidence, "عالي");

  // الضمان وأكواد الأعطال بيوصلوا للموديل
  const wx = sanitizeDiagInput({ fault: "مش بتصفي تاني", codes: [{ code: "OE", title: "مشكلة صرف", cause: "طرمبة/فلتر", fix: "نظف الفلتر" }], warranty: { fault: "مش بتصفي", work: "غيرت الطرمبة", parts: ["طرمبة صرف"], days: 12 } });
  const wp = diagPrompt(wx, []);
  assert.ok(/رجوع على ضمان أمر سابق \(بعد 12 يوم\)/.test(wp) && /غيرت الطرمبة/.test(wp) && /OE: مشكلة صرف/.test(wp));

  // الكاش على السيرفر + نظرة سريعة + رأي الفني — من غير ما نكلم جوجل
  mode = "ok"; calls.length = 0;
  const ai3 = createAI({ db, getToken: async () => "tok", projectId: "proj", actor: async (q) => actors[q], inc, fetchImpl, listParts: async () => PARTS, now: () => Date.UTC(2026, 9, 19, 12) });
  assert.deepStrictEqual(await ai3.diagnose("tech", { action: "peek", orderId: "r9" }), { none: true });
  const body = { orderId: "r9", device: { type: "غسالات", category: "أمامي أوتوماتيك" }, fault: "مش بتصفي المية" };
  r = await ai3.diagnose("own", body);
  assert.strictEqual(calls.length, 1); assert.strictEqual(r.cached, false);
  assert.ok(/مخزن الورشة/.test(calls[0].body.contents[0].parts[0].text), "المخزن بيتبعت من السيرفر");
  r = await ai3.diagnose("tech", body);
  assert.strictEqual(calls.length, 1, "نفس الوصف = نتيجة محفوظة من غير تكلفة"); assert.strictEqual(r.cached, true);
  r = await ai3.diagnose("tech", Object.assign({ force: true }, body));
  assert.strictEqual(calls.length, 2, "تحليل من جديد بيكلم الموديل");
  r = await ai3.diagnose("tech", Object.assign({}, body, { fault: "بتصفي بس مش بتعصر" }));
  assert.strictEqual(calls.length, 3, "الوصف اتغيّر = تحليل جديد");
  const pk = await ai3.diagnose("tech", { action: "peek", orderId: "r9" });
  assert.ok(!pk.none && pk.summary && pk.src.fault === "بتصفي بس مش بتعصر");
  await ai3.diagnose("tech", { action: "feedback", orderId: "r9", vote: "down", note: "كانت الكارته" });
  await ai3.diagnose("tech", { action: "feedback", orderId: "r9", vote: "up" });
  await ai3.diagnose("own", { action: "feedback", orderId: "r9", vote: "up" });
  const u2 = db.docs["serverConfig/aiUsage-2026-10"];
  assert.strictEqual(u2.fbUp, 2); assert.strictEqual(u2.fbDown, 0); assert.strictEqual(u2.cacheHits, 1);
  assert.strictEqual((await ai3.diagnose("tech", { action: "peek", orderId: "r9" })).vote, "up");
  await assert.rejects(ai3.diagnose("tech", { action: "feedback", orderId: "nope", vote: "up" }), /no_diag/);
  await assert.rejects(ai3.diagnose("cust", { action: "peek", orderId: "r9" }), /not_allowed/);
  assert.ok(db.docs["serverConfig/aiDiag/orders/r9"], "النتيجة متخزنة تحت serverConfig (السيرفر بس يقراها)");
  const oc = await ai3.config("own"); assert.strictEqual(oc.usage.feedback.up, 2); assert.strictEqual(oc.usage.cacheHits, 1);

  // الواجهة: الملف موجود في الصفحات والكاش، ومفيش بيانات عميل في السياق
  const read = (f) => fs.readFileSync(f, "utf8");
  ["request.html", "tech.html", "settings.html"].forEach((f) => assert.ok(read(f).includes('src="app-ai.js"'), f));
  assert.ok(read("service-worker.js").includes('"./app-ai.js"'));
  assert.ok(read("settings.html").includes('id="aiSettingsBody"') && read("settings.html").includes('id="aiUsageMini"'));
  assert.ok(read("app-requests.js").includes('wf-ai-slot" data-ai-rid="${esc(r.id)}"'));
  assert.ok(read("tech-portal.js").includes('"data-ai-rid"'));
  const src = read("app-ai.js");
  const ctxFn = src.slice(src.indexOf("function context(r)"), src.indexOf("function cacheGet"));
  assert.ok(!/\.phone|address|customerId|K\(\)\.c\b/.test(ctxFn), "السياق ما فيهوش بيانات العميل");
  ["aiConfig", "aiConfigSave", "aiDiagnose"].forEach((f) => assert.ok(read("functions/index.js").includes("exports." + f + " ="), f));
  console.log("ai-tests: PASS");
})().catch((e) => { console.error(e); process.exit(1); });
