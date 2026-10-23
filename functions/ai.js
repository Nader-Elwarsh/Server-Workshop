"use strict";
/* ---------------------------------------------------------------------
   الذكاء الاصطناعي (Gemini على Vertex AI — نفس حساب Google Cloud ونفس الفاتورة/الكريدت).
   - مفيش مفتاح API: الدالة بتاخد توكن حساب الخدمة بتاعها (زي تقرير الاستهلاك بالظبط).
   - الإعدادات في serverConfig/ai (المالك بس يغيّرها): تشغيل/إيقاف عام + لكل ميزة + حد أقصى للصرف في الشهر.
   - الاستهلاك في serverConfig/aiUsage-YYYY-MM (بتوقيت القاهرة): التكلفة وعدد المرات لكل ميزة ولكل مستخدم.
   - لو الحد اتعدّى أو الميزة مقفولة: مفيش أي طلب بيتبعت لجوجل = مفيش تكلفة.
   - مفيش بيانات عملاء بتتبعت: الجهاز والعطل واللي اتعمل بس.
   --------------------------------------------------------------------- */

const crypto = require("node:crypto");
const { TASKS } = require("./ai-tasks");

class AIError extends Error { constructor(code, message) { super(message); this.code = code; } }

// السعر بالدولار لكل مليون توكن [دخل نص/صورة، خرج، دخل صوت] — تقريبي من صفحة أسعار جوجل.
const MODELS = {
  "gemini-2.5-flash": [0.30, 2.50, 1.00],
  "gemini-3.1-flash-lite": [0.25, 1.50, 0.50],
  "gemini-3-flash": [0.50, 3.00, 1.00],
  "gemini-3-flash-preview": [0.50, 3.00, 1.00],
  "gemini-2.5-flash-lite": [0.10, 0.40, 0.30],
  "gemini-2.5-pro": [1.25, 10.00, 1.25],
  "gemini-3.1-pro-preview": [2.00, 12.00, 2.00],
  "gemini-3-pro-preview": [2.00, 12.00, 2.00]
};
/* «دقة أعلى»: موديلات Pro للحاجات اللي محتاجة قراية وتفكير تقيل (الفاتورة، صفحات الكتالوج، المكالمات).
   أغلى (حوالي 5 لـ 8 أضعاف) بس المرة لسه بقروش؛ لو مش متاحة بنرجع للعادي لوحده. */
const STRONG = ["gemini-2.5-pro", "gemini-3.1-pro-preview", "gemini-3-pro-preview"];
// «تلقائي»: أول موديل شغال من دول (لو جوجل وقّفت موديل قديم بنعدّي للي بعده لوحدنا).
const AUTO = ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-3-flash", "gemini-3-flash-preview", "gemini-2.5-flash-lite"];
const AUTO_SET = new Set(AUTO);
const FEATURES = ["diag", "codes", "msg", "voice", "plate", "invoice", "stock", "summary"];
const DEFAULTS = { enabled: false, features: { diag: true, codes: true, msg: true, voice: true, plate: true, invoice: true, stock: true, summary: true }, capUsd: 5, model: "auto", precise: true };

function cairoMonth(ms) {
  try {
    const p = {}; new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit" }).formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
    return p.year + "-" + p.month;
  } catch (e) { return new Date(ms).toISOString().slice(0, 7); }
}
function str(v, max) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max); }
function num(v) { v = +v; return Number.isFinite(v) ? v : 0; }

function normalizeCfg(c) {
  c = c && typeof c === "object" ? c : {};
  const f = c.features && typeof c.features === "object" ? c.features : {};
  const features = {};
  FEATURES.forEach((k) => { features[k] = f[k] === undefined ? DEFAULTS.features[k] !== false : f[k] === true; });
  let cap = num(c.capUsd === undefined ? DEFAULTS.capUsd : c.capUsd);
  cap = Math.min(500, Math.max(0, Math.round(cap * 100) / 100));
  const model = c.model === "auto" || (MODELS[c.model] && AUTO_SET.has(c.model)) ? c.model || "auto" : "auto";
  return { enabled: c.enabled === true, features, capUsd: cap, model, precise: c.precise === undefined ? DEFAULTS.precise : c.precise === true };
}
function costOf(model, meta) {
  const p = MODELS[model] || [0.5, 3, 1];
  const inT = num(meta && meta.promptTokenCount), outT = num(meta && meta.candidatesTokenCount) + num(meta && meta.thoughtsTokenCount);
  let audioT = 0; (Array.isArray(meta && meta.promptTokensDetails) ? meta.promptTokensDetails : []).forEach((x) => { if (x && x.modality === "AUDIO") audioT += num(x.tokenCount); });
  audioT = Math.min(audioT, inT);
  return { inT, outT, audioT, usd: ((inT - audioT) * p[0] + audioT * (p[2] || p[0]) + outT * p[1]) / 1e6 };
}
/* think=true: تفكير قليل قبل الرد (بيفرق في اختيار القطع الصح) — بيتحسب خرج، حوالي سنت لكل 8 مرات. */
/* think: false = من غير تفكير، true = تفكير قليل، رقم = ميزانية تفكير أكبر (للحاجات الصعبة). */
function thinkingFor(model, think) {
  const n = typeof think === "number" ? think : think ? 1024 : 0;
  if (/^gemini-2\.5-flash-lite/.test(model)) return n ? { thinkingBudget: n } : null;
  if (/^gemini-2\.5-pro/.test(model)) return { thinkingBudget: Math.max(1024, n) };
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: n };
  if (/^gemini-3/.test(model)) return { thinkingLevel: n >= 4096 ? "high" : "low" };
  return null;
}

