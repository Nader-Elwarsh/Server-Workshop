/* اختبارات WFPager: تقسيم القوائم لصفحات («عرض المزيد») داخل shared-data.js */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(`${__dirname}/shared-data.js`, 'utf8');
const m = src.match(/\/\* WFPAGER:BEGIN \*\/([\s\S]*?)\/\* WFPAGER:END \*\//);
assert.ok(m, 'WFPager block must exist in shared-data.js');

function makeEnv(hash = '') {
  const hosts = {}, boxes = {}, events = [], logs = [];
  const document = {
    querySelector(sel) {
      let mm = sel.match(/data-wf-pg-rows="([^"]+)"/);
      if (mm) return hosts[mm[1]] || (hosts[mm[1]] = { html: '', insertAdjacentHTML(_, h) { this.html += h; } });
      mm = sel.match(/data-wf-pg-more="([^"]+)"/);
      if (mm) return boxes[mm[1]] || (boxes[mm[1]] = { outerHTML: '' });
      return null;
    },
    dispatchEvent(e) { events.push(e); }
  };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  const window = {};
  const ctx = { window, document, CustomEvent, location: { hash }, console: { error: (...a) => logs.push(a.join(' ')) }, confirm: () => true, globalThis: window };
  ctx.confirmCalls = 0;
  vm.runInNewContext(m[1], ctx, { filename: 'WFPAGER' });
  return { P: window.WFPager, window, hosts, boxes, events, logs, ctx };
}
const items = n => Array.from({ length: n }, (_, i) => ({ id: 'x' + i }));
const count = html => (html.match(/<i /g) || []).length;
const row = x => `<i id="${x.id}"></i>`;

