/* دفعات العربون الجزئية من خط السير + مطابقة الرصيد.
   - الدفعة الجديدة بمحفظة مختلفة/بدون محفظة/بعد تعديل يدوي ماتنقلش فلوس العربون السابق ولا تتحسب في محفظة غلط.
   - فحص «مطابقة الرصيد» بيلقط عربون/تحصيل اتشال تلقائيًا من المحفظة ويقدر يرجّعه بتأكيد. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
function make(orderId='o1'){
  const store={},els={};
  const localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k]};
  const document={addEventListener(){},getElementById:i=>els[i]||null,querySelector:()=>null,querySelectorAll:()=>[]};
  const window={localStorage,WFStorage:localStorage,document,crypto:{randomUUID:()=>'id-'+Math.random().toString(36).slice(2)}};
  const ctx={window,localStorage,document,crypto:window.crypto,console,alert(){},confirm(){return true},setTimeout,Date,URLSearchParams,location:{search:'',href:'',reload(){}}};
  vm.createContext(ctx);
  const run=f=>vm.runInContext(fs.readFileSync(`${__dirname}/${f}`,'utf8'),ctx,{filename:f});
  run('shared-data.js');
  Object.assign(ctx,{K:window.K,arr:window.arr,get:window.get,put:window.put,esc:window.esc,id:window.id,settings:window.settings,withRollback:window.withRollback,commitStorage:window.commitStorage,commitStorageAsync:window.commitStorageAsync,putAsync:window.putAsync,withRollbackAsync:window.withRollbackAsync,localDateKey:window.localDateKey});
  ['app-shared.js','wallets.js','app-route-followup.js','app-delete-tools.js'].forEach(run);
  ctx.applyStatusTimestamp=()=>{}; // يوفّره app-requests.js في صفحة خط السير الفعلية.
  const A='محفظتي الشخصية',B='محفظة فودافون كاش';
  const s=ctx.settings();s.wallets=[A,B];ctx.put(ctx.K.s,s);
  ctx.put(ctx.K.r,[{id:orderId,no:'W-1',customerId:'c1',status:'جاري التنفيذ',closed:false,paid:false,partsTotal:0,labor:0,total:0,deposit:0,depositWallet:'',createdAt:new Date().toISOString()}]);
  const pay=(amount,wallet)=>{const key=String(orderId);els[`qcLabor-${key}`]={value:'1000'};els[`qcNewDeposit-${key}`]={value:String(amount)};els[`qcWallet-${key}`]={value:wallet};ctx.confirmQuickPartialPayment(key)};
  const order=()=>JSON.parse(store[ctx.K.r])[0];
  return{ctx,store,pay,order,orderId,A,B,bal:w=>ctx.walletBalance(w)};
}
async function main(){
let t;
// نفس المحفظة مرتين: بتتجمع في حركة واحدة زي الأول.
t=make();t.pay(300,t.A);t.pay(200,t.A);
assert.strictEqual(t.bal(t.A),500);assert.strictEqual(JSON.parse(t.store[t.ctx.K.wtx]).length,1);
// محفظة مختلفة: العربون السابق يفضل في محفظته والدفعة الجديدة في محفظتها.
t=make();t.pay(300,t.A);t.pay(200,t.B);
assert.strictEqual(t.bal(t.A),300,'old deposit must stay in its wallet');assert.strictEqual(t.bal(t.B),200);
assert.strictEqual(t.order().deposit,500);assert.strictEqual(t.order().depositWallet,t.A);
// المعرّفات الرقمية القديمة تظهر كنص داخل أزرار HTML؛ حافظ على فتح النموذج وتسجيل الدفعة والإغلاق.
t=make(123);t.ctx.toggleQuickClose('123');
assert.strictEqual(vm.runInContext('routeViewState.quickCloseId',t.ctx),'123','numeric legacy order can open quick-close form');
t.pay(250,t.A);
assert.strictEqual(t.order().deposit,250,'partial payment for numeric legacy order is saved');
assert.strictEqual(t.bal(t.A),250,'partial payment for numeric legacy order reaches its wallet');
{const key=String(t.orderId),els2={};
  t.ctx.document.getElementById=id=>els2[id]||null;
  els2[`qcLabor-${key}`]={value:'1000'};els2[`qcWallet-${key}`]={value:t.A};
  t.ctx.confirmQuickClose(key);
  assert.strictEqual(t.order().closed,true,'numeric legacy order can close from the route');
  assert.strictEqual(t.bal(t.A),1000,'final collection for numeric legacy order is recorded');
}
// دفعة من غير محفظة: مفيش فلوس وهمية في المحفظة القديمة.
t=make();t.pay(300,t.A);t.pay(200,'');
assert.strictEqual(t.bal(t.A),300,'untracked payment must not be credited to the old wallet');assert.strictEqual(t.order().deposit,500);
// عربون سابق من غير محفظة ثم دفعة بمحفظة: الدفعة الجديدة بس هي اللي تتسجل.
t=make();t.pay(300,'');t.pay(200,t.B);
assert.strictEqual(t.bal(t.B),200);assert.strictEqual(t.bal(t.A),0);
// حركة العربون معدّلة يدويًا: الدفعة الجديدة ماتضيعش.
t=make();t.pay(300,t.A);
{const w=JSON.parse(t.store[t.ctx.K.wtx]);w[0].amount=330;w[0].manualOverride=true;t.store[t.ctx.K.wtx]=JSON.stringify(w);}
t.pay(200,t.A);assert.strictEqual(t.bal(t.A),530);
// حفظ الأمر من فورم التعديل (بيبعت العربون الكلي) ماينتجش تكرار.
t=make();t.pay(300,t.A);t.pay(200,t.B);
t.ctx.syncWalletForOrderDeposit(t.order());
assert.strictEqual(t.bal(t.A),300);assert.strictEqual(t.bal(t.B),200);
// المطابقة: مفيش بنود «مبلغ غير مطابق» ولا تكرار على الدفعات الجزئية.
{const a=t.ctx.walletAudit();assert.ok(!a.issues.some(i=>['amount-mismatch','possible-duplicate','manual-vs-order','order-missing'].includes(i.kind)),JSON.stringify(a.issues.map(i=>i.kind)))}
// حذف الأمر بيشيل الدفعة الجزئية، وتتسترجع بعلامة deletedWithOrder.
{const after=t.ctx.walletEntriesAfterRemovingRequests(['o1']);
 const parts=after.filter(x=>x.source==='order-part');assert.ok(parts.length===1&&parts[0].deleted&&parts[0].deletedWithOrder);
 assert.ok(after.filter(x=>x.refKey==='order-deposit-o1').every(x=>x.deleted));}
// عربون اتشال تلقائيًا (deleted بدون userDeleted) لازم يظهر في المطابقة ويتسجّل تاني بعد التأكيد.
t=make();
t.ctx.put(t.ctx.K.r,[{id:'o2',no:'W-2',status:'مكتمل',closed:true,paid:true,total:1000,deposit:400,depositWallet:t.A,closeWallet:t.A,createdAt:new Date().toISOString()}]);
t.ctx.put(t.ctx.K.wtx,[
 {id:'order-deposit-o2',refKey:'order-deposit-o2',deleted:true,type:'in',amount:400,wallet:t.A,category:'تحصيل عميل',reason:'x',date:'2026-09-01',time:'10:00',source:'order-link',manualOverride:false,createdAt:'2026-09-01T10:00:00Z'},
 {id:'order-final-o2',refKey:'order-final-o2',deleted:false,type:'in',amount:600,wallet:t.A,category:'تحصيل عميل',reason:'y',date:'2026-09-02',time:'10:00',source:'order-link',manualOverride:false,createdAt:'2026-09-02T10:00:00Z'}]);
{const a=t.ctx.walletAudit();const m=a.issues.find(i=>i.kind==='missing-deposit');assert.ok(m&&m.dir==='down'&&m.amount===400&&m.fix,'auto-removed deposit must be flagged with a restore action');
 assert.strictEqual(a.downTotal,400);
 t.ctx.restoreOrderWalletTx('o2','deposit');assert.strictEqual(t.bal(t.A),1000);assert.ok(!t.ctx.walletAudit().issues.some(i=>i.kind==='missing-deposit'));}
// حذف المستخدم بقصد (userDeleted) مايتعرضش كخطأ.
t=make();
t.ctx.put(t.ctx.K.r,[{id:'o3',no:'W-3',status:'جاري التنفيذ',closed:false,total:0,deposit:250,depositWallet:t.A,createdAt:new Date().toISOString()}]);
t.ctx.put(t.ctx.K.wtx,[{id:'order-deposit-o3',refKey:'order-deposit-o3',deleted:true,userDeleted:true,deletedAmount:250,deletedWallet:t.A,type:'in',amount:250,wallet:t.A,category:'تحصيل عميل',reason:'x',date:'2026-09-01',time:'10:00',source:'order-link',createdAt:'2026-09-01T10:00:00Z'}]);
assert.ok(!t.ctx.walletAudit().issues.some(i=>i.kind==='missing-deposit'),'deliberate (user) deletion must not be reported as missing');
// أمر اتفتح تاني: التحصيل اللي اتشال يظهر كمعلومة.
t=make();
t.ctx.put(t.ctx.K.r,[{id:'o4',no:'W-4',status:'جاري التنفيذ',closed:false,total:900,deposit:0,reopenedFromClosedAt:'2026-09-20T10:00:00Z',createdAt:new Date().toISOString()}]);
t.ctx.put(t.ctx.K.wtx,[{id:'order-final-o4',refKey:'order-final-o4',deleted:true,type:'in',amount:900,wallet:t.A,category:'تحصيل عميل',reason:'x',date:'2026-09-01',time:'10:00',source:'order-link',createdAt:'2026-09-01T10:00:00Z'}]);
{const m=t.ctx.walletAudit().issues.find(i=>i.kind==='reopened-final');assert.ok(m&&m.dir==='info'&&m.amount===900);}

/* ---------- مرتجع أمر مقفول: تحويل المبلغ المتحصّل لعربون / رد الفلوس / من غير تسجيل ---------- */
function makeReturn(confirms,prompts,o){
  const store={},els={};
  const localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k]};
  const document={addEventListener(){},getElementById:i=>els[i]||null,querySelector:()=>null,querySelectorAll:()=>[]};
  const window={localStorage,WFStorage:localStorage,document,crypto:{randomUUID:()=>'id-'+Math.random().toString(36).slice(2)}};
  const ctx={window,localStorage,document,crypto:window.crypto,console,alert(m){ctx.__alerts.push(m)},confirm(){return confirms.length?confirms.shift():true},prompt(){return prompts.length?prompts.shift():''},__alerts:[],setTimeout,Date,URLSearchParams,location:{search:'',href:'',reload(){}}};
  vm.createContext(ctx);
  const run=f=>vm.runInContext(fs.readFileSync(`${__dirname}/${f}`,'utf8'),ctx,{filename:f});
  run('shared-data.js');
  Object.assign(ctx,{K:window.K,arr:window.arr,get:window.get,put:window.put,esc:window.esc,id:window.id,settings:window.settings,withRollback:window.withRollback,commitStorage:window.commitStorage,commitStorageAsync:window.commitStorageAsync,putAsync:window.putAsync,withRollbackAsync:window.withRollbackAsync,localDateKey:window.localDateKey});
  ['app-shared.js','wallets.js'].forEach(run);
  vm.runInContext('var renderRequests=()=>{},renderDash=()=>{},requestProfile=()=>{};',ctx);
  run('app-requests.js');
  const A='محفظتي الشخصية',B='محفظة فودافون كاش';
  const s=ctx.settings();s.wallets=[A,B];ctx.put(ctx.K.s,s);
  const now=new Date().toISOString();
  const order={id:o.id??'r1',no:'W-9',customerId:'c1',status:'مكتمل',closed:true,paid:true,total:1000,deposit:200,depositWallet:A,closeWallet:o.closeWallet===undefined?A:o.closeWallet,remain:0,closedAt:now,paidAt:now,createdAt:now};
  ctx.put(ctx.K.r,[order]);
  ctx.syncWalletForOrderDeposit(order);
  if(order.closeWallet)ctx.syncWalletForOrderClose(order,800,order.closeWallet);
  return{ctx,store,A,B,bal:w=>ctx.walletBalance(w),order:()=>JSON.parse(store[ctx.K.r])[0],txs:()=>JSON.parse(store[ctx.K.wtx])};
}
// R1: التحصيل في نفس محفظة العربون → يتحوّل لعربون والرصيد ثابت، ومش هيتحصّل تاني.
t=makeReturn([true],['عطل تاني'],{});
assert.strictEqual(t.bal(t.A),1000);await t.ctx.markRequestReturned('r1');
assert.strictEqual(t.bal(t.A),1000,'balance must not drop when the collected money becomes a deposit');
assert.strictEqual(t.order().deposit,1000);assert.strictEqual(t.order().closed,false);assert.strictEqual(t.order().remain,0);assert.strictEqual(t.order().status,'جاري التنفيذ');
assert.ok(t.txs().filter(x=>x.refKey==='order-final-r1'&&!x.deleted).length===0);
assert.strictEqual(t.txs().find(x=>x.refKey==='order-deposit-r1'&&!x.deleted).amount,1000);
assert.strictEqual(t.order().returnMoney.choice,'deposit');
assert.ok(!t.ctx.walletAudit().issues.some(i=>['amount-mismatch','reopened-final','final-on-open'].includes(i.kind)),'no false alarms after a converted return');
// R2: التحصيل في محفظة تانية → كل محفظة تفضل بفلوسها.
{const q=makeReturn([true],['عطل'],{});
 // نعدّل: العربون في A والتحصيل النهائي في B
 const o=JSON.parse(q.store[q.ctx.K.r]);o[0].closeWallet=q.B;q.store[q.ctx.K.r]=JSON.stringify(o);
 const w=JSON.parse(q.store[q.ctx.K.wtx]);w.find(x=>x.refKey==='order-final-r1').wallet=q.B;q.store[q.ctx.K.wtx]=JSON.stringify(w);
 assert.strictEqual(q.bal(q.A),200);assert.strictEqual(q.bal(q.B),800);
 await q.ctx.markRequestReturned('r1');
 assert.strictEqual(q.bal(q.A),200);assert.strictEqual(q.bal(q.B),800,'money stays in the wallet it was collected in');
 assert.strictEqual(q.order().deposit,1000);assert.strictEqual(q.order().depositExtra,800);
 assert.ok(!q.ctx.walletAudit().issues.some(i=>['amount-mismatch','possible-duplicate'].includes(i.kind)));}