/* ---------------------------------------------------------------------
   مساعد التشخيص
   --------------------------------------------------------------------- */
const LK = ["عالي", "متوسط", "ضعيف"];
const DIAG_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    confidence: { type: "STRING", enum: LK },
    confidenceNote: { type: "STRING" },
    steps: { type: "ARRAY", items: { type: "STRING" } },
    causes: { type: "ARRAY", items: { type: "OBJECT", properties: { title: { type: "STRING" }, likelihood: { type: "STRING", enum: LK }, checks: { type: "STRING" }, noPart: { type: "BOOLEAN" } }, required: ["title", "likelihood", "checks", "noPart"] } },
    parts: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, why: { type: "STRING" }, priority: { type: "STRING", enum: ["أساسي", "احتياطي"] }, stock: { type: "STRING" } }, required: ["name", "why", "priority", "stock"] } },
    questions: { type: "ARRAY", items: { type: "STRING" } },
    safety: { type: "STRING" },
    fromHistory: { type: "STRING" }
  },
  required: ["summary", "confidence", "confidenceNote", "steps", "causes", "parts", "questions", "safety", "fromHistory"]
};
const DIAG_SYSTEM = [
  "إنت فني صيانة خبير بقالك أكتر من 20 سنة في صيانة الأجهزة المنزلية في مصر (غسالات، تلاجات، ديب فريزر، تكييفات، سخانات، بوتاجازات، ميكروويف، مكانس، كمبروسرات…).",
  "شغلتك تساعد فني الورشة قبل وأثناء الزيارة: يفهم العطل، يعرف يبدأ فحص منين، وياخد معاه إيه. إنت مساعد مش بديل للفحص.",
  "",
  "طريقة التفكير (فكّر بيها قبل ما تكتب):",
  "1) حدد الجهاز بالظبط من النوع والتصنيف والماركة (غسالة فول أوتوماتيك أمامي ≠ فوق/علوي ≠ نص أوتوماتيك، تكييف سبليت ≠ شباك، إنفرتر ≠ عادي، تلاجة نوفروست ≠ ديفروست). أي سبب أو قطعة لازم تكون موجودة فعلًا في النوع ده — ممنوع قطعة نوع تاني.",
  "2) من وصف العطل حدد الدايرة/الجزء المسؤول، وبعدين الأسباب مترتبة من الأرجح للأضعف حسب الواقع في مصر: تذبذب وضعف الكهربا، المياه العسرة والجير، التراب والحرارة، سوء التركيب والاستخدام.",
  "3) فكّر الأول في الأسباب اللي بتتحل من غير قطع (فلتر/طرمبة مسدودة بحاجة، محبس أو ضغط مياه، فيشة/فيوز/كهربا البيت، ضبط أو برنامج غلط، تركيب) وعلّم عليها noPart=true.",
  "4) steps: خطوات الفحص بالترتيب من الأسرع والأرخص للأصعب (3 لـ 6)، كل خطوة جملة واحدة: تعمل إيه، ولو لقيت كذا يبقى العطل كذا.",
  "5) causes: من 2 لـ 5، لكل سبب إزاي يتأكد منه بقياس أو اختبار محدد (آفوميتر، تشغيل يدوي، مراقبة صوت/مية/حرارة).",
  "6) لو فيه أكواد أعطال من دليل الورشة، اعتمد على معناها أولًا. لو الأمر ده رجوع على ضمان أمر سابق: فكّر هل القطعة اللي اتغيرت باظت تاني (يبقى فيه سبب أصلي ما اتحلش، زي كهربا أو تسريب أو حمل زيادة) ولا عطل جديد، وقول ده صراحة.",
  "6ب) لو نفس الجهاز اتصلح قريب (أقل من 3 شهور من تاريخ النهارده) من نفس العطل أو عطل قريب، اعتبره عطل متكرر: ابدأ بليه رجع (القطعة الجديدة باظت؟ تركيب؟ السبب الأصلي ما اتحلش؟) قبل ما تقترح نفس القطعة تاني، وقول ده في summary.",
  "7) لو الوصف ناقص أو عام (زي «عطلانة» أو «مش شغالة» بس)، خلّي confidence «ضعيف» واكتب في confidenceNote المعلومة الناقصة، وركّز على questions. لو الوصف واضح ومعروف، confidence «عالي».",
  "8) parts: لحد 6 قطع، بالأسماء المتداولة في السوق المصري، من غير تكرار. priority «أساسي» = غالبًا هتتغير، «احتياطي» = خدها معاك احتمال. متكتبش قطعة لسبب noPart.",
  "9) stock: لو في «مخزن الورشة» قطعة هي نفس القطعة دي فعلًا وتنفع للجهاز ده (نفس النوع والتصنيف، ونفس الماركة لو القطعة مخصوصة لماركة)، اكتب الكود بتاعها بس (زي S12). لو مش متأكد، أو هي لجهاز تاني (خرطوم تكييف ≠ خرطوم غسالة، موتور مروحة ≠ كابستور)، أو مجرد كلمة شبه — اكتب \"\".",
  "10) questions: لحد 4 أسئلة قصيرة للعميل في التليفون تفرق في التشخيص فعلًا.",
  "11) fromHistory: لو سجل الورشة فيه حاجة مفيدة (نفس العطل اتكرر لنفس الجهاز، قطعة بتتغير كتير في الأعطال الشبيهة، مرتجعات) قولها في جملة، وإلا \"\".",
  "12) safety: تحذير قصير لو فيه خطر حقيقي (كهربا، غاز، فريون/ضغط، مكثف مشحون)، وإلا \"\".",
  "",
  "اكتب بالعامية المصرية، مختصر وعملي، من غير مقدمات ولا تكرار بين الأقسام. متخترعش أكواد أعطال أو أرقام قطع أو معلومات عن الجهاز مش مكتوبة."
].join("\n");

