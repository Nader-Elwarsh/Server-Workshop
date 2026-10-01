/* اختبارات العملاء والأجهزة والمهام: تحقق تعديل المهمة، حفظ المهام مايمسحش المحذوف، حذف العميل بيفك مهامه، فشل حفظ العميل مايفتحش ملف مش موجود، وجهاز مايتسجلش مرتين بالضغط المزدوج. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
function makeEnv(){
  const store={},alerts=[],answers=[];let failWrites=false;
  const localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{if(failWrites)throw new Error('quota');store[k]=String(v)},removeItem:k=>delete store[k]};
  const els={};
  const document={addEventListener:()=>{},getElementById:i=>els[i]||null,querySelector:()=>null};
  const window={localStorage,document,crypto:{randomUUID:()=>"id-"+Math.random().toString(36).slice(2)}};
  const location={href:'',search:''};
  const context={window,localStorage,document,location,crypto:window.crypto,console:{log(){},error(){}},alert:m=>alerts.push(String(m)),confirm:()=>true,prompt:()=>answers.shift(),
    renderTasks:()=>{},renderCustomers:()=>{},renderDevices:()=>{}};
  const c=vm.createContext(context);
  vm.runInContext(fs.readFileSync(`${__dirname}/shared-data.js`,'utf8'),c,{filename:'shared-data.js'});
  ['K','arr','get','put','esc','escAttr','commitStorage','withRollback','saveJSONSafe','phoneKey'].forEach(n=>{if(window[n]!==undefined)context[n]=window[n]});
  context.id=window.id;
  ['app-shared.js','tasks.js','app-customers.js','app-devices.js','app-delete-tools.js'].forEach(f=>vm.runInContext(fs.readFileSync(`${__dirname}/${f}`,'utf8'),c,{filename:f}));
  context.imageToDataURL=()=>new Promise(r=>setTimeout(()=>r('data:image/png;base64,AA'),30));
  return {store,alerts,answers,els,context,location,K:window.K,setFail:v=>{failWrites=v}};
}
const J=(e,k)=>JSON.parse(e.store[k]||'[]');
(async()=>{
  // 1) تعديل مهمة: تاريخ/وقت/أولوية غلط بتترفض، والأرقام العربية مقبولة
  {
    const e=makeEnv(),x=e.context,K=e.K;
    e.store[K.tasks]=JSON.stringify([{id:'t1',title:'اتصال',note:'',date:'2026-10-05',time:'09:00',priority:'عادية'}]);
    const run=(...a)=>{e.answers.length=0;e.answers.push(...a);x.editTask('t1')};
    run('اتصال','','بكرة','','عادية');assert.strictEqual(J(e,K.tasks)[0].date,'2026-10-05','free text date must be rejected');
    run('اتصال','','2026-02-31','','عادية');assert.strictEqual(J(e,K.tasks)[0].date,'2026-10-05','impossible date must be rejected');
    run('اتصال','','2026-10-06','25:99','عادية');assert.strictEqual(J(e,K.tasks)[0].date,'2026-10-05','bad time must be rejected');
    run('اتصال','','2026-10-06','10:00','مهمة جدا');assert.strictEqual(J(e,K.tasks)[0].date,'2026-10-05','bad priority must be rejected');
    assert.ok(e.alerts.length>=4);
    run('اتصال','تفاصيل','٢٠٢٦-١٠-٠٧','٩:٣٠','عاجلة');
    const t=J(e,K.tasks)[0];assert.strictEqual(t.date,'2026-10-07');assert.strictEqual(t.time,'09:30');assert.strictEqual(t.priority,'عاجلة');
  }
  // 2) حفظ مهمة جديدة مايمسحش المهام المحذوفة (tombstones) من التخزين
  {
    const e=makeEnv(),x=e.context,K=e.K;
    e.store[K.tasks]=JSON.stringify([{id:'old',title:'قديمة',deleted:true,date:'2026-10-01'}]);
    e.els.taskTitle={value:'جديدة'};
    x.saveTask();
    const all=J(e,K.tasks);
    assert.strictEqual(all.length,2);assert.ok(all.some(t=>t.id==='old'&&t.deleted),'deleted tombstone must be preserved');
  }
  // 3) حذف عميل: المهام بتتفك منه بدل ما تفضل بتشاور عليه
  {
    const e=makeEnv(),x=e.context,K=e.K;
    e.store[K.c]=JSON.stringify([{id:'c1',name:'أحمد',phone:'01001234567'}]);
    e.store[K.tasks]=JSON.stringify([{id:'t1',title:'متابعة',customerId:'c1',requestId:'r9'},{id:'t2',title:'تانية',customerId:'c2'}]);
    x.deleteCustomerRecord('c1');
    assert.strictEqual(J(e,K.c).length,0);
    const ts=J(e,K.tasks);assert.strictEqual(ts.length,2);
    assert.strictEqual(ts.find(t=>t.id==='t1').customerId,'');assert.strictEqual(ts.find(t=>t.id==='t2').customerId,'c2');
  }
  // 4) فشل حفظ العميل: بيرجع null (مفيش تنقل لملف مش موجود)
  {
    const e=makeEnv(),x=e.context;
    e.setFail(true);
    assert.strictEqual(x.persistCustomerRecord({name:'س',phone:'01001234567',mainAddress:{},extraAddress:{}},null),null);
    e.setFail(false);
    const c=x.persistCustomerRecord({name:'س',phone:'01001234567',mainAddress:{},extraAddress:{}},null);
    assert.ok(c&&c.id);assert.strictEqual(J(e,e.K.c).length,1);
  }
  // 5) جهاز بضغطتين متتاليتين = جهاز واحد
  {
    const e=makeEnv(),x=e.context,K=e.K;
    Object.assign(x,{dType:{value:'غسالة'},dCategory:{value:'أوتوماتيك'},dBrand:{value:'LG'},dModel:{value:' X1 '},dDesc:{value:''},dAddress:{value:'main'},dCustomer:{value:'c1'},dPhoto:{files:[{name:'p.png'}]}});
    e.els.dCustomer={value:'c1'};
    const ev={preventDefault(){}};
    await Promise.all([x.saveDevice(ev,null),x.saveDevice(ev,null)]);
    assert.strictEqual(J(e,K.d).length,1,'double submit must create one device');
    assert.strictEqual(J(e,K.d)[0].model,'X1');
    await x.saveDevice(ev,null);assert.strictEqual(J(e,K.d).length,2,'a later save must still work');
  }
  console.log('customers-tasks-tests: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
