/* app-dashboard-reports.js — لوحة التحكم الرئيسية + التقرير المالي الشهري/الأسبوعي والمصاريف. */
function renderDash(){let el=document.getElementById("dashboard");if(!el)return;if(typeof fixDuplicateOrderNumbers==="function")fixDuplicateOrderNumbers();if(typeof autoHealOrderWalletTx==="function")autoHealOrderWalletTx();let c=arrCached(K.c),d=arrCached(K.d),r=arrCached(K.r),p=arrCached(K.p);let today=dayKeyLocal(new Date());let openOrders=r.filter(x=>x.status!=="مكتمل"&&x.status!=="ملغي");let todayOrders=openOrders.filter(x=>x.visit&&dayKeyLocal(x.visit)===today);let overdue=openOrders.filter(x=>x.visit&&dayKeyLocal(x.visit)<today&&x.status!=="مجمد");let staleOrders=openOrders.filter(x=>typeof requestIsStale==="function"&&requestIsStale(x));let overdueAlertDays=+settings().overdueAlertDays||7;let waitingParts=openOrders.filter(x=>x.partsWaiting);let inWorkshop=openOrders.filter(x=>!x.closed&&x.executionPlace==="الورشة"&&x.workshopStatus!=="تم التسليم");let low=p.filter(x=>+x.qty<=+x.min).length;let ym=monthKeyLocal(new Date());let monthOrders=r.filter(x=>monthKeyLocal(x.closedAt||x.createdAt)===ym);let monthClosed=monthOrders.filter(x=>x.closed);let monthLabor=monthClosed.reduce((a,x)=>a+(+x.labor||0),0);let monthRevenue=monthLabor+monthClosed.reduce((a,x)=>a+(+x.partsTotal||0),0)+arrCached(K.m).reduce((a,m)=>a+(m&&m.saleId&&m.type==="خروج بيع مباشر"&&!m.voided&&monthKeyLocal(m.at)===ym?(+m.total||0):0),0); /* + بيع القطع المباشر (زي صفحة التقارير) */let unpaidRemain=r.filter(x=>!x.closed&&x.status==="مكتمل").reduce((a,x)=>a+orderRemainAmt(x),0);let newCustomers=c.filter(x=>monthKeyLocal(x.createdAt)===ym).length;let tasksToday=taskRows().filter(x=>!x.completed&&x.date===today).length;let pendingCallsCount=arrCached(K.pc).length;let needsAttention=overdue.length+staleOrders.length+waitingParts.length+low+pendingCallsCount;el.innerHTML=`
${needsAttention>0?`<div class="dash-group"><div class="dash-group-title">🔥 يحتاج انتباه</div><div class="compact-stats">
${overdue.length>0?`<a class="stat stat-urgent" href="requests.html?bucket=overdue">⚠️ <b>${overdue.length}</b><span>متأخرة</span></a>`:""}
${staleOrders.length>0?`<a class="stat stat-urgent" href="requests.html?bucket=stale">⏳ <b>${staleOrders.length}</b><span>قديمة (${overdueAlertDays}+ يوم)</span></a>`:""}
${waitingParts.length>0?`<a class="stat" href="requests.html?bucket=parts">📦 <b>${waitingParts.length}</b><span>انتظار قطع</span></a>`:""}
${low>0?`<a class="stat" href="inventory.html?bucket=low">📉 <b>${low}</b><span>قطع منخفضة</span></a>`:""}
${pendingCallsCount>0?`<a class="stat" href="pending-calls.html">📞 <b>${pendingCallsCount}</b><span>مكالمات معلّقة</span></a>`:""}
</div></div>`:""}
<div class="dash-group"><div class="dash-group-title">📅 اليوم</div><div class="compact-stats">
<a class="stat" href="requests.html?bucket=today">📅 <b>${todayOrders.length}</b><span>أوامر اليوم</span></a>
<a class="stat" href="tasks.html?filter=today">📋 <b>${tasksToday}</b><span>مهام اليوم</span></a>
<a class="stat" href="requests.html?bucket=workshop">🏭 <b>${inWorkshop.length}</b><span>في الورشة</span></a>
<a class="stat" href="requests.html?bucket=open">🛠️ <b>${openOrders.length}</b><span>أوامر مفتوحة</span></a>
</div></div>
<div class="dash-group"><div class="dash-group-title">💰 المالية</div><div class="compact-stats">
<a class="stat stat-accent" href="reports.html">💰 <b>${monthRevenue.toFixed(0)} ج</b><span>إيراد الشهر — فتح التقرير</span></a>
<a class="stat" href="treasury.html">💵 <b>${treasuryBalance().toFixed(0)} ج</b><span>رصيد الخزنة</span></a>
<a class="stat" href="requests.html?bucket=unpaid">🧾 <b>${unpaidRemain.toFixed(0)} ج</b><span>فلوس مستحقة</span></a>
</div></div>
<div class="dash-group"><div class="dash-group-title">👥 عام</div><div class="compact-stats">
<a class="stat" href="customers.html?bucket=all">👤 <b>${c.length}</b><span>عملاء (+${newCustomers})</span></a>
<a class="stat" href="devices.html?bucket=all">🔧 <b>${d.length}</b><span>أجهزة</span></a>
</div></div>`}
function isoWeekMonday(y,w){let jan4=new Date(y,0,4);let jan4Day=jan4.getDay()||7;let week1Monday=new Date(jan4);week1Monday.setDate(jan4.getDate()-jan4Day+1);let monday=new Date(week1Monday);monday.setDate(week1Monday.getDate()+(w-1)*7);return monday}
function inRange(dateStr,start,end){if(!dateStr)return false;let d=typeof parseLocalDateValue==="function"?parseLocalDateValue(dateStr):new Date(dateStr);if(Number.isNaN(d.getTime()))return false;return d>=start&&d<=end}
function getReportRange(){let mode=(document.getElementById("reportMode")||{}).value||"month";if(mode==="week"){let wEl=document.getElementById("reportWeek"),val=wEl&&wEl.value,start;if(val){let[y,w]=val.split("-W").map(Number);start=isoWeekMonday(y,w)}else{let now=new Date(),dow=now.getDay()||7;start=new Date(now.getFullYear(),now.getMonth(),now.getDate()-(dow-1))}let startClean=new Date(start.getFullYear(),start.getMonth(),start.getDate(),0,0,0,0);let end=new Date(start.getFullYear(),start.getMonth(),start.getDate()+5,23,59,59,999);return{start:startClean,end,label:`الأسبوع: ${startClean.toLocaleDateString("ar-EG",{day:"2-digit",month:"2-digit"})} (الاثنين) ← ${end.toLocaleDateString("ar-EG",{day:"2-digit",month:"2-digit"})} (السبت)`}}let mEl=document.getElementById("reportMonth"),ym=mEl&&mEl.value?mEl.value:monthKeyLocal(new Date()),parts=ym.split("-").map(Number),y=parts[0],m=parts[1];let start=new Date(y,m-1,1,0,0,0,0),end=new Date(y,m,0,23,59,59,999);return{start,end,label:`شهر ${ym}`}}
function setReportMode(mode){let hidden=document.getElementById("reportMode");if(!hidden){hidden=document.createElement("input");hidden.type="hidden";hidden.id="reportMode";document.querySelector(".report")?.appendChild(hidden)}hidden.value=mode;window.WFNavState?.setParams({rm:mode==="week"?"week":null});document.getElementById("reportMonth")?.classList.toggle("hidden",mode!=="month");document.getElementById("reportWeek")?.classList.toggle("hidden",mode!=="week");document.getElementById("modeMonthBtn")?.classList.toggle("active-track",mode==="month");document.getElementById("modeWeekBtn")?.classList.toggle("active-track",mode==="week");financeReport()}
function financeReport(){let el=document.getElementById("monthlyReport");if(!el)return;let m=document.getElementById("reportMonth");if(m&&!m.value)m.value=monthKeyLocal(new Date());let{start,end,label}=getReportRange();let r=arrCached(K.r).filter(x=>inRange(x.closedAt,start,end)||inRange(x.createdAt,start,end));let laborOrders=reportClosedOrders();const A=archReportSums(start,end);let labor=laborOrders.reduce((a,x)=>a+(+x.labor||0),0)+A.lab,partsSell=laborOrders.reduce((a,x)=>a+(+x.partsTotal||0),0)+A.ps,partsCost=laborOrders.reduce((a,x)=>a+(+x.partsCost||0),0)+A.pc,sales=reportDirectSales(),revenue=labor+partsSell+sales.rev,grossProfit=revenue-partsCost-sales.cost,partsProfit=partsSell-partsCost,partsProfitPct=partsSell>0?(partsProfit/partsSell*100):0,deposits=r.reduce((a,x)=>a+Math.max(0,(+x.deposit||0)-(+x.depositRefunded||0)),0),remain=r.reduce((a,x)=>a+((x.closed||x.status==="ملغي")?0:orderRemainAmt(x)),0),completedList=reportCompletedOrders(),completedCount=completedList.length+A.cl,avgTicket=completedCount?(completedList.reduce((a,x)=>a+(x.closed?(+x.labor||0):0),0)+A.lab)/completedCount:0;let exp=operatingExpensesInRange(start,end),totalExpenses=exp.reduce((a,x)=>a+(x.type==="in"?-(+x.amount||0):(+x.amount||0)),0)+A.ex,techPay=reportTechPay(laborOrders)+A.tp,netProfit=grossProfit-totalExpenses-techPay;el.innerHTML=`<div class="hint report-range">${label} • ${r.length} أمر</div><div class="hint report-click-hint">💡 اضغط على أي بند لعرض تفاصيله ومصدره</div><table class="month-table report-table">
<tr class="report-row-clickable" data-wf-event="click" data-wf-code="showReportDetail('labor')"><td>🔨 المصنعية</td><td>${labor.toFixed(2)} ج</td></tr>
<tr class="report-row-clickable" data-wf-event="click" data-wf-code="showReportDetail('partsSell')"><td>🔧 قطع الغيار المحصلة</td><td>${partsSell.toFixed(2)} ج</td></tr>
${sales.list.length?`<tr class="report-row-clickable" data-wf-event="click" data-wf-code="showReportDetail('sales')"><td>🛒 بيع قطع مباشر</td><td>${sales.rev.toFixed(2)} ج</td></tr>`:""}<tr class="report-row-clickable" data-wf-event="click" data-wf-code="showReportDetail('partsCost')"><td>📦 تكلفة القطع</td><td>${(partsCost+sales.cost).toFixed(2)} ج</td></tr>
<tr class="report-row-clickable" data-wf-event="click" data-wf-code="showReportDetail('partsProfitPct')"><td>📈 نسبة ربح قطع الغيار</td><td>${partsProfitPct.toFixed(1)}%</td></tr>
<tr class="report-row-clickable" data-wf-event="click" data-wf-code="showReportDetail('revenue')"><td>💰 الإيراد</td><td>${revenue.toFixed(2)} ج</td></tr>
<tr class="report-row-clickable" data-wf-event="click" data-wf-code="showReportDetail('grossProfit')"><td>📈 مكسب قبل المصاريف</td><td>${grossProfit.toFixed(2)} ج</td></tr>
<tr class="report-row-clickable" data-wf-event="click" data-wf-code="showReportDetail('expenses')"><td>🧯 مصاريف التشغيل</td><td>${totalExpenses.toFixed(2)} ج</td></tr>
${techPay!==0?`<tr class="report-row-clickable" data-wf-event="click" data-wf-code="showReportDetail('techPay')"><td>👷 أجور الفنيين</td><td>${techPay.toFixed(2)} ج</td></tr>`:""}
<tr class="total-row report-row-clickable" data-wf-event="click" data-wf-code="showReportDetail('netProfit')"><td>✅ صافي المكسب</td><td>${netProfit.toFixed(2)} ج</td></tr>
<tr class="report-row-clickable" data-wf-event="click" data-wf-code="showReportDetail('deposits')"><td>💵 العربون المحصّل</td><td>${deposits.toFixed(2)} ج</td></tr>
<tr class="report-row-clickable" data-wf-event="click" data-wf-code="showReportDetail('remain')"><td>🧾 المتبقي على العملاء</td><td>${remain.toFixed(2)} ج</td></tr>
<tr class="report-row-clickable" data-wf-event="click" data-wf-code="showReportDetail('count')"><td>🛠️ عدد الأوامر</td><td>${r.length}</td></tr>
<tr class="report-row-clickable" data-wf-event="click" data-wf-code="showReportDetail('completed')"><td>✅ أوامر مكتملة</td><td>${completedCount}</td></tr>
<tr class="report-row-clickable" data-wf-event="click" data-wf-code="showReportDetail('avgTicket')"><td>📊 متوسط قيمة الأمر (المصنعية فقط)</td><td>${avgTicket.toFixed(2)} ج</td></tr>
</table>${archReportNote(start,end)}<div id="reportDetail" class="report-detail hidden"></div>`;renderExpenseList()}
/* 📦 الفترة فيها أوامر اتنقلت للأرشيف؟ التقرير ده بيحسب الموجود على الجهاز بس، فبننبّه ونوديه لصفحة التقارير (بتجمع الأرشيف) */
/* 📦 أرقام الأوامر والحركات المتأرشفة في الفترة (من الملخصات اللي archive.js بينزّلها) — بتتجمع على الإجماليات */
function archReportSums(start,end){const A={lab:0,ps:0,pc:0,tp:0,cl:0,ex:0,any:false};try{const c=JSON.parse(WFStorage.getItem("wf_arch_cache")||"null");if(!c||!c.sums)return A;const f=localDateKey(new Date(start)),t=localDateKey(new Date(end));Object.keys(c.sums).forEach(m=>Object.keys(c.sums[m]||{}).forEach(k=>{if(k<f||k>t)return;const v=c.sums[m][k]||{};A.any=true;["lab","ps","pc","tp","cl","ex"].forEach(x=>{A[x]+=+v[x]||0})}))}catch(e){}return A}
function archReportNote(start,end){try{if(!archReportSums(start,end).any)return "";const f=localDateKey(new Date(start)),t=localDateKey(new Date(end));return `<p class="hint">📦 الإجماليات فوق شاملة أوامر قديمة اتنقلت للأرشيف (التفاصيل لما تضغط على بند بتعرض الأوامر الحالية بس). التقرير الكامل في <a href="reports.html?from=${f}&amp;to=${t}">صفحة التقارير</a>.</p>`}catch(e){return ""}}
// أجور الفنيين على الأوامر المقفولة في الفترة (الأجرة اللي المالك/المدير حددها على كل أمر) — تكلفة زي تكلفة القطع
function reportTechPay(list){let{start,end}=getReportRange();const shares=arrCached(K.r).reduce((a,r)=>a+(r&&r.status!=="ملغي"?(r.payShares||[]).filter(s=>s&&inRange(s.at,start,end)).reduce((b,s)=>b+(+s.amount||0),0):0),0);return (list||reportClosedOrders()).reduce((a,x)=>a+(x.status!=="ملغي"?(+x.techPay||0):0),0)+shares} // + حصص الشغل الأول للأوامر اللي اتعملها مرتجع (بتاريخ المرتجع)
/* 🛒 بيع قطع مباشر (من غير أمر شغل) في الفترة — نفس حساب صفحة التقارير عشان الرقمين يطلعوا واحد */
function reportDirectSales(){let{start,end}=getReportRange();const list=arrCached(K.m).filter(m=>m&&m.saleId&&m.type==="خروج بيع مباشر"&&!m.voided&&inRange(m.at,start,end));return{list,rev:list.reduce((a,m)=>a+(+m.total||0),0),cost:list.reduce((a,m)=>a+(+m.cost||0)*Math.abs(+m.qty||0),0)}}
function reportSaleRow(sl){return sl.list.length?`<div class="report-detail-row"><span>🛒 بيع قطع مباشر (${sl.list.length} بيعة)</span><b>${sl.rev.toFixed(2)} ج</b></div>`:""}
function reportOrders(){let{start,end}=getReportRange();return arrCached(K.r).filter(x=>inRange(x.closedAt,start,end)||inRange(x.createdAt,start,end))}
function operatingExpensesInRange(start,end){return walletTxEntries().filter(x=>x.category==="مصروف تشغيل"&&inRange(x.date,start,end))}
function reportExpensesInRange(){let{start,end}=getReportRange();return operatingExpensesInRange(start,end)}
// كل المصاريف "المُصنّفة فرعيًا" (تشغيل + شخصي) في فترة معينة — مستخدمة في
// إحصائيات "الأكتر صرفًا" بصفحة الحسابات فقط، ومش بتأثر على حساب صافي
// المكسب (اللي بيفضل معتمد على operatingExpensesInRange التشغيل فقط، لأن
// المصروف الشخصي مش تكلفة تشغيل للورشة).
function allTrackedExpensesInRange(start,end){
  return walletTxEntries().filter(x=>x.type==="out"&&(x.category==="مصروف تشغيل"||x.category==="مصروف شخصي")&&inRange(x.date,start,end));
}
// تجميع مصاريف فترة معينة حسب (النوع الفرعي + التصنيف الأصلي) مرتبة تنازليًا
// — الأساس لعرض "أكتر حاجة بيتصرف فيها" في صفحة الحسابات.
function spendingBreakdownInRange(start,end){
  let map={};
  allTrackedExpensesInRange(start,end).forEach(x=>{
    let sub=x.subCategory||"غير مصنف",catShort=x.category==="مصروف شخصي"?"شخصي":"تشغيل";
    let key=sub+"|"+catShort;
    map[key]=map[key]||{label:sub,catShort,amount:0,count:0};
    map[key].amount+=(+x.amount||0);map[key].count++;
  });
  return Object.values(map).sort((a,b)=>b.amount-a.amount);
}
// إحصائية سريعة لكل الشهر التقويمي الحالي (مستقلة عن فلتر التقرير
// شهري/أسبوعي تحت)، عشان "أكتر حاجة بيتصرف فيها" يبان أول ما تفتح صفحة
// الحسابات من غير ما تحتاج تفتح التقرير المفصّل.
function currentMonthSpendingStats(){
  let now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),1,0,0,0,0),end=new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59,999);
  let breakdown=spendingBreakdownInRange(start,end);
  let total=breakdown.reduce((a,x)=>a+x.amount,0);
  return {breakdown,total,top:breakdown[0]||null};
}
// كارت سريع أعلى صفحة الحسابات: إجمالي المصروف هذا الشهر + أكتر 3 حاجات
// بيتصرف عليها — منفصل عن قسم "كشف الحساب" المفصّل تحت (اللي بيدّي اختيار
// شهر/أسبوع بعينه). ده دايمًا عن الشهر التقويمي الحالي بالظبط.
function renderSpendingStatsHtml(){return renderSpendAnalysisHtml()}
/* ===== 📊 تحليل المصروفات والإيرادات: تختار الشهر (أو كل الوقت) والنوع (تشغيل/شخصي/إيرادات)،
   وكل بند جنبه نسبته من مجموعته، وكل مجموعة نسبتها من إجمالي الصرف. اضغط البند تشوف حركاته. ===== */
