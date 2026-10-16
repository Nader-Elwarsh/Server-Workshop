/* إصلاحات المراجعة الشاملة (قسم قسم). */
const assert = require("assert"), fs = require("fs");
const read = (f) => fs.readFileSync(__dirname + "/" + f, "utf8");
// 1) أوامر الشغل
const rq = read("app-requests.js");
assert.ok(/if\(r\.status==="ملغي"\)return alert\("الأمر ملغي/.test(rq), "مفيش إضافة قطع من المخزن لأمر ملغي (كانت بتتخصم مرتين لما الأمر يرجع)");
assert.ok(/status==="ملغي"\)return alert\("الأمر ملغي — رجّع حالته «جديد» الأول وبعدين ضيف القطع\."\);const ord0=/.test(rq), "ولا قطعة من بره");
assert.ok(/canEdit&&r\.status!=="ملغي"&&window\.wfSyncMode!=="scoped"/.test(rq));
assert.strictEqual((rq.match(/\(r\.paid\?0:Math\.max\(0,Math\.round/g) || []).length, 4, "المتبقي في الإيصال وواتساب = صفر للأمر المدفوع");
assert.ok(/!canEdit\?"":`<div class="workshop-track"><h3>🏭 سحب الجهاز للورشة/.test(rq), "مفيش سحب للورشة على أمر مقفول");
assert.ok(/moves\[k\]\.type="خروج بسبب أمر شغل جديد"/.test(rq));
const del = read("app-delete-tools.js");
assert.ok(/const partsDelta=requestPartsToRestore\(\[r\]\)/.test(del), "استرجاع أمر ملغي من السلة مايخصمش قطعه من المخزن");
const en = read("workshop-mini-enhancements.js");
assert.ok(/if \(r && r\.status === "ملغي"\) return;/.test(en) && (en.match(/orders\.filter\(function \(r\) \{ return r\.status !== "ملغي"; \}\)/g) || []).length === 2, "حذف عميل/جهاز مايرجّعش قطع أمر ملغي مرتين");
const ui = read("workshop-mini-simple-ui.js");
assert.ok(/\{v:"مجمد",t:"مجمّد"\}/.test(ui) && /r\.status !== "مجمد" && !r\.closed; \/\/ المجمّد/.test(ui));
// 2) خط السير
const rt = read("app-route-followup.js");
assert.ok(/x\.status==="مجمد"\)return\{collapsed:true,cls:"route-badge-frozen"/.test(rt), "المجمّد مايبقاش «الدور عليك»");
assert.ok(/applyCloseWarranty\(r,now\)/.test(rt) && /function applyCloseWarranty\(r,now\)/.test(read("app-shared.js")), "التقفيل السريع بيسجّل الضمان");
assert.ok(/\["جديد","جاري التنفيذ","مكتمل"\]\.indexOf\(r\.status\)<0/.test(rt) && /r\.returnPayPending&&!confirm/.test(rt));
assert.ok(/if\(window\.wfSyncMode==="scoped"\)\{location\.href="tech\.html\?id="/.test(rt), "الفني بيقفل من بوابته (السيرفر)");
assert.ok(/const currentTurnId=\(shown\.find/.test(rt), "الدور = أول أمر نشط في الترتيب المعروض");
// 3) متابعة العملاء: آخر تعامل = أحدث إنشاء أو تقفيل، واللي عنده أمر مفتوح مش ساكت
{
  const vm = require("vm"), ctx = {};
  vm.createContext(ctx);
  const src = rt.slice(rt.indexOf("function followupInfo("), rt.indexOf("function sendFollowupTemplate("));
  vm.runInContext(src, ctx);
  const now = new Date("2026-10-17T10:00:00Z"), day = (n) => new Date(now - n * 864e5).toISOString();
  const a = ctx.followupInfo({ id: "c" }, [{ createdAt: day(70), closedAt: day(2), closed: true, status: "مكتمل" }], now);
  assert.strictEqual(a.daysSince, 2, "أمر اتعمل من 70 يوم واتقفل من يومين = آخر تعامل من يومين");
  const b = ctx.followupInfo({ id: "c" }, [{ createdAt: day(90), closed: false, status: "مجمد" }], now);
  assert.strictEqual(b.open, true, "أمر مفتوح = مش ساكت");
  const c = ctx.followupInfo({ id: "c" }, [{ createdAt: day(90), closed: false, status: "ملغي" }], now);
  assert.strictEqual(c.open, false); assert.strictEqual(c.daysSince, 90);
}
// 4) المهام
const tk = read("tasks.js"), th = read("tasks.html");
assert.ok(!/prompt\(/.test(tk), "التعديل من الفورم مش من رسايل prompt");
assert.ok(/id="taskCustomerSearch"/.test(th) && /app-customer-autocomplete\.js/.test(th), "اختيار العميل بالبحث بدل قايمة فيها كل العملاء");
assert.ok(/cid\?x\.customerId===cid:\(!x\.closed&&x\.status!=="ملغي"\)/.test(tk), "من غير عميل: الأوامر المفتوحة بس");
assert.ok(/tasks\.html\?request=/.test(rq), "زرار مهمة متابعة من صفحة الأمر");
assert.ok(/editTask: \{ all: \["tasks\.edit"\] \}, toggleTask: \{ all: \["tasks\.edit"\] \}/.test(read("roles-core.js")));
// 5) الضمان
const st = read("app-settings.js");
assert.ok(/function activeWarrantyRows\(\)/.test(st) && /id="warrantySearch"/.test(st), "بحث في قايمة الضمان");
assert.ok(!/firstName/.test(st), "الاسم كامل مش الاسم الأول بس");
assert.ok(/المدة لازم تكون رقم أكبر من صفر/.test(st), "صفر مايتحوّلش لـ 90 من غير ما تعرف");
assert.ok(/if \(!box\) return; \/\/ الخانة اختفت/.test(read("shared-data.js")), "قايمة آخر بحث ماتوقعش الصفحة لو الخانة اتعملها render");
assert.ok(/\.badge\.negative\{/.test(read("style.css")), "ألوان الشارات (عاجل/قرّب يخلص)");
// 5ب) سياسة الضمان: على الشغل والقطع اللي اتغيرت بس، وقرار «ضمان ولا بفلوس» لأي أمر جديد على جهاز في الضمان
{
  const vm = require("vm"), ctx = { K: { p: "p", r: "r" }, byIdCached: () => new Map([["p7", { name: "ثرموستات" }]]), arr: () => [] };
  vm.createContext(ctx);
  const sh = read("app-shared.js");
  vm.runInContext(sh.slice(sh.indexOf("const WARRANTY_SCOPE_NOTE"), sh.indexOf("// ضمان الإصلاح وقت التقفيل")), ctx);
  const r = { work: "تغيير ثرموستات", parts: [{ partId: "p7", qty: 1 }, { external: true, name: "كارتة" }] };
  assert.strictEqual(ctx.warrantyScopeText(r), "🛠️ تغيير ثرموستات\n🔩 القطع: ثرموستات، كارتة");
  assert.strictEqual(ctx.warrantyScopeText(Object.assign({ warrantyScope: "الكمبروسر بس" }, r)), "الكمبروسر بس");
}
assert.ok(/await warrantyDecisionDialog\(prior\)/.test(rq) && /function setWarrantyDecision\(i,dec\)/.test(rq));
assert.ok(/p\.warrantyScope = String\(sc\)/.test(read("firebase-sync.js")) && /الضمان على الشغل والقطع دي بس/.test(read("portal.html")), "العميل بيشوف نطاق الضمان في البوابة");
assert.ok(/o\.warrantyDecision==='paid'\)return;/.test(read("reports.js")), "«عطل تاني — بفلوس» مش بيتحسب شغل ضمان في التقارير");
// 6) العملاء
assert.ok(/function customerDuplicateDialog\(dup,phone,useLabel\)/.test(read("app-shared.js")));
assert.strictEqual((read("app-quick-add.js").match(/await customerDuplicateDialog\(/g) || []).length, 3, "الإضافة السريعة: استخدم العميل الموجود بدل التكرار");
assert.ok(/await customerDuplicateDialog\(duplicate,formData\.phone/.test(read("app-customers.js")));
assert.ok(/function orderDueNow\(r\) \{ return !!r && !r\.closed && r\.status === "مكتمل"/.test(ui), "«فلوس مستحقة» = أوامر خلصت ولسه ماتحصّلتش");
assert.ok(/مستحق عليه دلوقتي/.test(en) && /r\.status === "ملغي" \? 0 : \(\+r\.total \|\| 0\)/.test(en), "الملغي مش داخل في قيمة التعامل");
// 7) الأجهزة: «بيتكرر عطله» = أمر جديد خلال 90 يوم من اللي قبله
{
  const vm = require("vm"), ctx = {}; vm.createContext(ctx);
  const sh = read("app-shared.js");
  vm.runInContext(sh.slice(sh.indexOf("const DEVICE_REPEAT_DAYS"), sh.indexOf("/* رقم التليفون مسجل لعميل تاني:")), ctx);
  const d = (n) => new Date(Date.UTC(2026, 0, 1) + n * 864e5).toISOString();
  assert.strictEqual(ctx.deviceOrdersRecurring([{ createdAt: d(0), closedAt: d(2) }, { createdAt: d(400) }]), false, "أمرين بينهم سنة = صيانة عادية مش عطل متكرر");
  assert.strictEqual(ctx.deviceOrdersRecurring([{ createdAt: d(0), closedAt: d(2) }, { createdAt: d(40) }]), true);
  assert.strictEqual(ctx.deviceOrdersRecurring([{ createdAt: d(0), status: "ملغي" }, { createdAt: d(5) }]), false, "الملغي مايتحسبش");
}
assert.ok(/warrantyScopeText\(activeWarrantyOrder\)/.test(read("app-devices.js")), "صفحة الجهاز بتوضح الضمان على إيه");
// 8) المخزن: صنف جديد من «توريد جديد» بيتعمل بكمية صفر ويتختار في التوريد (عشان الدفع والفاتورة يتسجلوا)
const rs = read("app-restock.js");
assert.ok(/restock: true,/.test(rs) && /selectRestockPart\(p\.id\);/.test(rs) && /_qapCtx && _qapCtx\.restock \? 0 :/.test(rs));
{
  const vm = require("vm"), ctx = {}; vm.createContext(ctx);
  vm.runInContext(rs.slice(rs.indexOf("function restockSellUpdate("), rs.indexOf("function updateRestockPayHint()")), ctx);
  const u = ctx.restockSellUpdate({ buy: 50, use: 80 }, 60);
  assert.strictEqual(u.newSell, 96, "الشراء +20% → البيع +20%"); assert.strictEqual(u.pct, 20);
  assert.strictEqual(ctx.restockSellUpdate({ buy: 50, use: 80 }, 45), null, "السعر نزل: مفيش تغيير تلقائي");
  assert.strictEqual(ctx.restockSellUpdate({ buy: 0, use: 80 }, 45), null);
}
// 9) أكواد الأعطال
const fcs = read("app-fault-codes.js");
assert.ok(/seenImport\.has\(key\)/.test(fcs), "الاستيراد مايدخلش نفس الكود مرتين من نفس الملف");
assert.ok(/wfMatch\(\[f\.code,f\.title/.test(fcs), "البحث يلاقي E1 لما تكتب e-1");
assert.ok(/function requestFaultCodeHintsHtml\(r\)/.test(rq) && /\$\{requestFaultCodeHintsHtml\(r\)\}/.test(rq), "كود العطل في وصف الأمر بيتعرض معناه");
// 11) الخزنة: تعديل الحركة في شاشة واحدة (ومعاها الطرف التاني للتحويل) + رصيد بعد كل حركة + السحب على المكشوف بتأكيد
const trs = read("treasury.js");
assert.ok(/function applyTreasuryEdit\(entryId,v\)/.test(trs) && /trEditDialog/.test(trs), "تعديل حركة الخزنة في نافذة واحدة");
assert.ok(/runBal/.test(trs), "رصيد بعد كل حركة في الجدول");
assert.ok(/depositRefunded/.test(trs), "الملخص التشغيلي بيطرح العربون المرتجع");
// 12) الحسابات: تحويل بين حسابين + تعديل الحركة بيحدّث الطرفين
const wl = read("wallets.js");
assert.ok(/function transferBetweenWallets\(from,to,amount,date,time,reason,note\)/.test(wl) && /wallet-transfer/.test(wl), "تحويل من حساب لحساب");
assert.ok(/function applyWalletTxEdit\(txId,v\)/.test(wl) && /wtEditDialog/.test(wl), "تعديل حركة الحساب في نافذة (والحساب نفسه يتغير)");
assert.ok(/function toggleWalletTransferDir\(v\)/.test(wl));
assert.ok(read("roles-core.js") === read("functions/roles-core.js") && /transferBetweenWallets/.test(read("roles-core.js")), "صلاحية التحويل بين الحسابات في نسختي الصلاحيات");
console.log("review-fixes-tests: PASS (أوامر الشغل، خط السير، متابعة العملاء، المهام، الضمان، العملاء، الأجهزة، المخزن، الأكواد، الخزنة، الحسابات)");
