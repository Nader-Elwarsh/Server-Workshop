"use strict";
/* ---------------------------------------------------------------------
   مهام الذكاء الاصطناعي التانية (غير التشخيص) — كلها بتعدّي على نفس المحرك في ai.js
   (نفس التشغيل/الإيقاف لكل ميزة، نفس الحد الشهري، نفس عدّاد التكلفة).
   كل مهمة: feature (مفتاح التشغيل في الإعدادات) + perm (صلاحية مطلوبة) + system + schema
   + build(d, ctx) → { prompt, media } + clean(out, built) → النتيجة النهائية بعد التنظيف والتحقق.
   القاعدة في الكل: الموديل بيقترح، والإنسان بيراجع قبل أي حفظ — ومفيش حاجة بتتحفظ من هنا.
   --------------------------------------------------------------------- */

function str(v, max) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max); }
function txt(v, max) { return String(v == null ? "" : v).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max); }
function num(v) { v = +v; return Number.isFinite(v) ? v : 0; }
function norm(s) { return String(s || "").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[ً-ْـ]/g, "").replace(/\s+/g, " ").trim(); }
/* «1) … 2) … 3) …» في سطر واحد → كل خطوة في سطر (عشان العرض والعربي/الإنجليزي ميتلخبطوش) */
function steps(v, max) {
  let t = txt(v, max);
  if (!/\n/.test(t) && (t.match(/(^|\s)\d{1,2}[).\-]\s/g) || []).length >= 2) t = t.replace(/\s+(?=\d{1,2}[).\-]\s)/g, "\n");
  return t;
}
function arrOf(a, n, f) { return Array.isArray(a) ? a.slice(0, n).map(f).filter((x) => x !== null && x !== undefined && x !== "") : []; }
const LK = ["عالي", "متوسط", "ضعيف"];
const lk = (v) => (LK.includes(v) ? v : "متوسط");
const EG = "اكتب بالعامية المصرية البسيطة، مختصر وعملي، من غير مقدمات.";

/* يختار قيمة من قايمة الإعدادات بالظبط (أو بعد التطبيع)، وإلا "" — عشان الموديل ميخترعش نوع/ماركة/قرية. */
function pick(list, v) {
  v = str(v, 80); if (!v) return "";
  if (list.includes(v)) return v;
  const n = norm(v), hit = list.find((x) => norm(x) === n);
  return hit || "";
}
function digits(v) { return String(v || "").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/\D/g, ""); }
function egMobile(v) { let x = digits(v); if (/^20?1[0125]\d{8}$/.test(x)) x = x.replace(/^20?/, "0"); if (/^1[0125]\d{8}$/.test(x)) x = "0" + x; return /^01[0125]\d{8}$/.test(x) ? x : ""; }
function image(d) {
  const im = d && d.image;
  if (!im || typeof im !== "object") return null;
  const mime = /^image\/(jpeg|png|webp)$/.test(String(im.mime || "")) ? im.mime : "";
  const data = String(im.data || "");
  if (!mime || !/^[A-Za-z0-9+/=]+$/.test(data) || data.length < 200 || data.length > 2200000) return null;
  return { mimeType: mime, data };
}
/* أكتر من صورة (صفحات فاتورة/كتالوج): كل صورة لحد ~3.5 ميجا، والمجموع تحت حد الطلب */
function images(d, max, total) {
  const list = Array.isArray(d && d.images) ? d.images : d && d.image ? [d.image] : [];
  const out = []; let sum = 0;
  list.slice(0, max || 4).forEach((im) => {
    if (!im || typeof im !== "object") return;
    const mime = /^image\/(jpeg|png|webp)$/.test(String(im.mime || "")) ? im.mime : "", data = String(im.data || "");
    if (!mime || !/^[A-Za-z0-9+/=]+$/.test(data) || data.length < 200 || data.length > 4800000 || sum + data.length > (total || 14000000)) return;
    sum += data.length; out.push({ mimeType: mime, data });
  });
  return out;
}
/* ملف PDF (كتالوج/كتاب): Gemini بيقراه مباشرة — لحد ~13.5 ميجا عشان الطلب كله يفضل تحت 20 ميجا */
function pdfOf(d) {
  const p = d && d.pdf; if (!p || typeof p !== "object") return null;
  const data = String(p.data || "");
  if (!/^[A-Za-z0-9+/=]+$/.test(data) || data.length < 400 || data.length > 18500000 || data.slice(0, 6) !== "JVBERi") return null;
  return { mimeType: "application/pdf", data };
}
/* تسجيل مكالمة: الصيغ اللي Gemini بيفهمها، ولحد 12 ميجا (الطلب كله لازم يبقى أقل من 20 ميجا بعد التحويل لـ base64) */
const AUDIO_MIME = ["audio/aac", "audio/flac", "audio/mp3", "audio/m4a", "audio/mpeg", "audio/mpga", "audio/mp4", "audio/opus", "audio/pcm", "audio/wav", "audio/webm", "audio/ogg"];
function audio(d) {
  const a = d && d.audio;
  if (!a || typeof a !== "object") return null;
  const mime = AUDIO_MIME.includes(String(a.mime || "")) ? a.mime : "";
  const data = String(a.data || "");
  if (!mime || !/^[A-Za-z0-9+/=]+$/.test(data) || data.length < 1000 || data.length > 16500000) return null;
  return { mimeType: mime, data };
}
/* قايمة المخزن بأكواد قصيرة (S1، S2…) — الموديل بيرد بالكود والسيرفر بيرجّعه للصنف الحقيقي. */
function stockList(parts, max) {
  return (parts || []).filter((p) => p && p.name && !p.archived).slice(0, max || 1500)
    .map((p, i) => ({ code: "S" + (i + 1), id: String(p.id), name: str(p.name, 80), cat: str(p.category, 40), qty: num(p.qty), buy: num(p.buy) }));
}
function stockText(list) { return list.map((p) => p.code + ": " + p.name + (p.cat ? " [" + p.cat + "]" : "")).join("\n"); }
function byCode(list) { const m = new Map(); list.forEach((p) => m.set(p.code, p)); return m; }

/* قوايم الإعدادات (أنواع/تصنيفات/ماركات/مراكز/قرى) — الموديل لازم يختار منها بالظبط */
function listsPrompt(lists) {
  const L = lists || {}, types = arrOf(L.types, 60, (x) => str(x, 60)), brands = arrOf(L.brands, 250, (x) => str(x, 60)), centers = arrOf(L.centers, 80, (x) => str(x, 60));
  const cats = {}, vills = {};
  types.forEach((t) => { cats[t] = arrOf((L.categories || {})[t], 40, (x) => str(x, 60)); });
  centers.forEach((c) => { vills[c] = arrOf((L.villages || {})[c], 150, (x) => str(x, 60)); });
  const P = ["أنواع الأجهزة والتصنيفات:"];
  types.forEach((t) => P.push("- " + t + (cats[t].length ? ": " + cats[t].join("، ") : "")));
  if (brands.length) P.push("", "الماركات: " + brands.join("، "));
  if (centers.length) { P.push("", "المراكز والقرى:"); centers.forEach((c) => P.push("- " + c + (vills[c].length ? ": " + vills[c].join("، ") : ""))); }
  return { prompt: P.join("\n"), types, brands, centers, cats, vills };
}