function norm(s) { return String(s || "").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[ً-ْـ]/g, ""); }
const STOP = new Set(["مش", "فيه", "في", "من", "علي", "عند", "بعد", "قبل", "خالص", "جدا", "شويه", "العميل", "الجهاز", "بيقول", "لما", "اللي", "ولا", "وكمان", "the", "and"]);
function words(s) { const o = new Set(); norm(s).replace(/[^؀-ۿa-z0-9]+/g, " ").split(" ").forEach((x) => { if ((x.length > 2 || /^\d+$/.test(x)) && !STOP.has(x)) o.add(x.replace(/^(ال|وال|بال)/, "")); }); return o; }
function overlap(a, b) { let n = 0; a.forEach((x) => { if (b.has(x)) n++; }); return n; }

function sanitizeDiagInput(d) {
  d = d || {};
  const dev = d.device || {};
  const item = (h) => ({
    fault: str(h && h.fault, 200), work: str(h && h.work, 300),
    parts: Array.isArray(h && h.parts) ? h.parts.slice(0, 8).map((x) => str(x, 60)).filter(Boolean) : [],
    returned: !!(h && h.returned), when: str(h && h.when, 10)
  });
  const list = (a, n) => (Array.isArray(a) ? a.slice(0, n).map(item).filter((x) => x.fault || x.work) : []);
  const w = d.warranty && typeof d.warranty === "object" ? d.warranty : null;
  return {
    orderId: /^[A-Za-z0-9_-]{1,80}$/.test(String(d.orderId || "")) ? String(d.orderId) : "",
    device: { type: str(dev.type, 60), category: str(dev.category, 60), brand: str(dev.brand, 60), model: str(dev.model, 80), desc: str(dev.desc, 160) },
    fault: str(d.fault, 600), work: str(d.work, 600), note: str(d.note, 300),
    codes: Array.isArray(d.codes) ? d.codes.slice(0, 4).map((c) => ({ code: str(c && c.code, 20), title: str(c && c.title, 120), cause: str(c && c.cause, 200), fix: str(c && c.fix, 200) })).filter((c) => c.code) : [],
    warranty: w ? { fault: str(w.fault, 200), work: str(w.work, 300), parts: Array.isArray(w.parts) ? w.parts.slice(0, 8).map((x) => str(x, 60)).filter(Boolean) : [], days: Math.max(0, Math.round(num(w.days))) } : null,
    sameDevice: list(d.sameDevice, 6), similar: list(d.similar, 14),
    preferIds: Array.isArray(d.preferIds) ? d.preferIds.slice(0, 150).map((x) => str(x, 80)).filter(Boolean) : []
  };
}
/* قائمة المخزن اللي بتتعرض على الموديل: كل القطع لو قليلة، وإلا الأقرب للجهاز/العطل + اللي اتركبت قبل كده على نفس النوع. */
function pickStock(parts, x, max) {
  max = max || 200;
  const dw = words([x.device.type, x.device.category, x.device.brand].join(" ")), fw = words(x.fault + " " + x.work), pref = new Set(x.preferIds);
  const list = (parts || []).filter((p) => p && p.name && !p.archived).map((p) => {
    const pw = words(p.name + " " + (p.category || ""));
    return { p, s: (pref.has(p.id) ? 4 : 0) + 2 * overlap(dw, pw) + overlap(fw, pw) };
  });
  list.sort((a, b) => b.s - a.s || num(b.p.qty) - num(a.p.qty));
  return list.slice(0, max).map((e, i) => ({ code: "S" + (i + 1), id: String(e.p.id), name: str(e.p.name, 80), cat: str(e.p.category, 40), qty: num(e.p.qty) }));
}
function diagPrompt(x, stock, today) {
  const L = [];
  if (today) L.push("تاريخ النهارده: " + today);
  L.push("نوع الجهاز: " + (x.device.type || "غير محدد") + (x.device.category ? " — التصنيف: " + x.device.category : ""));
  if (x.device.brand || x.device.model) L.push("الماركة/الموديل: " + [x.device.brand, x.device.model].filter(Boolean).join(" "));
  if (x.device.desc) L.push("وصف الجهاز: " + x.device.desc);
  L.push("العطل حسب كلام العميل: " + (x.fault || "—"));
  if (x.note) L.push("ملاحظة العميل: " + x.note);
  if (x.work) L.push("اللي اتعمل أو اتلاحظ لحد دلوقتي: " + x.work);
  if (x.codes.length) { L.push(""); L.push("أكواد أعطال من دليل الورشة لنفس الجهاز:"); x.codes.forEach((c) => L.push("- " + c.code + (c.title ? ": " + c.title : "") + (c.cause ? " | السبب: " + c.cause : "") + (c.fix ? " | الحل: " + c.fix : ""))); }
  if (x.warranty) { L.push(""); L.push("⚠️ الأمر ده رجوع على ضمان أمر سابق" + (x.warranty.days ? " (بعد " + x.warranty.days + " يوم)" : "") + ": العطل ساعتها: " + (x.warranty.fault || "—") + (x.warranty.work ? " | اتعمل: " + x.warranty.work : "") + (x.warranty.parts.length ? " | قطع اتغيرت: " + x.warranty.parts.join("، ") : "")); }
  const row = (h) => "- " + (h.when ? "[" + h.when + "] " : "") + "العطل: " + (h.fault || "—") + (h.work ? " | اتعمل: " + h.work : "") + (h.parts.length ? " | قطع: " + h.parts.join("، ") : "") + (h.returned ? " | ⚠️ رجع مرتجع بعدها" : "");
  if (x.sameDevice.length) { L.push(""); L.push("تاريخ نفس الجهاز ده في الورشة:"); x.sameDevice.forEach((h) => L.push(row(h))); }
  if (x.similar.length) { L.push(""); L.push("أوامر شبيهة اتقفلت في الورشة قبل كده (نفس النوع والتصنيف):"); x.similar.forEach((h) => L.push(row(h))); }
  if (stock && stock.length) { L.push(""); L.push("مخزن الورشة (الكود: اسم القطعة [التصنيف]):"); stock.forEach((p) => L.push(p.code + ": " + p.name + (p.cat ? " [" + p.cat + "]" : "") + (p.qty > 0 ? "" : " — خلصانة"))); }
  return L.join("\n");
}
function sanitizeDiagOut(o, stock) {
  o = o && typeof o === "object" ? o : {};
  const byCode = new Map((stock || []).map((p) => [p.code, p])), byName = new Map((stock || []).map((p) => [norm(p.name).trim(), p]));
  const seen = new Set(), seenStock = new Set();
  const parts = [];
  (Array.isArray(o.parts) ? o.parts : []).forEach((p) => {
    const name = str(p && p.name, 80), k = norm(name);
    if (!name || seen.has(k) || parts.length >= 6) return; seen.add(k);
    const raw = str(p && p.stock, 80).toUpperCase(), hit = byCode.get(raw) || byName.get(norm(str(p && p.stock, 80)).trim()) || null;
    const st = hit && !seenStock.has(hit.id) ? (seenStock.add(hit.id), { id: hit.id, name: hit.name, qty: hit.qty }) : null;
    parts.push({ name, why: str(p && p.why, 200), priority: p && p.priority === "احتياطي" ? "احتياطي" : "أساسي", stock: st });
  });
  parts.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "أساسي" ? -1 : 1));
  return {
    summary: str(o.summary, 400),
    confidence: LK.includes(o.confidence) ? o.confidence : "متوسط",
    confidenceNote: str(o.confidenceNote, 250),
    steps: (Array.isArray(o.steps) ? o.steps : []).slice(0, 7).map((s) => str(s, 260)).filter(Boolean),
    causes: (Array.isArray(o.causes) ? o.causes : []).slice(0, 6).map((c) => ({ title: str(c && c.title, 160), likelihood: LK.includes(c && c.likelihood) ? c.likelihood : "متوسط", checks: str(c && c.checks, 400), noPart: !!(c && c.noPart) })).filter((c) => c.title),
    parts,
    questions: (Array.isArray(o.questions) ? o.questions : []).slice(0, 5).map((q) => str(q, 200)).filter(Boolean),
    safety: str(o.safety, 300),
    fromHistory: str(o.fromHistory, 300)
  };
}
function diagKey(x) {
  return crypto.createHash("sha1").update(JSON.stringify([x.device, x.fault, x.work, x.note, x.codes, x.warranty, x.sameDevice])).digest("hex").slice(0, 20);
}

