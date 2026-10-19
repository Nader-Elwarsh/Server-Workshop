"use strict";
/* اختبارات الذكاء الاصطناعي: إعدادات المالك، القفل، الحد الشهري، اختيار الموديل، حساب التكلفة، والسياق اللي بيتبعت. */
const assert = require("assert");
const fs = require("fs");
const { createAI, normalizeCfg, costOf, sanitizeDiagInput, diagPrompt } = require("./functions/ai");

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
  assert.deepStrictEqual(calls[0].body.generationConfig.thinkingConfig, { thinkingBudget: 0 });
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
  const x = sanitizeDiagInput({ fault: "a".repeat(5000), similar: new Array(50).fill({ fault: "f", parts: new Array(30).fill("p") }) });
  assert.strictEqual(x.fault.length, 600); assert.strictEqual(x.similar.length, 14); assert.strictEqual(x.similar[0].parts.length, 8);
  assert.ok(!/undefined/.test(diagPrompt(x)));

  // الواجهة: الملف موجود في الصفحات والكاش، ومفيش بيانات عميل في السياق
  const read = (f) => fs.readFileSync(f, "utf8");
  ["request.html", "tech.html", "settings.html"].forEach((f) => assert.ok(read(f).includes('src="app-ai.js"'), f));
  assert.ok(read("service-worker.js").includes('"./app-ai.js"'));
  assert.ok(read("settings.html").includes('id="aiSettingsBody"') && read("settings.html").includes('id="aiUsageMini"'));
  assert.ok(read("app-requests.js").includes('wf-ai-slot" data-ai-rid="${esc(r.id)}"'));
  assert.ok(read("tech-portal.js").includes('"data-ai-rid"'));
  const src = read("app-ai.js");
  const ctxFn = src.slice(src.indexOf("function context(r)"), src.indexOf("function keyOf"));
  assert.ok(!/\.phone|\.name\b(?!\s*;)|address|customerId/.test(ctxFn.replace(/\(parts\[x\.partId\] \|\| \{\}\)\.name|x\.name/g, "")), "السياق ما فيهوش بيانات العميل");
  ["aiConfig", "aiConfigSave", "aiDiagnose"].forEach((f) => assert.ok(read("functions/index.js").includes("exports." + f + " ="), f));
  console.log("ai-tests: PASS");
})().catch((e) => { console.error(e); process.exit(1); });
