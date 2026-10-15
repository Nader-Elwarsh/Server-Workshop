/* اختبارات بيع قطعة مباشر من غير أمر شغل: المخزن + حركة البيع + وارد المحفظة بيتحفظوا مع بعض، والإلغاء بيرجّع كل حاجة،
   والتقارير بتحسب البيع المباشر في الإيراد والتكلفة والمحصّل. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
function makeEnv(){
  const store={},alerts=[];
  const localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k]};
  const document={addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]};
  const window={localStorage,WFStorage:localStorage,document,crypto:{randomUUID:()=>"id-"+Math.random().toString(36).slice(2)}};
  const context={window,localStorage,document,crypto:window.crypto,console,alert:m=>alerts.push(m),confirm:()=>true,refreshAllScreens:()=>{},renderParts:()=>{}};
  const c=vm.createContext(context);
  vm.runInContext(fs.readFileSync(`${__dirname}/shared-data.js`,'utf8'),c,{filename:'shared-data.js'});
  ['K','arr','get','put','putAsync','commitStorage','commitStorageAsync','withRollback','saveJSONSafe','settings','esc'].forEach(n=>{if(window[n])context[n]=window[n]});
  context.id=window.id;
  ['app-shared.js','app-parts.js'].forEach(f=>vm.runInContext(fs.readFileSync(`${__dirname}/${f}`,'utf8'),c,{filename:f}));
  return {store,alerts,x:context,K:window.K,window};
}
const J=(e,k)=>JSON.parse(e.store[k]||'[]');
(async()=>{
  const e=makeEnv(),x=e.x,K=e.K;
  const st=JSON.parse(e.store[K.s]||'{}');st.wallets=['كاش','فودافون كاش'];st.defaultWallet='كاش';e.store[K.s]=JSON.stringify(st);
  e.store[K.p]=JSON.stringify([{id:'p1',name:'ريلاي',qty:5,min:1,buy:40,use:70,category:'x'},{id:'p2',name:'مروحة',qty:0,buy:10,use:20,category:'x'}]);
  // رفض: كمية أكبر من المتاح، كسور، قطعة خلصانة، من غير محفظة
  for(const bad of [{partId:'p1',qty:6,price:70,wallet:'كاش'},{partId:'p1',qty:1.5,price:70,wallet:'كاش'},{partId:'p2',qty:1,price:20,wallet:'كاش'},{partId:'p1',qty:1,price:70,wallet:''},{partId:'p1',qty:1,price:NaN,wallet:'كاش'},{partId:'zz',qty:1,price:1,wallet:'كاش'}]){
    const r=await x.savePartSale(bad);assert.ok(!r.ok,'should reject '+JSON.stringify(bad));
  }
  assert.strictEqual(J(e,K.p)[0].qty,5);assert.strictEqual(J(e,K.m).length,0);assert.strictEqual(J(e,K.wtx).length,0);
  // بيع صحيح
  const r=await x.savePartSale({partId:'p1',qty:2,price:65.5,wallet:'فودافون كاش',buyer:'أحمد',note:'كاش'});
  assert.ok(r.ok,r.error);
  assert.strictEqual(J(e,K.p)[0].qty,3);
  const mv=J(e,K.m);assert.strictEqual(mv.length,1);assert.strictEqual(mv[0].type,'خروج بيع مباشر');assert.strictEqual(mv[0].total,131);assert.strictEqual(mv[0].cost,40);
  const tx=J(e,K.wtx);assert.strictEqual(tx.length,1);assert.strictEqual(tx[0].type,'in');assert.strictEqual(tx[0].amount,131);
  assert.strictEqual(tx[0].wallet,'فودافون كاش');assert.strictEqual(tx[0].category,'تحصيل عميل');assert.strictEqual(tx[0].source,'part-sale');assert.strictEqual(tx[0].saleId,mv[0].saleId);
  // بيع ببلاش: مفيش حركة محفظة
  const free=await x.savePartSale({partId:'p1',qty:1,price:0,wallet:'كاش'});assert.ok(free.ok);assert.strictEqual(J(e,K.wtx).length,1);assert.strictEqual(J(e,K.p)[0].qty,2);
  // ملف القطعة بيعرض البيعات
  assert.ok(/إلغاء البيعة/.test(x.partSalesHtml('p1')));
  // الإلغاء
  assert.ok(await x.undoPartSale(mv[0].saleId,{yes:true}));
  assert.strictEqual(J(e,K.p)[0].qty,4);
  const mv2=J(e,K.m);assert.ok(mv2.find(m=>m.saleId===mv[0].saleId&&m.type==='خروج بيع مباشر').voided);
  assert.ok(mv2.some(m=>m.saleId===mv[0].saleId&&/إرجاع/.test(m.type)&&m.qty===2));
  assert.ok(J(e,K.wtx)[0].deleted);
  // إلغاء مرتين ممنوع
  assert.ok(!(await x.undoPartSale(mv[0].saleId,{yes:true,silent:true})));assert.strictEqual(J(e,K.p)[0].qty,4);
  assert.ok(/اتلغت/.test(x.partSalesHtml('p1')));

  // التقارير
  {
    const e2=makeEnv(),x2=e2.x,K2=e2.K;
    const st2=JSON.parse(e2.store[K2.s]||'{}');st2.wallets=['كاش'];e2.store[K2.s]=JSON.stringify(st2);
    e2.store[K2.p]=JSON.stringify([{id:'p1',name:'ريلاي',qty:10,buy:40,use:70,category:'x'}]);
    assert.ok((await x2.savePartSale({partId:'p1',qty:3,price:70,wallet:'كاش'})).ok);
    const s2=await x2.savePartSale({partId:'p1',qty:1,price:70,wallet:'كاش'});assert.ok(s2.ok);
    assert.ok(await x2.undoPartSale(s2.sale.saleId,{yes:true}));
    const recs={orders:[],customers:[],devices:[],parts:J(e2,K2.p),tasks:[],treasury:[],moves:J(e2,K2.m)},wtx=J(e2,K2.wtx);
    const RK={r:'orders',c:'customers',d:'devices',p:'parts',tasks:'tasks',tr:'treasury',m:'moves'};
    const dk=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const els={};['reportsHost','reportStatus','reportPeriodLabel','repFrom','repTo','repApply','repToday','repWeek','repMonth'].forEach(id=>{els[id]={id,value:'',textContent:'',innerHTML:'',disabled:false,attrs:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(n,v){this.attrs[n]=v},removeAttribute(n){delete this.attrs[n]},getAttribute(n){return this.attrs[n]??null}}});
    const ev={},frames=[];
    const ctx={settings:()=>({}),put(){},document:{addEventListener(t,f){ev[t]=f},getElementById(id){return els[id]||null}},K:RK,arr:k=>recs[k]||[],walletTxEntries:()=>wtx,
      customerName:id=>id,deviceName:id=>id,dayKeyLocal:dk,console:{error(err){throw err}},setTimeout,URL,Blob:function(){},alert(){},location:{search:'?only=all'},window:{requestAnimationFrame(f){frames.push(f)}}};
    ctx.window.dayKeyLocal=dk;
    vm.runInNewContext(fs.readFileSync(`${__dirname}/reports.js`,'utf8'),ctx,{filename:'reports.js'});
    ev.DOMContentLoaded();frames.shift()();
    const html=els.reportsHost.innerHTML,sec=id=>(html.match(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`))||[''])[0];
    const fin=sec('report-finance');
    assert.ok(fin.includes('🛒 بيع قطع مباشر')&&fin.includes('210.00 ج'),'direct sales revenue (voided sale excluded)');
    assert.ok(fin.includes('120.00 ج'),'direct sale cost counted');
    assert.ok(fin.includes('90.00 ج'),'direct sale profit');
    assert.ok(sec('report-collect').includes('210.00 ج'),'sale money counted as collected');
    assert.ok(html.includes('بعت قطع مباشر'),'insight line');
  }
  console.log('part-sale tests passed');
})().catch(err=>{console.error(err);process.exit(1)});
