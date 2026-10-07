/* اختبارات: حركة المحفظة اللي اتمسحت بقصد ماترجعش، مفيش id مكرر، وتعديل التحويل بيحدّث الخزنة كمان. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
function makeEnv(){
  const store={};
  const localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k]};
  const document={addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null};
  const window={localStorage,WFStorage:localStorage,document,crypto:{randomUUID:()=>"id-"+Math.random().toString(36).slice(2)}};
  const answers=[];
  const context={window,localStorage,document,crypto:window.crypto,console,alert:()=>{},confirm:()=>true,prompt:()=>answers.shift()};
  const c=vm.createContext(context);
  vm.runInContext(fs.readFileSync(`${__dirname}/shared-data.js`,'utf8'),c,{filename:'shared-data.js'});
  ['K','arr','get','put','esc','escAttr','commitStorage','withRollback'].forEach(n=>context[n]=window[n]);
  context.id=window.id;
  ['app-shared.js','wallets.js','treasury.js'].forEach(f=>vm.runInContext(fs.readFileSync(`${__dirname}/${f}`,'utf8'),c,{filename:f}));
  return {store,context,answers,K:window.K};
}
const wtx=e=>JSON.parse(e.store[e.K.wtx]||'[]');

// 1) حذف حركة عربون بقصد ثم حفظ الأمر تاني بنفس القيم: ماترجعش
{
  const e=makeEnv(),{context:x,K}=e;
  const order={id:'r1',no:'W-1',deposit:100,depositWallet:'فودافون كاش',total:300};
  e.store[K.r]=JSON.stringify([order]);
  x.syncWalletForOrderDeposit(order);
  assert.strictEqual(wtx(e).filter(t=>!t.deleted).length,1);
  x.deleteWalletTx('order-deposit-r1');
  assert.strictEqual(wtx(e).filter(t=>!t.deleted).length,0,'deleted by user');
  x.syncWalletForOrderDeposit(order); // أي تعديل تاني على الأمر
  x.syncWalletForOrderDeposit(order);
  let list=wtx(e);
  assert.strictEqual(list.filter(t=>!t.deleted).length,0,'deliberately deleted wallet tx must NOT come back on order re-save');
  assert.strictEqual(list.length,1,'no extra record created');
  // 2) لو غيّرت العربون بعدها: تتسجل حركة جديدة، ومن غير id مكرر
  const changed={...order,deposit:150};
  x.syncWalletForOrderDeposit(changed);
  list=wtx(e);
  assert.strictEqual(list.filter(t=>!t.deleted).length,1,'a changed deposit is recorded again');
  assert.strictEqual(list.find(t=>!t.deleted).amount,150);
  assert.strictEqual(new Set(list.map(t=>t.id)).size,list.length,'no duplicate ids');
  assert.ok(!('userDeleted' in list.find(t=>!t.deleted)),'revived record has no tombstone flags');
}

// 3) حركة اتشالت تلقائيًا لما العربون بقى صفر ثم رجع: تتفعّل تاني في نفس السجل
{
  const e=makeEnv(),{context:x}=e;
  x.syncWalletForOrderDeposit({id:'r2',no:'W-2',deposit:80,depositWallet:'إنستاباي'});
  x.syncWalletForOrderDeposit({id:'r2',no:'W-2',deposit:0,depositWallet:'إنستاباي'});
  assert.strictEqual(wtx(e).filter(t=>!t.deleted).length,0);
  x.syncWalletForOrderDeposit({id:'r2',no:'W-2',deposit:80,depositWallet:'إنستاباي'});
  const list=wtx(e);
  assert.strictEqual(list.length,1,'revived in place instead of appending a duplicate id');
  assert.strictEqual(list[0].deleted,false);
}

// 4) بيانات قديمة فيها id مكرر: تتنضف والفعّال يحتفظ بالـ id
{
  const e=makeEnv(),{context:x,K}=e;
  e.store[K.wtx]=JSON.stringify([
    {id:'order-deposit-r3',refKey:'order-deposit-r3',deleted:true,type:'in',amount:50,wallet:'w',createdAt:'2026-09-01T00:00:00Z'},
    {id:'order-deposit-r3',refKey:'order-deposit-r3',deleted:false,type:'in',amount:70,wallet:'w',createdAt:'2026-09-05T00:00:00Z'}
  ]);
  x.dedupeWalletTxByRef();
  const list=wtx(e);
  assert.strictEqual(new Set(list.map(t=>t.id)).size,2,'ids made unique');
  assert.strictEqual(list.find(t=>!t.deleted).id,'order-deposit-r3','live record keeps the original id');
}

// 5) تعديل حركة تحويل يحدّث حركة الخزنة المقابلة، وإدخال مش رقم مرفوض
{
  const e=makeEnv(),{context:x,K}=e;
  x.transferBetweenWalletAndTreasury('toTreasury','محفظتي الشخصية',100,'2026-09-10','10:00','تحويل','');
  let w=wtx(e)[0];
  e.answers.push('٨٠','تحويل معدّل','');
  x.editWalletTx(w.id);
  w=wtx(e)[0];const t=JSON.parse(e.store[K.tr])[0];
  assert.strictEqual(w.amount,80);assert.strictEqual(t.amount,80,'treasury side follows the wallet side');
  assert.strictEqual(t.reason,'تحويل معدّل');
  e.answers.push('abc');
  x.editWalletTx(w.id);
  assert.strictEqual(wtx(e)[0].amount,80,'non-numeric input must not zero the amount');
  e.answers.push('');
  x.editWalletTx(w.id);
  assert.strictEqual(wtx(e)[0].amount,80,'empty input must not zero the amount');
}
console.log('wallet-tombstone-tests: PASS');
