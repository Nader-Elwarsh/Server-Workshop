/* مراجعة المخزن: البحث المرن، الأرشفة بدل الحذف للصنف اللي ليه بيع مباشر، منع استرجاع صنف مكرر من الأرشيف،
   دفع التوريد من محفظة + تسجيل الفاتورة في فواتير المخزن، وحماية صورة الفاتورة المستخدمة في حركة. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
function makeEnv(){
  const store={},els={},alerts=[];
  const localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k]};
  const document={addEventListener:()=>{},getElementById:i=>els[i]||null,querySelector:()=>null,querySelectorAll:()=>[]};
  const window={localStorage,WFStorage:localStorage,document,crypto:{randomUUID:()=>"id-"+Math.random().toString(36).slice(2)}};
  const context={window,localStorage,document,crypto:window.crypto,console,alert:m=>alerts.push(m),confirm:()=>true,location:{href:''},
    refreshAllScreens:()=>{},renderParts:()=>{},imageToDataURL:async()=> 'data:image/png;base64,AA',refreshDualPhotoName:()=>{},renderLivePhotoPreview:()=>{}};
  const c=vm.createContext(context);
  vm.runInContext(fs.readFileSync(`${__dirname}/shared-data.js`,'utf8'),c,{filename:'shared-data.js'});
  ['K','arr','get','put','putAsync','commitStorage','commitStorageAsync','withRollback','saveJSONSafe','settings','esc','byIdCached'].forEach(n=>{if(window[n])context[n]=window[n]});
  context.id=window.id;
  ['app-shared.js','app-parts.js','app-restock.js','app-invoices.js'].forEach(f=>vm.runInContext(fs.readFileSync(`${__dirname}/${f}`,'utf8'),c,{filename:f}));
  context.imageToDataURL=async()=> 'data:image/png;base64,AA';
  return {store,els,alerts,x:context,K:window.K,window};
}
const J=(e,k)=>JSON.parse(e.store[k]||'[]');
(async()=>{
  // البحث المرن
  {
    const {x}=makeEnv(),p={name:'مكثف مروحة ٤ ميكرو',code:'CAP-4',category:'كهرباء',location:'رف أ'};
    assert.ok(x.partMatchesQuery(p,'مكثف 4'),'Arabic-Indic digits');
    assert.ok(x.partMatchesQuery(p,'مروحه'),'ta marbuta');
    assert.ok(x.partMatchesQuery(p,'cap4'),'code without dash/case');
    assert.ok(x.partMatchesQuery(p,'كهرباء رف'),'category + location words');
    assert.ok(!x.partMatchesQuery(p,'مكثف 5'));assert.ok(x.partMatchesQuery(p,''));
  }
  // الصنف اللي ليه بيع مباشر بيتأرشف بدل ما يتمسح (عشان التقارير)
  {
    const e=makeEnv(),x=e.x,K=e.K;
    e.store[K.p]=JSON.stringify([{id:'p1',name:'ريلاي',qty:5,buy:10,use:20,category:'x'}]);
    e.store[K.m]=JSON.stringify([{id:'m1',partId:'p1',type:'خروج بيع مباشر',qty:1,total:20,cost:10,saleId:'s1',at:new Date().toISOString()}]);
    await x.deletePartRecord('p1');
    assert.strictEqual(J(e,K.p).length,1);assert.ok(J(e,K.p)[0].archived,'archived, not deleted');assert.strictEqual(J(e,K.m).length,1,'sale move kept');
  }
  // صنف من غير أي تاريخ بيتمسح عادي
  {
    const e=makeEnv(),x=e.x,K=e.K;
    e.store[K.p]=JSON.stringify([{id:'p1',name:'ريلاي',qty:5,category:'x'}]);
    await x.deletePartRecord('p1');assert.strictEqual(J(e,K.p).length,0);
  }
  // استرجاع من الأرشيف ممنوع لو فيه صنف شغّال بنفس الاسم
  {
    const e=makeEnv(),x=e.x,K=e.K;
    e.store[K.p]=JSON.stringify([{id:'old',name:'ريلاي تلاجة',archived:true,qty:0,category:'x'},{id:'new',name:'ريلاي  تلاجه',qty:3,category:'x'}]);
    await x.restorePartRecord('old');
    assert.ok(J(e,K.p).find(p=>p.id==='old').archived,'still archived');assert.ok(/مينفعش/.test(e.alerts.pop()));
  }
  // توريد مع دفع من محفظة + فاتورة
  {
    const e=makeEnv(),x=e.x,K=e.K;
    const st=JSON.parse(e.store[K.s]||'{}');st.wallets=['كاش'];e.store[K.s]=JSON.stringify(st);
    e.store[K.p]=JSON.stringify([{id:'p1',name:'مروحة',qty:10,buy:5,use:9,category:'x'}]);
    e.window.ImageStore={save:async()=> 'inv-ref',delete:async()=>{}};
    Object.assign(e.els,{stkPart:{value:'p1'},stkQty:{value:'4'},stkBuy:{value:'6.5'},stkNote:{value:'الحاج محمد'},stkWallet:{value:'كاش'},stkInvoice:{files:[{name:'f.png'}]}});
    await x.saveRestock();
    assert.strictEqual(J(e,K.p)[0].qty,14);assert.strictEqual(J(e,K.p)[0].buy,6.5);
    const tx=J(e,K.wtx);assert.strictEqual(tx.length,1);
    assert.deepStrictEqual([tx[0].type,tx[0].amount,tx[0].wallet,tx[0].category,tx[0].source],['out',26,'كاش','مشتريات قطع غيار','restock']);
    const mv=J(e,K.m)[0];assert.strictEqual(tx[0].moveId,mv.id);
    const inv=J(e,K.inv);assert.strictEqual(inv.length,1);assert.deepStrictEqual(inv[0].partIds,['p1']);assert.strictEqual(inv[0].photo,'inv-ref');
    // حذف الفاتورة من «فواتير المخزن» مايمسحش الصورة طول ما حركة التوريد شايلاها
    const deleted=[];e.window.ImageStore.delete=async r=>deleted.push(r);
    x.renderInvoices=()=>{};x.partProfile=()=>{};x.deleteInvoiceRecord(inv[0].id);
    assert.strictEqual(J(e,K.inv).length,0);assert.deepStrictEqual(deleted,[],'image still used by the restock move');
  }
  // توريد من غير دفع (آجل) = مفيش حركة محفظة
  {
    const e=makeEnv(),x=e.x,K=e.K;
    e.store[K.p]=JSON.stringify([{id:'p1',name:'مروحة',qty:10,buy:5,use:9,category:'x'}]);
    Object.assign(e.els,{stkPart:{value:'p1'},stkQty:{value:'2'},stkBuy:{value:''},stkNote:{value:''},stkWallet:{value:''},stkInvoice:{files:[]}});
    await x.saveRestock();
    assert.strictEqual(J(e,K.p)[0].qty,12);assert.strictEqual(J(e,K.wtx).length,0);assert.strictEqual(J(e,K.inv).length,0);
  }
  console.log('inventory-review-tests: PASS');
})().catch(err=>{console.error(err);process.exit(1)});
