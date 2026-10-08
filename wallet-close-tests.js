/* اختبارات: إقفال أمر الشغل وتسجيل التحصيل، والتحويل للخزنة، ومقارنة اسم المحفظة */
const fs=require('fs'),vm=require('vm');
const D=__dirname;
function makeEnv(){
  const store={};
  const localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k]};
  const els={};
  const document={addEventListener:()=>{},getElementById:id=>els[id]||null,querySelector:()=>null};
  const window={localStorage,WFStorage:localStorage,document,crypto:{randomUUID:()=>"id-"+Math.random().toString(36).slice(2)}};
  const alerts=[];
  const context={window,localStorage,document,crypto:window.crypto,console,alert:m=>alerts.push(m),confirm:m=>{alerts.push('CONFIRM:'+m);return true},location:{reload(){alerts.push('RELOAD')}}};
  const c=vm.createContext(context);
  vm.runInContext(fs.readFileSync(D+'/shared-data.js','utf8'),c);
  ['K','arr','arrCached','get','put','esc','escAttr','commitStorage','withRollback','settings','localDateKey'].forEach(n=>{if(window[n])context[n]=window[n]});
  context.id=window.id;
  ['app-shared.js','wallets.js','treasury.js'].forEach(f=>vm.runInContext(fs.readFileSync(D+'/'+f,'utf8'),c,{filename:f}));
  return {store,context,alerts,els,K:window.K};
}

const assert=require('assert');
const J=(e,k)=>JSON.parse(e.store[k]||'[]');
function setup(e,orders,tx){const x=e.context,K=e.K;const s=x.settings();s.wallets=['فودافون كاش','كاش'];x.put(K.s,s);x.put(K.r,orders);if(tx)x.put(K.wtx,tx);return x}
// 1) إقفال عادي بيقفل ويسجل التحصيل
{const e=makeEnv(),K=e.K,x=setup(e,[{id:'o1',no:'1',status:'مكتمل',deposit:100,depositWallet:'كاش',total:600}]);
 e.els.rCloseWallet={value:'فودافون كاش'};x.markPaidAndClose('o1');
 assert.ok(J(e,K.r)[0].closed&&J(e,K.r)[0].paid);
 assert.strictEqual(J(e,K.wtx).filter(t=>t.refKey==='order-final-o1'&&!t.deleted)[0].amount,500)}
// 2) تحصيل قديم اتمسح يدويًا بنفس المبلغ/المحفظة: الإقفال الجديد لازم يسجّله
{const e=makeEnv(),K=e.K,x=setup(e,[{id:'o2',no:'2',status:'مكتمل',deposit:100,total:600}],
 [{id:'order-final-o2',refKey:'order-final-o2',deleted:true,userDeleted:true,deletedAmount:500,deletedWallet:'كاش',type:'in',amount:500,wallet:'كاش'}]);
 e.els.rCloseWallet={value:'كاش'};x.markPaidAndClose('o2');
 assert.strictEqual(J(e,K.wtx).filter(t=>t.refKey==='order-final-o2'&&!t.deleted).length,1,'explicit close must record the collection')}
// 3) أمر نص-مقفول (paid بدون closed) بيكمّل بدل ما يتجاهل
{const e=makeEnv(),K=e.K,x=setup(e,[{id:'o3',no:'3',status:'مكتمل',deposit:0,total:300,paid:true,closed:false}]);
 e.els.rCloseWallet={value:'كاش'};x.markPaidAndClose('o3');
 assert.ok(J(e,K.r)[0].closed,'half-closed order gets completed')}
// 4) id رقمي في الأمر مع id نصي في الزرار
{const e=makeEnv(),K=e.K,x=setup(e,[{id:12,no:'4',status:'مكتمل',deposit:0,total:300}]);
 e.els.rCloseWallet={value:''};x.markPaidAndClose('12');
 assert.ok(J(e,K.r)[0].closed,'numeric id matches')}
// 5) اسم محفظة بمسافة زيادة في الحركة لازم يظهر في رصيدها
{const e=makeEnv(),K=e.K,x=setup(e,[],[{id:'t',type:'in',amount:70,wallet:'كاش ',deleted:false}]);
 assert.strictEqual(x.walletBalance('كاش'),70)}
// 6) التحويل للخزنة بيتسجل في الطرفين ويظهر في الأرصدة
{const e=makeEnv(),K=e.K,x=setup(e,[],[{id:'t',type:'in',amount:500,wallet:'كاش',deleted:false}]);
 x.transferBetweenWalletAndTreasury('toTreasury','كاش',200,'2026-10-08','10:00','','');
 assert.strictEqual(x.walletBalance('كاش'),300);assert.strictEqual(x.treasuryBalance(),200)}
console.log('wallet-close-tests: PASS');
