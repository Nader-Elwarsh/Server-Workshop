/* اختبارات منطق شريط الإعلانات (portal-ticker.js): التنظيف، الجمهور، التواريخ، الروابط، وتوليد HTML آمن. */
const assert=require('assert');
const T=require('./portal-ticker.js');

// sanitize: الافتراضي مقفول، وحذف < > ورسائل فاضية
{
  assert.strictEqual(T.sanitize(null),null);
  assert.strictEqual(T.sanitize({items:[{text:'x'}]}).enabled,false,'ticker is off unless explicitly enabled');
  const c=T.sanitize({enabled:true,mode:'nonsense',speed:'warp',items:[{text:'  أهلاً <script>alert(1)</script> بيك  '},{text:'   '},{text:'ب',type:'evil',audience:'x',link:'javascript:alert(1)'}]});
  assert.strictEqual(c.mode,'scroll');assert.strictEqual(c.speed,'normal');
  assert.strictEqual(c.items.length,2,'empty-text items are dropped');
  assert.ok(!/[<>]/.test(c.items[0].text),'angle brackets stripped');
  assert.strictEqual(c.items[1].type,'info');assert.strictEqual(c.items[1].audience,'all');assert.strictEqual(c.items[1].link,'','javascript: links are rejected');
  assert.strictEqual(T.sanitize({enabled:true,items:Array.from({length:50},(_,i)=>({text:'m'+i}))}).items.length,T.MAX_ITEMS);
  assert.strictEqual(T.sanitize({items:[{text:'a'.repeat(1000)}]}).items[0].text.length,T.MAX_TEXT);
}

// الروابط المسموحة فقط
{
  assert.strictEqual(T.cleanLink('signup'),'signup');
  assert.strictEqual(T.cleanLink('tab:learn'),'tab:learn');
  assert.strictEqual(T.cleanLink('tab:admin'),'');
  assert.strictEqual(T.cleanLink('https://wa.me/201000000000'),'https://wa.me/201000000000');
  assert.strictEqual(T.cleanLink('http://insecure.example'),'');
  assert.strictEqual(T.cleanLink('tel:+201000000000'),'tel:+201000000000');
  assert.strictEqual(T.cleanLink('data:text/html,<b>'),'');
  assert.strictEqual(T.cleanLink('https://a.com/"onmouseover="x'),'');
}

// الجمهور والتواريخ (شاملة الطرفين)
{
  const base={enabled:true,items:[
    {text:'للكل'},{text:'زوار',audience:'guest'},{text:'عملاء',audience:'member'},
    {text:'مجدولة',start:'2026-10-05',end:'2026-10-10'},{text:'مقفولة',enabled:false}]};
  const vis=(member,today)=>T.visible(base,{member,today}).map(i=>i.text);
  assert.deepStrictEqual(vis(false,'2026-10-01'),['للكل','زوار']);
  assert.deepStrictEqual(vis(true,'2026-10-01'),['للكل','عملاء']);
  assert.ok(vis(true,'2026-10-05').includes('مجدولة'),'start date inclusive');
  assert.ok(vis(true,'2026-10-10').includes('مجدولة'),'end date inclusive');
  assert.ok(!vis(true,'2026-10-11').includes('مجدولة'),'hidden after end date');
  assert.ok(!vis(true,'2026-10-04').includes('مجدولة'),'hidden before start date');
  assert.deepStrictEqual(T.visible({...base,enabled:false},{member:true,today:'2026-10-06'}),[],'master switch hides everything');
  assert.strictEqual(T.dayKey(new Date(2026,8,5)),'2026-09-05','local day key, zero padded');
}

