const fs=require('fs'),vm=require('vm'),assert=require('assert');
const store={};
const localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k]};
const document={addEventListener:()=>{},getElementById:()=>null};
const window={localStorage,WFStorage:localStorage,document,crypto:{randomUUID:()=>"id-"+Math.random()}};
const context={window,localStorage,document,crypto:window.crypto,console,alert:()=>{},confirm:()=>true};
const c=vm.createContext(context);
vm.runInContext(fs.readFileSync(`${__dirname}/shared-data.js`,'utf8'),c,{filename:'shared-data.js'});
context.K=window.K;context.arr=window.arr;context.get=window.get;context.put=window.put;context.esc=window.esc;context.settings=window.settings;
context.id=window.id||(()=>'id-'+Math.random());
vm.runInContext(fs.readFileSync(`${__dirname}/app-shared.js`,'utf8'),c,{filename:'app-shared.js'});
vm.runInContext(fs.readFileSync(`${__dirname}/wallets.js`,'utf8'),c,{filename:'wallets.js'});

// 1) المحفظة الافتراضية: من الإعدادات لو موجودة، وإلا أول محفظة، وإلا فاضي.
let s=context.settings();s.wallets=['أ','ب'];s.defaultWallet='';context.put(context.K.s,s);
assert.strictEqual(context.resolveDefaultWallet(),'أ','falls back to first wallet');
s=context.settings();s.defaultWallet='ب';context.put(context.K.s,s);
assert.strictEqual(context.resolveDefaultWallet(),'ب','uses configured default');
s=context.settings();s.defaultWallet='محذوفة';context.put(context.K.s,s);
assert.strictEqual(context.resolveDefaultWallet(),'أ','ignores default that no longer exists');

// 2) تسجيل تلقائي لعربون وتحصيل ناقصين، ومن غير تكرار، ومن غير ما يرجّع حركة انت مسحتها.
context.put(context.K.r,[
  {id:'o1',no:'1',status:'جاري التنفيذ',deposit:100,depositWallet:'أ',total:300},
  {id:'o2',no:'2',status:'مكتمل',closed:true,paid:true,deposit:50,depositWallet:'أ',closeWallet:'ب',total:200},
  {id:'o3',no:'3',status:'ملغي',deposit:80,depositWallet:'أ',total:300},
  {id:'o4',no:'4',status:'جديد',deposit:70,depositWallet:'ب',total:300},
]);
context.put(context.K.wtx,[{id:'order-deposit-o4',refKey:'order-deposit-o4',deleted:true,userDeleted:true,type:'in',amount:70,wallet:'ب'}]);
let n=context.autoHealOrderWalletTx();
let list=JSON.parse(store[context.K.wtx]).filter(x=>!x.deleted);
const by=k=>list.filter(x=>x.refKey===k);
assert.strictEqual(by('order-deposit-o1').length,1,'missing deposit recorded');
assert.strictEqual(by('order-deposit-o2').length,1,'missing deposit of closed order recorded');
assert.strictEqual(by('order-final-o2').length,1,'missing final collection recorded');
assert.strictEqual(by('order-final-o2')[0].amount,150,'final = total - deposit');
assert.strictEqual(by('order-deposit-o3').length,0,'cancelled order skipped');
assert.strictEqual(by('order-deposit-o4').length,0,'user-deleted tx not resurrected');
assert.strictEqual(n,3);
assert.strictEqual(context.autoHealOrderWalletTx(),0,'second run is a no-op');
console.log('wallet-autorecord-tests: PASS');