// R3: اتردّت كلها → الرصيد ينقص بالمحصّل بس والعربون القديم يفضل.
t=makeReturn([false,true],['800','العميل رفض'],{});await t.ctx.markRequestReturned('r1');
assert.strictEqual(t.bal(t.A),200);assert.strictEqual(t.order().deposit,200);assert.strictEqual(t.order().remain,800);assert.strictEqual(t.order().returnMoney.choice,'refund');
// R4: رد جزئي 300 → الباقي 500 يتحوّل لعربون.
t=makeReturn([false,true],['300','رد جزئي'],{});await t.ctx.markRequestReturned('r1');
assert.strictEqual(t.bal(t.A),700);assert.strictEqual(t.order().deposit,700);assert.strictEqual(t.order().remain,300);
// رد أكبر من المحصّل مرفوض ومفيش تغيير.
t=makeReturn([false,true],['900','x'],{});await t.ctx.markRequestReturned('r1');
assert.strictEqual(t.order().closed,true);assert.strictEqual(t.bal(t.A),1000);
// R5: من غير تسجيل (السلوك القديم، بعد تحذير صريح): التحصيل يتشال من الرصيد.
t=makeReturn([false,false,true],['x'],{});await t.ctx.markRequestReturned('r1');
assert.strictEqual(t.bal(t.A),200);assert.strictEqual(t.order().deposit,200);assert.strictEqual(t.order().returnMoney,undefined);
// R6: إلغاء في آخر تحذير = مفيش مرتجع خالص.
t=makeReturn([false,false,false],['x'],{});await t.ctx.markRequestReturned('r1');
assert.strictEqual(t.order().closed,true);assert.strictEqual(t.bal(t.A),1000);
// R7: التحصيل كان من غير محفظة → يتحوّل لعربون من غير ما يتسجل في أي محفظة، وماينسخش فلوس وهمية.
t=makeReturn([true],['x'],{closeWallet:''});
assert.strictEqual(t.bal(t.A),200);await t.ctx.markRequestReturned('r1');
assert.strictEqual(t.bal(t.A),200);assert.strictEqual(t.order().deposit,1000);assert.strictEqual(t.order().depositExtra,800);
// R8: حركة التحصيل معدّلة يدويًا ماتفضلش فاضلة ومتتحسبش مرتين.
t=makeReturn([true],['x'],{});
{const w=t.txs();w.find(x=>x.refKey==='order-final-r1').manualOverride=true;t.store[t.ctx.K.wtx]=JSON.stringify(w);}
await t.ctx.markRequestReturned('r1');assert.strictEqual(t.bal(t.A),1000);
// رابط الأمر يمرر id كنص، حتى لو كان id المحفوظ رقميًا؛ المرتجع يجب أن يزيل التحصيل النهائي ويحفظه كعربون.
t=makeReturn([true],['معرّف قديم'],{id:123});
assert.strictEqual(t.bal(t.A),1000);
await t.ctx.markRequestReturned('123');
assert.strictEqual(t.order().closed,false,'numeric legacy order can be returned from its detail page');
assert.strictEqual(t.order().deposit,1000,'returned amount is converted to a deposit');
assert.strictEqual(t.bal(t.A),1000,'return conversion does not change the actual wallet balance');

console.log('wallet-partial-payment-tests: PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1});