// HTML: هروب كامل، والنسخة المكررة مخفية عن قارئات الشاشة، وبدون أزرار روابط لو مفيش onLink
{
  const c=T.sanitize({enabled:true,items:[{text:'عرض "خاص" & أكتر',type:'offer',icon:'🎁',link:'https://wa.me/201000000000'},{text:'ب'}]});
  const html=T.buildHtml(c,c.items,{clickable:true,dismissible:true});
  assert.ok(html.includes('&quot;خاص&quot; &amp; أكتر'),'text escaped');
  assert.ok(html.includes('data-l="https://wa.me/201000000000"'));
  assert.ok(html.includes('data-a="x"'));
  assert.ok(html.includes('aria-hidden="true"'),'duplicated loop set hidden from assistive tech');
  assert.ok(/tabindex="-1"/.test(html),'links in the duplicated set are not focusable');
  const plain=T.buildHtml(c,c.items,{clickable:false});
  assert.ok(!plain.includes('data-l='),'no link buttons when nothing handles clicks');
  const rot=T.buildHtml({...c,mode:'rotate'},c.items,{clickable:true});
  assert.ok(rot.includes('tk-rot')&&!rot.includes('tk-track'));
}

// البصمة: نفس المحتوى = نفس البصمة (عشان الحركة ماتتقطعش عند كل تحديث)
{
  const c=T.sanitize({enabled:true,rev:5,items:[{text:'أ'}]});
  assert.strictEqual(T.signature(c,c.items),T.signature(T.sanitize(c),T.sanitize(c).items));
  const d=T.sanitize({enabled:true,rev:5,items:[{text:'أ!'}]});
  assert.notStrictEqual(T.signature(c,c.items),T.signature(d,d.items));
}
// العميل يقدر يقفل الشريط افتراضيًا، والأدمن يقدر يمنع ده
{
  assert.strictEqual(T.sanitize({enabled:true,items:[{text:'أ'}]}).dismissible,true,'dismissible by default');
  assert.strictEqual(T.sanitize({enabled:true,dismissible:false,items:[{text:'أ'}]}).dismissible,false,'admin can disable closing');
  assert.strictEqual(T.sanitize({enabled:true,items:[{text:'أ'}]}).controls,true,'controls are visible by default');
  assert.strictEqual(T.sanitize({enabled:true,controls:false,items:[{text:'أ'}]}).controls,false,'admin can hide controls');
  const c=T.sanitize({enabled:true,items:[{text:'أ'},{text:'ب'}]});
  const h=T.buildHtml(c,c.items,{dismissible:true});
  ['pp','next','prev','x'].forEach(a=>assert.ok(h.includes('data-a="'+a+'"'),'control '+a));
  const hn=T.buildHtml(c,c.items,{dismissible:false});
  assert.ok(!hn.includes('data-a="x"'),'no close button when closing is disabled');
  const hidden=T.buildHtml(c,c.items,{controls:false});
  assert.ok(!hidden.includes('data-a="pp"')&&!hidden.includes('data-a="next"'),'all controls can be hidden');
  const one=T.sanitize({enabled:true,mode:'rotate',items:[{text:'وحيدة'}]});
  const ho=T.buildHtml(one,one.items,{});
  assert.ok(ho.includes('data-a="pp"')&&!ho.includes('data-a="next"'),'a single rotating message needs no next/prev');
}

// واجهة العميل (simple): زر الإغلاق فقط — بدون إيقاف مؤقت ولا أسهم
{
  const c=T.sanitize({enabled:true,mode:'scroll',items:[{text:'أ'},{text:'ب'}]});
  const simple=T.buildHtml(c,c.items,{dismissible:true,simple:true});
  assert.ok(!simple.includes('data-a="pp"')&&!simple.includes('data-a="next"')&&!simple.includes('data-a="prev"'),'customer view has no pause or arrows');
  assert.ok(simple.includes('data-a="x"'),'customer view keeps the close button');
  const full=T.buildHtml(c,c.items,{dismissible:true});
  assert.ok(full.includes('data-a="pp"')&&full.includes('data-a="next"'),'full controls still available when simple is off');
  assert.notStrictEqual(T.signature(c,c.items,true),T.signature(c,c.items,false),'signature differs by mode');
  const portal=require('fs').readFileSync('portal.html','utf8');
  assert.ok(/pendTab/.test(portal)&&/if\(pendTab\)\{tab=pendTab/.test(portal),'guest tab-link remembers target tab and opens it after login');
  assert.ok(/else\{pendTab=tn;mode=INV\?"login":"signup";showAuth\(\)/.test(portal),'guest clicking a tab link gets the signup/login screen, not nothing');
}
console.log('portal-ticker-tests: PASS');
