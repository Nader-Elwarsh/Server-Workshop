/* اختبارات الإعدادات: تغيير/إلغاء الرقم السري بيعدّي على محدّد المحاولات، وحذف قيمة مستخدمة بيحذّر قبل ما يمسحها. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
function makeEnv(){
  const store={},alerts=[],confirms=[],answers=[],confirmAnswers=[];
  const localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k]};
  const els={};
  const document={addEventListener:()=>{},getElementById:i=>els[i]||null,querySelector:()=>null,querySelectorAll:()=>[]};
  const window={localStorage,WFStorage:localStorage,document,addEventListener(){},removeEventListener(){},crypto:{randomUUID:()=>"id-"+Math.random().toString(36).slice(2)}};
  const calls={requirePin:0,remove:0};
  window.WFLock={isSet:()=>true,verify:()=>{throw new Error('verify() must not be called directly (bypasses the attempt limiter)')},
    requirePin:()=>{calls.requirePin++;return pinOk},removePin:()=>{calls.remove++},setPin(){},unlock(){}};
  let pinOk=true;
  const context={window,localStorage,document,location:{href:'',hash:''},crypto:window.crypto,console:{log(){},error(){},warn(){}},
    alert:m=>alerts.push(String(m)),confirm:m=>{confirms.push(String(m));return confirmAnswers.length?confirmAnswers.shift():true},prompt:()=>answers.shift(),
    settingsPage:()=>{},WFLock:window.WFLock};
  const c=vm.createContext(context);
  vm.runInContext(fs.readFileSync(`${__dirname}/shared-data.js`,'utf8'),c,{filename:'shared-data.js'});
  ['K','arr','get','put','esc','escAttr','commitStorage','withRollback','saveJSONSafe','settings'].forEach(n=>{if(window[n]!==undefined)context[n]=window[n]});
  context.id=window.id;
  ['app-shared.js','app-settings.js'].forEach(f=>vm.runInContext(fs.readFileSync(`${__dirname}/${f}`,'utf8'),c,{filename:f}));
  context.settingsPage=()=>{};
  return {store,alerts,confirms,answers,confirmAnswers,context,calls,K:window.K,setPinOk:v=>{pinOk=v}};
}
const J=(e,k,d='[]')=>JSON.parse(e.store[k]||d);
// 1) إلغاء الرقم السري: عن طريق requirePin، ولو غلط مايتلغاش
{
  const e=makeEnv(),x=e.context;
  e.setPinOk(false);x.removeAppPin();assert.strictEqual(e.calls.remove,0,'wrong PIN must not remove the lock');assert.strictEqual(e.calls.requirePin,1);
  e.setPinOk(true);x.removeAppPin();assert.strictEqual(e.calls.remove,1);
}
// 2) حذف نوع جهاز مستخدم: تحذير بعدد الأجهزة، والرفض يمنع الحذف
{
  const e=makeEnv(),x=e.context,K=e.K;
  e.store[K.d]=JSON.stringify([{id:'d1',type:'غسالة'},{id:'d2',type:'غسالة'}]);
  const s=x.settings();s.types['غسالة']=s.types['غسالة']||['أوتوماتيك'];x.put(K.s,s);
  e.confirmAnswers.push(false);x.deleteType('غسالة');
  assert.ok(/2 جهاز/.test(e.confirms[0]),'warns with the number of devices using it');
  assert.ok('غسالة' in J(e,K.s,'{}').types,'declining keeps the type');
  e.confirmAnswers.push(true,true);x.deleteType('غسالة');
  assert.ok(!('غسالة' in J(e,K.s,'{}').types),'accepting deletes it');
}
// 3) ماركة وتصنيف قطع مستخدمين
{
  const e=makeEnv(),x=e.context,K=e.K;
  e.store[K.d]=JSON.stringify([{id:'d1',brand:'LG'}]);e.store[K.p]=JSON.stringify([{id:'p1',category:'موتورات'},{id:'p2',category:'موتورات',archived:true}]);
  const s=x.settings();s.brands=(s.brands||[]).concat('LG');s.partCats=(s.partCats||[]).concat('موتورات');x.put(K.s,s);
  e.confirmAnswers.push(false);x.deleteBrand('LG');assert.ok(/1 جهاز/.test(e.confirms[0]));assert.ok(J(e,K.s,'{}').brands.includes('LG'));
  e.confirmAnswers.push(false);x.deletePartCategory('موتورات');assert.ok(/1 صنف/.test(e.confirms[1]),'archived parts are not counted');assert.ok(J(e,K.s,'{}').partCats.includes('موتورات'));
}
// 4) مركز فيه عملاء
{
  const e=makeEnv(),x=e.context,K=e.K;
  e.store[K.c]=JSON.stringify([{id:'c1',mainAddress:{center:'مركز أ'}},{id:'c2',mainAddress:{center:'مركز ب'}}]);
  const s=x.settings();s.centers=(s.centers||[]).concat('مركز أ');s.villages=s.villages||{};s.villages['مركز أ']=['ق'];x.put(K.s,s);
  e.confirmAnswers.push(false);x.deleteCenter('مركز أ');assert.ok(/1 عميل/.test(e.confirms[0]));assert.ok(J(e,K.s,'{}').centers.includes('مركز أ'));
}
console.log('settings-tests: PASS');