function createAI({ db, getToken, projectId, actor, inc, listParts = async () => [], fetchImpl = (...a) => fetch(...a), now = () => Date.now(), log = () => {} }) {
  let working = "", partsCache = null, partsAt = 0;
  async function stockParts() {
    if (partsCache && now() - partsAt < 10 * 60000) return partsCache;
    try { partsCache = (await listParts()) || []; partsAt = now(); } catch (e) { log("parts load failed", e && e.message); partsCache = partsCache || []; }
    return partsCache;
  }
  const usagePath = (ms) => "serverConfig/aiUsage-" + cairoMonth(ms);

  async function loadCfg() { const s = await db.doc("serverConfig/ai").get(); return normalizeCfg(s.exists ? s.data() : null); }
  async function loadUsage() { const s = await db.doc(usagePath(now())).get(); const u = s.exists ? s.data() || {} : {}; return { month: cairoMonth(now()), cost: num(u.cost), calls: num(u.calls), byFeature: u.byFeature || {}, byUser: u.byUser || {}, model: u.model || "", cacheHits: num(u.cacheHits), feedback: { up: num(u.fbUp), down: num(u.fbDown) } }; }
  async function staffOnly(uid) {
    const a = await actor(uid);
    if (!a || a.role !== "staff") throw new AIError("permission-denied", "not_allowed");
    return a;
  }

  async function config(uid) {
    const a = await staffOnly(uid);
    const [cfg, u] = await Promise.all([loadCfg(), loadUsage()]);
    const out = { enabled: cfg.enabled, features: cfg.features, capReached: cfg.capUsd <= 0 || u.cost >= cfg.capUsd, owner: !!a.owner };
    if (a.owner) {
      const names = {};
      await Promise.all(Object.keys(u.byUser).slice(0, 40).map(async (id) => { try { const s = await db.doc("staff/" + id).get(); const x = s.exists ? s.data() || {} : {}; names[id] = x.name || x.email || ""; } catch (e) {} }));
      Object.assign(out, { capUsd: cfg.capUsd, model: cfg.model, precise: cfg.precise, models: ["auto"].concat(AUTO), usage: u, names, project: projectId });
    }
    return out;
  }
  async function saveConfig(uid, d) {
    const a = await staffOnly(uid);
    if (!a.owner) throw new AIError("permission-denied", "owner_only");
    const cur = await loadCfg();
    d = d || {};
    const next = normalizeCfg({
      enabled: d.enabled === undefined ? cur.enabled : d.enabled === true,
      features: Object.assign({}, cur.features, d.features && typeof d.features === "object" ? d.features : {}),
      capUsd: d.capUsd === undefined ? cur.capUsd : d.capUsd,
      model: d.model === undefined ? cur.model : d.model,
      precise: d.precise === undefined ? cur.precise : d.precise === true
    });
    await db.doc("serverConfig/ai").set(Object.assign({}, next, { updatedAt: now(), updatedBy: uid }));
    return config(uid);
  }

  /* كل طلب لجوجل ليه حد زمني، عشان نرجّع رسالة واضحة قبل ما الدالة نفسها تتقفل (9 دقايق) */
  async function callModel(model, body, ms) {
    const url = `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/global/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
    const tok = await getToken();
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), Math.max(20000, ms || 420000)) : null;
    try {
      const res = await fetchImpl(url, { method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined });
      const j = await res.json().catch(() => ({}));
      return { status: res.status, ok: res.ok, j };
    } catch (e) {
      if (e && e.name === "AbortError") throw new AIError("deadline-exceeded", "ai_timeout");
      throw e;
    } finally { if (timer) clearTimeout(timer); }
  }

  let workingStrong = "";
  const deadStrong = new Set();
  async function generate({ uid, feature, system, prompt, schema, maxOut, think, media, temperature, strong, hiRes }) {
    const [cfg, u] = await Promise.all([loadCfg(), loadUsage()]);
    if (!cfg.enabled) throw new AIError("failed-precondition", "ai_off");
    if (!cfg.features[feature]) throw new AIError("failed-precondition", "feature_off");
    if (cfg.capUsd <= 0 || u.cost >= cfg.capUsd) throw new AIError("resource-exhausted", "ai_cap");
    let list = cfg.model === "auto" ? AUTO.slice() : [cfg.model].concat(AUTO.filter((m) => m !== cfg.model));
    if (cfg.model === "auto" && working) list = [working].concat(list.filter((m) => m !== working));
    if (strong && cfg.precise) {
      let s2 = STRONG.filter((m) => !deadStrong.has(m));
      if (workingStrong) s2 = [workingStrong].concat(s2.filter((m) => m !== workingStrong));
      list = s2.concat(list);
    }
    let lastErr = "", retried5xx = false;
    const t0 = now(), left = () => 450000 - (now() - t0);
    for (const model of list) {
      if (left() < 25000) throw new AIError("deadline-exceeded", "ai_timeout");
      const isStrong = STRONG.includes(model);
      const gen = { temperature: temperature == null ? 0.3 : temperature, maxOutputTokens: Math.max(maxOut || 2048, isStrong ? 16384 : 0), responseMimeType: "application/json", responseSchema: schema };
      if (hiRes && (media || []).length === 1 && String(((media || [])[0] || {}).mimeType || "").indexOf("image/") === 0) gen.mediaResolution = "MEDIA_RESOLUTION_HIGH";
      const th = thinkingFor(model, think);
      const body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: (media || []).map((m) => ({ inlineData: { mimeType: m.mimeType, data: m.data } })).concat([{ text: prompt }]) }], generationConfig: th ? Object.assign({ thinkingConfig: th }, gen) : gen };
      let r = await callModel(model, body, left());
      const errOf = (x) => String((x.j && x.j.error && x.j.error.message) || "").replace(/\s+/g, " ").slice(0, 300);
      /* الموديل نفسه مش موجود/مش متاح للمشروع — غير كده الـ400 سببه حاجة في الطلب */
      const gone = (x) => x.status === 404 || (x.status === 400 && /(publisher model|model).{0,120}(not found|does not exist|was not found|is not (found|available|supported for))|not found.{0,60}model/i.test(errOf(x)));
      if (r.status === 400 && !gone(r)) {
        log("vertex 400", model, errOf(r));
        /* نشيل الإعدادات الاختيارية واحدة واحدة لحد ما الطلب يتقبل */
        const steps = [
          () => (gen.mediaResolution ? (delete body.generationConfig.mediaResolution, true) : false),
          () => (body.generationConfig.thinkingConfig ? (delete body.generationConfig.thinkingConfig, true) : false),
          () => (/propertyOrdering/.test(JSON.stringify(body.generationConfig.responseSchema || {})) ? (body.generationConfig.responseSchema = JSON.parse(JSON.stringify(body.generationConfig.responseSchema, (k, v) => (k === "propertyOrdering" ? undefined : v))), true) : false),
          /* شكل الرد معقد زيادة على جوجل → نشيله ونكتب الشكل المطلوب في الطلب نفسه */
          () => (body.generationConfig.responseSchema ? (delete body.generationConfig.responseSchema, body.contents[0].parts[body.contents[0].parts.length - 1].text = prompt + "\n\nرجّع JSON بس بالشكل ده (نفس أسماء الحقول):\n" + JSON.stringify(schema), true) : false)
        ];
        for (const st of steps) {
          if (r.status !== 400 || gone(r) || left() < 30000) break;
          if (!st()) continue;
          r = await callModel(model, body, left());
          if (r.status === 400) log("vertex 400 again", model, errOf(r));
        }
      }
      if (gone(r) || (isStrong && (r.status === 403 || r.status === 429))) { lastErr = model + ": " + r.status + " " + errOf(r).slice(0, 120); log("model unavailable", model, r.status, errOf(r)); if (working === model) working = ""; if (isStrong) { if (r.status !== 429) deadStrong.add(model); if (workingStrong === model) workingStrong = ""; } continue; }
      if (r.status === 400) { lastErr = "HTTP 400 " + errOf(r).slice(0, 140); log("vertex 400 final", model, errOf(r)); if (isStrong && workingStrong === model) workingStrong = ""; continue; }
      if (r.status === 403 || r.status === 401) { log("vertex denied", r.status, r.j.error && r.j.error.message); throw new AIError("failed-precondition", "ai_not_setup"); }
      if (r.status === 429) throw new AIError("resource-exhausted", "ai_busy");
      if (!r.ok) {
        const msg = String((r.j.error && r.j.error.message) || "").slice(0, 140);
        log("vertex error", model, r.status, msg);
        lastErr = "HTTP " + r.status + (msg ? " " + msg : "");
        // الموديل القوي فشل (زحمة/خطأ عندهم) → نكمّل بالعادي بدل ما نوقف؛ والعادي لو 5xx نجرّبه مرة كمان
        if (isStrong) { if (workingStrong === model) workingStrong = ""; continue; }
        if (r.status >= 500 && !retried5xx) { retried5xx = true; await new Promise((ok) => setTimeout(ok, 1500)); r = await callModel(model, body, left()); if (r.ok) { /* نكمّل تحت */ } else { throw new AIError("unavailable", "ai_failed|" + lastErr); } }
        else throw new AIError("unavailable", "ai_failed|" + lastErr);
      }
      if (isStrong) workingStrong = model; else working = model;
      const c = costOf(model, r.j.usageMetadata);
      // تسجيل التكلفة قبل أي حاجة تانية (حتى لو الرد طلع مش مفهوم، جوجل حسبته).
      try {
        await db.doc(usagePath(now())).set({
          cost: inc(c.usd), calls: inc(1), tokensIn: inc(c.inT), tokensOut: inc(c.outT), model, updatedAt: now(),
          byFeature: { [feature]: { calls: inc(1), cost: inc(c.usd) } },
          byUser: { [uid]: { calls: inc(1), cost: inc(c.usd) } }
        }, { merge: true });
      } catch (e) { log("usage write failed", e && e.message); }
      let cand = r.j.candidates && r.j.candidates[0];
      let text = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts.map((p) => p.text || "").join("") : "";
      /* RECITATION = جوجل وقف الرد لأنه كان بينقل نص كتاب حرفيًا → نعيد مرة بطلب صياغة بالكلام بتاعه */
      if (cand && cand.finishReason === "RECITATION" && left() > 60000) {
        log("recitation, retrying", model);
        body.systemInstruction.parts[0].text = system + "\n\nمهم جدًا: متنقلش أي فقرة أو جدول حرفيًا من المصدر — اكتب كل حاجة بصياغتك وبالعامية المصرية، مع الحفاظ على الأكواد وأسماء الأزرار والأرقام والموديلات زي ما هي بالظبط.";
        body.generationConfig.temperature = 0.5;
        const r2 = await callModel(model, body, left());
        if (r2.ok) {
          const c2 = costOf(model, r2.j.usageMetadata);
          try { await db.doc(usagePath(now())).set({ cost: inc(c2.usd), calls: inc(1), byFeature: { [feature]: { calls: inc(1), cost: inc(c2.usd) } }, byUser: { [uid]: { calls: inc(1), cost: inc(c2.usd) } }, updatedAt: now() }, { merge: true }); } catch (e) {}
          c.usd += c2.usd;
          cand = r2.j.candidates && r2.j.candidates[0];
          text = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts.map((p) => p.text || "").join("") : "";
        }
      }
      let data = null;
      try { data = JSON.parse(text); } catch (e) { const m = text.match(/\{[\s\S]*\}/); try { data = m ? JSON.parse(m[0]) : null; } catch (e2) { data = null; } }
      if (!data) { const why = (cand && cand.finishReason) || (r.j.promptFeedback && r.j.promptFeedback.blockReason) || "EMPTY"; log("bad reply", model, why, text.slice(0, 120)); throw new AIError("internal", "ai_bad_reply|" + why); }
      return { data, model, cost: c.usd };
    }
    log("no model available", lastErr);
    if (/HTTP \d/.test(lastErr)) throw new AIError("unavailable", "ai_failed|" + lastErr);
    throw new AIError("failed-precondition", "ai_no_model" + (lastErr ? "|" + lastErr : ""));
  }

  const diagPath = (id) => "serverConfig/aiDiag/orders/" + id;
  async function bump(fields) { try { await db.doc(usagePath(now())).set(Object.assign({ updatedAt: now() }, fields), { merge: true }); } catch (e) { log("usage write failed", e && e.message); } }

  /* action: "" = تحليل (أو نتيجة محفوظة لنفس الوصف من غير تكلفة)، "peek" = آخر تحليل محفوظ للأمر بس، "feedback" = 👍/👎 */
  async function diagnose(uid, d) {
    await staffOnly(uid);
    d = d || {};
    const action = String(d.action || "");
    const orderId = /^[A-Za-z0-9_-]{1,80}$/.test(String(d.orderId || "")) ? String(d.orderId) : "";
    if (action === "peek") {
      if (!orderId) return { none: true };
      const s = await db.doc(diagPath(orderId)).get();
      return s.exists && s.data() && s.data().res ? Object.assign({}, s.data().res, { cached: true, at: s.data().at, src: s.data().src || {}, vote: (s.data().votes || {})[uid] || "" }) : { none: true };
    }
    if (action === "feedback") {
      const vote = d.vote === "up" || d.vote === "down" ? d.vote : "";
      if (!orderId) throw new AIError("invalid-argument", "bad_args");
      const ref = db.doc(diagPath(orderId)), s = await ref.get();
      if (!s.exists) throw new AIError("not-found", "no_diag");
      const prev = ((s.data() || {}).votes || {})[uid] || "";
      if (prev === vote) return { vote };
      await ref.set({ votes: { [uid]: vote }, note: vote === "down" ? str(d.note, 300) : "" }, { merge: true });
      const f = {};
      if (prev === "up") f.fbUp = inc(-1); if (prev === "down") f.fbDown = inc(-1);
      if (vote === "up") f.fbUp = inc(1); if (vote === "down") f.fbDown = inc(1);
      await bump(f);
      return { vote };
    }
    const x = sanitizeDiagInput(d);
    if (!x.fault && !x.work) throw new AIError("invalid-argument", "no_fault");
    const cfg = await loadCfg();
    if (!cfg.enabled) throw new AIError("failed-precondition", "ai_off");
    if (!cfg.features.diag) throw new AIError("failed-precondition", "feature_off");
    const key = diagKey(x), src = { fault: x.fault, work: x.work };
    if (orderId && !d.force) {
      const s = await db.doc(diagPath(orderId)).get();
      const c = s.exists ? s.data() || {} : null;
      if (c && c.key === key && c.res) { await bump({ cacheHits: inc(1) }); return Object.assign({}, c.res, { cached: true, at: c.at, src, vote: (c.votes || {})[uid] || "" }); }
    }
    const stock = pickStock(await stockParts(), x, 150);
    const r = await generate({ uid, feature: "diag", system: DIAG_SYSTEM, prompt: diagPrompt(x, stock, new Date(now()).toISOString().slice(0, 10)), schema: DIAG_SCHEMA, maxOut: 6144, think: true });
    const res = Object.assign(sanitizeDiagOut(r.data, stock), { model: r.model, cost: Math.round(r.cost * 1e6) / 1e6 });
    const at = now();
    if (orderId) { try { await db.doc(diagPath(orderId)).set({ key, res, src, at, by: uid, votes: {} }); } catch (e) { log("diag save failed", e && e.message); } }
    return Object.assign({}, res, { cached: false, at, src, vote: "" });
  }

  /* باقي المهام (أكواد الأعطال، رسالة العميل، الأمر بالكلام، لوحة البيانات، الفاتورة، المخزن، ملخص الشهر) — functions/ai-tasks.js */
  async function task(uid, d) {
    const a = await staffOnly(uid);
    d = d || {};
    const def = Object.prototype.hasOwnProperty.call(TASKS, String(d.task || "")) ? TASKS[d.task] : null;
    if (!def) throw new AIError("invalid-argument", "bad_task");
    if (def.perm && !a.owner && !(a.perms || {})[def.perm]) throw new AIError("permission-denied", "not_allowed");
    const ctx = {};
    if (def.needsParts) ctx.parts = await stockParts();
    // مهام على أكتر من خطوة (زي الفاتورة: قراية دقيقة الأول وبعدين ربط بالمخزن) — كل خطوة بتتحسب لوحدها
    if (def.run) {
      let cost = 0, models = [];
      const gen = async (o) => { const r = await generate(Object.assign({ uid, feature: def.feature }, o)); cost += r.cost; models.push(r.model); return r.data || {}; };
      const out = await def.run(d, ctx, gen, (code, msg) => new AIError(code, msg));
      return Object.assign(out, { aiModel: models.join(" + "), cost: Math.round(cost * 1e6) / 1e6 });
    }
    const b = def.build(d, ctx) || {};
    if (b.error) throw new AIError("invalid-argument", b.error);
    const r = await generate({ uid, feature: def.feature, system: def.system, prompt: b.prompt, schema: def.schema, maxOut: def.maxOut, think: def.think, media: b.media, temperature: def.temperature, strong: def.strong, hiRes: def.hiRes });
    // aiModel مش model: «model» في لوحة البيانات/الأمر بالكلام = موديل الجهاز.
    return Object.assign(def.clean(r.data || {}, b), { aiModel: r.model, cost: Math.round(r.cost * 1e6) / 1e6 });
  }

  return { config, saveConfig, diagnose, generate, task };
}

module.exports = { createAI, AIError, normalizeCfg, costOf, cairoMonth, sanitizeDiagInput, diagPrompt, sanitizeDiagOut, pickStock, diagKey, MODELS, AUTO, FEATURES };
