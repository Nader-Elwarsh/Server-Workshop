/* اختبارات النسخ الاحتياطي والسلة: إلغاء تأكيد الاسترجاع مايجمّدش النسخ بعد كده، واسترجاع أمر/جهاز لأب محذوف بيتمنع بدل ما يطلع سجل يتيم. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
function makeEnv(confirmAnswer){
  const store={},alerts=[],confirms=[],downloads=[];
  const localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k]};
  const document={addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null,createElement:()=>({click(){downloads.push(1)},remove(){}}),body:{appendChild(){}}};
  const window={localStorage,WFStorage:localStorage,document,crypto:{randomUUID:()=>"id-"+Math.random().toString(36).slice(2)}};
  const readers=[];let readerMode='load';
  function FileReader(){readers.push(this);this.readAsText=function(f){this.result=f.text;Promise.resolve().then(()=>{if(readerMode==='error')this.onerror({target:{error:new Error('simulated read failure')}});else this.onload()})}}
  const context={window,localStorage,document,location:{href:''},crypto:window.crypto,console:{log(){},error(){},warn(){}},
    alert:m=>alerts.push(String(m)),confirm:m=>{confirms.push(String(m));return confirmAnswer},prompt:()=>null,
    Blob:function(){},URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}},FileReader,TextEncoder,TextDecoder,btoa,atob,setTimeout,clearTimeout,
    refreshAllScreens:()=>{},renderTrash:()=>{}};
  const c=vm.createContext(context);
  vm.runInContext(fs.readFileSync(`${__dirname}/shared-data.js`,'utf8'),c,{filename:'shared-data.js'});
  ['K','arr','get','put','putAsync','esc','escAttr','commitStorage','commitStorageAsync','withRollback','withRollbackAsync','saveJSONSafe'].forEach(n=>{if(window[n]!==undefined)context[n]=window[n]});
  context.id=window.id;
  ['app-shared.js','app-data-management.js','app-trash.js'].forEach(f=>vm.runInContext(fs.readFileSync(`${__dirname}/${f}`,'utf8'),c,{filename:f}));
  return {store,alerts,confirms,downloads,readers,context,K:window.K,setReaderMode(mode){readerMode=mode}};
}
(async()=>{
  // 1) إلغاء تأكيد الاسترجاع: بعدها نقدر نختار ملف تاني (مفيش تجمّد)
  {
    const e=makeEnv(false),x=e.context,K=e.K;
    const file={text:JSON.stringify({[K.c]:[{id:'c9',name:'من النسخة'}],_meta:{schemaVersion:1}})};
    const input={files:[file],value:'x'};
    x.restoreBackupFile(input);await new Promise(r=>setTimeout(r,60));
    assert.strictEqual(e.confirms.length,1,'confirmation shown');
    assert.strictEqual(JSON.parse(e.store[K.c]||'[]').length,0,'cancel must not replace data');
    x.restoreBackupFile({files:[file],value:'y'});await new Promise(r=>setTimeout(r,60));
    assert.strictEqual(e.readers.length,2,'a second restore attempt must not be blocked after cancelling');
  }
  // تعطل/إلغاء قراءة الملف ما يعلّقش قفل النسخ والاسترجاع، والمحاولة التالية تشتغل.
  {
    const e=makeEnv(true),x=e.context,input={files:[{text:'{}'}],value:'bad'};
    e.setReaderMode('error');x.restoreBackupFile(input);await new Promise(r=>setTimeout(r,30));
    assert.strictEqual(input.value,'','failed file input is cleared');assert.ok(/تعذر قراءة ملف النسخة/.test(e.alerts[0]));
    e.setReaderMode('load');x.restoreBackupFile({files:[{text:JSON.stringify({[e.K.c]:[],_meta:{schemaVersion:1}})}],value:'retry'});await new Promise(r=>setTimeout(r,80));
    assert.strictEqual(e.readers.length,2,'retry is not blocked after a read failure');
  }
  // فشل تصدير IndexedDB يمنع إنشاء نسخة ناقصة بصمت.
  {
    const e=makeEnv(true);e.context.window.ImageStore={exportAll:async()=>{throw new Error('simulated IndexedDB failure')}};
    let rejected=false;try{await e.context.snapshotAllData()}catch(_){rejected=true}
    assert.ok(rejected,'image-store export failure must abort a backup snapshot');
  }
  // 2) السلة: أمر أبوه اتحذف مايترجعش
  {
    const e=makeEnv(true),x=e.context,K=e.K;
    e.store[K.trash]=JSON.stringify([{id:'t1',type:'request',label:'أمر 1',payload:{request:{id:'r1',deviceId:'d-gone',customerId:'c-gone'}},deletedAt:new Date().toISOString()}]);
    await x.restoreFromTrash('t1');
    assert.strictEqual(JSON.parse(e.store[K.r]||'[]').length,0,'orphan request must not be restored');
    assert.ok(/الجهاز/.test(e.alerts[0]),'tells the user to restore the device first');
    assert.strictEqual(e.confirms.length,0,'no confirmation for a blocked restore');
    assert.strictEqual(JSON.parse(e.store[K.trash]).length,1,'entry stays in trash');
  }
  // 3) جهاز أبوه اتحذف مايترجعش؛ ولو الأب موجود بيترجع
  {
    const e=makeEnv(true),x=e.context,K=e.K;
    e.store[K.trash]=JSON.stringify([{id:'t2',type:'device',label:'غسالة',payload:{device:{id:'d1',customerId:'c1'},requests:[],moves:[]},deletedAt:new Date().toISOString()}]);
    await x.restoreFromTrash('t2');assert.strictEqual(JSON.parse(e.store[K.d]||'[]').length,0);assert.ok(/العميل/.test(e.alerts[0]));
    e.store[K.c]=JSON.stringify([{id:'c1',name:'أحمد'}]);
    await x.restoreFromTrash('t2');assert.strictEqual(JSON.parse(e.store[K.d]).length,1,'restores when the customer exists');
    assert.strictEqual(JSON.parse(e.store[K.trash]).length,0);
  }
  // 4) استرجاع نسخة قديمة (مفيهاش الخزنة ولا المحافظ): الأقسام الناقصة بتتفرّغ ومذكورة في رسالة التأكيد، والإعدادات الحالية بتفضل
  {
    const e=makeEnv(true),x=e.context,K=e.K;
    e.store[K.tr]=JSON.stringify([{id:'t1',amount:50}]);e.store[K.wtx]=JSON.stringify([{id:'w1',amount:50}]);e.store[K.s]=JSON.stringify({centers:['مركز حالي']});
    e.store[K.c]=JSON.stringify([{id:'cur',name:'عميل حالي'}]);
    const file={text:JSON.stringify({[K.c]:[{id:'c9',name:'من النسخة'}],[K.d]:[],[K.r]:[],[K.p]:[],_meta:{schemaVersion:1}})};
    x.restoreBackupFile({files:[file],value:'x'});await new Promise(r=>setTimeout(r,80));
    assert.ok(/هتتفرّغ/.test(e.confirms[0])&&/الخزنة/.test(e.confirms[0])&&/حركات الحسابات/.test(e.confirms[0])&&/الصور والتسجيلات/.test(e.confirms[0]),'confirmation lists the sections and images that will be emptied');
    assert.strictEqual(JSON.parse(e.store[K.c])[0].id,'c9','data replaced by the backup');
    assert.strictEqual(JSON.parse(e.store[K.tr]).length,0,'treasury emptied, not left mixed with the backup');
    assert.strictEqual(JSON.parse(e.store[K.wtx]).length,0);
    assert.strictEqual(JSON.parse(e.store[K.s]).centers[0],'مركز حالي','current settings are kept when the backup has none');
  }
  {
    const e=makeEnv(true),x=e.context,K=e.K;
    assert.throws(()=>x.validateBackupData({[K.c]:[],_meta:{schemaVersion:0}}),/invalid-schema/);
  }
  console.log('backup-trash-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
