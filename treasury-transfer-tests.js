/* اختبارات: تعديل حركة تحويل من الخزنة بيحدّث حركة المحفظة المقابلة، ومدخل المبلغ غير الصحيح مش بيتحوّل صفر بصمت، والضغط المزدوج على التحويل مايسجّلش مرتين. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
function makeEnv(){
  const store={};
  const localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k]};
  const document={addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null};
  const window={localStorage,WFStorage:localStorage,document,crypto:{randomUUID:()=>"id-"+Math.random().toString(36).slice(2)}};
  const answers=[],alerts=[];
  const context={window,localStorage,document,crypto:window.crypto,console,alert:m=>alerts.push(m),confirm:()=>true,prompt:()=>answers.shift()};
  const c=vm.createContext(context);
  vm.runInContext(fs.readFileSync(`${__dirname}/shared-data.js`,'utf8'),c,{filename:'shared-data.js'});
  ['K','arr','get','put','esc','escAttr','commitStorage','withRollback'].forEach(n=>context[n]=window[n]);
  context.id=window.id;
  ['app-shared.js','wallets.js','treasury.js'].forEach(f=>vm.runInContext(fs.readFileSync(`${__dirname}/${f}`,'utf8'),c,{filename:f}));
  return {store,context,answers,alerts,K:window.K};
}
const J=(e,k)=>JSON.parse(e.store[k]||'[]');

// 1) تحويل ثم تعديل مبلغه من الخزنة: الطرفين لازم يتساووا
{
  const e=makeEnv(),x=e.context,K=e.K;
  x.transferBetweenWalletAndTreasury('toTreasury','فودافون كاش',100,'2026-10-01','10:00','','');
  const tr=J(e,K.tr)[0];assert.strictEqual(tr.amount,100);
  e.answers.push('80','سبب','','');
  x.editTreasuryEntry(tr.id);
  assert.strictEqual(J(e,K.tr)[0].amount,80);
  assert.strictEqual(J(e,K.wtx)[0].amount,80,'wallet side must follow the treasury edit');
}
// 2) مدخل مش رقم / صفر / سالب: مايتغيّرش حاجة
{
  const e=makeEnv(),x=e.context,K=e.K;
  x.transferBetweenWalletAndTreasury('toTreasury','فودافون كاش',100,'2026-10-01','10:00','','');
  const tr=J(e,K.tr)[0];
  for(const bad of ['abc','0','-5','']){e.answers.length=0;e.answers.push(bad);x.editTreasuryEntry(tr.id)}
  assert.strictEqual(J(e,K.tr)[0].amount,100,'invalid input must not change the amount');
  assert.strictEqual(J(e,K.wtx)[0].amount,100);
  assert.ok(e.alerts.length>=4);
  // أرقام عربية مقبولة
  e.answers.length=0;e.answers.push('٧٥','','','');x.editTreasuryEntry(tr.id);
  assert.strictEqual(J(e,K.tr)[0].amount,75);assert.strictEqual(J(e,K.wtx)[0].amount,75);
}
// 3) تحويل بمبلغ سالب بيترفض، والضغط المزدوج بيسجّل مرة واحدة
{
  const e=makeEnv(),x=e.context,K=e.K;
  x.transferBetweenWalletAndTreasury('toTreasury','فودافون كاش',-50,'2026-10-01','10:00','','');
  assert.strictEqual(J(e,K.tr).length,0,'negative amount rejected');
  x.transferBetweenWalletAndTreasury('toTreasury','فودافون كاش',50,'2026-10-01','10:00','','');
  x.transferBetweenWalletAndTreasury('toTreasury','فودافون كاش',50,'2026-10-01','10:00','','');
  assert.strictEqual(J(e,K.tr).length,1,'double tap records one transfer');
  assert.strictEqual(J(e,K.wtx).length,1);
}
console.log('treasury-transfer-tests: PASS');
