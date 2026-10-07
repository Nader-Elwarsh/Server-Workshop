/* اختبارات قفل التطبيق: مدة الإيقاف بتتضاعف مع المحاولات الخاطئة، والقفل بسبب الخمول أو الخروج بيطلب الرقم السري فورًا. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(`${__dirname}/app-lock.js`,'utf8');
function mkStorage(){const s={};return{getItem:k=>(k in s?s[k]:null),setItem:(k,v)=>{s[k]=String(v)},removeItem:k=>{delete s[k]}}}
function makeEnv(){
  let clock=1e12;const handlers={},wHandlers={},timers=[],alerts=[],answers=[],prompts=[];
  const RealDate=Date;
  function FakeDate(...a){return new RealDate(...(a.length?a:[clock]))}
  FakeDate.now=()=>clock;
  const body={children:[],appendChild(c){this.children.push(c)}};
  const document={hidden:false,body,documentElement:body,addEventListener:(t,f)=>{(handlers[t]=handlers[t]||[]).push(f)},getElementById:()=>null,createElement:()=>({style:{},setAttribute(){},appendChild(){}})};
  const window={addEventListener:(t,f)=>{(wHandlers[t]=wHandlers[t]||[]).push(f)}};
  const localStorage=mkStorage();window.WFStorage=localStorage;
  const ctx={window,document,localStorage,WFStorage:localStorage,sessionStorage:mkStorage(),crypto:require('crypto').webcrypto,Date:FakeDate,Math,JSON,Number,String,Uint32Array,
    setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length},clearTimeout:()=>{},
    alert:m=>alerts.push(String(m)),prompt:m=>{prompts.push(m);return answers.length?answers.shift():null}};
  vm.runInNewContext(src,ctx,{filename:'app-lock.js'});
  return {lock:window.WFLock,alerts,answers,prompts,body,document,handlers,wHandlers,timers,advance:ms=>{clock+=ms},
    runTimers:()=>{const t=timers.splice(0);t.forEach(x=>x.f())}};
}
const wrong=(e,n)=>{for(let i=0;i<n;i++){e.answers.push('0000');e.lock.requirePin()}};
// 1) المحاولات الخاطئة: 30 ثانية ثم دقيقة
{
  const e=makeEnv();e.lock.setPin('1234');
  wrong(e,5);
  assert.ok(/30 ثانية/.test(e.alerts[e.alerts.length-1]),'first lockout is 30 seconds');
  const before=e.prompts.length;e.answers.push('1234');
  assert.strictEqual(e.lock.requirePin(),false,'locked: even the right PIN is refused');assert.strictEqual(e.prompts.length,before,'no prompt while locked');
  e.answers.length=0;e.advance(31000);
  wrong(e,5);
  assert.ok(/دقيقة/.test(e.alerts[e.alerts.length-1]),'second lockout is longer: '+e.alerts[e.alerts.length-1]);
  e.advance(31000);e.answers.push('1234');
  assert.strictEqual(e.lock.requirePin(),false,'still locked 31s into a 60s lockout');
  e.answers.length=0;e.advance(31000);e.answers.push('1234');
  assert.strictEqual(e.lock.requirePin(),true,'after the lockout the right PIN works');
  // الرقم الصحيح بيصفّر العدّاد
  wrong(e,4);e.answers.push('1234');assert.strictEqual(e.lock.requirePin(),true);
}
// 2) القفل بسبب الخمول بيطلب الرقم السري فورًا
{
  const e=makeEnv();e.lock.setPin('1234');e.lock.unlock();assert.ok(e.lock.isUnlocked());
  e.lock.lock('idle');e.answers.push('1234');e.runTimers();
  assert.ok(e.prompts.some(p=>/للدخول/.test(p)),'idle lock must prompt for the PIN');
  assert.ok(e.lock.isUnlocked(),'right PIN unlocks again');
  // إلغاء الطلب = شاشة حجب
  e.lock.lock('idle');e.answers.push(null);e.runTimers();
  assert.ok(e.body.children.length>=1,'cancelling must leave the blocker screen');
}
// 3) الخروج من التطبيق والرجوع له
{
  const e=makeEnv();e.lock.setPin('1234');e.lock.unlock();
  e.document.hidden=true;e.handlers.visibilitychange.forEach(f=>f());
  assert.strictEqual(e.lock.isUnlocked(),false,'leaving locks');
  e.document.hidden=false;e.answers.push('1234');e.handlers.visibilitychange.forEach(f=>f());
  assert.ok(e.prompts.some(p=>/للدخول/.test(p)),'coming back must ask for the PIN');assert.ok(e.lock.isUnlocked());
  // لو قفل الدخول متعطّل مفيش طلب
  const e2=makeEnv();e2.lock.setPin('1234');e2.lock.setEntryLockEnabled(false);e2.lock.unlock();
  e2.document.hidden=true;e2.handlers.visibilitychange.forEach(f=>f());e2.document.hidden=false;e2.handlers.visibilitychange.forEach(f=>f());
  assert.strictEqual(e2.prompts.length,0,'entry lock disabled: no prompt');
}
// 4) الأرقام العربية والمسافات في الرقم السري، مع بقاء الأرقام السرية القديمة شغالة
{
  const e=makeEnv();e.lock.setPin('1234');
  assert.ok(e.lock.verify('١٢٣٤'),'Arabic-Indic digits match');assert.ok(e.lock.verify(' 1234 '),'stray spaces ignored');assert.ok(!e.lock.verify('1235'));
  // رقم قديم اتخزن بأرقام عربية خام: لسه بيتقبل بنفس الكتابة
  const e2=makeEnv();e2.lock.setPin('١٢٣٤');
  assert.ok(e2.lock.verify('1234'),'normalized pin');
}
console.log('app-lock-tests: PASS');
