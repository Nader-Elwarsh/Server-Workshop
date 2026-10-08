/* اختبارات "مطابقة الرصيد": كل سبب محتمل لاختلاف الرصيد المعروض عن الفعلي لازم يتلقط، والبيانات السليمة ماتطلعش تحذيرات. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
function makeEnv(){
  const store={};
  const localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k]};
  const document={addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null};
  const window={localStorage,WFStorage:localStorage,document,crypto:{randomUUID:()=>"id-"+Math.random().toString(36).slice(2)}};
  const context={window,localStorage,document,crypto:window.crypto,console,alert:()=>{},confirm:()=>true,prompt:()=>null};
  const c=vm.createContext(context);
  vm.runInContext(fs.readFileSync(`${__dirname}/shared-data.js`,'utf8'),c,{filename:'shared-data.js'});
  ['K','arr','get','put','putAsync','esc','escAttr','commitStorage','commitStorageAsync','withRollback','withRollbackAsync','settings','arrCached','localDateKey','WFStorage'].forEach(n=>context[n]=window[n]);
  context.id=window.id;context.renderRequests=()=>{};
  ['app-shared.js','wallets.js','treasury.js','app-data-management.js'].forEach(f=>vm.runInContext(fs.readFileSync(`${__dirname}/${f}`,'utf8'),c,{filename:f}));
  return {store,context,K:window.K};
}
const kinds=a=>Array.from(a.issues,i=>i.kind);
const W='محفظتي الشخصية';

// بيانات سليمة: لا تحذيرات
{
  const e=makeEnv(),{context:x,K}=e;
  const wallets=x.settings().wallets;assert.ok(wallets.includes(W),'default wallets include the personal wallet: '+wallets);
  const o={id:'r1',no:'W-1',status:'مكتمل',total:300,deposit:100,depositWallet:W,closed:true,closeWallet:W,createdAt:new Date().toISOString()};
  e.store[K.r]=JSON.stringify([o]);
  x.syncWalletForOrderDeposit(o);x.syncWalletForOrderClose(o,200,W);
  const a=x.walletAudit();
  assert.deepStrictEqual(kinds(a),[],'clean data has no findings: '+JSON.stringify(kinds(a)));
  assert.strictEqual(x.walletBalance(W),300);
  assert.strictEqual(a.wallets.find(w=>w.name===W).raw,300);
}

// أمر ملغي + أمر اتحذف + أمر اتفتح تاني (مرتجع): كلهم بيرفعوا الرصيد المعروض
{
  const e=makeEnv(),{context:x,K}=e;
  const orders=[
    {id:'c1',no:'C-1',status:'ملغي',total:500,deposit:150,depositWallet:W},
    {id:'d1',no:'D-1',status:'جديد',total:400,deposit:50,depositWallet:W},
    {id:'r2',no:'R-2',status:'جاري التنفيذ',total:300,deposit:0,closed:false,closeWallet:W}
  ];
  e.store[K.r]=JSON.stringify(orders);
  orders.forEach(o=>x.syncWalletForOrderDeposit(o));
  x.syncWalletForOrderClose(orders[2],300,W);               // كان اتقفل وبعدين اتعمله مرتجع
  e.store[K.r]=JSON.stringify(orders.filter(o=>o.id!=='d1')); // أمر d1 اتحذف بدون حذف حركته
  const a=x.walletAudit(),k=kinds(a);
  assert.ok(k.includes('order-cancelled'),'cancelled order flagged');
  assert.ok(k.includes('order-missing'),'deleted order flagged');
  assert.ok(k.includes('final-on-open'),'returned/reopened order flagged');
  assert.ok(a.upTotal>=150+50+300-0.01,'up total counts them: '+a.upTotal);
  assert.ok(a.issues.filter(i=>i.kind!=='late-entry').every(i=>i.dir==='up'||i.dir==='info'));
}

// مبلغ الحركة غير مطابق (الإجمالي اتعدّل بعد القفل) + تكرار + ناقص
{
  const e=makeEnv(),{context:x,K}=e;
  const o={id:'m1',no:'M-1',status:'مكتمل',total:300,deposit:100,depositWallet:W,closed:true,closeWallet:W};
  e.store[K.r]=JSON.stringify([o]);
  x.syncWalletForOrderDeposit(o);x.syncWalletForOrderClose(o,200,W);
  o.total=250;e.store[K.r]=JSON.stringify([o]);                 // اتخفّض الإجمالي بعد التحصيل
  let a=x.walletAudit();
  const mm=a.issues.find(i=>i.kind==='amount-mismatch');
  assert.ok(mm&&mm.dir==='up'&&Math.abs(mm.amount-50)<0.01,'mismatch of +50 (wallet shows 200, order says 150)');
  // أمر فيه محفظة وعربون لكن مفيش حركة => المعروض أقل
  const o2={id:'m2',no:'M-2',status:'جديد',total:100,deposit:40,depositWallet:W};
  e.store[K.r]=JSON.stringify([o,o2]);
  a=x.walletAudit();assert.ok(a.issues.some(i=>i.kind==='missing-deposit'&&i.dir==='down'&&i.amount===40));
  // لو اتحذفت بقصد (tombstone) ماتتعدّش ناقصة
  x.syncWalletForOrderDeposit(o2);x.deleteWalletTx('order-deposit-m2');
  a=x.walletAudit();assert.ok(!a.issues.some(i=>i.kind==='missing-deposit'),'deliberately deleted entry is not reported as missing');
  // تكرار
  const list=JSON.parse(e.store[K.wtx]);
  const base={type:'out',amount:75,wallet:W,category:'مصروف تشغيل',date:'2026-09-20',reason:'بنزين',deleted:false};
  list.push({...base,id:'x1'},{...base,id:'x2'});
  e.store[K.wtx]=JSON.stringify(list);
  a=x.walletAudit();assert.ok(a.issues.some(i=>i.kind==='possible-duplicate'&&i.amount===75),'possible duplicate flagged');
}

// حد أقصى + محفظة غير معروفة + أمر بدون محفظة عند الإغلاق
{
  const e=makeEnv(),{context:x,K}=e;
  const s=x.settings();s.walletCaps={[W]:100};e.store[K.s]=JSON.stringify(s);
  e.store[K.wtx]=JSON.stringify([{id:'a',type:'in',amount:250,wallet:W,deleted:false,date:'2026-09-01',reason:'وارد'},{id:'b',type:'in',amount:10,wallet:'محفظة محذوفة',deleted:false,date:'2026-09-01',reason:'قديم'}]);
  e.store[K.r]=JSON.stringify([{id:'n1',no:'N-1',status:'مكتمل',total:90,deposit:0,closed:true,closeWallet:''}]);
  const a=x.walletAudit(),k=kinds(a);
  assert.ok(k.includes('cap')&&k.includes('unknown-wallet')&&k.includes('closed-no-wallet'));
  assert.strictEqual(a.issues.find(i=>i.kind==='cap').amount,150);
}
// وارد يدوي بنفس مبلغ عربون أمر => احتمال تسجيل مرتين
{
  const e=makeEnv(),{context:x,K}=e;
  const o={id:'t1',no:'T-1',status:'جديد',total:500,deposit:120,depositWallet:W,date:'2026-09-20'};
  e.store[K.r]=JSON.stringify([o]);
  x.syncWalletForOrderDeposit(o);
  const today=x.localDateKey(new Date());
  const list=JSON.parse(e.store[K.wtx]);
  list.push({id:'man1',type:'in',amount:120,wallet:W,category:'تحصيل عميل',date:today,reason:'عربون أحمد',source:'manual',manualOverride:true,deleted:false});
  e.store[K.wtx]=JSON.stringify(list);
  let a=x.walletAudit();
  assert.ok(a.issues.some(i=>i.kind==='manual-vs-order'&&i.dir==='up'&&i.amount===120),'manual income duplicating an order deposit is flagged');
  // مبلغ مختلف => مش متكرر
  list[list.length-1].amount=121;e.store[K.wtx]=JSON.stringify(list);
  a=x.walletAudit();assert.ok(!a.issues.some(i=>i.kind==='manual-vs-order'));
}
// طرفا التحويل لازم يكونا موجودين ومتطابقين في المبلغ والاتجاه والمحفظة
{
  const e=makeEnv(),{context:x,K}=e;
  const walletSide={id:'wx',source:'transfer',transferId:'tx-1',type:'out',amount:100,wallet:W,deleted:false};
  e.store[K.wtx]=JSON.stringify([walletSide]);e.store[K.tr]=JSON.stringify([]);
  assert.ok(kinds(x.walletAudit()).includes('transfer-orphan'),'wallet-only transfer is reported');
  const treasurySide={id:'tx',source:'transfer',transferId:'tx-1',type:'in',amount:90,counterparty:W,deleted:false};
  e.store[K.tr]=JSON.stringify([treasurySide]);
  let a=x.walletAudit();assert.ok(kinds(a).includes('transfer-mismatch'),'amount mismatch is reported');
  treasurySide.amount=100;treasurySide.type='out';e.store[K.tr]=JSON.stringify([treasurySide]);
  a=x.walletAudit();assert.ok(kinds(a).includes('transfer-mismatch'),'same-direction transfer sides are reported');
  treasurySide.type='in';e.store[K.tr]=JSON.stringify([treasurySide]);
  assert.ok(!kinds(x.walletAudit()).some(k=>k.startsWith('transfer-')),'matching transfer sides are clean');
  e.store[K.wtx]=JSON.stringify([]);
  assert.ok(kinds(x.walletAudit()).includes('transfer-orphan'),'treasury-only transfer is reported');
}
(async()=>{
// إصلاح العربون من شاشة سلامة البيانات يجب أن يحدّث قيد المحفظة المرتبط في العملية نفسها.
{
  const e=makeEnv(),{context:x,K}=e;
  const o={id:123,no:'OLD-123',status:'مكتمل',total:50,labor:50,partsTotal:0,partsCost:0,deposit:70,depositWallet:W,closed:true,closeWallet:'',closedAt:new Date().toISOString()};
  e.store[K.r]=JSON.stringify([o]);x.syncWalletForOrderDeposit(o);
  const issue=x.dataIntegrityReport().issues.find(i=>i.key==='req-deposit:123');
  assert.ok(issue&&issue.fix?.type==='clampOrderDeposit','invalid legacy order deposit is detected');
  await x.applyIntegrityFix(issue.key);
  const savedOrder=JSON.parse(e.store[K.r])[0],tx=JSON.parse(e.store[K.wtx]).find(x=>x.refKey==='order-deposit-123'&&!x.deleted);
  assert.strictEqual(savedOrder.deposit,50,'order deposit was clamped');
  assert.strictEqual(tx.amount,50,'linked wallet movement was reconciled with the repaired deposit');
  assert.strictEqual(x.walletBalance(W),50,'wallet balance matches the repaired order');
}
console.log('wallet-audit-tests: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
