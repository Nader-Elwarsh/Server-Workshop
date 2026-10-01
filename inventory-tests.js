/* اختبارات المخزن: تعديل الكمية يدويًا بيسجّل حركة جرد، التوريد مايتسجلش مرتين بالضغط المزدوج، وتوقع النفاذ بيخصم الإرجاع. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
function makeEnv(){
  const store={},els={},alerts=[];
  const localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k]};
  const document={addEventListener:()=>{},getElementById:i=>els[i]||null,querySelector:()=>null};
  const window={localStorage,document,crypto:{randomUUID:()=>"id-"+Math.random().toString(36).slice(2)}};
  const context={window,localStorage,document,crypto:window.crypto,console,alert:m=>alerts.push(m),confirm:()=>true,
    refreshAllScreens:()=>{},renderParts:()=>{},
    imageToDataURL:()=>new Promise(r=>setTimeout(()=>r('data:image/png;base64,AA'),30)),
    refreshDualPhotoName:()=>{},renderLivePhotoPreview:()=>{}};
  const c=vm.createContext(context);
  vm.runInContext(fs.readFileSync(`${__dirname}/shared-data.js`,'utf8'),c,{filename:'shared-data.js'});
  ['K','arr','get','put','esc','escAttr','commitStorage','withRollback','saveJSONSafe'].forEach(n=>{if(window[n])context[n]=window[n]});
  context.id=window.id;
  ['app-shared.js','app-parts.js','app-restock.js'].forEach(f=>vm.runInContext(fs.readFileSync(`${__dirname}/${f}`,'utf8'),c,{filename:f}));
  // app-shared.js بيعرّف imageToDataURL الحقيقية (محتاجة canvas)، فبنستبدلها بعد التحميل.
  context.imageToDataURL=()=>new Promise(r=>setTimeout(()=>r('data:image/png;base64,AA'),30));
  return {store,els,alerts,context,K:window.K,window};
}
const J=(e,k)=>JSON.parse(e.store[k]||'[]');
(async()=>{
  // 1) تعديل الكمية من ملف الصنف: حركة جرد بالفرق، والأرقام السالبة تتقص لصفر
  {
    const e=makeEnv(),x=e.context,K=e.K;
    e.store[K.p]=JSON.stringify([{id:'p1',name:'مروحة',qty:10,min:2,buy:5,use:9,category:'x'}]);
    const existing=J(e,K.p)[0];
    let r=x.persistPartRecord({name:'مروحة',code:'',category:'x',location:'',qty:7,min:2,buy:5,use:9,photo:''},existing);
    assert.ok(r.ok);assert.strictEqual(J(e,K.p)[0].qty,7);
    const mv=J(e,K.m);assert.strictEqual(mv.length,1);assert.strictEqual(mv[0].qty,3);assert.ok(/نقص/.test(mv[0].type));
    assert.ok(!/خروج|إرجاع/.test(mv[0].type),'inventory adjustment must not count as consumption');
    // تعديل بدون تغيير الكمية: مفيش حركة
    x.persistPartRecord({name:'مروحة 2',code:'',category:'x',location:'',qty:7,min:2,buy:5,use:9,photo:''},J(e,K.p)[0]);
    assert.strictEqual(J(e,K.m).length,1);
  }
  // 2) توريد بضغطتين متتاليتين = توريد واحد
  {
    const e=makeEnv(),x=e.context,K=e.K;
    e.store[K.p]=JSON.stringify([{id:'p1',name:'مروحة',qty:10,buy:5,use:9,category:'x'}]);
    e.els.stkPart={value:'p1'};e.els.stkQty={value:'5'};e.els.stkBuy={value:''};e.els.stkNote={value:''};
    e.els.stkInvoice={files:[{name:'f.png'}]};
    const a=x.saveRestock(),b=x.saveRestock();await Promise.all([a,b]);
    assert.strictEqual(J(e,K.p)[0].qty,15,'double tap must restock once');
    assert.strictEqual(J(e,K.m).filter(m=>m.type==='توريد').length,1);
    // وبعد ما يخلص تقدر توريد تاني
    await x.saveRestock();assert.strictEqual(J(e,K.p)[0].qty,20);
  }
  // 3) توقع النفاذ بيخصم الإرجاع
  {
    const e=makeEnv(),x=e.context;const now=new Date().toISOString();
    const p={qty:10};
    const only=x.partConsumptionForecast(p,[{type:'خروج',qty:10,at:now}]);
    const netted=x.partConsumptionForecast(p,[{type:'خروج',qty:10,at:now},{type:'إرجاع بسبب إلغاء أمر',qty:6,at:now}]);
    assert.ok(only&&netted&&netted.daysLeft>only.daysLeft,'returns must slow the forecast burn rate');
    assert.strictEqual(x.partConsumptionForecast(p,[{type:'خروج',qty:5,at:now},{type:'إرجاع',qty:5,at:now}]),null,'fully returned = no consumption');
  }
  console.log('inventory-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
