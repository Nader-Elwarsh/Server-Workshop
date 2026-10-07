/* اختبارات المخزن: تعديل الكمية يدويًا بيسجّل حركة جرد، التوريد مايتسجلش مرتين بالضغط المزدوج، وتوقع النفاذ بيخصم الإرجاع. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
function makeEnv(){
  const store={},els={},alerts=[];
  const localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k]};
  const document={addEventListener:()=>{},getElementById:i=>els[i]||null,querySelector:()=>null};
  const window={localStorage,WFStorage:localStorage,document,crypto:{randomUUID:()=>"id-"+Math.random().toString(36).slice(2)}};
  const context={window,localStorage,document,crypto:window.crypto,console,alert:m=>alerts.push(m),confirm:()=>true,
    refreshAllScreens:()=>{},renderParts:()=>{},
    imageToDataURL:()=>new Promise(r=>setTimeout(()=>r('data:image/png;base64,AA'),30)),
    refreshDualPhotoName:()=>{},renderLivePhotoPreview:()=>{}};
  const c=vm.createContext(context);
  vm.runInContext(fs.readFileSync(`${__dirname}/shared-data.js`,'utf8'),c,{filename:'shared-data.js'});
  ['K','arr','get','put','putAsync','commitStorage','commitStorageAsync','withRollback','saveJSONSafe'].forEach(n=>{if(window[n])context[n]=window[n]});
  context.id=window.id;
  ['app-shared.js','app-parts.js','app-restock.js','app-inventory-bulk.js'].forEach(f=>vm.runInContext(fs.readFileSync(`${__dirname}/${f}`,'utf8'),c,{filename:f}));
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
    let r=await x.persistPartRecord({name:'مروحة',code:'',category:'x',location:'',qty:7,min:2,buy:5,use:9,photo:''},existing);
    assert.ok(r.ok);assert.strictEqual(J(e,K.p)[0].qty,7);
    const mv=J(e,K.m);assert.strictEqual(mv.length,1);assert.strictEqual(mv[0].qty,3);assert.ok(/نقص/.test(mv[0].type));
    assert.ok(!/خروج|إرجاع/.test(mv[0].type),'inventory adjustment must not count as consumption');
    // تعديل بدون تغيير الكمية: مفيش حركة
    await x.persistPartRecord({name:'مروحة 2',code:'',category:'x',location:'',qty:7,min:2,buy:5,use:9,photo:''},J(e,K.p)[0]);
    assert.strictEqual(J(e,K.m).length,1);
  }
  // 2) كل كميات المخزون والتوريد أعداد صحيحة، ولا تُغيّر الكسور أي سجل.
  {
    const e=makeEnv(),x=e.context,K=e.K;
    e.store[K.p]=JSON.stringify([{id:'p1',name:'مروحة',qty:10,min:2,buy:5,use:9,category:'x'}]);
    const before=e.store[K.p];
    const fractional=await x.persistPartRecord({name:'مروحة',code:'',category:'x',location:'',qty:1.5,min:2,buy:5,use:9,photo:''},J(e,K.p)[0]);
    assert.strictEqual(fractional.ok,false);assert.strictEqual(e.store[K.p],before,'fractional manual inventory counts must not be saved');
    Object.assign(e.els,{qapName:{value:'فلتر'},qapCategory:{value:'x'},qapCode:{value:''},qapQty:{value:'1.5'},qapBuy:{value:'0'},qapUse:{value:'0'}});
    await x.saveQuickAddPart();assert.strictEqual(J(e,K.p).length,1,'quick-add must reject fractional initial stock');
    Object.assign(e.els,{stkPart:{value:'p1'},stkQty:{value:'1.5'},stkBuy:{value:''},stkNote:{value:''},stkInvoice:{files:[]}});
    await x.saveRestock();assert.strictEqual(J(e,K.p)[0].qty,10,'restock must reject fractional units');
    assert.ok(e.alerts.some(a=>/عدد صحيح/.test(a)));
  }
  // 3) فشل حفظ القطعة لا يترك صورة جديدة يتيمة ولا يغيّر مرجع الصورة القديمة.
  {
    const e=makeEnv(),x=e.context,K=e.K,deleted=[];
    e.store[K.p]=JSON.stringify([{id:'p1',name:'مروحة',qty:10,min:2,buy:5,use:9,category:'x',photo:'old-photo'}]);
    e.window.ImageStore={save:async()=> 'new-photo',delete:async ref=>deleted.push(ref)};
    Object.assign(x,{pName:{value:'مروحة'},pCode:{value:''},pLocation:{value:''},pCategory:{value:'x'},pQty:{value:'10'},pMin:{value:'2'},pBuy:{value:'5'},pUse:{value:'9'},pPhoto:{files:[{name:'new.png'}]}});
    x.localStorage.setItem=(key,value)=>{if(key===K.p)throw new Error('simulated quota failure');e.store[key]=String(value)};
    await x.savePart({preventDefault(){}},J(e,K.p)[0]);
    assert.deepStrictEqual(deleted,['new-photo']);
    assert.strictEqual(J(e,K.p)[0].photo,'old-photo');
  }
  // 4) عند نجاح التعديل يُحفظ مرجع الصورة الجديدة أولاً ثم تُحذف القديمة.
  {
    const e=makeEnv(),x=e.context,K=e.K,deleted=[];
    e.store[K.p]=JSON.stringify([{id:'p1',name:'مروحة',qty:10,min:2,buy:5,use:9,category:'x',photo:'old-photo'}]);
    e.window.ImageStore={save:async()=> 'new-photo',delete:async ref=>deleted.push(ref)};x.location={href:''};
    Object.assign(x,{pName:{value:'مروحة'},pCode:{value:''},pLocation:{value:''},pCategory:{value:'x'},pQty:{value:'10'},pMin:{value:'2'},pBuy:{value:'5'},pUse:{value:'9'},pPhoto:{files:[{name:'new.png'}]}});
    await x.savePart({preventDefault(){}},J(e,K.p)[0]);
    assert.strictEqual(J(e,K.p)[0].photo,'new-photo');
    assert.deepStrictEqual(deleted,['old-photo']);
  }
  // 5) فشل حفظ التوريد ينظف صورة الفاتورة الجديدة.
  {
    const e=makeEnv(),x=e.context,K=e.K,deleted=[];
    e.store[K.p]=JSON.stringify([{id:'p1',name:'مروحة',qty:10,buy:5,use:9,category:'x'}]);
    e.window.ImageStore={save:async()=> 'invoice-photo',delete:async ref=>deleted.push(ref)};
    Object.assign(e.els,{stkPart:{value:'p1'},stkQty:{value:'2'},stkBuy:{value:''},stkNote:{value:''},stkInvoice:{files:[{name:'invoice.png'}]}});
    x.localStorage.setItem=(key,value)=>{if(key===K.p)throw new Error('simulated quota failure');e.store[key]=String(value)};
    await x.saveRestock();
    assert.deepStrictEqual(deleted,['invoice-photo']);
    assert.strictEqual(J(e,K.p)[0].qty,10,'failed restock must roll back stock');
  }
  // 6) التعديل الجماعي يرفض النسب السالبة والنتائج غير الآمنة قبل تغيير أي صنف.
  {
    const e=makeEnv(),x=e.context,K=e.K;
    e.store[K.p]=JSON.stringify([{id:'p1',name:'مروحة',qty:10,buy:5,use:9,category:'x'},{id:'p2',name:'فلتر',qty:2,buy:3,use:6,category:'x'}]);
    const before=e.store[K.p];
    Object.assign(e.els,{bulkScope:{value:''},bulkOp:{value:'margin'},bulkMarginValue:{value:'-10'}});
    await x.applyBulkPriceChange();assert.strictEqual(e.store[K.p],before,'negative margin must not modify prices');
    e.els.bulkMarginValue.value='1e308';await x.applyBulkPriceChange();assert.strictEqual(e.store[K.p],before,'overflowing margin must not modify any item');
    Object.assign(e.els,{bulkOp:{value:'adjust'},bulkField:{value:'use'},bulkDir:{value:'up'},bulkType:{value:'pct'},bulkValue:{value:'1e308'}});
    await x.applyBulkPriceChange();assert.strictEqual(e.store[K.p],before,'overflowing bulk adjustment must be atomic');
  }
  // 7) النسب والمبالغ السليمة تظل قابلة للتطبيق على الأسعار المحددة.
  {
    const e=makeEnv(),x=e.context,K=e.K;
    e.store[K.p]=JSON.stringify([{id:'p1',name:'مروحة',qty:10,buy:5,use:9,category:'x'}]);
    Object.assign(e.els,{bulkScope:{value:''},bulkOp:{value:'margin'},bulkMarginValue:{value:'20'}});
    await x.applyBulkPriceChange();assert.strictEqual(J(e,K.p)[0].use,6);
    Object.assign(e.els,{bulkOp:{value:'adjust'},bulkField:{value:'both'},bulkDir:{value:'down'},bulkType:{value:'fixed'},bulkValue:{value:'2'}});
    await x.applyBulkPriceChange();assert.strictEqual(J(e,K.p)[0].buy,3);assert.strictEqual(J(e,K.p)[0].use,4);
  }
  // 8) توريد بضغطتين متتاليتين = توريد واحد
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
  // 9) توقع النفاذ بيخصم الإرجاع
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