// 1) أول دفعة بس + زر عرض المزيد + عرض الكل
{
  const { P } = makeEnv();
  const r = P.render('t1', items(100), row, 'a');
  assert.strictEqual(r.shown, 30); assert.strictEqual(count(r.rows), 30); assert.strictEqual(r.total, 100);
  assert.ok(r.html.includes('data-wf-pg-rows="t1"') && r.html.includes("wfPagerMore('t1')") && r.html.includes("wfPagerAll('t1')"));
}
// 2) قائمة قصيرة: مفيش أزرار
{
  const { P } = makeEnv();
  const r = P.render('t2', items(10), row, 'a');
  assert.strictEqual(count(r.rows), 10); assert.ok(!r.more.includes('wfPagerMore'));
}
// 3) rowFn بيتنادى مرة واحدة لكل صف معروض (مش مرتين)
{
  const { P } = makeEnv(); let calls = 0;
  P.render('t3', items(50), x => { calls++; return row(x); }, 'a');
  assert.strictEqual(calls, 30, 'rowFn must run once per visible row only');
}
// 4) عرض المزيد: بيضيف الدفعة التالية وبيحدّث الزر ويطلق الحدث
{
  const e = makeEnv(); const { P, window, hosts, boxes, events } = e;
  P.render('t4', items(100), row, 'a');
  assert.strictEqual(window.wfPagerMore('t4'), true);
  assert.strictEqual(count(hosts.t4.html), 30);
  assert.ok(boxes.t4.outerHTML.includes('wfPagerMore'));
  assert.strictEqual(events.length, 1); assert.strictEqual(events[0].type, 'wf-pager-more'); assert.strictEqual(events[0].detail.key, 't4');
  window.wfPagerMore('t4'); window.wfPagerMore('t4');
  assert.strictEqual(count(hosts.t4.html), 70);
  assert.ok(boxes.t4.outerHTML.includes('تم عرض كل السجلات'), 'final state shows done message');
  assert.strictEqual(window.wfPagerMore('t4'), false, 'nothing left');
}
// 5) عرض الكل (مع تأكيد لو أكتر من 300)
{
  const e = makeEnv(); let asked = 0; e.ctx.confirm = () => { asked++; return false; };
  e.P.render('t5', items(1000), row, 'a');
  assert.strictEqual(e.window.wfPagerAll('t5'), false); assert.strictEqual(asked, 1, 'asks before rendering many rows');
  e.ctx.confirm = () => true;
  assert.strictEqual(e.window.wfPagerAll('t5'), true); assert.strictEqual(count(e.hosts.t5.html), 970);
  const small = makeEnv(); small.ctx.confirm = () => { throw new Error('must not ask'); };
  small.P.render('t5b', items(120), row, 'a'); assert.strictEqual(small.window.wfPagerAll('t5b'), true);
}
// 6) نفس الفلاتر بعد إعادة الرسم = نفس عدد الصفوف؛ فلاتر مختلفة = رجوع لأول دفعة
{
  const { P, window } = makeEnv();
  P.render('t6', items(200), row, 'q1'); window.wfPagerMore('t6'); window.wfPagerMore('t6');
  assert.strictEqual(P.render('t6', items(200), row, 'q1').shown, 90, 're-render after edit keeps loaded rows');
  assert.strictEqual(P.render('t6', items(200), row, 'q2').shown, 30, 'changed filter resets');
  P.render('t6', items(200), row, 'q2'); window.wfPagerMore('t6'); P.reset('t6');
  assert.strictEqual(P.render('t6', items(200), row, 'q2').shown, 30, 'reset() returns to first page');
}
// 7) رابط #tx-<id> بيوسّع الدفعة لحد ما السجل يظهر
{
  const { P } = makeEnv('#tx-x95');
  const r = P.render('t7', items(200), row, 'a', { hashPrefix: 'tx-' });
  assert.ok(r.rows.includes('id="x95"'), 'deep-linked row is rendered'); assert.ok(r.shown >= 96);
  const none = makeEnv('#tx-missing').P.render('t7', items(200), row, 'a', { hashPrefix: 'tx-' });
  assert.strictEqual(none.shown, 30);
  const enc = makeEnv('#trash-entry-a%20b').P.render('t7', [{ id: 'a b' }].concat(items(100)).reverse(), row, 'a', { hashPrefix: 'trash-entry-' });
  assert.ok(enc.rows.includes('id="a b"'), 'encoded hash id is decoded');
}
// 8) صف بيرمي خطأ مايوقفش القائمة كلها
{
  const { P, logs } = makeEnv();
  const r = P.render('t8', items(5), x => { if (x.id === 'x2') throw new Error('boom'); return row(x); }, 'a');
  assert.strictEqual(count(r.rows), 4); assert.ok(logs.length === 1);
}
// 9) مفاتيح غير آمنة بتتنضّف، وقيم غير مصفوفة مش بتكسر
{
  const { P } = makeEnv();
  const r = P.render('a"b><x', null, row, 'a');
  assert.ok(!/[<>"]x/.test(r.attr) && r.total === 0);
  assert.strictEqual(P.render('t9', items(100), row, 'a', { step: 50 }).shown, 50);
}
// 10) كل القوائم الرئيسية بتستخدم WFPager فعلًا
{
  const use = { 'workshop-mini-simple-ui.js': ['"customers"', '"devices"', '"parts"', '"requests"'], 'wallets.js': ['"wallet-tx"'], 'treasury.js': ['"treasury-tx"'],
    'tasks.js': ['"tasks"'], 'app-fault-codes.js': ['"faultcodes"'], 'app-invoices.js': ['"invoices"'], 'app-trash.js': ['"trash"'] };
  for (const [f, keys] of Object.entries(use)) {
    const s = fs.readFileSync(`${__dirname}/${f}`, 'utf8');
    for (const k of keys) assert.ok(s.includes(`WFPager.render(${k}`), `${f} must page ${k}`);
  }
  const ui = fs.readFileSync(`${__dirname}/workshop-mini-simple-ui.js`, 'utf8');
  for (const k of ['customers', 'devices', 'parts', 'requests']) assert.ok(ui.includes(`WFPager.reset("${k}")`), `${k} summary resets pager`);
}
// 11) الطباعة/المشاركة: expandAll بيعرض كل السجلات (أو حد أقصى) جوه العنصر المطلوب بس
{
  const { P, hosts, boxes } = makeEnv();
  P.render('t11', items(100), row, 'a'); P.render('t11b', items(100), row, 'a');
  const inside = { contains: h => h === hosts.t11 };
  P.more('t11'); // يضمن وجود الـhost
  P.expandAll(inside);
  assert.strictEqual(count(hosts.t11.html), 70, "only the list inside the target is expanded");
  assert.ok(!hosts.t11b || count(hosts.t11b.html) === 0, 'list outside target untouched');
  const lim = makeEnv(); lim.P.render('t11c', items(500), row, 'a'); lim.P.more('t11c');
  assert.strictEqual(lim.P.expandAll(null, { maxRows: 100 }), 100, 'maxRows caps share expansion');
}
// 12) print-share بيوسّع القوائم قبل الطباعة والمشاركة
{
  const ps = fs.readFileSync(`${__dirname}/print-share.js`, 'utf8');
  assert.ok(/function printTarget[\s\S]*?WFPager[\s\S]*?expandAll\(target\)/.test(ps), 'printTarget expands lists');
  assert.ok(/async function shareTarget[\s\S]*?expandAll\(target,\{maxRows:150\}\)/.test(ps), 'shareTarget expands lists (capped)');
}
console.log('list-pager-tests: PASS');