const TASKS = {
  /* ---------------- 🧯 أكواد الأعطال ---------------- */
  codeLookup: {
    feature: "codes", perm: "faultcodes.view", think: true, maxOut: 2048,
    system: [
      "إنت خبير أكواد أعطال الأجهزة المنزلية (غسالات، تلاجات، تكييفات، سخانات، ديش واشر، ميكروويف…) بكل الماركات المنتشرة في مصر.",
      "المطلوب: معنى كود العطل ده لنفس نوع الجهاز والماركة، والسبب المحتمل، وخطوات الفحص/الحل للفني.",
      "مهم جدًا: معنى الكود بيختلف من ماركة لماركة ومن موديل لموديل. لو مش متأكد إن ده معناه للماركة دي بالذات: recognized=false، confidence «ضعيف»، واكتب في note إن ده معنى شائع ومحتاج تأكيد من كتالوج الخدمة أو اللوحة اللي جوه الغطا.",
      "متخترعش. لو الكود مش معروف خالص، title=\"كود غير معروف\" واقترح في fix إزاي الفني يعرف معناه (كتالوج الخدمة، الملصق جوه الجهاز، وضع الاختبار).",
      "title: وصف قصير جدًا (أقل من 8 كلمات). cause: الأسباب المحتملة مترتبة. fix: خطوات فحص مرقمة كل خطوة في سطر.",
      EG
    ].join("\n"),
    schema: { type: "OBJECT", properties: { recognized: { type: "BOOLEAN" }, confidence: { type: "STRING", enum: LK }, title: { type: "STRING" }, cause: { type: "STRING" }, fix: { type: "STRING" }, note: { type: "STRING" } }, required: ["recognized", "confidence", "title", "cause", "fix", "note"] },
    build(d) {
      const code = str(d.code, 20); if (!code) return { error: "no_code" };
      const known = arrOf(d.known, 30, (k) => (k && k.code ? str(k.code, 20) + ": " + str(k.title, 80) : null));
      const L = ["الكود: " + code, "نوع الجهاز: " + (str(d.deviceType, 60) || "غير محدد") + (d.category ? " — " + str(d.category, 60) : ""), "الماركة: " + (str(d.brand, 60) || "غير محددة") + (d.model ? " — موديل " + str(d.model, 60) : "")];
      if (d.symptom) L.push("الفني شايف/مكتوب: " + str(d.symptom, 200));
      if (known.length) L.push("", "أكواد تانية متسجلة عندنا لنفس الماركة/النوع (للاسترشاد بنظام الترقيم):", known.join("\n"));
      return { prompt: L.join("\n") };
    },
    clean(o) { return { recognized: !!o.recognized, confidence: lk(o.confidence), title: str(o.title, 120), cause: txt(o.cause, 800), fix: txt(o.fix, 1200), note: txt(o.note, 400) }; }
  },
  codeFill: {
    feature: "codes", perm: "faultcodes.edit", think: true, maxOut: 6000,
    system: [
      "إنت خبير أكواد أعطال الأجهزة المنزلية. عندك أكواد متسجلة ناقصها السبب أو الحل.",
      "لكل كود: اكتب cause (الأسباب المحتملة) و fix (خطوات فحص مرقمة كل خطوة في سطر) مبنية على العنوان المكتوب ونوع الجهاز والماركة.",
      "لو العنوان مش كفاية أو مش متأكد: confidence «ضعيف» وخلي الكلام عام وآمن. متغيرش معنى العنوان. رجّع نفس id زي ما هو.",
      EG
    ].join("\n"),
    schema: { type: "OBJECT", properties: { items: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, cause: { type: "STRING" }, fix: { type: "STRING" }, confidence: { type: "STRING", enum: LK } }, required: ["id", "cause", "fix", "confidence"] } } }, required: ["items"] },
    build(d) {
      const items = arrOf(d.items, 10, (x) => (x && x.id && x.code ? { id: str(x.id, 60), code: str(x.code, 20), title: str(x.title, 120), deviceType: str(x.deviceType, 60), brand: str(x.brand, 60), cause: str(x.cause, 200), fix: str(x.fix, 200) } : null));
      if (!items.length) return { error: "no_items" };
      return { prompt: items.map((x) => "id=" + x.id + " | الكود " + x.code + " | " + (x.deviceType || "كل الأنواع") + " | " + (x.brand || "كل الماركات") + " | العنوان: " + (x.title || "—") + (x.cause ? " | السبب الحالي: " + x.cause : "") + (x.fix ? " | الحل الحالي: " + x.fix : "")).join("\n"), ids: new Set(items.map((x) => x.id)) };
    },
    clean(o, b) { return { items: arrOf(o.items, 10, (x) => (x && b.ids.has(String(x.id)) ? { id: String(x.id), cause: txt(x.cause, 800), fix: txt(x.fix, 1200), confidence: lk(x.confidence) } : null)) }; }
  },
  codePhoto: {
    feature: "codes", perm: "faultcodes.view", think: false, maxOut: 1024, temperature: 0.1,
    system: [
      "الصورة لشاشة أو لوحة جهاز منزلي (غسالة، تكييف، سخان…). اقرا كود العطل الظاهر بالظبط (زي E1، F05، OE، dE، 4C، H2، LE…).",
      "لو الشاشة بتعرض أكتر من حاجة، رتّب الأكواد من الأوضح. لو مفيش كود واضح، codes فاضية واشرح في note إيه اللي باين (لمبات بتنور، أرقام وقت…).",
      "deviceType و brand: لو باينين من الصورة (اللوجو أو شكل الجهاز) وإلا \"\". متخمنش.",
      EG
    ].join("\n"),
    schema: { type: "OBJECT", properties: { codes: { type: "ARRAY", items: { type: "STRING" } }, screenText: { type: "STRING" }, deviceType: { type: "STRING" }, brand: { type: "STRING" }, note: { type: "STRING" } }, required: ["codes", "screenText", "deviceType", "brand", "note"] },
    build(d) {
      const im = image(d); if (!im) return { error: "bad_image" };
      const types = arrOf(d.types, 60, (x) => str(x, 60)), brands = arrOf(d.brands, 200, (x) => str(x, 60));
      return { prompt: "اقرا كود العطل من الصورة." + (types.length ? "\nأنواع الأجهزة عندنا: " + types.join("، ") : "") + (brands.length ? "\nالماركات عندنا: " + brands.join("، ") : ""), media: [im], types, brands };
    },
    clean(o, b) {
      return { codes: arrOf(o.codes, 4, (c) => str(c, 12).replace(/\s+/g, "").toUpperCase() || null), screenText: str(o.screenText, 200), deviceType: pick(b.types, o.deviceType), brand: pick(b.brands, o.brand), note: str(o.note, 300) };
    }
  },

  /* صفحة كتالوج/كتاب/جدول أكواد → أكواد منظمة بنفس شكل دليل الأكواد في النظام */
  codesBook: {
    feature: "codes", perm: "faultcodes.add", think: 8192, maxOut: 32000, temperature: 0, strong: true, hiRes: true,
    system: [
      "إنت مهندس صيانة أجهزة منزلية خبير، وبتحوّل كتالوجات الخدمة (Service manual) والكتب وجداول الأكواد لدليل منظم لورشة في مصر، فيه قسمين منفصلين:",
      "",
      "(1) codes = أكواد الأعطال: كود بيظهر على الشاشة أو بلمبات (E1، E-01، F05، 4C، dE، LE1، OE، IE، UE، tE، H2، «لمبة X بترمش 3 مرات»…).",
      "   - code: زي ما هو بالظبط. title: وصف قصير جدًا بالعامية (أقل من 8 كلمات، ترجم لو إنجليزي). cause: الأسباب (كل سبب في سطر). fix: خطوات الفحص/الحل مرقمة كل خطوة في سطر.",
      "   - causeFromPage/fixFromPage: true لو الكلام ده مكتوب في المصدر، false لو من خبرتك (مسموح بس لو المطلوب «كمّل الناقص»). note: موديلات معينة/شرط ظهور/رقم قطعة، وإلا \"\". unsure: لو مش مقروء كويس.",
      "",
      "(2) testModes = التيست مود / وضع الخدمة / الاختبار الذاتي / Self diagnosis / Service mode / Quick test / Factory test: أي طريقة للدخول في وضع اختبار للجهاز.",
      "   - كل إجراء ليه طريقة دخول مختلفة = عنصر لوحده. الموديل الواحد غالبًا ليه كذا إجراء (تيست مود المهندس، اختبار المراحل c0…c7، تيست مود أعطال الموتور، اختبار حساس MEMS، اختبار زمن الفرامل والمروحة d0…d8…) — طلّعهم كلهم ومتدمجش اتنين في واحد ومتسيبش واحد.",
      "   - title: اسم واضح فيه الماركة والسلسلة ونوع الاختبار (مثال: «شارب ES-TD — تيست مود أعطال الموتور E7»). models: الموديلات/السلسلة.",
      "   - enter: طريقة الدخول خطوة خطوة (الأزرار وبأي ترتيب، الضغط باستمرار ولا مرة، الانتظار، وإيه اللي بيظهر على الشاشة زي U-XX أو c0 أو bt)، كل خطوة في سطر لوحده يبدأ برقم.",
      "   - tests: لو فيه جدول (الزر / شاشة العرض / الجزء المختبر) اكتب كل صفوفه كلها من غير اختصار (بصياغتك بالعامية — مش نسخ حرفي للنص — بس الأزرار والأكواد والأرقام زي ما هي)، كل صف في سطر لوحده بالشكل: «رقم) الزر ← بيظهر: الكود ← بيختبر: الجزء» (مثال: «3) Delay Start ← بيظهر: dP ← طلمبة الصرف»). الصفوف اللي بتوقّف الموتور أو بتنوّر ليدات البرامج اكتبها هي كمان. لو مراحل (c3 ← مرحلة الوزن) نفس الفكرة. ممنوع تلخّص الجدول في جملة.",
      "   - exit: إزاي تخرج. note: تحذيرات أو ملاحظات. unsure: لو مش واضح.",
      "   - متحطش التيست مود جوه الأكواد ولا العكس. لو جدول أكواد بيظهر جوه التيست مود (أكواد خاصة بالاختبار)، الأكواد تروح في codes والطريقة في testModes.",
      "",
      "",
      "(3) الماركة والتصنيف لكل عنصر لوحده — مهم جدًا: الكتب الكبيرة (زي كتب مجموعة العربي) بتجمع كذا ماركة وكذا سلسلة (شارب، توشيبا، تورنيدو… تحميل علوي/أمامي، DDM، موديلات معينة).",
      "   لكل كود ولكل تيست مود: brands = الماركات اللي بينطبق عليها بالظبط من قايمة الماركات (لو الجدول لـ «توشيبا وتورنيدو» اكتب الاتنين)، brandsRaw = ماركات مكتوبة ومش في القايمة، category = التصنيف من قايمة التصنيفات للنوع ده (أمامي/علوي…) لو واضح، models = السلسلة أو الموديلات (ES-TN، TWT-TLD، AEW-8460…).",
      "   خد الماركة من عنوان الجدول أو القسم أو الصفحة اللي فيها الكود. لو الجدول مش مكتوب لمين فعلًا سيب brands فاضية.",
      "   code = الكود نفسه بس (E01، OE، E7-1) — متضيفش جنبه «(Front Load)» أو اسم ماركة أو أكواد تانية بين قوسين؛ لو الكود ليه أشكال تانية (E21، E23) اكتبها في alsoShows. نفس الكود لماركتين/سلسلتين مختلفين بمعنى مختلف = عنصرين منفصلين.",
      "",
      "(4) sections: قبل ما تكتب أي عنصر، اكتب فهرس بكل عناوين جداول الأكواد وكل إجراءات الاختبار اللي شفتها في المصدر (العنوان زي ما هو + رقم الصفحة لو باين) — وبعدين تأكد إن كل عنوان منهم طلّعته.",
      "",
      "قواعد: اقرا كل المصدر ومتسيبش كود أو طريقة. متنقلش فقرات حرفيًا من الكتاب — أعد الصياغة بكلامك. كل الكلام بالعامية المصرية الواضحة للفني (ترجم الإنجليزي) والأكواد وأسماء الأزرار زي ما هي (Start/Pause، Temp، Spin…).",
      "deviceType و brand للمصدر كله: اختار من القوايم بالظبط لو باينين، وإلا \"\". model: الموديلات اللي المصدر بيتكلم عنها.",
      "لو الأكواد كتير جدًا (أكتر من 180) طلّع أول 180 وقول في unclear لحد صفحة كام وصلت عشان صاحب الورشة يكمّل الباقي. متخترعش حاجة مش موجودة في المصدر. لو جزء مقطوع أو مش مقروء قول ده في unclear."
    ].join("\n"),
    schema: { type: "OBJECT", properties: { deviceType: { type: "STRING" }, brand: { type: "STRING" }, model: { type: "STRING" }, codes: { type: "ARRAY", items: { type: "OBJECT", properties: { code: { type: "STRING" }, alsoShows: { type: "STRING" }, brands: { type: "ARRAY", items: { type: "STRING" } }, brandsRaw: { type: "ARRAY", items: { type: "STRING" } }, category: { type: "STRING" }, models: { type: "STRING" }, title: { type: "STRING" }, cause: { type: "STRING" }, fix: { type: "STRING" }, causeFromPage: { type: "BOOLEAN" }, fixFromPage: { type: "BOOLEAN" }, note: { type: "STRING" }, unsure: { type: "BOOLEAN" } }, required: ["code", "alsoShows", "brands", "brandsRaw", "category", "models", "title", "cause", "fix", "causeFromPage", "fixFromPage", "note", "unsure"] } }, sections: { type: "ARRAY", items: { type: "STRING" } }, testModes: { type: "ARRAY", items: { type: "OBJECT", properties: { title: { type: "STRING" }, brands: { type: "ARRAY", items: { type: "STRING" } }, brandsRaw: { type: "ARRAY", items: { type: "STRING" } }, category: { type: "STRING" }, models: { type: "STRING" }, enter: { type: "STRING" }, tests: { type: "STRING" }, exit: { type: "STRING" }, note: { type: "STRING" }, unsure: { type: "BOOLEAN" } }, required: ["title", "brands", "brandsRaw", "category", "models", "enter", "tests", "exit", "note", "unsure"] } }, unclear: { type: "STRING" } }, required: ["deviceType", "brand", "model", "sections", "codes", "testModes", "unclear"], propertyOrdering: ["deviceType", "brand", "model", "sections", "codes", "testModes", "unclear"] },
    build(d) {
      const imgs = images(d, 4, 14000000), pdf = pdfOf(d);
      if (!imgs.length && !pdf) return { error: "bad_image" };
      const types = arrOf(d.types, 60, (x) => str(x, 60)), brands = arrOf(d.brands, 250, (x) => str(x, 60)), cats = {};
      types.forEach((t) => { cats[t] = arrOf((d.categories || {})[t], 40, (x) => str(x, 60)); });
      const from = Math.max(0, Math.round(num(d.pageFrom))), to = Math.max(0, Math.round(num(d.pageTo)));
      const P = [pdf ? "المصدر: ملف PDF (كتالوج/كتاب)." + (from || to ? " ركّز على الصفحات من " + (from || 1) + " لحد " + (to || "الآخر") + " بس (رقم الصفحة في ملف الـ PDF مش المطبوع عليها). لو جدول أو إجراء بيبدأ في الصفحات دي ويكمل بعدها كمّله للآخر، ولو بادئ قبلها متطلعهوش (هيتطلع في الجزء اللي قبله)." : " دوّر في الملف كله على جداول الأكواد وطرق التيست مود.") : "المصدر: " + (imgs.length > 1 ? imgs.length + " صور" : "صورة") + " من كتالوج/كتاب."];
      if (d.deviceType) P.push("نوع الجهاز (اختيار صاحب الورشة): " + str(d.deviceType, 60));
      if (d.brand) P.push("الماركة (اختيار صاحب الورشة): " + str(d.brand, 60));
      if (d.want === "codes") P.push("المطلوب: أكواد الأعطال بس (testModes فاضية).");
      else if (d.want === "tests") P.push("المطلوب: التيست مود بس (codes فاضية).");
      else P.push("المطلوب: الاتنين — أكواد الأعطال والتيست مود، كل واحد في مكانه.");
      P.push(d.fillMissing ? "لو السبب أو الحل لكود مش مكتوب في المصدر، كمّله من خبرتك (وعلّم fromPage=false)." : "اللي مكتوب في المصدر بس — لو السبب أو الحل مش مكتوب سيبه فاضي.");
      if (types.length) { P.push("أنواع الأجهزة والتصنيفات عندنا:"); types.forEach((t) => P.push("- " + t + (cats[t].length ? ": " + cats[t].join("، ") : ""))); }
      if (brands.length) P.push("الماركات عندنا: " + brands.join("، "));
      return { prompt: P.join("\n"), media: pdf ? [pdf] : imgs, types, brands, cats, fill: !!d.fillMissing, want: d.want, deviceType: str(d.deviceType, 60) };
    },
    clean(o, b) {
      const seen = new Set(), seenT = new Set(), dt = pick(b.types, o.deviceType) || pick(b.types, b.deviceType);
      const brandsOf = (x) => { const out = []; arrOf(x && x.brands, 8, (v) => pick(b.brands, v) || null).forEach((v) => { if (out.indexOf(v) < 0) out.push(v); }); return out; };
      const rawOf = (x) => arrOf(x && x.brandsRaw, 6, (v) => (str(v, 40) && !pick(b.brands, v) ? str(v, 40) : null));
      const catOf = (x) => (dt ? pick((b.cats || {})[dt] || [], x && x.category) : "");
      const cleanCode = (c) => str(c, 40).replace(/\s*\((front|top)\s*load\)\s*$/i, "").replace(/\s*\(.*\)\s*$/, "").trim();
      const codes = b.want === "tests" ? [] : arrOf(o.codes, 200, (c) => {
        const code = cleanCode(c && c.code); if (!code) return null;
        const brs = brandsOf(c), models = str(c.models, 120);
        const k = norm(code).replace(/[\s\-_.]/g, "") + "|" + brs.join(",") + "|" + norm(models); if (seen.has(k)) return null; seen.add(k);
        const cfp = !!c.causeFromPage, ffp = !!c.fixFromPage;
        return { code, alsoShows: str(c.alsoShows, 80), brands: brs, brandsRaw: rawOf(c), category: catOf(c), models, title: str(c.title, 120), cause: cfp || b.fill ? steps(c.cause, 800) : "", fix: ffp || b.fill ? steps(c.fix, 1200) : "", aiCause: !cfp && !!str(c.cause, 10) && b.fill, aiFix: !ffp && !!str(c.fix, 10) && b.fill, note: str(c.note, 200), unsure: !!c.unsure };
      });
      const testModes = b.want === "codes" ? [] : arrOf(o.testModes, 30, (t) => {
        const title = str(t && t.title, 140), enter = txt(t && t.enter, 2000); if (!title || !enter) return null;
        const k = norm(title); if (seenT.has(k)) return null; seenT.add(k);
        return { title, brands: brandsOf(t), brandsRaw: rawOf(t), category: catOf(t), models: str(t.models, 160), enter: steps(enter, 2000), tests: steps(t.tests, 5000), exit: steps(t.exit, 600), note: txt(t.note, 500), unsure: !!t.unsure };
      });
      return { sections: arrOf(o.sections, 80, (x) => str(x, 140) || null), deviceType: dt, brand: pick(b.brands, o.brand), brandRaw: pick(b.brands, o.brand) ? "" : str(o.brand, 60), model: str(o.model, 160), codes, testModes, unclear: txt(o.unclear, 400) };
    }
  },

  /* أكواد/تيست مود متسجلين «عام» (من استيراد قديم): يحدد الماركة والتصنيف والموديلات من العنوان والملاحظات اللي معاهم */
  codesClassify: {
    feature: "codes", perm: "faultcodes.edit", think: 2048, maxOut: 16000, temperature: 0,
    system: [
      "إنت مهندس صيانة أجهزة منزلية في مصر. عندك أكواد أعطال وطرق تيست مود اتسجلت من كتاب من غير ماركة. كل عنصر معاه العنوان والملاحظات والموديلات اللي اتكتبت ساعة الاستيراد — ومنها تقدر تعرف هو لأنهي ماركة.",
      "لكل عنصر (بنفس id): brands = الماركات من قايمة الماركات بالظبط (ممكن أكتر من واحدة لو مكتوب «شارب وتورنيدو»)، category = التصنيف من قايمة تصنيفات النوع (أمامي/علوي…) لو مكتوب أو واضح من الموديل، models = السلسلة/الموديلات، code = الكود نظيف من غير «(Front Load)» أو أي إضافات بين قوسين (للتيست مود سيبه فاضي)، confidence.",
      "استنتج بس من الكلام المكتوب (أسماء الماركات، بادئات الموديلات المعروفة: ES- و ES-TN و ES-FP = شارب، TWT/TWE/TWFL = تورنيدو، AEW/AW = توشيبا…). لو مفيش دليل سيب brands فاضية و confidence «ضعيف». متخترعش."
    ].join("\n"),
    schema: { type: "OBJECT", properties: { items: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, brands: { type: "ARRAY", items: { type: "STRING" } }, category: { type: "STRING" }, models: { type: "STRING" }, code: { type: "STRING" }, confidence: { type: "STRING", enum: LK }, why: { type: "STRING" } }, required: ["id", "brands", "category", "models", "code", "confidence", "why"] } } }, required: ["items"] },
    build(d) {
      const items = arrOf(d.items, 120, (x) => (x && x.id ? { id: str(x.id, 60), kind: x.kind === "test" ? "test" : "code", code: str(x.code, 40), title: str(x.title, 140), model: str(x.model, 160), note: str(String(x.note || "").replace(/📚[^\n]*/g, ""), 220), deviceType: str(x.deviceType, 60) } : null));
      if (!items.length) return { error: "no_items" };
      const types = arrOf(d.types, 60, (x) => str(x, 60)), brands = arrOf(d.brands, 250, (x) => str(x, 60)), cats = {};
      types.forEach((t) => { cats[t] = arrOf((d.categories || {})[t], 40, (x) => str(x, 60)); });
      const P = ["الماركات: " + brands.join("، "), "الأنواع والتصنيفات:"];
      types.forEach((t) => P.push("- " + t + (cats[t].length ? ": " + cats[t].join("، ") : "")));
      P.push("", "العناصر:");
      items.forEach((x) => P.push("id=" + x.id + " | " + (x.kind === "test" ? "تيست مود: " + x.title : "كود " + x.code + ": " + x.title) + (x.deviceType ? " | النوع: " + x.deviceType : "") + (x.model ? " | موديلات: " + x.model : "") + (x.note ? " | ملاحظة: " + x.note : "")));
      return { prompt: P.join("\n"), items, brands, cats };
    },
    clean(o, b) {
      const by = new Map(b.items.map((x) => [x.id, x]));
      return { items: arrOf(o.items, 120, (r) => {
        const it = r && by.get(String(r.id)); if (!it) return null;
        const brs = []; arrOf(r.brands, 8, (v) => pick(b.brands, v) || null).forEach((v) => { if (brs.indexOf(v) < 0) brs.push(v); });
        const code = it.kind === "test" ? "" : str(r.code, 40).replace(/\s*\(.*\)\s*$/, "").trim();
        return { id: it.id, brands: brs, category: it.deviceType ? pick((b.cats || {})[it.deviceType] || [], r.category) : "", models: str(r.models, 160), code: code && code !== it.code ? code : "", confidence: lk(r.confidence), why: str(r.why, 160) };
      }) };
    }
  },

  /* ---------------- 💬 رسالة للعميل ---------------- */
  message: {
    feature: "msg", perm: "requests.view", think: false, maxOut: 1024, temperature: 0.6,
    system: [
      "إنت مسؤول خدمة عملاء في ورشة صيانة أجهزة منزلية في مصر، بتكتب رسالة واتساب للعميل.",
      "الرسالة: مهذبة ودودة ومحترمة، بالعامية المصرية الراقية، قصيرة (3 لـ 6 سطور)، إيموجي واحد أو اتنين بالكتير.",
      "استخدم الخانات دي بالظبط زي ما هي بين {} بدل البيانات الحقيقية (هتتملي لوحدها): {اسم_العميل} {اسم_الجهاز} {رقم_الأمر} {الإجمالي} {المتبقي} {اسم_الورشة} {التوقيع} {الضمان_لحد} {رابط_البوابة}.",
      "متخترعش أرقام أو مواعيد أو أسعار أو وعود مش مكتوبة في التفاصيل. لو محتاج معلومة مش موجودة سيبها عامة.",
      "ابدأ بتحية باسم العميل، واختم بـ {اسم_الورشة} أو {التوقيع}."
    ].join("\n"),
    schema: { type: "OBJECT", properties: { text: { type: "STRING" } }, required: ["text"] },
    KINDS: { price: "إبلاغ بتكلفة الإصلاح المتوقعة وطلب موافقته", delay: "اعتذار عن تأخير وطمأنة إننا شغالين عليه", ready: "الجهاز جاهز / الإصلاح خلص", visit: "تأكيد موعد زيارة الفني", pay: "تذكير لطيف بالمبلغ المتبقي", follow: "متابعة بعد الإصلاح: الجهاز شغال كويس؟", parts: "انتظار قطعة غيار وهنبلغه أول ما توصل", maint: "تذكير بصيانة دورية ونصايح للحفاظ على الجهاز", custom: "رسالة حسب طلب الورشة" },
    build(d) {
      const kind = this.KINDS[d.kind] ? d.kind : "custom", o = d.order || {};
      const L = ["نوع الرسالة: " + this.KINDS[kind]];
      if (d.note) L.push("طلب الورشة/تفاصيل إضافية: " + str(d.note, 300));
      L.push("", "تفاصيل الأمر (للفهم بس):");
      [["نوع الجهاز", o.deviceType], ["الحالة", o.status], ["العطل", o.fault], ["اللي اتعمل", o.work], ["مكان التنفيذ", o.place], ["موعد الزيارة", o.visit], ["أيام الضمان", o.warrantyDays], ["فيه مبلغ متبقي", o.hasRemain ? "أيوه" : "لأ"], ["فيه قطع مستنياها", o.partsWaiting ? "أيوه" : ""]].forEach((x) => { const v = str(x[1], 200); if (v) L.push(x[0] + ": " + v); });
      return { prompt: L.join("\n") };
    },
    clean(o) { return { text: txt(o.text, 1200) }; }
  },

  /* ---------------- 🎙️ أمر شغل بالكلام ---------------- */
  orderParse: {
    feature: "voice", perm: "requests.add", think: true, maxOut: 2048, temperature: 0.1,
    system: [
      "الكلام ده اتقال/اتكتب بسرعة عن أمر صيانة جديد في ورشة أجهزة منزلية في مصر (ممكن يكون فيه أخطاء تفريغ صوتي).",
      "طلّع منه الخانات بس — متخترعش أي حاجة مش مذكورة. أي خانة مش مذكورة سيبها \"\".",
      "deviceType و category و brand و center و village: اختار من القوايم اللي معاك بالظبط (نفس الكتابة)، ولو المذكور مش في القايمة حطه في raw المقابل وسيب الأساسي فاضي.",
      "phone: رقم الموبايل أرقام بس (المصري 11 رقم بيبدأ بـ 01). لو الرقم اتقال بالكلام حوّله لأرقام.",
      "fault: وصف العطل زي ما العميل قاله بصياغة واضحة. visit: موعد الزيارة لو اتقال بالكلام زي ما هو (بكرة الساعة 5).",
      "missing: الحاجات المهمة اللي ناقصة (الاسم، التليفون، الجهاز، العطل، العنوان)."
    ].join("\n"),
    schema: { type: "OBJECT", properties: { customerName: { type: "STRING" }, phone: { type: "STRING" }, center: { type: "STRING" }, centerRaw: { type: "STRING" }, village: { type: "STRING" }, villageRaw: { type: "STRING" }, street: { type: "STRING" }, deviceType: { type: "STRING" }, deviceTypeRaw: { type: "STRING" }, category: { type: "STRING" }, brand: { type: "STRING" }, brandRaw: { type: "STRING" }, model: { type: "STRING" }, fault: { type: "STRING" }, visit: { type: "STRING" }, notes: { type: "STRING" }, missing: { type: "ARRAY", items: { type: "STRING" } } }, required: ["customerName", "phone", "center", "village", "street", "deviceType", "category", "brand", "model", "fault", "visit", "notes", "missing"] },
    build(d) {
      const text = txt(d.text, 2000); if (text.length < 4) return { error: "no_text" };
      const b = listsPrompt(d.lists); b.prompt = "الكلام:\n" + text + "\n\n" + b.prompt; return b;
    },
    clean(o, b) {
      const deviceType = pick(b.types, o.deviceType), center = pick(b.centers, o.center);
      return {
        customerName: str(o.customerName, 80), phone: egMobile(o.phone), phoneRaw: str(o.phone, 30),
        center, centerRaw: center ? "" : str(o.centerRaw || o.center, 60),
        village: center ? pick(b.vills[center] || [], o.village) : "", villageRaw: str(o.villageRaw || o.village, 60),
        street: str(o.street, 120),
        deviceType, deviceTypeRaw: deviceType ? "" : str(o.deviceTypeRaw || o.deviceType, 60),
        category: deviceType ? pick(b.cats[deviceType] || [], o.category) : "",
        brand: pick(b.brands, o.brand), brandRaw: pick(b.brands, o.brand) ? "" : str(o.brandRaw || o.brand, 60),
        model: str(o.model, 60), fault: str(o.fault, 400), visit: str(o.visit, 80), notes: str(o.notes, 300),
        missing: arrOf(o.missing, 6, (x) => str(x, 40))
      };
    }
  },

  /* ---------------- 📞 تسجيل مكالمة مع العميل ---------------- */
  callParse: {
    feature: "voice", perm: "requests.add", think: 4096, maxOut: 12000, temperature: 0.1, strong: true,
    system: [
      "ده تسجيل مكالمة تليفون بين ورشة صيانة أجهزة منزلية في مصر وعميل (بالعامية المصرية — ممكن صعيدي أو فلاحي أو إسكندراني — وممكن يبقى فيه دوشة أو كلام متداخل).",
      "الأول: اسمع المكالمة كلها كويس واكتب transcript: الكلام بالترتيب، كل مقطع مع مين اللي بيتكلم (الورشة / العميل)، بالعامية زي ما اتقال. ده هيساعدك تفهم صح — متطلّعش البيانات قبل ما تكتب المكالمة كلها.",
      "قاموس للمساعدة: «الديب» = ديب فريزر، «التلاجة مش بتسقّع/مش بتتلج» = تبريد، «بتفصل/بتطفي لوحدها»، «بتهرّب/بتسرّب/بتنقّط مية»، «بتخبّط/بتزوّم/صوتها عالي»، «مش بتصفّي/مش بتعصر»، «السخان بيطفي/مش بيولّع»، «التكييف بيخر مية/بيطلع هوا سخن»، «الكومبروسر/الموتور»، «الكارتة/البوردة» = لوحة التحكم، «فوق/علوي» و«قدّام/أمامي» = نوع الغسالة.",
      "لو العميل قال رقم التليفون بالكلام (زيرو واحد واحد…) حوّله لأرقام وراجع إنه 11 رقم. لو اتقال مرتين خد الأوضح.",
      "اسمع المكالمة كلها وطلّع بيانات أمر الصيانة: اسم العميل، رقم التليفون لو اتقال، العنوان (المركز/القرية/الشارع أو علامة مميزة)، نوع الجهاز وتصنيفه وماركته وموديله، ووصف العطل زي ما العميل وصفه.",
      "متخترعش أي حاجة مش مقولة في المكالمة. أي خانة مش مذكورة سيبها \"\". اسم الورشة أو الفني مش اسم العميل.",
      "deviceType و category و brand و center و village: اختار من القوايم اللي معاك بالظبط (نفس الكتابة)، ولو المذكور مش في القايمة حطه في raw المقابل وسيب الأساسي فاضي.",
      "phone: أرقام بس (المصري 11 رقم بيبدأ بـ 01). لو الرقم اتقال بالكلام حوّله لأرقام. لو الرقم مكتوب في اسم الملف ومتقالش في المكالمة استخدمه.",
      "fault: وصف العطل بصياغة واضحة للفني (الأعراض، من إمتى، بيحصل إمتى). visit: الموعد اللي اتفقوا عليه لو فيه. ",
      "summary: ملخص المكالمة في 2 لـ 4 سطور قصيرة: العطل، اللي اتفقوا عليه (موعد، سعر معاينة أو تكلفة اتقالت، حاجة العميل طلبها). price: أي مبلغ اتقال بالجنيه زي ما اتقال، وإلا \"\".",
      "missing: البيانات المهمة اللي ماتقالتش (الاسم، التليفون، العنوان، الجهاز، الماركة، العطل). heard=false لو التسجيل مش مسموع أو مش مكالمة صيانة."
    ].join("\n"),
    schema: { type: "OBJECT", properties: { transcript: { type: "ARRAY", items: { type: "OBJECT", properties: { who: { type: "STRING", enum: ["الورشة", "العميل", "غير واضح"] }, text: { type: "STRING" } }, required: ["who", "text"] } }, heard: { type: "BOOLEAN" }, customerName: { type: "STRING" }, phone: { type: "STRING" }, center: { type: "STRING" }, centerRaw: { type: "STRING" }, village: { type: "STRING" }, villageRaw: { type: "STRING" }, street: { type: "STRING" }, deviceType: { type: "STRING" }, deviceTypeRaw: { type: "STRING" }, category: { type: "STRING" }, brand: { type: "STRING" }, brandRaw: { type: "STRING" }, model: { type: "STRING" }, fault: { type: "STRING" }, visit: { type: "STRING" }, price: { type: "STRING" }, summary: { type: "STRING" }, notes: { type: "STRING" }, missing: { type: "ARRAY", items: { type: "STRING" } } }, required: ["transcript", "heard", "customerName", "phone", "center", "village", "street", "deviceType", "category", "brand", "model", "fault", "visit", "price", "summary", "notes", "missing"], propertyOrdering: ["transcript", "heard", "customerName", "phone", "center", "centerRaw", "village", "villageRaw", "street", "deviceType", "deviceTypeRaw", "category", "brand", "brandRaw", "model", "fault", "visit", "price", "summary", "notes", "missing"] },
    build(d) {
      const au = audio(d); if (!au) return { error: "bad_audio" };
      const b = listsPrompt(d.lists), hint = str(d.hint, 200);
      b.prompt = "اسمع المكالمة المرفقة." + (hint ? "\nاسم الملف/بيانات المشاركة: " + hint : "") + "\n\n" + b.prompt;
      b.media = [au];
      return b;
    },
    clean(o, b) { return Object.assign(TASKS.orderParse.clean(o, b), { heard: o.heard !== false, summary: txt(o.summary, 600), price: str(o.price, 60), transcript: arrOf(o.transcript, 80, (t) => (t && str(t.text, 400) ? { who: ["الورشة", "العميل"].includes(t.who) ? t.who : "غير واضح", text: str(t.text, 400) } : null)) }); }
  },

  /* ---------------- 🏷️ لوحة بيانات الجهاز ---------------- */
  plate: {
    feature: "plate", perm: "devices.add", think: false, maxOut: 1024, temperature: 0.1,
    system: [
      "الصورة لملصق/لوحة بيانات جهاز منزلي (Rating plate). اقرا البيانات المكتوبة بالظبط زي ما هي.",
      "brand و type: اختار من القوايم بالظبط لو موجودين، وإلا اكتب المقروء في brandRaw/typeRaw. model: رقم الموديل زي ما هو (Model / Type / MOD). serial: رقم المسلسل (S/N).",
      "specs: سطر واحد فيه أهم المواصفات المقروءة (القدرة/الواط، الجهد، السعة كيلو/لتر/حصان، نوع الفريون والكمية، التيار) — المقروء بس.",
      "لو الصورة مش واضحة أو مش لوحة بيانات: readable=false وقول السبب في note. متخمنش أرقام."
    ].join("\n"),
    schema: { type: "OBJECT", properties: { readable: { type: "BOOLEAN" }, type: { type: "STRING" }, typeRaw: { type: "STRING" }, category: { type: "STRING" }, brand: { type: "STRING" }, brandRaw: { type: "STRING" }, model: { type: "STRING" }, serial: { type: "STRING" }, specs: { type: "STRING" }, note: { type: "STRING" } }, required: ["readable", "type", "brand", "model", "serial", "specs", "note"] },
    build(d) {
      const im = image(d); if (!im) return { error: "bad_image" };
      const L = d.lists || {}, types = arrOf(L.types, 60, (x) => str(x, 60)), brands = arrOf(L.brands, 250, (x) => str(x, 60)), cats = {};
      types.forEach((t) => { cats[t] = arrOf((L.categories || {})[t], 40, (x) => str(x, 60)); });
      const P = ["اقرا لوحة البيانات.", "أنواع الأجهزة والتصنيفات:"]; types.forEach((t) => P.push("- " + t + (cats[t].length ? ": " + cats[t].join("، ") : "")));
      if (brands.length) P.push("الماركات: " + brands.join("، "));
      return { prompt: P.join("\n"), media: [im], types, brands, cats };
    },
    clean(o, b) {
      const type = pick(b.types, o.type), brand = pick(b.brands, o.brand);
      return { readable: o.readable !== false, type, typeRaw: type ? "" : str(o.typeRaw || o.type, 60), category: type ? pick(b.cats[type] || [], o.category) : "", brand, brandRaw: brand ? "" : str(o.brandRaw || o.brand, 60), model: str(o.model, 60), serial: str(o.serial, 60), specs: str(o.specs, 250), note: str(o.note, 250) };
    }
  },

  /* ---------------- 🧾 فاتورة المورد ---------------- */
  invoice: {
    feature: "invoice", perm: "inventory.add", needsParts: true,
    /* خطوة 1: قراية الفاتورة بس (موديل قوي + دقة صورة عالية + تفكير كتير) — من غير قايمة المخزن عشان متشتتوش.
       خطوة 2: ربط كل سطر بالمخزن (نص بس — رخيص) مع الربط اللي اتعلّمه النظام من مراجعاتك قبل كده. */
    READ: [
      "إنت محاسب مخزن خبير بقالك سنين بتقرا فواتير موردين قطع غيار أجهزة منزلية في مصر — مطبوعة أو بخط اليد، عربي أو إنجليزي أو مخلوط، والأرقام ممكن تبقى هندي (٠١٢٣٤٥٦٧٨٩) أو عربي (0123456789).",
      "المطلوب قراية دقيقة جدًا زي ما هو مكتوب — مش تخمين. خد وقتك وفكّر في كل سطر.",
      "",
      "الطريقة:",
      "1) حدّد شكل الفاتورة الأول واكتبه في layout: الأعمدة وترتيبها (غالبًا من اليمين: م | الصنف/البيان | العدد/الكمية | الفئة/السعر | القيمة/الإجمالي)، والوحدات المستخدمة (قطعة، دستة، علبة، كرتونة، متر، لفة).",
      "2) اقرا كل سطر أصناف بالترتيب من فوق لتحت. متدمجش سطرين ومتقسمش سطر. السطور المشطوبة بالكامل تجاهلها. لو رقم اتشطب واتكتب جنبه رقم تاني خد الجديد.",
      "3) لكل سطر:",
      "   raw = البيان زي ما هو مكتوب حرفيًا (حتى لو فيه غلط إملائي أو اختصار).",
      "   item = اسم القطعة بصياغة واضحة زي ما بتتقال في سوق قطع الغيار المصري (صحّح الإملاء والاختصارات: طلمبه/طرمبه→طلمبة، كبستور/كباستور→كابستور، ترموستات→ثرموستات، سير/سيور، مساعدين…) من غير ما تضيف معلومة مش مكتوبة.",
      "   specs = أي مقاس/قيمة/قدرة/ماركة/موديل/جهاز مكتوب في السطر (10 مايكرو، 30 وات، 1/4 حصان، LG، توشيبا، غسالة فوق).",
      "   unit و qty و unitPrice (الفئة) و lineTotal (القيمة).",
      "4) راجع الحساب في كل سطر: qty × unitPrice لازم = lineTotal. لو مش مساوية ارجع بص على الأرقام تاني — الأخطاء الشائعة: 1↔7، 4↔9، 0↔6، 3↔8، ٢↔٣، ٥(الهندي)↔0، ٦↔٤، والعلامة العشرية. لو مكتوب سعر الوحدة بس أو الإجمالي بس احسب التاني.",
      "   لو بعد المراجعة مش متطابقة: اكتب أقرب قراية، وحط اسم الحقل المشكوك فيه في unsure.",
      "5) آخر الفاتورة: subtotal (المجموع قبل الخصم)، discount، total (الصافي المطلوب). اجمع السطور وقارن بالمجموع المكتوب؛ لو مختلف دوّر على السطر الغلط وصحّحه أو علّم عليه.",
      "6) confidence لكل سطر: «عالي» لو واضح ومطابق حسابيًا، «متوسط» لو فيه حاجة اتقرت بصعوبة، «ضعيف» لو خط مش مقروء.",
      "متخترعش سطور أو أرقام. لو جزء من الصورة مقطوع أو مضلّل أو مش مقروء قول ده في unclear بالتحديد (سطر كام / عمود إيه)."
    ].join("\n"),
    READ_SCHEMA: { type: "OBJECT", properties: { layout: { type: "STRING" }, supplier: { type: "STRING" }, date: { type: "STRING" }, invoiceNo: { type: "STRING" }, lines: { type: "ARRAY", items: { type: "OBJECT", properties: { raw: { type: "STRING" }, item: { type: "STRING" }, specs: { type: "STRING" }, unit: { type: "STRING" }, qty: { type: "NUMBER" }, unitPrice: { type: "NUMBER" }, lineTotal: { type: "NUMBER" }, unsure: { type: "ARRAY", items: { type: "STRING", enum: ["item", "qty", "unitPrice", "lineTotal"] } }, confidence: { type: "STRING", enum: LK } }, required: ["raw", "item", "specs", "unit", "qty", "unitPrice", "lineTotal", "unsure", "confidence"] } }, subtotal: { type: "NUMBER" }, discount: { type: "NUMBER" }, total: { type: "NUMBER" }, unclear: { type: "STRING" } }, required: ["layout", "supplier", "date", "invoiceNo", "lines", "subtotal", "discount", "total", "unclear"] },
    MATCH: [
      "إنت أمين مخزن قطع غيار أجهزة منزلية في مصر. معاك سطور فاتورة مورد اتقرت، وقايمة أصناف المخزن بأكواد.",
      "لكل سطر (بالـ index): stock = كود الصنف في المخزن لو هو نفس القطعة فعلًا، وإلا \"\".",
      "قواعد الربط: لازم نفس نوع القطعة ونفس المواصفة المهمة (القيمة/المقاس/القدرة/الماركة/الجهاز). كابستور 10 ≠ كابستور 12، طلمبة غسالة ≠ طلمبة ديش واشر، خرطوم تكييف ≠ خرطوم غسالة. لو اسم المخزن عام ومفيهوش مواصفة والسطر نفس النوع: اربطه بثقة «متوسط».",
      "«ربط سابق اتأكد من صاحب الورشة» أهم مرجع: لو نفس الكلام (أو قريب جدًا) اتربط قبل كده بصنف، استخدمه.",
      "لو مفيش صنف مطابق: newName = اسم للصنف الجديد بنفس أسلوب كتابة الأسماء في المخزن (شوف القايمة وقلّدها)، و category من تصنيفات القطع.",
      "matchConfidence: «عالي» / «متوسط» / «ضعيف». why: سبب قصير جدًا.",
      "اكتب بالعامية المصرية."
    ].join("\n"),
    MATCH_SCHEMA: { type: "OBJECT", properties: { lines: { type: "ARRAY", items: { type: "OBJECT", properties: { index: { type: "NUMBER" }, stock: { type: "STRING" }, matchConfidence: { type: "STRING", enum: LK }, newName: { type: "STRING" }, category: { type: "STRING" }, why: { type: "STRING" } }, required: ["index", "stock", "matchConfidence", "newName", "category", "why"] } } }, required: ["lines"] },
    async run(d, ctx, gen, err) {
      const imgs = images(d, 4, 14000000);
      if (!imgs.length) throw err("invalid-argument", "bad_image");
      const r1 = await gen({ system: this.READ, schema: this.READ_SCHEMA, prompt: "اقرا الفاتورة" + (imgs.length > 1 ? " (" + imgs.length + " صور لنفس الفاتورة — ممكن تكون صفحات أو أجزاء؛ متكررش السطر اللي ظاهر في صورتين)" : "") + ".", media: imgs, think: 8192, maxOut: 12000, temperature: 0, strong: true, hiRes: true });
      const lines = arrOf(r1.lines, 80, (l) => {
        if (!l || !(str(l.raw, 160) || str(l.item, 120))) return null;
        let qty = Math.max(0, num(l.qty)), unit = Math.max(0, Math.round(num(l.unitPrice) * 100) / 100), tot = Math.max(0, Math.round(num(l.lineTotal) * 100) / 100);
        const unsure = new Set(arrOf(l.unsure, 4, (x) => (["item", "qty", "unitPrice", "lineTotal"].includes(x) ? x : null)));
        if (!unit && tot && qty) { unit = Math.round((tot / qty) * 100) / 100; }
        if (!tot && unit && qty) tot = Math.round(qty * unit * 100) / 100;
        const mathOk = !(qty && unit && tot) || Math.abs(qty * unit - tot) <= Math.max(0.5, tot * 0.005);
        if (!mathOk) { unsure.add("qty"); unsure.add("unitPrice"); unsure.add("lineTotal"); }
        if (qty && Math.round(qty) !== qty) unsure.add("qty");
        return { raw: str(l.raw, 160), item: str(l.item || l.raw, 120), specs: str(l.specs, 120), unit: str(l.unit, 20), qty: Math.max(0, Math.round(qty)), unitPrice: unit, lineTotal: tot, unsure: Array.from(unsure), mathOk, confidence: lk(l.confidence) };
      });
      const sum = Math.round(lines.reduce((a, l) => a + l.lineTotal, 0) * 100) / 100;
      const total = Math.max(0, Math.round(num(r1.total) * 100) / 100), subtotal = Math.max(0, Math.round(num(r1.subtotal) * 100) / 100), discount = Math.max(0, Math.round(num(r1.discount) * 100) / 100);
      const ref = subtotal || (total && discount ? total + discount : total);
      const out = { supplier: str(r1.supplier, 80), date: /^\d{4}-\d{2}-\d{2}$/.test(String(r1.date || "")) ? r1.date : "", invoiceNo: str(r1.invoiceNo, 40), layout: str(r1.layout, 300), subtotal, discount, total, sum, mismatch: !!(ref && Math.abs(ref - sum) > Math.max(1, ref * 0.01)), unclear: txt(r1.unclear, 400), lines };
      if (!lines.length) return out;
      // خطوة 2: الربط بالمخزن
      const stock = stockList(ctx.parts, 1500), cats = arrOf(d.partCats, 80, (x) => str(x, 40));
      const aliases = arrOf(d.aliases, 250, (a) => (a && a.text && a.part ? "- «" + str(a.text, 100) + "» ← " + str(a.part, 80) : null));
      const P = ["سطور الفاتورة:"].concat(lines.map((l, i) => i + ") " + l.item + (l.specs ? " | مواصفات: " + l.specs : "") + (l.raw && l.raw !== l.item ? " | مكتوب: " + l.raw : "") + (l.unit ? " | الوحدة: " + l.unit : "")));
      if (aliases.length) P.push("", "ربط سابق اتأكد من صاحب الورشة (كلام الفاتورة ← صنف المخزن):", aliases.join("\n"));
      P.push("", "تصنيفات القطع: " + (cats.join("، ") || "—"), "", "مخزن الورشة (الكود: الاسم [التصنيف]):", stockText(stock));
      let r2 = {};
      try { r2 = await gen({ system: this.MATCH, schema: this.MATCH_SCHEMA, prompt: P.join("\n"), think: 2048, maxOut: 8000, temperature: 0.1 }); } catch (e) { out.matchError = true; }
      const m = byCode(stock), used = new Set();
      arrOf(r2.lines, 80, (x) => x).forEach((x) => {
        const l = lines[Math.round(num(x && x.index))]; if (!l || l._m) return; l._m = 1;
        const hit = m.get(str(x.stock, 10).toUpperCase()) || null;
        l.part = hit && !used.has(hit.id) ? (used.add(hit.id), { id: hit.id, name: hit.name, qty: hit.qty, buy: hit.buy }) : null;
        l.matchConfidence = l.part ? lk(x.matchConfidence) : "";
        l.newName = l.part ? "" : str(x.newName || l.item, 80);
        l.category = pick(cats, x.category); l.why = str(x.why, 120);
      });
      lines.forEach((l) => { if (!l._m) { l.part = null; l.newName = l.item; l.category = ""; l.matchConfidence = ""; } delete l._m; });
      return out;
    }
  },

  /* ---------------- 🧹 تنظيف أسماء المخزن ---------------- */
  stockClean: {
    feature: "stock", perm: "inventory.edit", think: true, maxOut: 8000, temperature: 0.1, needsParts: true,
    system: [
      "دي قايمة أصناف مخزن قطع غيار أجهزة منزلية في مصر. المطلوب تلاقي:",
      "1) groups: أصناف متكررة = نفس القطعة بالظبط مكتوبة بأسماء مختلفة (طلمبة/طرمبة، كابستور/مكثف بنفس القيمة، اختصارات، أخطاء إملائية). مش أي قطعتين شبه بعض: لو المقاس/القيمة/الماركة/الجهاز مختلف يبقوا مختلفين (كابستور 10 ≠ كابستور 12، طلمبة غسالة ≠ طلمبة ديش واشر).",
      "   لكل مجموعة: codes (أكواد الأصناف)، keep (الكود الأنسب يفضل)، name (أحسن اسم موحد)، reason (ليه شايفهم نفس الحاجة).",
      "2) renames: أسماء مش واضحة أو فيها أخطاء أو ناقصها معلومة مهمة موجودة في التصنيف — اقترح اسم أوضح بنفس المعنى بالظبط (متضيفش مواصفات مش مكتوبة).",
      "خليك محافظ جدًا: لو مش متأكد إنهم نفس القطعة متحطهمش. لحد 40 مجموعة و40 اسم.",
      EG
    ].join("\n"),
    schema: { type: "OBJECT", properties: { groups: { type: "ARRAY", items: { type: "OBJECT", properties: { codes: { type: "ARRAY", items: { type: "STRING" } }, keep: { type: "STRING" }, name: { type: "STRING" }, reason: { type: "STRING" } }, required: ["codes", "keep", "name", "reason"] } }, renames: { type: "ARRAY", items: { type: "OBJECT", properties: { code: { type: "STRING" }, name: { type: "STRING" }, reason: { type: "STRING" } }, required: ["code", "name", "reason"] } } }, required: ["groups", "renames"] },
    build(d, ctx) {
      const stock = stockList(ctx.parts, 1500);
      if (stock.length < 2) return { error: "few_parts" };
      return { prompt: "أصناف المخزن (الكود: الاسم [التصنيف]):\n" + stockText(stock), stock };
    },
    clean(o, b) {
      const m = byCode(b.stock), seen = new Set();
      const ref = (c) => { const p = m.get(str(c, 10).toUpperCase()); return p ? { id: p.id, name: p.name, qty: p.qty, cat: p.cat } : null; };
      const groups = arrOf(o.groups, 40, (g) => {
        const items = arrOf(g && g.codes, 8, ref).filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i && !seen.has(p.id));
        if (items.length < 2) return null;
        items.forEach((p) => seen.add(p.id));
        const keep = ref(g.keep); return { items, keepId: keep && items.some((p) => p.id === keep.id) ? keep.id : items[0].id, name: str(g.name, 80), reason: str(g.reason, 200) };
      });
      const renames = arrOf(o.renames, 40, (r) => { const p = r && ref(r.code), n = str(r && r.name, 80); return p && n && norm(n) !== norm(p.name) ? { part: p, name: n, reason: str(r.reason, 200) } : null; });
      return { groups, renames };
    }
  },

  /* ---------------- 📊 ملخص الشهر ---------------- */
  monthSummary: {
    feature: "summary", perm: "reports.view", think: true, maxOut: 4096, temperature: 0.4,
    system: [
      "إنت مستشار إدارة لورشة صيانة أجهزة منزلية في مصر. معاك أرقام فترة (ومقارنتها بالفترة اللي قبلها).",
      "اكتب لصاحب الورشة: headline (جملة واحدة تلخص الفترة)، good (حاجات كويسة بالأرقام)، watch (حاجات محتاجة انتباه بالأرقام: مرتجعات فني، تأخير، مصاريف زادت، فلوس عند العملاء، قطع هتخلص، أوامر خسرانة)، actions (3 لـ 5 خطوات عملية محددة يعملها الأسبوع ده).",
      "استخدم الأرقام اللي معاك بس — متحسبش أرقام جديدة معقدة ومتخترعش. لو رقم بيقارن بالفترة اللي فاتت اذكر الاتجاه. كل بند جملة أو اتنين.",
      EG
    ].join("\n"),
    schema: { type: "OBJECT", properties: { headline: { type: "STRING" }, good: { type: "ARRAY", items: { type: "STRING" } }, watch: { type: "ARRAY", items: { type: "STRING" } }, actions: { type: "ARRAY", items: { type: "STRING" } } }, required: ["headline", "good", "watch", "actions"] },
    build(d) {
      let j = ""; try { j = JSON.stringify(d.stats || {}); } catch (e) { j = ""; }
      if (j.length < 20) return { error: "no_stats" };
      return { prompt: "الفترة: " + str(d.label, 60) + "\nالأرقام (JSON — الفلوس بالجنيه):\n" + j.slice(0, 14000) };
    },
    clean(o) { const L = (a) => arrOf(a, 6, (x) => str(x, 300)); return { headline: str(o.headline, 300), good: L(o.good), watch: L(o.watch), actions: L(o.actions) }; }
  }
};

module.exports = { TASKS, egMobile, pick, stockList, AUDIO_MIME };
