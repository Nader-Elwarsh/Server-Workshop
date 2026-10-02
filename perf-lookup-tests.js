/* اختبارات الأداء: فهرس id للقراءة بيرجع نفس نتيجة find القديمة، وشاشة المتابعة مابتعيدش قراءة الأوامر لكل عميل. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
function makeEnv(){
  const store={},reads={};
  const localStorage={getItem:k=>{reads[k]=(reads[k]||0)+1;return k in store?store[k]:null},setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k]};
  const els={followupList:{innerHTML:''},followupDays:{value:'1'}};
  const document={addEventListener:()=>{},getElementById:i=>els[i]||null,querySelector:()=>null,querySelectorAll:()=>[]};
  const window={localStorage,document,addEventListener(){},removeEventListener(){},crypto:{randomUUID:()=>"id-"+Math.random().toString(36).slice(2)}};
  const context={window,localStorage,document,location:{href:'',search:''},crypto:window.crypto,console:{log(){},error(){},warn(){}},alert(){},confirm:()=>true,prompt:()=>null,setTimeout,clearTimeout,
    contactLinksHtml:()=>'',waNumber:()=>'',localDateKey:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const c=vm.createContext(context);
  vm.runInContext(fs.readFileSync(`${__dirname}/shared-data.js`,'utf8'),c,{filename:'shared-data.js'});
  ['K','arr','get','put','esc','escAttr','commitStorage','withRollback','saveJSONSafe','settings','arrCached','byIdCached','customerName','deviceName','addressText'].forEach(n=>{if(window[n]!==undefined)context[n]=window[n]});
  context.id=window.id;
  return {store,reads,els,context,c,K:window.K,window};
}
// 1) سلوك الفهرس
{
  const e=makeEnv(),K=e.K,x=e.context;
  e.store[K.c]=JSON.stringify([{id:'a',name:'أحمد'},{id:'b',name:'بسمة'},{id:'a',name:'مكرر'}]);
  assert.strictEqual(x.customerName('a'),'أحمد','first record wins, same as find()');
  assert.strictEqual(x.customerName('b'),'بسمة');
  assert.strictEqual(x.customerName('nope'),'\u2014','missing customer keeps the dash fallback');
  assert.strictEqual(x.customerName(undefined),'\u2014');
  // تحديث البيانات: الفهرس بيتجدد (نسخة جديدة من التخزين)
  e.store[K.c]=JSON.stringify([{id:'a',name:'أحمد'},{id:'b',name:'بسمة'},{id:'c',name:'جديد'}]);
  assert.strictEqual(x.customerName('c'),'جديد','index follows storage changes');
  // أجهزة
  e.store[K.d]=JSON.stringify([{id:'d1',type:'غسالة',brand:'LG'}]);
  assert.strictEqual(x.deviceName('d1'),'غسالة - LG');assert.strictEqual(x.deviceName('zz'),'\u2014');
  // بيانات تالفة مش بتكسر
  e.store[K.c]='{"not":"an array"}';assert.strictEqual(x.customerName('a'),'\u2014');
  e.store[K.c]='not json';assert.strictEqual(x.customerName('a'),'\u2014');
}
// 2) المتابعة: قراءة الأوامر مرة واحدة مهما كان عدد العملاء، والنتيجة نفسها
{
  const e=makeEnv(),K=e.K;
  const N=400,old=new Date(Date.now()-90*86400000).toISOString();
  e.store[K.c]=JSON.stringify(Array.from({length:N},(_,i)=>({id:'c'+i,name:'عميل '+i,phone:'010'+i})));
  e.store[K.r]=JSON.stringify(Array.from({length:N*2},(_,i)=>({id:'r'+i,customerId:'c'+(i%N),createdAt:old})));
  e.store[K.followupLog]=JSON.stringify([{id:'l1',customerId:'c3',templateName:'قالب',text:'x',sentAt:new Date().toISOString()}]);
  vm.runInContext(fs.readFileSync(`${__dirname}/app-route-followup.js`,'utf8'),e.c,{filename:'app-route-followup.js'});
  e.reads[K.r]=0;e.reads[K.followupLog]=0;
  e.context.renderFollowup();
  const html=e.els.followupList.innerHTML;
  assert.strictEqual((html.match(/class="item record-card"/g)||[]).length,N,'every customer with an old order is listed');
  assert.ok(e.reads[K.r]<=3,'orders must not be re-read per customer (reads='+e.reads[K.r]+')');
  assert.ok(e.reads[K.followupLog]<=3,'follow-up log must not be re-read per row (reads='+e.reads[K.followupLog]+')');
  assert.ok(html.includes('قالب'),'last send info still shown for the customer who has one');
}
console.log('perf-lookup-tests: PASS');
