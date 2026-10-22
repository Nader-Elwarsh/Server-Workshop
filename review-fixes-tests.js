/* إصلاحات المراجعة الشاملة (قسم قسم). */
const assert = require("assert"), fs = require("fs");
const read = (f) => fs.readFileSync(__dirname + "/" + f, "utf8");
// 1) أوامر الشغل
const rq = read("app-requests.js");
assert.ok(/if\(r\.status==="ملغي"\)return alert\("الأمر ملغي/.test(rq), "مفيش إضافة قطع من المخزن لأمر ملغي (كانت بتتخصم مرتين لما الأمر يرجع)");
assert.ok(/status==="ملغي"\)return alert\("الأمر ملغي — رجّع حالته «جديد» الأول وبعدين ضيف القطع\."\);const ord0=/.test(rq), "ولا قطعة من بره");
assert.ok(/canEdit&&r\.status!=="ملغي"&&window\.wfSyncMode!=="scoped"/.test(rq));
assert.strictEqual((rq.match(/\(r\.paid\?0:orderRemainAmt\(r\)\)/g) || []).length, 4, "المتبقي في الإيصال وواتساب = صفر للأمر المدفوع");
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
// 13) التقارير: تسوية الجرد مش استهلاك، البيعة الملغية مش محسوبة، أوامر الضمان مش «خسرانة»، المقارنة بالشهر اللي فات بعدل
const rp = read("reports.js"), dr = read("app-dashboard-reports.js");
assert.ok(/const skipMove=/.test(rp) && /تعديل جرد\|تسوية/.test(rp), "تسوية الجرد والبيعة الملغية برا الاستهلاك");
assert.ok(/closedOrders\.filter\(o=>!isWarrantyJob\(o\)\)/.test(rp), "أمر الضمان مكانه قسم الضمان مش الأوامر الخسرانة");
assert.ok(/o\.warrantyOf&&allOrders\.find/.test(rp));
{
  const vm = require("vm"), ctx = { DAY: 864e5 }; vm.createContext(ctx);
  vm.runInContext("const dateKey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');" + rp.slice(rp.indexOf("function mkRange"), rp.indexOf("function range()")) + rp.slice(rp.indexOf("  function prevRange"), rp.indexOf("function inRangeDate")) + ";this.prevRange=prevRange;this.mkRange=mkRange;", ctx);
  const pr = ctx.prevRange(ctx.mkRange("2025-03-01", "2025-03-31"));
  assert.deepStrictEqual([pr.from, pr.to], ["2025-02-01", "2025-02-28"], "مارس بيتقارن بفبراير كله");
  const pw = ctx.prevRange(ctx.mkRange("2025-03-10", "2025-03-16"));
  assert.deepStrictEqual([pw.from, pw.to], ["2025-03-03", "2025-03-09"]);
}
assert.ok(/function reportDirectSales\(\)/.test(dr) && /sales=reportDirectSales\(\),revenue=labor\+partsSell\+sales\.rev/.test(dr), "كشف الحساب فيه البيع المباشر زي التقارير");
assert.ok(/فلوس مستحقة/.test(dr) && /if \(b === "workshop"\) return orderIsWorkshop\(r\) && !orderIsCompleted\(r\)/.test(ui), "أرقام الرئيسية = القوايم اللي بتفتحها");
assert.ok(/setReportMonthlyTarget: \{ all: \["settings\.edit"\] \}/.test(read("roles-core.js")));
// 14) بوابة الفني: المتبقي بيطرح العربون المرتجع، أمر الضمان واضح ومصنعيته صفر، المجمّد مايختفيش، والفني مايقدرش يعدّل الضمان/المرتجع
const tp = read("tech-portal.js");
assert.ok(/\(\+r\.deposit \|\| 0\) - \(\+r\.depositRefunded \|\| 0\)/.test(tp) && /function warrantyBox\(r\)/.test(tp) && /if \(isWarranty\(r\)\) r\.labor = 0;/.test(tp));
assert.ok(/section\("❄️ مجمّدة \(متوقفة\)", frozen\)/.test(tp), "الأوامر المجمّدة اللي ميعادها فات ليها مكان");
["depositRefunded", "warrantyUntil", "warrantyDecision", "warrantyOfScope"].forEach((f) => {
  assert.ok(read("firestore.rules").includes("'" + f + "'") && read("firebase-sync.js").includes('"' + f + '"'), "الفني مايعدّلش " + f);
});
assert.ok(/fd\.warrantyOfScope=/.test(rq), "أمر الضمان بياخد نطاق ضمان الأمر القديم عشان الفني يشوفه");
// 15) الفنيين والعهدة: إيداع/تسوية العهدة حركتين بيتعدلوا ويتمسحوا مع بعض، ومصروف الفني من جيبه بيدخل مصاريف التشغيل
const cu = read("custody-page.js"), wl2 = read("wallets.js");
assert.ok(/function ownExpenseTx\(e\)/.test(cu) && /if \(kind === "own" && e\.category !== "part"\) ownExpenseTx\(e\);/.test(cu), "مصروف من جيب الفني بيتحسب في صافي المكسب");
assert.ok(/window\.WFTech\.lastError\(\)/.test(cu), "رسالة الخطأ بتتنادى كدالة مش بتطبع الكود");
assert.ok(/cPair=e\.source==="custody"&&e\.custodyId/.test(wl2) && /if\(e\.source==="custody"&&e\.custodyId\)\{/.test(wl2), "حركة العهدة: الطرفين مع بعض في التعديل والحذف");
// 16) توزيع الشغل: المنطقة والموعد على الكارت، شغل كل فني، التعيين للظاهر بس، وتأكيد قبل نقل أمر من فني لفني
const dp = read("dispatch-page.js");
assert.ok(/function areaOf\(r\)/.test(dp) && /function openLoad\(\)/.test(dp) && /var ids = selectedIds\(\);/.test(dp) && /متعيّن لفني تاني/.test(dp));
// 17) المستخدمين والصلاحيات: صلاحيات حساب قديم ماتتطبقش على حساب جديد على نفس الجهاز، والمحفظة ماتتضافش لو السيرفر رفض
const pm = read("app-permissions.js"), up = read("users-page.js");
assert.ok(/uid: curUid\(\) \};/.test(pm) && /state\.profile\.uid !== u\.uid\) \{ switched = true;/.test(pm) && /if \(!switched && state\.profile && p\[0\] === u\.uid/.test(pm), "تبديل الحساب: صلاحيات الجديد تتحمّل فورًا");
assert.ok(/then\(function \(\) \{ ensureWallet\(walletIn\.value\);/.test(up) && /function openOrdersOf\(uid\)/.test(up), "تحذير قبل إيقاف فني معاه أوامر أو تغيير محفظته");
// 19) الإعدادات: تغيير الأسماء بيتطبق على البيانات، المحفظة بتتغير في كل مكان، أسماء النظام الأساسية محمية، النسخة الاحتياطية كاملة
const st2 = read("app-settings.js"), sl = read("app-settings-lists.js"), dm = read("app-data-management.js");
assert.ok(/function renameRecordsPayload\(kind,old,n,center\)/.test(st2) && /commitRename\(s,"center",c,n\)/.test(st2) && /commitRename\(s,"type",t,n\)/.test(st2));
assert.ok(/commitRename\(s,"village",v,n,center\)/.test(sl) && /commitRename\(s,"brand",x,n\)/.test(sl) && /commitRename\(s,"partCat",x,n\)/.test(sl));
assert.ok(/p\.payWallet===old/.test(st2) && /r\.techWallet===old/.test(st2) && /x\.counterparty===old/.test(st2) && /function walletTechs\(w\)/.test(st2), "تغيير اسم المحفظة في كل مكان + تحذير لو عهدة فني");
assert.ok(/const RESERVED_LIST_VALUES=/.test(st2) && /reservedListValue\(key,removed\)/.test(st2), "الورشة/مصروف تشغيل/... مايتمسحوش");
assert.ok(/const BACKUP_EXTRA_KEYS=\["wf_techpay","wf_comp_custom","wf_comp_fav"\]/.test(dm), "النسخة الاحتياطية فيها أجور الفنيين");
// 20) بوابة العملاء: العربون الصافي والمتبقي محسوبين صح، والمجمّد «متوقف مؤقتًا»
assert.ok(/var netDep = Math\.round\(\(\(\+r\.deposit \|\| 0\) - \(\+r\.depositRefunded \|\| 0\)\)/.test(read("firebase-sync.js")) && /متوقف مؤقتًا/.test(read("portal.html")));
// 21) إدارة البوابة: طلب الزائر لعميل موجود بيستخدم جهازه بدل جهاز مكرر + سجل العمليات
assert.ok(/useDev=same\.length===1/.test(read("portal-admin.html")) && /تحويل طلب زائر/.test(read("portal-admin.html")));
// batch73: موبايل مصري، حذف مستخدم، ربط الفاتورة الفوري، شكل صفحة الأمر، تحليل المصروفات، الطلبية من ملف الصنف، التحويل في فحص السلامة
{
  const vm = require("vm"), ctx = {}; vm.createContext(ctx);
  const sd = read("shared-data.js");
  vm.runInContext(sd.slice(sd.indexOf("  function phoneKey(v) {"), sd.indexOf("  window.wfEgMobile")) + ";this.egMobile=egMobile;", ctx);
  assert.strictEqual(ctx.egMobile("01012345678"), "01012345678"); assert.strictEqual(ctx.egMobile("٠١١٢٣٤٥٦٧٨٩"), "01123456789"); assert.strictEqual(ctx.egMobile("+201512345678"), "01512345678");
  ["0101234567", "010123456789", "01312345678", "0221234567"].forEach((x) => assert.strictEqual(ctx.egMobile(x), "", "مرفوض: " + x));
}
assert.ok(/async function remove\(uid, data\)/.test(read("functions/staff-admin.js")) && /exports\.staffDelete/.test(read("functions/index.js")) && /P\.call\("staffDelete"/.test(read("users-page.js")));
assert.ok(/function openInvoiceLinker\(invId\)/.test(read("app-invoices.js")) && /function invoiceLinkSet\(invId, partId, on\)/.test(read("app-invoices.js")));
assert.ok(/\.request-one-page \.receipt-actions-row,\.request-one-page \.wa-send-row\{display:grid/.test(read("style.css")));
assert.ok(/function renderSpendAnalysisHtml\(fixed,wallet\)/.test(dr) && /SPEND_EXP_CATS\[name\]/.test(read("wallets.js")));
assert.ok(/function partOrderBoxHtml\(p\)/.test(read("app-supplier-order.js")) && /partOrderBoxHtml\(p\)/.test(read("app-parts.js")));
assert.ok(/x\.source==="wallet-transfer"&&x\.transferId/.test(dm), "التحويل بين محفظتين مش «ناقص طرف الخزنة»");
// batch74: تعميم — شكل ملفات العميل/الجهاز/الصنف، تحليل الخزنة والمحفظة بالشهر، النسب في التقارير، الطلبية من قايمة المخزن، فحص أرقام الموبايل والعهدة
assert.ok(/\.profile \.profile-grid>\.kv:last-child:nth-child\(odd\)\{grid-column:1\/-1\}/.test(read("style.css")));
assert.ok(/function treasuryAnalysisHtml\(\)/.test(dr) && /treasuryAnalysisHtml\(\)/.test(read("treasury.js")) && /renderSpendAnalysisHtml\("",name\)/.test(read("wallets.js")));
assert.ok(/class="rep-pct"/.test(rp) || /rep-pct/.test(read("reports.js")));
assert.ok(/window\.listDraftAdd = function/.test(read("app-supplier-order.js")) && /listDraftAdd\('\$\{p\.id\}'\)/.test(read("workshop-mini-simple-ui.js")));
assert.ok(/cust-phone:/.test(read("app-data-management.js")) && /custody-parts:/.test(read("app-data-management.js")));
assert.ok(!/\$\{p\.use\} ج/.test(read("app-parts.js")), "سعر البيع مايظهرش undefined");
// batch75/76: حاجات بتتقري من تخزين الجهاز قبل ما يجهز (صورة النظام اللي كانت بترجع للأصلية)
{ const b = read("branding.js"); assert.ok(/var stReadyP = /.test(b) && /return stReadyP\.then\(function \(\) \{ return importData0\(o\); \}\)/.test(b) && /set\.hasIcon = !!a\[1\]/.test(b), "صورة النظام بتستنى التخزين وبتتنشر من الصورة نفسها"); }
assert.ok(/function spendLoad\(\)/.test(dr) && !/let SPEND=\(function\(\)\{let o=\{\};try\{o=JSON\.parse\(WFStorage/.test(dr));
assert.ok(/t\.dataset\.touched/.test(read("portal-admin.html")));
console.log("review-fixes-tests: PASS (أوامر الشغل، خط السير، متابعة العملاء، المهام، الضمان، العملاء، الأجهزة، المخزن، الأكواد، الخزنة، الحسابات، التقارير، بوابة الفني، العهدة، التوزيع، الصلاحيات، الإعدادات، البوابة، إدارة البوابة)");
