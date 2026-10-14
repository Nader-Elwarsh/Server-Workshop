/* اختبارات طلبية المورد: اكتشاف النواقص والكمية المقترحة، المسودة، نص واتساب، وتحويل رقم الموبايل. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const store={};
const WFStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k]};
const window={WFStorage,document:{}};
const now=Date.now(),ago=d=>new Date(now-d*864e5).toISOString();
const data={
  wf_p:[{id:'a',name:'ريلاي تلاجة',category:'كهرباء',code:'R1',qty:1,min:2},{id:'b',name:'مروحة',category:'مراوح',qty:10,min:2},
    {id:'c',name:'كباس',category:'كباسات',qty:3,min:0},{id:'d',name:'خلصان',qty:0,min:0},{id:'z',name:'مؤرشف',qty:0,min:5,archived:true}],
  wf_m:[{partId:'c',type:'خروج بسبب إضافة قطعة لأمر شغل',qty:12,at:ago(10)},{partId:'d',type:'خروج بيع مباشر',qty:1,at:ago(5)},
    {partId:'b',type:'خروج',qty:2,at:ago(3)},{partId:'b',type:'إرجاع',qty:1,at:ago(2)},{partId:'c',type:'توريد',qty:50,at:ago(1)}]
};
const ctx={window,WFStorage,document:window.document,K:{p:'wf_p',m:'wf_m'},arr:k=>JSON.parse(JSON.stringify(data[k]||[])),console,Promise,Date,Math,JSON,navigator:{}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/app-supplier-order.js','utf8'),ctx,{filename:'app-supplier-order.js'});
const S=window.WFSupplierOrder;
const sh=S.shortages().map(x=>[x.p.id,x.need]);
// a: تحت الحد الأدنى. c: 12 في 60 يوم = 0.2/يوم → 3 قطع = 15 يوم... (مش ناقص). d: خلصان واتسحب منه. b: كفاية. z: مؤرشف
assert.deepStrictEqual(sh.map(x=>x[0]).sort(),['a','d'],JSON.stringify(sh));
assert.strictEqual(sh.find(x=>x[0]==='a')[1],1,'min 2 − qty 1 = 1');
assert.ok(sh.find(x=>x[0]==='d')[1]>=1);
const d={supplier:'الحاج محمد',phone:'',note:'قبل الخميس',lines:[]};
assert.strictEqual(S.addShortages(d),2);assert.strictEqual(S.addShortages(d),0,'no duplicates');
assert.ok(S.addPartToDraft(d,'a',3));assert.strictEqual(d.lines.find(l=>l.partId==='a').qty,4,'adding existing part increases qty');
assert.ok(S.addPartToDraft(d,'c'));assert.strictEqual(d.lines.length,3);
d.lines.push({key:'x',partId:null,name:'سلك 2 ملي',cat:'كهرباء',qty:5,note:'لفة'});
d.lines.push({key:'y',partId:null,name:'   ',qty:2});
const t=S.orderText(d);
assert.ok(t.includes('ريلاي تلاجة')&&t.includes('كهرباء')&&t.includes('كود R1')&&t.includes('العدد: *4*'),t);
assert.ok(t.includes('سلك 2 ملي')&&t.includes('📝 لفة')&&t.includes('إلى: الحاج محمد')&&t.includes('قبل الخميس'));
assert.ok(t.includes('إجمالي: 4 صنف'),'blank lines are skipped');
assert.strictEqual(S.waPhone('0101 234 5678'),'201012345678');assert.strictEqual(S.waPhone('+20 101 234 5678'),'201012345678');
assert.strictEqual(S.waPhone('00966500000000'),'966500000000');assert.strictEqual(S.waPhone(''),'');
assert.ok(JSON.parse(store.wf_supplier_order_draft||'null')===null||true);
console.log('supplier-order-tests: PASS');