const SPEND_EXP_CATS={"مصروف تشغيل":"op","مصروف شخصي":"personal"};
const SPEND_NOT_INCOME_CATS=["سلفة / تحويل","تحويل","رصيد افتتاحي","مشتريات قطع غيار","أجور فنيين"];
const SPEND_NOT_INCOME_SRC=["transfer","wallet-transfer","custody","custody-expense"];
let SPEND={month:"",kind:"all",open:""},spendLoaded=false;
/* اختيار الشهر/النوع بيتقري من التخزين أول ما يتطلب (مش وقت تحميل الملف — التخزين ساعتها ممكن يكون لسه مجهزش) */
function spendLoad(){if(spendLoaded)return;let o=null;try{o=JSON.parse(WFStorage.getItem("wf_spend_view")||"null")}catch(e){}if(!o&&window.WFStorage&&WFStorage.isReady&&!WFStorage.isReady())return;spendLoaded=true;o=o||{};SPEND.month=typeof o.month==="string"&&o.month?o.month:"";SPEND.kind=o.kind||"all"}
function spendSave(){spendLoaded=true;try{WFStorage.setItem("wf_spend_view",JSON.stringify({month:SPEND.month,kind:SPEND.kind}))}catch(e){}}
function spendMonth(){spendLoad();return SPEND.month||monthKeyLocal(new Date())}
function spendData(month,wallet){
  const all=walletTxEntries().filter(x=>!wallet||String(x.wallet||"").trim()===wallet),inP=x=>month==="all"||String(x.date||"").slice(0,7)===month;
  const groups={op:new Map(),personal:new Map(),income:new Map()},tot={op:0,personal:0,income:0};
  all.forEach(x=>{
    if(!x||!inP(x)||x.source==="archive-carry")return; /* الرصيد المُرحّل من الأرشيف مش دخل ولا مصروف */
    const amt=+x.amount||0,g=SPEND_EXP_CATS[x.category];
    if(g){const k=x.subCategory||"غير مصنف",sign=x.type==="in"?-1:1,m=groups[g];const e=m.get(k)||{amt:0,n:0,tx:[]};e.amt+=sign*amt;e.n++;e.tx.push(x);m.set(k,e);tot[g]+=sign*amt;return}
    if(x.type!=="in"||SPEND_NOT_INCOME_CATS.includes(x.category)||SPEND_NOT_INCOME_SRC.includes(x.source)||x.ownPocket)return;
    const k=x.category||"أخرى",e=groups.income.get(k)||{amt:0,n:0,tx:[]};e.amt+=amt;e.n++;e.tx.push(x);groups.income.set(k,e);tot.income+=amt;
  });
  return{groups,tot,spend:tot.op+tot.personal};
}
function spendPct(a,b){return b>0?Math.round(a/b*1000)/10:0}
function spendMonthLabel(m){if(m==="all")return"كل الوقت";try{return new Date(m+"-01T12:00:00").toLocaleDateString("ar-EG",{month:"long",year:"numeric"})}catch(e){return m}}
function renderSpendAnalysisHtml(fixed,wallet){
  wallet=wallet||"";const m=spendMonth(),d=spendData(m,wallet),kind=fixed||SPEND.kind,money=n=>(Math.round((+n||0)*100)/100).toLocaleString("en-US",{maximumFractionDigits:2})+" ج";
  const prevKey=m==="all"?"":(()=>{const t=new Date(m+"-01T12:00:00");t.setMonth(t.getMonth()-1);return monthKeyLocal(t)})(),pd=prevKey?spendData(prevKey,wallet):null;
  const delta=(cur,prev)=>{if(!pd||!prev)return"";const p=(cur-prev)/prev*100;if(Math.abs(p)<0.5)return"";return ` <small class="spend-delta ${p>0?"up":"down"}">${p>0?"▲":"▼"}${Math.abs(Math.round(p))}%</small>`};
  const LBL={op:"🔧 مصاريف التشغيل",personal:"🙋 المصاريف الشخصية",income:"💰 الإيرادات"};
  const tile=(k,v,sub,cls)=>`<button type="button" class="spend-tile ${cls||""} ${kind===k?"on":""}" ${fixed?"disabled":""} data-wf-event="click" data-wf-code="setSpendKind('${k}')"><span>${k==="all"?"🧾 إجمالي الصرف":LBL[k]}</span><b>${money(v)}</b><small>${sub}</small></button>`;
  const tiles=fixed?"":`<div class="spend-tiles">
    ${tile("all",d.spend,`تشغيل + شخصي${delta(d.spend,pd&&pd.spend)}`)}
    ${tile("op",d.tot.op,`${spendPct(d.tot.op,d.spend)}% من الصرف${delta(d.tot.op,pd&&pd.tot.op)}`)}
    ${tile("personal",d.tot.personal,`${spendPct(d.tot.personal,d.spend)}% من الصرف${delta(d.tot.personal,pd&&pd.tot.personal)}`)}
    ${tile("income",d.tot.income,`${d.tot.income>0?`الصرف = ${spendPct(d.spend,d.tot.income)}% منها`:"—"}${delta(d.tot.income,pd&&pd.tot.income)}`,"inc")}</div>`;
  let rows=[],base=0,title="";
  if(kind==="all"){["op","personal"].forEach(g=>d.groups[g].forEach((e,k)=>rows.push({key:g+"|"+k,label:k,tag:g==="op"?"تشغيل":"شخصي",e})));base=d.spend;title="كل المصروفات حسب البند — النسبة من إجمالي الصرف"}
  else{d.groups[kind].forEach((e,k)=>rows.push({key:kind+"|"+k,label:k,e}));base=d.tot[kind];title=(LBL[kind]||"")+" حسب "+(kind==="income"?"المصدر":"البند")+" — النسبة من "+(kind==="income"?"إجمالي الإيرادات":"إجمالي المجموعة")+(kind!=="income"&&d.spend?` (والمجموعة ${spendPct(base,d.spend)}% من كل الصرف)`:"")}
  rows=rows.filter(r=>Math.abs(r.e.amt)>0.004).sort((a,b)=>b.e.amt-a.e.amt);
  const max=Math.max(1,...rows.map(r=>r.e.amt));
  const list=rows.length?rows.map(r=>{const p=spendPct(r.e.amt,base),open=SPEND.open===r.key;
    return `<div class="spend-row ${open?"open":""}"><button type="button" class="spend-row-btn" data-wf-event="click" data-wf-code="toggleSpendRow('${encodeURIComponent(r.key)}')"><span class="spend-name">${esc(r.label)}${r.tag?` <small class="spend-tag">${r.tag}</small>`:""}</span><b>${money(r.e.amt)}</b><em class="spend-pct">${p}%</em><i class="spend-bar" style="width:${Math.max(2,r.e.amt/max*100).toFixed(1)}%"></i><small class="spend-n">${r.e.n} حركة</small></button>
    ${open?`<div class="spend-tx">${r.e.tx.slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(x=>`<div class="spend-tx-row"><span>${esc(x.date||"")} • ${esc(x.reason||x.category||"")}<small> • 💳 ${esc(x.wallet||"—")}</small></span><b class="${x.type==="in"?"pos":"neg"}">${x.type==="in"?"+":"−"}${money(x.amount)}</b></div>`).join("")}</div>`:""}</div>`}).join(""):`<div class="hint">مفيش ${kind==="income"?"إيرادات":"مصروفات"} في ${esc(spendMonthLabel(m))}.</div>`;
  return `<section class="panel spend-box" data-fixed="${fixed||""}" data-wallet="${esc(wallet)}" style="margin:10px 0">
    <div class="page-head"><h2>📊 تحليل ${fixed==="income"?"الإيرادات":fixed?"المصروفات":"المصروفات والإيرادات"}${wallet?` — ${esc(wallet)}`:""}</h2></div>
    <div class="spend-period"><button type="button" class="secondary mini-action" data-wf-event="click" data-wf-code="shiftSpendMonth(-1)" ${m==="all"?"disabled":""}>‹ اللي قبله</button>
      <input type="month" value="${m==="all"?"":esc(m)}" data-wf-event="change" data-wf-code="setSpendMonth(this.value)" aria-label="الشهر">
      <button type="button" class="secondary mini-action" data-wf-event="click" data-wf-code="shiftSpendMonth(1)" ${m==="all"?"disabled":""}>اللي بعده ›</button>
      <button type="button" class="secondary mini-action ${m==="all"?"active-track":""}" data-wf-event="click" data-wf-code="setSpendMonth('all')">كل الوقت</button></div>
    <div class="hint" style="margin:4px 0 8px">📅 ${esc(spendMonthLabel(m))}${pd?` • ▲▼ = مقارنة بـ ${esc(spendMonthLabel(prevKey))}`:""}</div>
    ${tiles}
    ${fixed?`<div class="treasury-balance"><span>${LBL[fixed]} — ${esc(spendMonthLabel(m))}</span><b>${money(base)}</b></div>${fixed!=="income"&&d.spend?`<div class="hint">= ${spendPct(base,d.spend)}% من إجمالي الصرف (تشغيل + شخصي) في الفترة${delta(base,pd&&pd.tot[fixed])}</div>`:""}`:""}
    <h3 class="spend-h">${title}</h3>
    <div class="spend-list">${list}</div>
    <div class="hint">اضغط على أي بند تشوف حركاته. الأنواع الفرعية (وقود، مواصلات، أكل…) بتتعدل من ⚙️ الإعدادات ← الحسابات.</div>
  </section>`;
}
/* الخزنة: نفس اختيار الشهر، والصرف والوارد حسب النوع (شخصي/تشغيل/سلفة…) وجنب كل نوع نسبته */
function treasuryAnalysisHtml(){
  const m=spendMonth(),inP=x=>m==="all"||String(x.date||"").slice(0,7)===m,money=n=>(Math.round((+n||0)*100)/100).toLocaleString("en-US",{maximumFractionDigits:2})+" ج";
  const rows={in:new Map(),out:new Map()},tot={in:0,out:0};
  (typeof treasuryEntries==="function"?treasuryEntries():[]).forEach(x=>{if(!x||!inP(x)||x.refKey==="opening-balance"||x.source==="archive-carry")return;const t=x.type==="in"?"in":"out",k=x.category||"أخرى",a=+x.amount||0;const e=rows[t].get(k)||{amt:0,n:0};e.amt+=a;e.n++;rows[t].set(k,e);tot[t]+=a});
  const list=t=>{const r=[...rows[t].entries()].sort((a,b)=>b[1].amt-a[1].amt);if(!r.length)return `<div class="hint">مفيش ${t==="in"?"وارد":"صرف"} في الفترة.</div>`;const mx=Math.max(1,...r.map(x=>x[1].amt));return r.map(([k,e])=>`<div class="spend-row"><div class="spend-row-btn" style="cursor:default"><span class="spend-name">${esc(k)}</span><b>${money(e.amt)}</b><em class="spend-pct">${spendPct(e.amt,tot[t])}%</em><i class="spend-bar" style="width:${Math.max(2,e.amt/mx*100).toFixed(1)}%"></i><small class="spend-n">${e.n} حركة</small></div></div>`).join("")};
  return `<section class="tr-analysis spend-box-tr" style="margin:8px 0">
    <div class="spend-period"><button type="button" class="secondary mini-action" data-wf-event="click" data-wf-code="shiftSpendMonth(-1)" ${m==="all"?"disabled":""}>‹ اللي قبله</button><input type="month" value="${m==="all"?"":esc(m)}" data-wf-event="change" data-wf-code="setSpendMonth(this.value)" aria-label="الشهر"><button type="button" class="secondary mini-action" data-wf-event="click" data-wf-code="shiftSpendMonth(1)" ${m==="all"?"disabled":""}>اللي بعده ›</button><button type="button" class="secondary mini-action ${m==="all"?"active-track":""}" data-wf-event="click" data-wf-code="setSpendMonth('all')">كل الوقت</button></div>
    <div class="hint" style="margin:4px 0 8px">📅 ${esc(spendMonthLabel(m))}</div>
    <div class="spend-tiles"><div class="spend-tile" style="cursor:default"><span>➕ الوارد</span><b>${money(tot.in)}</b></div><div class="spend-tile" style="cursor:default"><span>➖ الصرف</span><b>${money(tot.out)}</b><small>${tot.in>0?`= ${spendPct(tot.out,tot.in)}% من الوارد`:""}</small></div></div>
    <h3 class="spend-h">➖ الصرف حسب النوع — النسبة من إجمالي الصرف</h3><div class="spend-list">${list("out")}</div>
    <h3 class="spend-h">➕ الوارد حسب النوع — النسبة من إجمالي الوارد</h3><div class="spend-list">${list("in")}</div></section>`;
}
function rerenderSpend(){document.querySelectorAll(".tr-analysis").forEach(el=>{const t=document.createElement("div");t.innerHTML=treasuryAnalysisHtml();el.replaceWith(t.firstElementChild)});document.querySelectorAll(".spend-box").forEach(el=>{const t=document.createElement("div");t.innerHTML=renderSpendAnalysisHtml(el.dataset.fixed||"",el.dataset.wallet||"");el.replaceWith(t.firstElementChild)})}
function setSpendMonth(v){SPEND.month=v==="all"?"all":(/^\d{4}-\d{2}$/.test(v||"")?v:"");SPEND.open="";spendSave();rerenderSpend()}
function shiftSpendMonth(n){const m=spendMonth();if(m==="all")return;const t=new Date(m+"-01T12:00:00");t.setMonth(t.getMonth()+(+n||0));SPEND.month=monthKeyLocal(t);SPEND.open="";spendSave();rerenderSpend()}
function setSpendKind(k){SPEND.kind=["all","op","personal","income"].includes(k)?k:"all";SPEND.open="";spendSave();rerenderSpend()}
function toggleSpendRow(k){try{k=decodeURIComponent(k)}catch(e){}SPEND.open=SPEND.open===k?"":k;rerenderSpend()}
(function(){try{if(document.getElementById("spendCss"))return;const st=document.createElement("style");st.id="spendCss";st.textContent=
".spend-period{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.spend-period input{flex:1;min-width:130px}"+
".spend-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:8px 0}.spend-tile{display:flex;flex-direction:column;gap:2px;align-items:flex-start;padding:10px;border-radius:12px;border:1px solid var(--border);background:var(--bg-elevated);color:var(--text);font:inherit;text-align:start;cursor:pointer;min-height:0}.spend-tile span{font-size:12px;color:var(--text-muted)}.spend-tile b{font-size:18px}.spend-tile small{font-size:11.5px;color:var(--text-muted)}.spend-tile.on{border-color:var(--pri,var(--accent-text,#17324d));box-shadow:0 0 0 2px var(--pri,var(--accent-text,#17324d)) inset}.spend-tile.inc b{color:var(--success-text)}"+
".spend-delta.up{color:var(--danger-text)}.spend-delta.down{color:var(--success-text)}.spend-tile.inc .spend-delta.up{color:var(--success-text)}.spend-tile.inc .spend-delta.down{color:var(--danger-text)}"+
".spend-h{font-size:14px;margin:12px 0 6px}.spend-list{display:grid;gap:6px}.spend-row{border:1px solid var(--border);border-radius:10px;background:var(--bg-elevated);overflow:hidden}"+
".spend-row-btn{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:4px 10px;align-items:center;width:100%;padding:9px 10px;border:0;background:transparent;color:var(--text);font:inherit;text-align:start;cursor:pointer;min-height:0}"+
".spend-name{font-weight:700;font-size:14px}.spend-tag{font-size:10.5px;padding:1px 6px;border-radius:99px;background:var(--bg-sunken);color:var(--text-muted);font-weight:600}.spend-pct{font-style:normal;font-size:11.5px;font-weight:800;padding:2px 7px;border-radius:99px;background:var(--bg-sunken);color:var(--text-muted)}"+
".spend-bar{grid-column:1/-1;display:block;height:6px;border-radius:6px;background:var(--pri,var(--accent-text,#17324d));opacity:.75}.spend-n{grid-column:1/-1;font-size:11px;color:var(--text-muted)}"+
".spend-tx{border-top:1px dashed var(--border);padding:6px 10px;display:grid;gap:4px;background:var(--bg-sunken)}.spend-tx-row{display:flex;justify-content:space-between;gap:8px;font-size:12.5px}.spend-tx-row small{color:var(--text-muted)}.spend-tx-row b{white-space:nowrap}.spend-tx-row .neg{color:var(--danger-text)}.spend-tx-row .pos{color:var(--success-text)}";
document.head.appendChild(st)}catch(e){}})();
function reportOrderLine(o,val){return `<a class="report-detail-row" href="request.html?id=${encodeURIComponent(String(o.id??""))}"><span>${esc(o.no||"—")} • ${esc(customerName(o.customerId))}${o.closed?" 🔒":""}</span><b>${(+val||0).toFixed(2)} ج</b></a>`}
function reportClosedOrders(){let{start,end}=getReportRange();return arrCached(K.r).filter(x=>x.closed&&inRange(x.closedAt||x.createdAt,start,end))}
function reportCompletedOrders(){let{start,end}=getReportRange();return arrCached(K.r).filter(x=>x.closed?inRange(x.closedAt||x.createdAt,start,end):x.status==="مكتمل"&&inRange(x.createdAt,start,end))}
function reportRowMeta(key){let r=reportOrders(),closedOrders=reportClosedOrders();
if(key==="labor"){let list=closedOrders.filter(x=>(+x.labor||0)>0);return{title:"🔨 تفاصيل المصنعية",note:"المصنعية تدخل هذا البند فقط بعد إغلاق أمر الشغل نهائيًا.",rows:list.map(x=>reportOrderLine(x,x.labor)),empty:"لا توجد مصنعية محسوبة بعد؛ ستظهر هنا الأوامر بعد إغلاقها نهائيًا."}}
if(key==="partsSell"){let list=closedOrders.filter(x=>(+x.partsTotal||0)>0);return{title:"🔧 تفاصيل قطع الغيار المحصلة",note:"قطع الغيار تدخل هذا البند فقط بعد إغلاق أمر الشغل نهائيًا، زي المصنعية بالظبط.",rows:list.map(x=>reportOrderLine(x,x.partsTotal)),empty:"لا توجد قطع غيار محصلة بعد؛ ستظهر هنا الأوامر بعد إغلاقها نهائيًا."}}
if(key==="partsCost"){let list=closedOrders.filter(x=>(+x.partsCost||0)>0);return{title:"📦 تفاصيل تكلفة القطع",note:"تكلفة القطع تدخل هذا البند فقط بعد إغلاق أمر الشغل نهائيًا.",rows:list.map(x=>reportOrderLine(x,x.partsCost)).concat((()=>{const sl=reportDirectSales();return sl.cost?[`<div class="report-detail-row"><span>🛒 تكلفة القطع المباعة مباشر (${sl.list.length} بيعة)</span><b>${sl.cost.toFixed(2)} ج</b></div>`]:[]})()),empty:"لا توجد تكلفة قطع مسجلة بعد؛ ستظهر هنا الأوامر بعد إغلاقها نهائيًا."}}
if(key==="deposits"){let list=r.filter(x=>(+x.deposit||0)>0);return{title:"💵 تفاصيل العربون المحصّل",rows:list.map(x=>reportOrderLine(x,Math.max(0,(+x.deposit||0)-(+x.depositRefunded||0)))),empty:"لا يوجد عربون محصل في هذه الفترة."}}
if(key==="remain"){let list=r.filter(x=>!x.closed&&x.status!=="ملغي"&&orderRemainAmt(x)>0);return{title:"🧾 تفاصيل المتبقي على العملاء",note:"الأوامر المقفولة نهائيًا لا تُحتسب هنا حتى لو كان إجماليها أكبر من العربون وقت الفتح.",rows:list.map(x=>reportOrderLine(x,orderRemainAmt(x))),empty:"لا يوجد متبقي على العملاء."}}
if(key==="count"){return{title:"🛠️ كل أوامر الفترة",rows:r.map(x=>reportOrderLine(x,x.total)),empty:"لا توجد أوامر في هذه الفترة."}}
if(key==="completed"){let list=reportCompletedOrders();return{title:"✅ الأوامر المكتملة / المغلقة",rows:list.map(x=>reportOrderLine(x,x.total)),empty:"لا توجد أوامر مكتملة أو مغلقة في هذه الفترة."}}
if(key==="expenses"){let list=reportExpensesInRange();return{title:"🧯 تفاصيل مصاريف التشغيل",rows:list.map(x=>`<div class="report-detail-row"><span>${esc(new Date(x.date).toLocaleDateString("ar-EG"))} • ${esc(x.subCategory||"غير مصنف")} • ${esc(x.reason||"")} • 💳 ${esc(x.wallet||"—")}${x.note?" — "+esc(x.note):""}</span><b>${x.type==="in"?"+":"−"}${(+x.amount||0).toFixed(2)} ج</b></div>`),empty:"لا توجد مصاريف مسجلة في هذه الفترة."}}
if(key==="sales"){const sl=reportDirectSales();return{title:"🛒 بيع قطع مباشر",note:"قطع اتباعت من المخزن من غير أمر شغل (البيعة الملغية مش محسوبة).",rows:sl.list.map(m=>`<div class="report-detail-row"><span>${esc(new Date(m.at).toLocaleDateString("ar-EG"))} • ${esc(String(Math.abs(+m.qty||0)))} × ${esc((arrCached(K.p).find(p=>p.id===m.partId)||{}).name||"قطعة")}${m.buyer?" — "+esc(m.buyer):""}</span><b>${(+m.total||0).toFixed(2)} ج</b></div>`),empty:"مفيش بيع مباشر في الفترة."}}
if(key==="revenue"){let closedOrders=reportClosedOrders(),labor=closedOrders.reduce((a,x)=>a+(+x.labor||0),0),partsSell=closedOrders.reduce((a,x)=>a+(+x.partsTotal||0),0),sl=reportDirectSales();return{title:"💰 مكوّنات الإيراد",rows:[`<div class="report-detail-row"><span>🔨 المصنعية (الأوامر المقفولة)</span><b>${labor.toFixed(2)} ج</b></div>`,`<div class="report-detail-row"><span>🔧 قطع الغيار المحصلة (الأوامر المقفولة)</span><b>${partsSell.toFixed(2)} ج</b></div>`,reportSaleRow(sl),`<div class="report-detail-row total-row"><span>= الإيراد</span><b>${(labor+partsSell+sl.rev).toFixed(2)} ج</b></div>`],empty:""}}
if(key==="grossProfit"){let closedOrders=reportClosedOrders(),labor=closedOrders.reduce((a,x)=>a+(+x.labor||0),0),partsSell=closedOrders.reduce((a,x)=>a+(+x.partsTotal||0),0),sl=reportDirectSales(),partsCost=closedOrders.reduce((a,x)=>a+(+x.partsCost||0),0)+sl.cost,revenue=labor+partsSell+sl.rev;return{title:"📈 مكوّنات المكسب قبل المصاريف",rows:[`<div class="report-detail-row"><span>💰 الإيراد</span><b>${revenue.toFixed(2)} ج</b></div>`,`<div class="report-detail-row"><span>− 📦 تكلفة القطع</span><b>${partsCost.toFixed(2)} ج</b></div>`,`<div class="report-detail-row total-row"><span>= المكسب قبل المصاريف</span><b>${(revenue-partsCost).toFixed(2)} ج</b></div>`],empty:""}}
if(key==="netProfit"){let closedOrders=reportClosedOrders(),labor=closedOrders.reduce((a,x)=>a+(+x.labor||0),0),partsSell=closedOrders.reduce((a,x)=>a+(+x.partsTotal||0),0),sl=reportDirectSales(),partsCost=closedOrders.reduce((a,x)=>a+(+x.partsCost||0),0)+sl.cost,grossProfit=labor+partsSell+sl.rev-partsCost,exp=reportExpensesInRange(),totalExpenses=exp.reduce((a,x)=>a+(x.type==="in"?-(+x.amount||0):(+x.amount||0)),0),techPay=reportTechPay(closedOrders);return{title:"✅ مكوّنات صافي المكسب",note:"مشتريات القطع (من بره المخزن أو من عهدة الفني) مش داخلة في مصاريف التشغيل، لأن تكلفتها محسوبة في «تكلفة القطع» على الأمر.",rows:[`<div class="report-detail-row"><span>📈 مكسب قبل المصاريف</span><b>${grossProfit.toFixed(2)} ج</b></div>`,`<div class="report-detail-row"><span>− 🧯 مصاريف التشغيل</span><b>${totalExpenses.toFixed(2)} ج</b></div>`].concat(techPay!==0?[`<div class="report-detail-row"><span>− 👷 أجور الفنيين</span><b>${techPay.toFixed(2)} ج</b></div>`]:[]).concat([`<div class="report-detail-row total-row"><span>= صافي المكسب</span><b>${(grossProfit-totalExpenses-techPay).toFixed(2)} ج</b></div>`]),empty:""}}
if(key==="techPay"){let list=closedOrders.filter(x=>(+x.techPay||0)!==0&&x.status!=="ملغي"),{start,end}=getReportRange(),sh=[];arrCached(K.r).forEach(r=>{if(r&&r.status!=="ملغي")(r.payShares||[]).forEach(s=>{if(s&&inRange(s.at,start,end))sh.push(`<div class="report-detail-row"><span>🔄 ${esc(r.no||"")} — ${esc(s.name||"")} • ${esc(s.note||"")}</span><b>${(+s.amount||0).toFixed(2)} ج</b></div>`)})});return{title:"👷 أجور الفنيين",note:"الأجرة المحددة على كل أمر اتقفل في الفترة، + أجرة الشغل الأول للأوامر اللي اتعملها مرتجع. الصرف الفعلي للفني من «الفنيين والعهدة» مش بيتحسب تاني.",rows:list.map(x=>reportOrderLine(x,x.techPay)).concat(sh),empty:"مفيش أجور على أوامر الفترة."}}
if(key==="avgTicket"){let completedList=reportCompletedOrders(),completedLabor=completedList.reduce((a,x)=>a+(x.closed?(+x.labor||0):0),0);return{title:"📊 متوسط قيمة الأمر (المصنعية فقط)",note:"يُحسب من المصنعية (للأوامر المقفولة) فقط ÷ عدد الأوامر المنتهية — قطع الغيار مش داخلة في الحساب ده لأنها منفصلة تمامًا عن أجر الفني.",rows:[`<div class="report-detail-row"><span>🔨 إجمالي المصنعية (المقفولة)</span><b>${completedLabor.toFixed(2)} ج</b></div>`,`<div class="report-detail-row"><span>÷ ✅ عدد الأوامر المنتهية</span><b>${completedList.length}</b></div>`,`<div class="report-detail-row total-row"><span>= متوسط قيمة الأمر</span><b>${(completedList.length?completedLabor/completedList.length:0).toFixed(2)} ج</b></div>`],empty:""}}
if(key==="partsProfitPct"){let closedOrders=reportClosedOrders(),partsSell=closedOrders.reduce((a,x)=>a+(+x.partsTotal||0),0),partsCost=closedOrders.reduce((a,x)=>a+(+x.partsCost||0),0),profit=partsSell-partsCost,pct=partsSell>0?(profit/partsSell*100):0;return{title:"📈 نسبة ربح قطع الغيار",note:"النسبة = (قطع الغيار المحصلة − تكلفة القطع) ÷ قطع الغيار المحصلة × 100، لأوامر الشغل المقفولة فقط.",rows:[`<div class="report-detail-row"><span>🔧 قطع الغيار المحصلة</span><b>${partsSell.toFixed(2)} ج</b></div>`,`<div class="report-detail-row"><span>− 📦 تكلفة القطع</span><b>${partsCost.toFixed(2)} ج</b></div>`,`<div class="report-detail-row"><span>= مكسب قطع الغيار</span><b>${profit.toFixed(2)} ج</b></div>`,`<div class="report-detail-row total-row"><span>= نسبة الربح</span><b>${pct.toFixed(1)}%</b></div>`],empty:partsSell>0?"":"لا توجد مبيعات قطع غيار في هذه الفترة لحساب النسبة."}}
return null}
function showReportDetail(key){let el=document.getElementById("reportDetail");if(!el)return;let meta=reportRowMeta(key);if(!meta)return;el.innerHTML=`<div class="report-detail-head"><b>${meta.title}</b><button type="button" class="secondary small-btn" data-wf-event="click" data-wf-code="closeReportDetail()">✖ إغلاق</button></div>${meta.note?`<div class="hint report-detail-note">${meta.note}</div>`:""}<div class="report-detail-list">${meta.rows&&meta.rows.length?meta.rows.join(""):`<div class="hint">${meta.empty||""}</div>`}</div>`;el.classList.remove("hidden");el.scrollIntoView({behavior:"smooth",block:"nearest"})}
function closeReportDetail(){document.getElementById("reportDetail")?.classList.add("hidden")}
function deleteExpense(i){deleteWalletTx(i);financeReport()}
function renderExpenseList(){
  let el=document.getElementById("expenseList");if(!el)return;
  let{start,end}=getReportRange();
  let exp=allTrackedExpensesInRange(start,end).sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(!exp.length){el.innerHTML=`<div class="hint">لا توجد مصاريف مسجلة في هذه الفترة.</div>`;return}
  let breakdown=spendingBreakdownInRange(start,end),total=breakdown.reduce((a,x)=>a+x.amount,0),top=breakdown[0];
  let topHtml=top?`<div class="wallet-icon-card" style="display:flex;margin-bottom:10px"><i>🏆</i><b>الأكتر صرفًا في الفترة: ${esc(top.label)} (${top.catShort})</b><span>${top.amount.toFixed(2)} ج</span></div>`:"";
  let summaryHtml=`${topHtml}<h3 class="expense-subtitle">🧯 تفاصيل المصاريف حسب النوع — تشغيل وشخصي (${exp.length} حركة، إجمالي ${total.toFixed(2)} ج)</h3><table class="month-table">${breakdown.map(x=>`<tr><td>${esc(x.label)} <small>(${x.catShort})</small></td><td>${x.amount.toFixed(2)} ج <small>(${x.count})</small> <em class="spend-pct">${spendPct(x.amount,total)}%</em></td></tr>`).join("")}</table>`;
  let rowsHtml=exp.map(x=>`<div class="expense-row"><span>${esc(new Date(x.date).toLocaleDateString("ar-EG"))}</span><span>${esc(x.subCategory||"غير مصنف")} • ${esc(x.category==="مصروف شخصي"?"🙋 شخصي":"🔧 تشغيل")} • ${esc(x.reason||"")}</span><b>${x.type==="in"?"+":"−"}${(+x.amount||0).toFixed(2)} ج</b><span class="expense-note">💳 ${esc(x.wallet||"—")}${x.note?" • "+esc(x.note):""}</span><button type="button" class="mini-action" data-wf-event="click" data-wf-code="deleteExpense('${x.id}')">🗑️</button></div>`).join("");
  el.innerHTML=summaryHtml+rowsHtml;
}
function monthReport(){if(!document.getElementById("monthlyReport"))return;if(!document.getElementById("reportMode"))setReportMode("month");else financeReport()}// نفس مبدأ فصل قراءة الفورم عن منطق الحفظ اللي اتطبّق على أمر الشغل،
// اتطبّق هنا على حفظ العميل. تأكيد رقم الهاتف المكرر فضل في onsubmit
// لأنه فعليًا تفاعل مع المستخدم (confirm) مش منطق حفظ بيانات.
