/* reports.js — صفحة «التقارير والتحليلات» (reports.html).
   كل الأرقام بتتحسب من بيانات الجهاز (مفيش قراءة من السيرفر):
   - الماليات بتتحسب بتاريخ القفل (closedAt، ولو قديم من غيره: تاريخ الإنشاء) — نفس منطق تقرير الرئيسية.
   - كل رقم مهم بيتقارن بالفترة اللي قبلها بنفس الطول (▲/▼).
   - «ملاحظات سريعة» فوق بتلخّص أهم حاجة محتاج تاخد بالك منها. */
(function(){
  const money=n=>(+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' ج';
  const money0=n=>Math.round(+n||0).toLocaleString('en-US')+' ج';
  const num=n=>(+n||0).toLocaleString('en-US',{maximumFractionDigits:1});
  const dateKey=d=>window.dayKeyLocal?window.dayKeyLocal(d):`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const detailHref=(page,id)=>`${page}?id=${encodeURIComponent(String(id??''))}`;
  const detailLink=(page,id,label)=>id==null||String(id)===''?escR(label):`<a href="${detailHref(page,id)}">${escR(label)}</a>`;
  const escR=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const DAY=864e5;
  const WEEKDAYS=['الأحد','الاتنين','التلات','الأربع','الخميس','الجمعة','السبت'];
  const SOURCES={portal:'🌐 بوابة العملاء',guest:'🛠️ طلب سريع (زائر)',server:'🌐 بوابة العملاء'};
  const safe=(fn,fb)=>{try{const v=fn();return v===undefined?fb:v}catch(e){return fb}};
  function list(k){return safe(()=>arr(k),[])||[]}

  function validDateKey(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;const d=new Date(value+'T12:00:00');return !Number.isNaN(d.getTime())&&dateKey(d)===value}
  function mkRange(from,to){return {from,to,valid:true,start:new Date(from+'T00:00:00'),end:new Date(to+'T23:59:59.999')}}
  function range(){
    let from=document.getElementById('repFrom')?.value,to=document.getElementById('repTo')?.value;
    let now=new Date();
    if(!from)from=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    if(!to)to=dateKey(new Date(now.getFullYear(),now.getMonth()+1,0));
    if(!validDateKey(from)||!validDateKey(to))return {from,to,valid:false,reason:'اكتب تاريخًا صحيحًا في حقلي الفترة.'};
    if(from>to)return {from,to,valid:false,reason:'تاريخ البداية يجب أن يكون قبل تاريخ النهاية أو مساويًا له.'};
    return mkRange(from,to);
  }
  /* الفترة اللي قبلها بنفس عدد الأيام (للمقارنة) */
  function prevRange(r){
    const days=Math.round((new Date(r.to+'T12:00:00')-new Date(r.from+'T12:00:00'))/DAY)+1;
    const e=new Date(r.from+'T12:00:00');e.setDate(e.getDate()-1);
    const s=new Date(e);s.setDate(s.getDate()-days+1);
    return mkRange(dateKey(s),dateKey(e));
  }
  function inRangeDate(v,r){if(!v)return false;const d=typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?new Date(v+'T12:00:00'):new Date(v);return !Number.isNaN(d.getTime())&&d>=r.start&&d<=r.end}
  function inRangeDay(v,r){if(!v)return false;const raw=String(v);const k=/^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:dateKey(new Date(raw));return !!k&&k>=r.from&&k<=r.to}
  function dayOf(v){if(!v)return '';const raw=String(v);if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;const d=new Date(raw);return Number.isNaN(d.getTime())?'':dateKey(d)}
  function orders(r,records=arr(K.r)){return records.filter(x=>inRangeDate(x.createdAt,r)||inRangeDate(x.closedAt,r))}
  function walletEntries(){return safe(()=>typeof walletTxEntries==="function"?walletTxEntries():[],[])||[]}
  function expenses(r){return walletEntries().filter(x=>x.category==="مصروف تشغيل"&&inRangeDay(x.date,r))}
  function treasuryUntil(end){return list(K.tr).filter(x=>!x.deleted&&new Date((x.date||'1970-01-01')+'T'+(x.time||'00:00'))<=end).reduce((a,x)=>a+(x.type==='in'?(+x.amount||0):-(+x.amount||0)),0)}
  const revOf=o=>(+o.labor||0)+(+o.partsTotal||0);
  function cycleStart(o){const d=safe(()=>typeof requestCycleStart==='function'?requestCycleStart(o):null,null);if(d&&!Number.isNaN(d.getTime?.()))return d;const c=new Date(o.createdAt||0);return Number.isNaN(c.getTime())?null:c}
  function areaOf(o,customers){
    const a=safe(()=>typeof resolveRequestAddress==='function'?resolveRequestAddress(o):null,null);
    if(a&&(a.center||a.village))return {center:a.center||'غير محدد',village:a.village||''};
    const c=customers.get(o.customerId)||{},m=c.mainAddress||c.address||{};
    return {center:(m&&m.center)||c.center||'غير محدد',village:(m&&m.village)||c.village||''};
  }
  function bump(map,k,f){const v=map.get(k)||f();map.set(k,v);return v}

  function compute(r,light){
    const allOrders=arr(K.r).filter(Boolean),os=orders(r,allOrders),ex=expenses(r);
    const closedOrders=allOrders.filter(x=>x.closed&&inRangeDate(x.closedAt||x.createdAt,r));
    const labor=closedOrders.reduce((a,x)=>a+(+x.labor||0),0),partsSell=closedOrders.reduce((a,x)=>a+(+x.partsTotal||0),0),partsCost=closedOrders.reduce((a,x)=>a+(+x.partsCost||0),0),revenue=labor+partsSell,gross=revenue-partsCost;
    const totalExp=ex.reduce((a,x)=>a+(x.type==="in"?-(+x.amount||0):(+x.amount||0)),0);
    const sharesIn=x=>x&&x.status!=="ملغي"?(x.payShares||[]).filter(s=>s&&inRangeDate(s.at,r)).reduce((b,s)=>b+(+s.amount||0),0):0;
    const techPay=closedOrders.reduce((a,x)=>a+(+x.techPay||0),0)+allOrders.reduce((a,x)=>a+sharesIn(x),0),net=gross-totalExp-techPay;
    const completed=os.filter(x=>x.closed?inRangeDate(x.closedAt||x.createdAt,r):x.status==='مكتمل').length;
    const created=allOrders.filter(x=>inRangeDate(x.createdAt,r));
    const collectedTx=walletEntries().filter(x=>!x.deleted&&x.type==='in'&&x.category==='تحصيل عميل'&&inRangeDay(x.date,r));
    const collected=collectedTx.reduce((a,x)=>a+(+x.amount||0),0);
    const durations=closedOrders.map(o=>{const s=cycleStart(o),e=o.closedAt?new Date(o.closedAt):null;return s&&e&&!Number.isNaN(e.getTime())&&e>=s?(e-s)/DAY:null}).filter(v=>v!==null);
    const avgDays=durations.length?durations.reduce((a,b)=>a+b,0)/durations.length:null;
    const returns=[];allOrders.forEach(o=>(Array.isArray(o.statusHistory)?o.statusHistory:[]).forEach(h=>{if(h&&/^مرتجع/.test(String(h.note||''))&&inRangeDate(h.at,r))returns.push({o,at:h.at,note:h.note})}));
    const cancelAt=o=>{const h=(Array.isArray(o.statusHistory)?o.statusHistory:[]).filter(x=>x&&x.to==='ملغي').pop();return h?h.at:(o.cancelledAt||o.createdAt)};
    const cancelled=allOrders.filter(o=>o.status==='ملغي'&&inRangeDate(cancelAt(o),r));
    const base={r,os,closedOrders,created,labor,partsSell,partsCost,revenue,gross,totalExp,techPay,net,completed,collected,avgDays,returns,cancelled,
      avgTicket:closedOrders.length?revenue/closedOrders.length:0};
    if(light)return base;
    const cs=list(K.c),ds=list(K.d),psAll=list(K.p),ps=psAll.filter(p=>p&&!p.archived&&!p.deleted),ts=list(K.tasks).filter(x=>inRangeDay(x.date,r)),tr=list(K.tr).filter(x=>!x.deleted&&inRangeDay(x.date,r));
    const open=os.filter(x=>!x.closed&&x.status!=='ملغي').length,activeOrders=allOrders.filter(x=>!x.closed&&x.status!=='مكتمل'&&x.status!=='ملغي'),waiting=activeOrders.filter(x=>x.partsWaiting===true||x.partsWaiting==='yes').length,currentWorkshop=activeOrders.filter(x=>x.workshopStatus!=='تم التسليم'&&(x.executionPlace==='الورشة'||(x.workshopStatus&&x.workshopStatus!=='غير مطلوب'))).filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i),workshop=currentWorkshop.length;
    const custMap=new Map(cs.map(c=>[c.id,c])),devMap=new Map(ds.map(x=>[x.id,x]));
    // التحصيل: حسب المحفظة + المستحق على العملاء (مكتمل ولسه ماتقفلش/ماتدفعش) + عربون الأوامر المفتوحة
    const byWallet=new Map();collectedTx.forEach(x=>{const k=x.wallet||'غير محدد';byWallet.set(k,(byWallet.get(k)||0)+(+x.amount||0))});
    const receivables=allOrders.filter(o=>o.status==='مكتمل'&&!o.closed&&!o.paid).map(o=>({o,due:Math.max(0,Math.round(((+o.total||0)-(+o.deposit||0))*100)/100)})).filter(x=>x.due>0).sort((a,b)=>b.due-a.due);
    const depositsHeld=activeOrders.reduce((a,o)=>a+(+o.deposit||0),0);
    // الفنيين
    const techs=new Map();
    closedOrders.forEach(o=>{const t=bump(techs,o.techName||'بدون فني',()=>({closed:0,rev:0,pay:0,days:[],returns:0,open:0}));t.closed++;t.rev+=revOf(o);t.pay+=(+o.techPay||0);const s=cycleStart(o),e=o.closedAt?new Date(o.closedAt):null;if(s&&e&&e>=s)t.days.push((e-s)/DAY)});
    activeOrders.forEach(o=>{if(o.techName)bump(techs,o.techName,()=>({closed:0,rev:0,pay:0,days:[],returns:0,open:0})).open++});
    returns.forEach(x=>{bump(techs,x.o.techName||'بدون فني',()=>({closed:0,rev:0,pay:0,days:[],returns:0,open:0})).returns++});
    // المناطق
    const areas=new Map(),villages=new Map();
    created.forEach(o=>{const a=areaOf(o,custMap);bump(areas,a.center,()=>({orders:0,rev:0})).orders++;if(a.village)bump(villages,a.center+' — '+a.village,()=>({orders:0,rev:0})).orders++});
    closedOrders.forEach(o=>{const a=areaOf(o,custMap);bump(areas,a.center,()=>({orders:0,rev:0})).rev+=revOf(o)});
    // الأجهزة: إيراد حسب النوع والماركة
    const byType=new Map(),byBrand=new Map();
    closedOrders.forEach(o=>{const dv=devMap.get(o.deviceId)||{};const t=bump(byType,dv.type||'غير محدد',()=>({n:0,rev:0}));t.n++;t.rev+=revOf(o);const b=bump(byBrand,dv.brand||'غير محدد',()=>({n:0,rev:0}));b.n++;b.rev+=revOf(o)});
    // مصادر الأوامر + مكان التنفيذ + أيام الأسبوع
    const sources=new Map(),places={workshop:0,home:0},weekdays=[0,0,0,0,0,0,0];
    created.forEach(o=>{const k=SOURCES[o.source]||'🧑‍💼 من الإدارة';sources.set(k,(sources.get(k)||0)+1);if(o.executionPlace==='الورشة')places.workshop++;else places.home++;const d=new Date(o.createdAt);if(!Number.isNaN(d.getTime()))weekdays[d.getDay()]++});
    // الاتجاه اليومي (بيتجمّع أسبوعيًا/شهريًا لو الفترة طويلة)
    const spanDays=Math.round((r.end-r.start)/DAY)+1,bucket=spanDays>400?'month':spanDays>62?'week':'day';
    const keyFor=k=>{if(!k)return '';if(bucket==='day')return k;const d=new Date(k+'T12:00:00');if(bucket==='month')return k.slice(0,7);const s=new Date(d);s.setDate(d.getDate()-((d.getDay()+1)%7));return dateKey(s)}; // الأسبوع بيبدأ السبت
    const series=new Map();for(let d=new Date(r.start);d<=r.end;d.setDate(d.getDate()+1)){const k=keyFor(dateKey(d));if(!series.has(k))series.set(k,{rev:0,orders:0})}
    closedOrders.forEach(o=>{const k=keyFor(dayOf(o.closedAt||o.createdAt));if(series.has(k))series.get(k).rev+=revOf(o)});
    created.forEach(o=>{const k=keyFor(dayOf(o.createdAt));if(series.has(k))series.get(k).orders++});
    // العملاء
    const ordersPerCust=new Map();allOrders.forEach(o=>{if(o.customerId)ordersPerCust.set(o.customerId,(ordersPerCust.get(o.customerId)||0)+1)});
    const activeCust=new Set(os.map(o=>o.customerId).filter(Boolean)),repeat=[...activeCust].filter(id=>(ordersPerCust.get(id)||0)>=2).length;
    const custRev=new Map();closedOrders.forEach(o=>{if(o.customerId)custRev.set(o.customerId,(custRev.get(o.customerId)||0)+revOf(o))});
    // المخزن: الاستهلاك الفعلي (خروج − إرجاع) والوارد
    const moves=list(K.m).filter(m=>m&&inRangeDate(m.at,r)),partMap=new Map(psAll.map(p=>[p.id,p])),use=new Map();let inQty=0,outQty=0,usedValue=0;
    moves.forEach(m=>{const t=String(m.type||''),q=Math.abs(+m.qty||0),p=partMap.get(m.partId)||{};let sign=0;if(/خروج|out/i.test(t))sign=1;else if(/إرجاع|ارجاع|return/i.test(t))sign=-1;else if(/توريد|دخول|in/i.test(t)){inQty+=q;return}else sign=1;
      if(sign>0)outQty+=q;usedValue+=sign*q*(+p.buy||0);if(m.partId)use.set(m.partId,(use.get(m.partId)||0)+sign*q)});
    // المصاريف حسب البند
    const expByCat=new Map();ex.forEach(x=>{const k=x.subCategory||x.reason||'أخرى';expByCat.set(k,(expByCat.get(k)||0)+(x.type==='in'?-(+x.amount||0):(+x.amount||0)))});
    return Object.assign(base,{ex,cs,ds,ps,ts,tr,open,waiting,workshop,low:ps.filter(p=>(+p.qty||0)<=(+p.min||0)).length,treasuryBalance:treasuryUntil(r.end),
      byWallet,receivables,depositsHeld,techs,areas,villages,byType,byBrand,sources,places,weekdays,series,bucket,activeCust,repeat,custRev,moves,use,inQty,outQty,usedValue,expByCat,custMap,devMap});
  }
  function reportData(){const r=range();const d=compute(r);d.prev=compute(prevRange(r),true);return d}

  /* ---------- CSV ---------- */
  function csvCell(v){const s=String(v??"");return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
  function downloadCSV(filename,headers,rows){
    try{
      const lines=[headers].concat(rows).map(r=>r.map(csvCell).join(","));
      // ﻿ (BOM) عشان إكسل يفتح الملف بالعربي صح من غير ما يتحول لرموز غريبة.
      const blob=new Blob(["﻿"+lines.join("\r\n")],{type:"text/csv;charset=utf-8;"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
      return true;
    }catch(e){console.error("[reports] تعذر تصدير CSV",e);alert("تعذر إنشاء ملف CSV.");return false}
  }
  function exportOrdersCSV(){const d=reportData();downloadCSV(`تقرير-اوامر-الشغل-${d.r.from}-الى-${d.r.to}.csv`,["رقم الأمر","العميل","الجهاز","الحالة","المكان","الفني","المصنعية","القطع","الإجمالي","العربون","تاريخ الإنشاء","تاريخ القفل"],d.os.map(o=>[o.no||"",customerName(o.customerId),deviceName(o.deviceId),o.status||"",o.executionPlace==="الورشة"?"الورشة":"العميل",o.techName||"",(+o.labor||0).toFixed(2),(+o.partsTotal||0).toFixed(2),(+o.total||0).toFixed(2),(+o.deposit||0).toFixed(2),dayOf(o.createdAt),dayOf(o.closedAt)]))}
  function exportInventoryCSV(){const d=reportData();downloadCSV(`تقرير-المخزن-${d.r.to}.csv`,["اسم الصنف","الكمية الحالية","الحد الأدنى","سعر الشراء","سعر البيع","المستهلك بالفترة"],d.ps.map(p=>[p.name||"",p.qty||0,p.min||0,(+p.buy||0).toFixed(2),(+p.sell||0).toFixed(2),d.use.get(p.id)||0]))}
  function exportTreasuryCSV(){const d=reportData();downloadCSV(`تقرير-الخزنة-${d.r.from}-الى-${d.r.to}.csv`,["التاريخ","الوقت","الحركة","السبب","لمن/من","المكان","المبلغ"],d.tr.map(x=>[x.date||"",x.time||"",x.type==="in"?"وارد":"صرف",x.reason||"",x.counterparty||"",x.place||"",(+x.amount||0).toFixed(2)]))}
  function exportSummaryCSV(){const d=reportData();const p=d.prev;downloadCSV(`ملخص-التقرير-${d.r.from}-الى-${d.r.to}.csv`,["البند","الفترة","الفترة اللي قبلها"],[
    ["الإيراد",d.revenue.toFixed(2),p.revenue.toFixed(2)],["المصنعية",d.labor.toFixed(2),p.labor.toFixed(2)],["قطع الغيار",d.partsSell.toFixed(2),p.partsSell.toFixed(2)],["تكلفة القطع",d.partsCost.toFixed(2),p.partsCost.toFixed(2)],
    ["مصاريف التشغيل",d.totalExp.toFixed(2),p.totalExp.toFixed(2)],["أجور الفنيين",d.techPay.toFixed(2),p.techPay.toFixed(2)],["صافي المكسب",d.net.toFixed(2),p.net.toFixed(2)],["المحصّل فعليًا",d.collected.toFixed(2),p.collected.toFixed(2)],
    ["أوامر جديدة",d.created.length,p.created.length],["أوامر اتقفلت",d.closedOrders.length,p.closedOrders.length],["متوسط قيمة الأمر",d.avgTicket.toFixed(2),p.avgTicket.toFixed(2)],["مرتجعات",d.returns.length,p.returns.length],["ملغي",d.cancelled.length,p.cancelled.length]])}

  /* ---------- أدوات العرض ---------- */
  function section(title,body,id){return `<section id="${id}" class="panel report-section"><div class="report-section-head"><h2>${title}</h2></div>${body}</section>`}
  function delta(cur,prev,lowerIsBetter){
    cur=+cur||0;prev=+prev||0;
    if(!prev&&!cur)return '<small class="rep-delta">— زي الفترة اللي فاتت</small>';
    if(!prev)return '<small class="rep-delta up">🆕 مفيش أرقام في الفترة اللي فاتت</small>';
    const p=(cur-prev)/Math.abs(prev)*100;if(Math.abs(p)<0.5)return '<small class="rep-delta">— تقريبًا زي الفترة اللي فاتت</small>';
    const good=lowerIsBetter?p<0:p>0;return `<small class="rep-delta ${good?'up':'down'}">${p>0?'▲':'▼'} ${num(Math.abs(p))}% عن اللي فاتت</small>`;
  }
  function card(label,value,sub,href,cls){const tag=href?'a':'div';return `<${tag} class="report-card${href?' report-card-link':''}${cls?' '+cls:''}"${href?` href="${href}"`:''}><span>${label}</span><b>${value}</b>${sub||''}</${tag}>`}
  function bars(map,opts={}){
    const rows=[...map.entries()].sort((a,b)=>(opts.val?opts.val(b[1]):b[1])-(opts.val?opts.val(a[1]):a[1])).slice(0,opts.top||10);
    if(!rows.length)return `<div class="report-empty">${opts.empty||'لا توجد بيانات في الفترة.'}</div>`;
    const max=Math.max(...rows.map(x=>opts.val?opts.val(x[1]):x[1]),1);
    return '<div class="rep-bars">'+rows.map(([k,v])=>{const val=opts.val?opts.val(v):v;return `<div class="rep-bar"><div class="rep-bar-top"><span>${opts.label?opts.label(k):escR(k)}</span><b>${opts.fmt?opts.fmt(val,v):num(val)}</b></div><i style="width:${Math.max(2,val/max*100).toFixed(1)}%"></i></div>`}).join('')+'</div>';
  }
  const fmtDay=k=>{try{return new Date(k+'T12:00:00').toLocaleDateString('ar-EG',{day:'numeric',month:'short'})}catch(e){return k}};
  const fmtLong=k=>{try{return new Date(k+'T12:00:00').toLocaleDateString('ar-EG',{day:'numeric',month:'long',year:'numeric'})}catch(e){return k}};
  function trendChart(d){
    const pts=[...d.series.entries()];if(!pts.length)return '';
    const W=Math.max(320,pts.length*14),H=150,pad=18,bw=(W-pad*2)/pts.length,maxR=Math.max(...pts.map(p=>p[1].rev),1),maxO=Math.max(...pts.map(p=>p[1].orders),1);
    const lab=k=>d.bucket==='month'?k:fmtDay(k),every=Math.ceil(pts.length/8);
    let g='';pts.forEach(([k,v],i)=>{const h=v.rev/maxR*(H-40),x=pad+i*bw;g+=`<rect x="${(x+bw*0.15).toFixed(1)}" y="${(H-22-h).toFixed(1)}" width="${(bw*0.7).toFixed(1)}" height="${Math.max(h,v.rev?2:0).toFixed(1)}" rx="2" class="rep-c-bar"><title>${escR(lab(k))}: ${escR(money0(v.rev))} • ${v.orders} أمر جديد</title></rect>`;if(i%every===0)g+=`<text x="${(x+bw/2).toFixed(1)}" y="${H-6}" class="rep-c-lbl" text-anchor="middle">${escR(lab(k))}</text>`});
    const line=pts.map(([k,v],i)=>`${(pad+i*bw+bw/2).toFixed(1)},${(H-22-v.orders/maxO*(H-40)).toFixed(1)}`).join(' ');
    g+=`<polyline points="${line}" class="rep-c-line"/>`;
    return `<div class="rep-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="الإيراد وعدد الأوامر الجديدة على مدار الفترة">${g}</svg></div><div class="rep-legend"><span><i class="b"></i>الإيراد (${d.bucket==='day'?'يومي':d.bucket==='week'?'أسبوعي':'شهري'}) — أعلى قيمة ${escR(money0(maxR))}</span><span><i class="l"></i>الأوامر الجديدة — أعلى رقم ${maxO}</span></div>`;
  }

  /* ---------- الأقسام ---------- */
  const NAV=[['report-insights','💡 ملخص'],['report-finance','المالية'],['report-trend','الاتجاه'],['report-collect','التحصيل'],['report-orders','أوامر الشغل'],['report-techs','الفنيين'],['report-areas','المناطق'],['report-customers','العملاء'],['report-devices','الأجهزة'],['report-inventory','المخزن'],['report-workshop','الورشة'],['report-returns','الإلغاء والمرتجعات'],['report-treasury','الخزنة'],['report-tasks','المهام']];
  function cards(d){const p=d.prev;return `<nav class="report-shortcuts" aria-label="الانتقال إلى أقسام التقرير">${NAV.map(([id,t])=>`<a href="#${id}">${t}</a>`).join('')}</nav><div class="report-cards report-summary-cards">
    ${card('💰 الإيراد',money(d.revenue),delta(d.revenue,p.revenue),'#report-finance')}${card('✅ صافي المكسب',money(d.net),delta(d.net,p.net),'#report-finance',d.net<0?'report-card-warn':'')}
    ${card('💵 المحصّل فعليًا',money(d.collected),delta(d.collected,p.collected),'#report-collect')}${card('🧾 متوسط قيمة الأمر',money(d.avgTicket),delta(d.avgTicket,p.avgTicket),'#report-finance')}
    ${card('🛠️ أوامر الفترة',d.os.length,`<small>جديد ${d.created.length} ${delta(d.created.length,p.created.length)}</small>`,'#report-orders')}${card('🔒 مكتملة/مغلقة',d.completed,delta(d.closedOrders.length,p.closedOrders.length),'#report-orders')}
    ${card('⏱️ متوسط مدة الإنجاز',d.avgDays===null?'—':num(d.avgDays)+' يوم',d.prev.avgDays!==null&&d.avgDays!==null?delta(d.avgDays,d.prev.avgDays,true):'<small>من الفتح للقفل</small>','#report-techs')}${card('🔄 مرتجعات',d.returns.length,`<small>${d.closedOrders.length?num(d.returns.length/d.closedOrders.length*100)+'% من المقفول':''}</small>`,'#report-returns',d.returns.length?'report-card-warn':'')}
    <a class="report-card report-card-link" href="#report-workshop"><span>📦 انتظار قطع</span><b>${d.waiting}</b><small>فتح تقرير الورشة</small></a><a class="report-card report-card-link" href="#report-workshop"><span>🏭 في الورشة</span><b>${d.workshop}</b><small>عرض الموجود بالورشة</small></a><a class="report-card report-card-link" href="#report-customers"><span>👤 العملاء</span><b>${d.cs.length}</b><small>فتح تقرير العملاء</small></a><a class="report-card report-card-link" href="#report-inventory"><span>📦 أصناف المخزن</span><b>${d.ps.length} · منخفض ${d.low}</b><small>فتح تقرير المخزن</small></a>
  </div>`}
  function insights(d){
    const p=d.prev,out=[];
    if(p.revenue||d.revenue){const ch=p.revenue?(d.revenue-p.revenue)/p.revenue*100:null;out.push(ch===null?`💰 إيراد الفترة ${money0(d.revenue)}.`:`💰 الإيراد ${ch>=0?'زاد':'قل'} ${num(Math.abs(ch))}% عن الفترة اللي فاتت (${money0(d.revenue)} مقابل ${money0(p.revenue)}).`)}
    if(d.revenue>0)out.push(`📈 هامش الربح بعد كل المصاريف ${num(d.net/d.revenue*100)}% — ${d.net>=0?'كل 100 ج إيراد بيفضل منها':'خسارة'} ${num(Math.abs(d.net/d.revenue*100))} ج.`);
    if(d.receivables.length)out.push(`🧾 ${d.receivables.length} أمر مكتمل لسه ماتحصّلش (${money0(d.receivables.reduce((a,x)=>a+x.due,0))}) — شوف قسم «التحصيل».`);
    const topArea=[...d.areas.entries()].filter(x=>x[0]!=='غير محدد').sort((a,b)=>b[1].orders-a[1].orders)[0];if(topArea)out.push(`📍 أكتر منطقة طلبًا: ${escR(topArea[0])} (${topArea[1].orders} أمر).`);
    const wd=d.weekdays.indexOf(Math.max(...d.weekdays));if(d.created.length>=7)out.push(`📅 أكتر يوم بيجيلك فيه شغل: ${WEEKDAYS[wd]}.`);
    const topType=[...d.byType.entries()].sort((a,b)=>b[1].rev-a[1].rev)[0];if(topType&&topType[1].rev>0)out.push(`🔧 أكتر نوع جهاز بيجيب فلوس: ${escR(topType[0])} (${money0(topType[1].rev)}).`);
    if(d.closedOrders.length&&d.returns.length/d.closedOrders.length>0.08)out.push(`🔄 نسبة المرتجعات ${num(d.returns.length/d.closedOrders.length*100)}% — أعلى من الطبيعي، راجع قسم «الإلغاء والمرتجعات».`);
    if(d.cancelled.length)out.push(`❌ ${d.cancelled.length} أمر اتلغى في الفترة.`);
    if(d.low)out.push(`📦 ${d.low} صنف وصل للحد الأدنى في المخزن.`);
    if(d.avgDays!==null)out.push(`⏱️ الأمر بياخد في المتوسط ${num(d.avgDays)} يوم من الفتح للقفل.`);
    return section('💡 ملاحظات سريعة',out.length?`<ul class="rep-insights">${out.map(x=>`<li>${x}</li>`).join('')}</ul>`:'<div class="report-empty">مفيش بيانات كفاية في الفترة دي.</div>','report-insights');
  }
  function finance(d){
    const margin=d.revenue?` (${num(d.gross/d.revenue*100)}%)`:'';
    const expRows=bars(d.expByCat,{fmt:v=>money(v),empty:'لا توجد مصاريف تشغيل في الفترة.'});
    return section('💰 التقرير المالي',`<div class="report-table-wrap"><table class="report-table-full rep-fin"><tr><th>البند</th><th>القيمة</th><th>ملاحظة</th></tr><tr><td>🔨 المصنعية</td><td>${money(d.labor)}</td><td>من الأوامر المقفولة</td></tr><tr><td>🔧 قطع الغيار المحصلة</td><td>${money(d.partsSell)}</td><td>من الأوامر المقفولة</td></tr><tr><td>📦 تكلفة القطع</td><td>${money(d.partsCost)}</td><td>تكلفة القطع المستخدمة</td></tr><tr><td>💰 الإيراد</td><td>${money(d.revenue)}</td><td>مصنعية + قطع</td></tr><tr><td>📈 مكسب قبل المصاريف</td><td>${money(d.gross)}</td><td>الإيراد − تكلفة القطع${margin}</td></tr><tr><td>🧯 مصاريف التشغيل</td><td>${money(d.totalExp)}</td><td>لا تدخل في رصيد الخزنة (مشتريات القطع محسوبة في تكلفة القطع)</td></tr>${d.techPay!==0?`<tr><td>👷 أجور الفنيين</td><td>${money(d.techPay)}</td><td>الأجرة على الأوامر المقفولة</td></tr>`:""}<tr class="report-total"><td>✅ صافي المكسب</td><td>${money(d.net)}</td><td>للنشاط${d.revenue?` — ${num(d.net/d.revenue*100)}% من الإيراد`:''}</td></tr></table></div>
      <div class="report-cards"><div class="report-card"><span>ربح القطع</span><b>${money(d.partsSell-d.partsCost)}</b><small>${d.partsSell?num((d.partsSell-d.partsCost)/d.partsSell*100)+'% من بيع القطع':''}</small></div><div class="report-card"><span>المصنعية من الإيراد</span><b>${d.revenue?num(d.labor/d.revenue*100)+'%':'—'}</b></div><div class="report-card"><span>متوسط مكسب الأمر</span><b>${money(d.closedOrders.length?d.net/d.closedOrders.length:0)}</b></div><div class="report-card"><span>الفترة اللي فاتت (صافي)</span><b>${money(d.prev.net)}</b><small>${escR(fmtDay(d.prev.r.from))} – ${escR(fmtDay(d.prev.r.to))}</small></div></div>
      <h3>🧯 المصاريف حسب البند</h3>${expRows}`,'report-finance');
  }
  function trend(d){
    const wdMap=new Map(WEEKDAYS.map((w,i)=>[w,d.weekdays[i]]));
    return section('📈 الاتجاه على مدار الفترة',`${trendChart(d)}<div class="report-mini-grid"><div><h3>📅 الأوامر الجديدة حسب يوم الأسبوع</h3>${bars(wdMap,{top:7,empty:'لا توجد أوامر جديدة.'})}</div><div><h3>🌐 مصدر الأوامر الجديدة</h3>${bars(d.sources,{empty:'لا توجد أوامر جديدة.'})}<h3>📍 مكان التنفيذ</h3>${bars(new Map([['🏭 في الورشة',d.places.workshop],['🏠 عند العميل',d.places.home]]),{empty:'لا توجد أوامر جديدة.'})}</div></div>`,'report-trend');
  }
  function collections(d){
    const due=d.receivables.reduce((a,x)=>a+x.due,0);
    const more=d.receivables.length-10,rows=d.receivables.slice(0,10).map(x=>`<div class="report-list-row"><span>${detailLink('request.html',x.o.id,x.o.no||'أمر')} — ${detailLink('customer.html',x.o.customerId,customerName(x.o.customerId))}</span><b>${money(x.due)}</b></div>`).join('');
    return section('🧾 التحصيل والمديونية',`<div class="report-cards"><div class="report-card"><span>المحصّل فعليًا في الفترة</span><b>${money(d.collected)}</b>${delta(d.collected,d.prev.collected)}</div><div class="report-card"><span>نسبة التحصيل من الإيراد</span><b>${d.revenue?num(d.collected/d.revenue*100)+'%':'—'}</b><small>بتشمل العرابين ودفعات الأوامر المفتوحة</small></div><div class="report-card ${due?'report-card-warn':''}"><span>مكتمل ولسه ماتحصّلش</span><b>${money(due)}</b><small>${d.receivables.length} أمر</small></div><div class="report-card"><span>عربون على أوامر مفتوحة</span><b>${money(d.depositsHeld)}</b><small>فلوس مستلمة لشغل لسه ماخلصش</small></div></div>
      <div class="report-mini-grid"><div><h3>💳 المحصّل حسب المحفظة</h3>${bars(d.byWallet,{fmt:v=>money(v),empty:'مفيش تحصيلات في الفترة.'})}</div><div><h3>⏳ أوامر مكتملة لسه ماتحصّلتش — اضغط للفتح</h3><div class="report-list">${rows||'<div class="report-empty">كل الأوامر المكتملة اتحصّلت 👌</div>'}</div>${more>0?`<p><a href="requests.html?list=1&amp;f=unpaid&amp;st=${encodeURIComponent('مكتمل')}">وكمان ${more} أمر — افتحهم كلهم في أوامر الشغل ›</a></p>`:''}</div></div>`,'report-collect');
  }
  function orderRow(o){return `<div class="report-list-row rep-order"><span>${detailLink('request.html',o.id,o.no||'—')} • ${detailLink('customer.html',o.customerId,customerName(o.customerId))} • ${detailLink('device.html',o.deviceId,deviceName(o.deviceId))}<small>${escR(o.status||'—')} • ${o.executionPlace==='الورشة'?'🏭 الورشة':'🏠 العميل'}${o.techName?' • 👷 '+escR(o.techName):''}${(+o.deposit||0)>0?' • عربون '+escR(money(o.deposit)):''}</small></span><b>${money(o.total)}</b></div>`}
  function ordersReport(d){
    const sorted=d.os.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    const P=window.WFPager;const body=sorted.length?(P&&P.render?P.render('rep-orders',sorted,orderRow,d.r.from+'|'+d.r.to+'|'+sorted.length).html:sorted.map(orderRow).join('')):'<div class="report-empty">لا توجد أوامر في الفترة.</div>';
    const byStatus=new Map();d.os.forEach(o=>{const k=o.closed?'🔒 مقفول':(o.status||'—');byStatus.set(k,(byStatus.get(k)||0)+1)});
    return section('🛠️ تقرير أوامر الشغل',`<div class="report-cards"><div class="report-card"><span>أوامر جديدة</span><b>${d.created.length}</b>${delta(d.created.length,d.prev.created.length)}</div><div class="report-card"><span>اتقفلت في الفترة</span><b>${d.closedOrders.length}</b>${delta(d.closedOrders.length,d.prev.closedOrders.length)}</div><div class="report-card"><span>مفتوحة من أوامر الفترة</span><b>${d.open}</b></div><div class="report-card"><span>اتلغت</span><b>${d.cancelled.length}</b></div></div>
      <h3>حسب الحالة</h3>${bars(byStatus,{empty:'لا توجد أوامر.'})}
      <details class="rep-details"><summary>📋 قائمة أوامر الفترة (${sorted.length}) <button type="button" class="secondary small-btn no-print" data-wf-event="click" data-wf-code="exportOrdersCSV()">⬇️ تصدير CSV</button></summary><div class="report-list">${body}</div></details>`,'report-orders');
  }
  function techsReport(d){
    const rows=[...d.techs.entries()].sort((a,b)=>b[1].rev-a[1].rev).map(([n,t])=>{const avg=t.days.length?t.days.reduce((a,b)=>a+b,0)/t.days.length:null;return `<tr><td>👷 ${escR(n)}</td><td>${t.closed}</td><td>${money(t.rev)}</td><td>${avg===null?'—':num(avg)+' يوم'}</td><td>${t.returns?`<b class="rep-bad">${t.returns}</b>`:'0'}</td><td>${t.open}</td><td>${money(t.pay)}</td></tr>`}).join('');
    return section('👷 أداء الفنيين',`<p class="hint">الأوامر اللي اتقفلت في الفترة لكل فني، وإيرادها، ومتوسط مدتها، والمرتجعات عليها، واللي معاه مفتوح دلوقتي.</p><div class="report-table-wrap"><table class="report-table-full"><tr><th>الفني</th><th>اتقفل</th><th>الإيراد</th><th>متوسط المدة</th><th>مرتجعات</th><th>معاه مفتوح</th><th>أجره</th></tr>${rows||'<tr><td colspan="7">لا توجد أوامر مقفولة في الفترة.</td></tr>'}</table></div>`,'report-techs');
  }
  function areasReport(d){
    return section('📍 المناطق',`<div class="report-mini-grid"><div><h3>الأوامر الجديدة حسب المركز</h3>${bars(d.areas,{val:v=>v.orders,fmt:(n,v)=>`${n} أمر${v.rev?' • '+money0(v.rev):''}`,empty:'لا توجد أوامر جديدة.'})}</div><div><h3>أكتر القرى/المناطق طلبًا</h3>${bars(d.villages,{val:v=>v.orders,fmt:n=>n+' أمر',empty:'مفيش قرى متسجلة على عناوين العملاء.'})}</div></div>`,'report-areas');
  }
  function customersReport(d){let counts={};d.os.forEach(o=>{if(o.customerId)counts[o.customerId]=(counts[o.customerId]||0)+1});let top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([id,n])=>`<div class="report-list-row"><span>${detailLink('customer.html',id,customerName(id))}</span><b>${n} أمر</b></div>`).join('');let topRev=[...d.custRev.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([id,v])=>`<div class="report-list-row"><span>${detailLink('customer.html',id,customerName(id))}</span><b>${money(v)}</b></div>`).join('');let newC=d.cs.filter(c=>inRangeDate(c.createdAt,d.r)).length;const act=d.activeCust.size;
    return section('👤 تقرير العملاء',`<div class="report-cards"><div class="report-card"><span>إجمالي العملاء</span><b>${d.cs.length}</b></div><div class="report-card"><span>عملاء جدد بالفترة</span><b>${newC}</b></div><div class="report-card"><span>عملاء تعاملوا بالفترة</span><b>${Object.keys(counts).length}</b></div><div class="report-card"><span>عملاء راجعين (أكتر من أمر)</span><b>${d.repeat}</b><small>${act?num(d.repeat/act*100)+'% من اللي اتعاملوا':''}</small></div></div><div class="report-mini-grid"><div><h3>⭐ أكثر العملاء تعاملًا في الفترة</h3><div class="report-list">${top||'<div class="report-empty">لا توجد تعاملات.</div>'}</div></div><div><h3>💰 أكتر العملاء دفعًا في الفترة</h3><div class="report-list">${topRev||'<div class="report-empty">لا توجد أوامر مقفولة.</div>'}</div></div></div>`, 'report-customers')}
  function devicesReport(d){let types={},brands={},serviced={};d.ds.forEach(x=>{let type=x.type||'غير محدد',brand=x.brand||'غير محدد';types[type]=(types[type]||0)+1;brands[brand]=(brands[brand]||0)+1});d.os.forEach(o=>{if(o.deviceId)serviced[o.deviceId]=(serviced[o.deviceId]||0)+1});let servicedRows=Object.entries(serviced).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([id,n])=>{let device=d.devMap.get(id);return `<div class="report-list-row"><span>${detailLink('device.html',id,device?deviceName(id):'جهاز محذوف')}</span><b>${n} أمر</b></div>`}).join('');
    const revFmt=(v,o)=>`${money0(v)} • ${o.n} أمر`;
    return section('🔧 تقرير الأجهزة',`<div class="report-cards"><div class="report-card"><span>إجمالي الأجهزة</span><b>${d.ds.length}</b></div><div class="report-card"><span>أنواع الأجهزة</span><b>${Object.keys(types).length}</b></div><div class="report-card"><span>الماركات</span><b>${Object.keys(brands).length}</b></div><div class="report-card"><span>أجهزة دخلت الخدمة بالفترة</span><b>${Object.keys(serviced).length}</b></div></div><div class="report-mini-grid"><div><h3>💰 الإيراد حسب نوع الجهاز</h3>${bars(d.byType,{val:v=>v.rev,fmt:revFmt,empty:'لا توجد أوامر مقفولة.'})}<h3>💰 الإيراد حسب الماركة</h3>${bars(d.byBrand,{val:v=>v.rev,fmt:revFmt,empty:'لا توجد أوامر مقفولة.'})}</div><div><h3>🛠️ الأجهزة الأكثر دخولًا للصيانة</h3><div class="report-list">${servicedRows||'<div class="report-empty">لا توجد أجهزة مخدومة في الفترة.</div>'}</div><h3>كل الأجهزة حسب النوع</h3>${bars(new Map(Object.entries(types)),{empty:'لا توجد أجهزة.'})}</div></div>`, 'report-devices')}
  function inventoryReport(d){let stockValue=d.ps.reduce((a,p)=>a+(+p.qty||0)*(+p.buy||0),0),sellValue=d.ps.reduce((a,p)=>a+(+p.qty||0)*(+p.sell||+p.use||0),0),low=d.ps.filter(p=>(+p.qty||0)<=(+p.min||0));const pmap=new Map(d.ps.map(p=>[p.id,p]));let usedRows=[...d.use.entries()].filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([id,n])=>{let p=pmap.get(id);return `<div class="report-list-row"><span>${detailLink('part.html',id,p?.name||'قطعة محذوفة')}</span><b>${n}</b></div>`}).join('');let lowRows=low.slice(0,15).map(p=>`<div class="report-list-row report-danger"><span>${detailLink('part.html',p.id,p.name||'قطعة بدون اسم')} <small>(${escR(p.qty)}/${escR(p.min)})</small></span><b>${money((+p.qty||0)*(+p.buy||0))}</b></div>`).join('');
    const still=d.ps.filter(p=>(+p.qty||0)>0&&!d.use.get(p.id)).sort((a,b)=>(+b.qty||0)*(+b.buy||0)-(+a.qty||0)*(+a.buy||0)).slice(0,8).map(p=>`<div class="report-list-row"><span>${detailLink('part.html',p.id,p.name||'قطعة')} <small>(${escR(p.qty)} قطعة)</small></span><b>${money((+p.qty||0)*(+p.buy||0))}</b></div>`).join('');
    return section('📦 تقرير المخزن',`<button type="button" class="secondary small-btn no-print" data-wf-event="click" data-wf-code="exportInventoryCSV()">⬇️ تصدير CSV</button><div class="report-cards"><div class="report-card"><span>قيمة المخزون بالتكلفة</span><b>${money(stockValue)}</b><small>بسعر البيع: ${escR(money0(sellValue))}</small></div><div class="report-card"><span>أصناف منخفضة</span><b>${low.length}</b></div><div class="report-card"><span>إجمالي الأصناف</span><b>${d.ps.length}</b></div><div class="report-card"><span>المستهلك بالفترة</span><b>${num(d.outQty)} قطعة</b><small>بتكلفة ${escR(money0(d.usedValue))} • وارد ${num(d.inQty)}</small></div></div><div class="report-mini-grid"><div><h3>🔥 الأكثر استهلاكًا بالفترة</h3><div class="report-list">${usedRows||'<div class="report-empty">لا توجد حركات.</div>'}</div><h3>🐢 مخزون واقف (ماتحركش في الفترة)</h3><div class="report-list">${still||'<div class="report-empty">كل الأصناف اتحركت.</div>'}</div></div><div><h3>⚠️ الأصناف المنخفضة — اضغط لفتح الصنف</h3><div class="report-list">${lowRows||'<div class="report-empty">لا توجد أصناف منخفضة.</div>'}</div></div></div>`, 'report-inventory')}
  function workshopReport(d){const current=list(K.r).filter(o=>o&&!o.closed&&o.status!=='مكتمل'&&o.status!=='ملغي'&&(o.workshopStatus!=='تم التسليم'&&(o.executionPlace==='الورشة'||(o.workshopStatus&&o.workshopStatus!=='غير مطلوب'))));const currentUnique=current.filter((o,i,a)=>a.findIndex(x=>x.id===o.id)===i);const delivered=list(K.r).filter(o=>o&&o.workshopStatus==='تم التسليم'&&inRangeDate(o.workshopAt,d.r));const rows=currentUnique.map(o=>`<tr><td>${detailLink('request.html',o.id,o.no||'—')}</td><td>${detailLink('customer.html',o.customerId,customerName(o.customerId))}</td><td>${detailLink('device.html',o.deviceId,deviceName(o.deviceId))}</td><td>${escR(o.workshopStatus||'غير مطلوب')}</td><td>${o.workshopAt?new Date(o.workshopAt).toLocaleString('ar-EG'):'—'}</td></tr>`).join('');const waiting=d.waiting;return section('🏭 تقرير الورشة',`<div class="report-cards"><div class="report-card"><span>أجهزة/أوامر داخل الورشة الآن</span><b>${currentUnique.length}</b></div><div class="report-card"><span>انتظار قطع</span><b>${waiting}</b></div><div class="report-card"><span>تم التسليم بالفترة</span><b>${delivered.length}</b></div></div><div class="report-table-wrap"><table class="report-table-full"><tr><th>الأمر</th><th>العميل</th><th>الجهاز</th><th>حالة الورشة</th><th>آخر تحديث</th></tr>${rows||'<tr><td colspan="5">لا توجد أجهزة داخل الورشة حاليًا.</td></tr>'}</table></div>`, 'report-workshop')}
  function returnsReport(d){
    const reasons=new Map();d.cancelled.forEach(o=>{const k=String(o.cancelReason||'بدون سبب').trim()||'بدون سبب';reasons.set(k,(reasons.get(k)||0)+1)});
    const retReasons=new Map();d.returns.forEach(x=>{const m=String(x.note).replace(/^مرتجع(\s*\(كان مغلقًا\))?:\s*/,'').split(/[—\n]/)[0].trim().slice(0,60)||'بدون سبب';retReasons.set(m,(retReasons.get(m)||0)+1)});
    const retRows=d.returns.slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,20).map(x=>`<div class="report-list-row"><span>${detailLink('request.html',x.o.id,x.o.no||'أمر')} — ${detailLink('customer.html',x.o.customerId,customerName(x.o.customerId))}<small>${escR(fmtDay(dayOf(x.at)))}${x.o.techName?' • 👷 '+escR(x.o.techName):''}</small></span><b>🔄</b></div>`).join('');
    return section('❌ الإلغاء والمرتجعات',`<div class="report-cards"><div class="report-card"><span>أوامر اتلغت</span><b>${d.cancelled.length}</b>${delta(d.cancelled.length,d.prev.cancelled.length,true)}</div><div class="report-card"><span>نسبة الإلغاء</span><b>${d.created.length?num(d.cancelled.length/d.created.length*100)+'%':'—'}</b><small>من الأوامر الجديدة</small></div><div class="report-card ${d.returns.length?'report-card-warn':''}"><span>مرتجعات</span><b>${d.returns.length}</b>${delta(d.returns.length,d.prev.returns.length,true)}</div><div class="report-card"><span>نسبة المرتجعات</span><b>${d.closedOrders.length?num(d.returns.length/d.closedOrders.length*100)+'%':'—'}</b><small>من الأوامر المقفولة</small></div></div><div class="report-mini-grid"><div><h3>أسباب الإلغاء</h3>${bars(reasons,{empty:'مفيش أوامر اتلغت في الفترة 👌'})}<h3>أسباب المرتجعات</h3>${bars(retReasons,{empty:'مفيش مرتجعات في الفترة 👌'})}</div><div><h3>آخر المرتجعات</h3><div class="report-list">${retRows||'<div class="report-empty">مفيش مرتجعات في الفترة 👌</div>'}</div></div></div>`,'report-returns');
  }
  function treasuryReport(d){let ins=d.tr.filter(x=>x.type==='in').reduce((a,x)=>a+(+x.amount||0),0),outs=d.tr.filter(x=>x.type==='out').reduce((a,x)=>a+(+x.amount||0),0);let rows=d.tr.slice().sort((a,b)=>String(b.date+b.time).localeCompare(String(a.date+a.time))).map(x=>`<tr><td>${escR(x.date||'—')}</td><td>${escR(x.time||'—')}</td><td>${x.type==='in'?'➕ وارد':'➖ صرف'}</td><td>${escR(x.reason||'—')}</td><td>${escR(x.counterparty||'')}</td><td>${escR(x.place||'')}</td><td>${money(x.amount)}</td></tr>`).join('');return section('💵 تقرير الخزنة المستقلة',`<div class="hint">الخزنة منفصلة عن حسابات أوامر الشغل وقطع الغيار ومصاريف التشغيل. الأرقام التالية لحركات درج الخزنة فقط.</div><button type="button" class="secondary small-btn no-print" data-wf-event="click" data-wf-code="exportTreasuryCSV()">⬇️ تصدير CSV</button><div class="report-cards"><div class="report-card"><span>وارد الفترة</span><b>${money(ins)}</b></div><div class="report-card"><span>صرف الفترة</span><b>${money(outs)}</b></div><div class="report-card"><span>صافي حركة الفترة</span><b>${money(ins-outs)}</b></div><div class="report-card"><span>رصيد الدرج حتى نهاية الفترة</span><b>${money(d.treasuryBalance)}</b></div></div><div class="report-table-wrap"><table class="report-table-full"><tr><th>التاريخ</th><th>الوقت</th><th>الحركة</th><th>السبب</th><th>لمن/من</th><th>المكان</th><th>المبلغ</th></tr>${rows||'<tr><td colspan="7">لا توجد حركات خزنة في الفترة.</td></tr>'}</table></div>`, 'report-treasury')}
  function tasksReport(d){let today=dateKey(new Date()),open=d.ts.filter(t=>!t.completed).length,done=d.ts.filter(t=>t.completed).length,over=d.ts.filter(t=>!t.completed&&t.date&&t.date<today).length;return section('📋 تقرير المهام والمتابعة',`<div class="report-cards"><div class="report-card"><span>مهام الفترة</span><b>${d.ts.length}</b></div><div class="report-card"><span>مكتملة</span><b>${done}</b></div><div class="report-card"><span>مفتوحة</span><b>${open}</b></div><div class="report-card"><span>متأخرة</span><b>${over}</b></div></div><div class="report-list">${d.ts.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(t=>`<div class="report-list-row"><span>${t.completed?'✅':'📋'} ${escR(t.title)} <small>• ${escR(t.date||'')}</small></span><b>${escR(t.priority||'عادية')}</b></div>`).join('')||'<div class="report-empty">لا توجد مهام في الفترة.</div>'}</div>`, 'report-tasks')}

  /* ---------- تنسيق خاص بالصفحة ---------- */
  function injectCss(){
    if(!document.head||!document.createElement||document.getElementById('rep-css'))return;
    const s=document.createElement('style');s.id='rep-css';
    s.textContent='.report-shortcuts{position:sticky;top:0;z-index:5;background:var(--bg);padding:6px 0;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}.report-shortcuts::-webkit-scrollbar{display:none}.report-shortcuts a{flex:0 0 auto}'+
      '.report-section{scroll-margin-top:56px}.report-cards{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}'+
      '.rep-delta{display:block;font-size:11px;font-weight:700;color:var(--text-muted)}.rep-delta.up{color:var(--success-text)}.rep-delta.down{color:var(--danger-text)}.report-card small{font-size:11px;color:var(--text-muted)}'+
      '.rep-insights{margin:0;padding-inline-start:18px;display:grid;gap:6px;line-height:1.7}'+
      '.rep-bars{display:grid;gap:8px}.rep-bar-top{display:flex;justify-content:space-between;gap:8px;font-size:13px}.rep-bar-top b{white-space:nowrap}.rep-bar i{display:block;height:8px;border-radius:6px;margin-top:3px;background:var(--pri,var(--accent-text,#17324d))}'+
      '.rep-chart{overflow-x:auto;border:1px solid var(--border);border-radius:12px;background:var(--bg-sunken);padding:6px}.rep-chart svg{display:block;width:100%;min-width:300px;height:170px}'+
      '.rep-c-bar{fill:var(--pri,var(--accent-text,#17324d));opacity:.85}.rep-c-line{fill:none;stroke:var(--wl-accent,#f2a93b);stroke-width:2.5;stroke-linejoin:round}.rep-c-lbl{font-size:10px;fill:var(--text-muted)}'+
      '.rep-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--text-muted);margin:6px 2px}.rep-legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-inline-end:5px;vertical-align:middle}.rep-legend i.b{background:var(--pri,var(--accent-text,#17324d))}.rep-legend i.l{background:var(--wl-accent,#f2a93b);height:4px}'+
      '.rep-details summary{cursor:pointer;font-weight:700;margin:12px 0 8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.rep-order small{display:block;color:var(--text-muted);font-size:12px}.rep-bad{color:var(--danger-text)}'+
      '.report-list-row small{color:var(--text-muted)}.rep-presets{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.rep-presets button{flex:1 1 auto;min-width:84px}.rep-presets button.on{background:var(--wl-primary,#17324d);color:var(--wl-on-primary,#fff)}'+
      '@media (max-width:600px){.rep-fin tr{display:grid;grid-template-columns:1fr auto}.rep-fin th:nth-child(3){display:none}.rep-fin td:nth-child(3){grid-column:1/-1;font-size:11.5px;color:var(--text-muted);padding-top:0;white-space:normal}.rep-fin td{border-bottom:0}.rep-fin tr{border-bottom:1px solid var(--border)}.report-table-full{white-space:normal}}'+
      '@media print{.report-shortcuts,.rep-presets{display:none}.rep-details{display:block}}';
    document.head.appendChild(s);
  }

  let renderQueued=false;
  function render(){
    const host=document.getElementById('reportsHost');if(!host||renderQueued)return;
    const fromEl=document.getElementById('repFrom'),toEl=document.getElementById('repTo'),status=document.getElementById('reportStatus'),r=range();
    [fromEl,toEl].forEach(el=>{if(el)el.removeAttribute('aria-invalid')});
    if(!r.valid){if(fromEl&&r.from&&!validDateKey(r.from))fromEl.setAttribute('aria-invalid','true');if(toEl&&r.to&&!validDateKey(r.to))toEl.setAttribute('aria-invalid','true');if(fromEl&&toEl&&r.from>r.to){fromEl.setAttribute('aria-invalid','true');toEl.setAttribute('aria-invalid','true')}if(status){status.textContent=r.reason;status.classList.add('report-status-error')}return}
    renderQueued=true;host.setAttribute('aria-busy','true');if(status){status.textContent='جاري تحديث التقارير…';status.classList.remove('report-status-error');status.setAttribute('role','status')}
    const controls=['repApply','repToday','repWeek','repMonth'].map(id=>document.getElementById(id)).filter(Boolean);controls.forEach(el=>{el.disabled=true;el.setAttribute('aria-disabled','true')});
    window.WFNavState?.setParams({from:r.from,to:r.to});
    markPreset(r);
    const run=()=>{try{injectCss();const d=reportData();const lbl=document.getElementById('reportPeriodLabel');if(lbl)lbl.textContent=`من ${fmtLong(d.r.from)} إلى ${fmtLong(d.r.to)} • بنقارن بـ ${fmtDay(d.prev.r.from)} – ${fmtDay(d.prev.r.to)}`;
        host.innerHTML=cards(d)+insights(d)+finance(d)+trend(d)+collections(d)+ordersReport(d)+techsReport(d)+areasReport(d)+customersReport(d)+devicesReport(d)+inventoryReport(d)+workshopReport(d)+returnsReport(d)+treasuryReport(d)+tasksReport(d);if(status)status.textContent='تم تحديث التقارير.'}
      catch(e){console.error('[reports] تعذر تحميل التقرير',e);if(status){status.textContent='تعذر تحميل التقرير. تأكد من البيانات ثم اضغط «تحديث التقرير» مرة أخرى.';status.classList.add('report-status-error');status.setAttribute('role','alert')}}
      finally{renderQueued=false;host.setAttribute('aria-busy','false');controls.forEach(el=>{el.disabled=false;el.removeAttribute('aria-disabled')})}};
    if(typeof window.requestAnimationFrame==='function')window.requestAnimationFrame(run);else window.setTimeout(run,0);
  }
  /* ---------- الفترات الجاهزة ---------- */
  function presetRange(kind){
    const now=new Date(),y=now.getFullYear(),m=now.getMonth();let from,to;
    if(kind==='today'){from=to=dateKey(now)}
    else if(kind==='yesterday'){const d=new Date(now);d.setDate(d.getDate()-1);from=to=dateKey(d)}
    else if(kind==='week'){let day=now.getDay()||7;let s=new Date(now);s.setDate(now.getDate()-day+1);let e=new Date(s);e.setDate(s.getDate()+6);from=dateKey(s);to=dateKey(e)}
    else if(kind==='last7'){const s=new Date(now);s.setDate(s.getDate()-6);from=dateKey(s);to=dateKey(now)}
    else if(kind==='month'){from=`${y}-${String(m+1).padStart(2,'0')}-01`;to=dateKey(new Date(y,m+1,0))}
    else if(kind==='lastMonth'){from=dateKey(new Date(y,m-1,1));to=dateKey(new Date(y,m,0))}
    else if(kind==='3m'){from=dateKey(new Date(y,m-2,1));to=dateKey(new Date(y,m+1,0))}
    else if(kind==='year'){from=`${y}-01-01`;to=`${y}-12-31`}
    else return null;
    return {from,to};
  }
  function preset(kind){const p=presetRange(kind);if(!p)return;document.getElementById('repFrom').value=p.from;document.getElementById('repTo').value=p.to;render()}
  const EXTRA=[['yesterday','امبارح'],['last7','آخر ٧ أيام'],['lastMonth','الشهر اللي فات'],['3m','آخر ٣ شهور'],['year','السنة دي']];
  function markPreset(r){
    if(!document.querySelectorAll)return;
    document.querySelectorAll('[data-rep-preset]').forEach(b=>{const p=presetRange(b.getAttribute('data-rep-preset'));b.classList.toggle('on',!!p&&p.from===r.from&&p.to===r.to)});
  }
  function addPresets(){
    if(!document.createElement||!document.querySelector)return;
    const box=document.querySelector('.report-filter-actions');if(!box||document.querySelector('.rep-presets'))return;
    [['repToday','today'],['repWeek','week'],['repMonth','month']].forEach(([id,k])=>{const b=document.getElementById(id);if(b)b.setAttribute('data-rep-preset',k)});
    const wrap=document.createElement('div');wrap.className='rep-presets no-print';
    EXTRA.forEach(([k,t])=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=t;b.setAttribute('data-rep-preset',k);b.addEventListener('click',()=>preset(k));wrap.appendChild(b)});
    const pr=document.createElement('button');pr.type='button';pr.className='secondary';pr.textContent='🖨️ طباعة / PDF';pr.addEventListener('click',()=>{try{(window.printWorkshopPage||window.print)()}catch(e){window.print()}});wrap.appendChild(pr);
    const sm=document.createElement('button');sm.type='button';sm.className='secondary';sm.textContent='⬇️ ملخص CSV';sm.addEventListener('click',exportSummaryCSV);wrap.appendChild(sm);
    box.insertAdjacentElement('afterend',wrap);
    ['repFrom','repTo'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('change',()=>{const r=range();if(r.valid)render()})});
  }
  window.exportOrdersCSV=exportOrdersCSV;
  window.exportInventoryCSV=exportInventoryCSV;
  window.exportTreasuryCSV=exportTreasuryCSV;
  window.exportReportSummaryCSV=exportSummaryCSV;
  document.addEventListener('DOMContentLoaded',()=>{if(!document.getElementById('reportsHost'))return;addPresets();const nf=window.WFNavState?.getParam('from'),nt=window.WFNavState?.getParam('to');if(nf&&nt&&validDateKey(nf)&&validDateKey(nt)){document.getElementById('repFrom').value=nf;document.getElementById('repTo').value=nt;render()}else preset('month');const apply=document.getElementById('repApply'),today=document.getElementById('repToday'),week=document.getElementById('repWeek'),month=document.getElementById('repMonth');if(apply)apply.addEventListener('click',render);if(today)today.addEventListener('click',()=>preset('today'));if(week)week.addEventListener('click',()=>preset('week'));if(month)month.addEventListener('click',()=>preset('month'));});
})();
