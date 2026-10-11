// اختبار حراسة الواجهة (app-permissions.js) على DOM وهمي: صفحات، روابط، نماذج، دوال، عناصر data-perm.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const core = require('./roles-core');
const src = fs.readFileSync('app-permissions.js', 'utf8');

function el(tag, attrs, cls) {
  const a = Object.assign({}, attrs), c = new Set(cls || []);
  return { tagName: tag.toUpperCase(), style: {}, classList: { contains: (x) => c.has(x) }, children: [], parent: null, nextElementSibling: null,
    getAttribute: (k) => (k in a ? a[k] : null), setAttribute(k, v) { a[k] = String(v); }, removeAttribute(k) { delete a[k]; }, hasAttribute: (k) => k in a,
    appendChild(ch) { this.children.push(ch); return ch; }, remove() { this.removed = true; }, querySelectorAll() { return []; }, _a: a };
}
function run(url, { profile, config, nodes } = {}) {
  const store = new Map();
  if (profile) store.set('wf_perm_profile', JSON.stringify(profile));
  if (config) store.set('wf_perm_config', JSON.stringify(config));
  const alerts = [], docListeners = {};
  const all = nodes || [];
  const body = el('body');
  const document = {
    readyState: 'complete', body, createElement: (t) => el(t), addEventListener(t, fn, cap) { (docListeners[t] ||= []).push({ fn, cap }); },
    querySelectorAll(sel) {
      if (sel === 'a[href]') return all.filter((n) => n.tagName === 'A' && n.hasAttribute('href'));
      if (sel === '.nav-section-title') return all.filter((n) => n.classList.contains('nav-section-title'));
      if (sel === '[data-perm],[data-owner-only]') return all.filter((n) => n.hasAttribute('data-perm') || n.hasAttribute('data-owner-only'));
      return [];
    }
  };
  const winListeners = {};
  const ctx = { document, alert: (m) => alerts.push(String(m)), setTimeout: (fn) => { return 1; }, clearTimeout() {}, location: { pathname: url.split('?')[0], search: url.includes('?') ? '?' + url.split('?')[1] : '' },
    WFStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) }, WFRoles: core, navigator: { onLine: false },
    MutationObserver: function () { this.observe = () => {}; }, firebase: undefined, Promise };
  ctx.window = ctx; ctx.addEventListener = (t, fn) => { (winListeners[t] ||= []).push(fn); };
  vm.runInNewContext(src, ctx, { filename: 'app-permissions.js' });
  return { ctx, alerts, body, docListeners, winListeners, store };
}
const flush = () => new Promise((r) => setImmediate(r));
const TECH = { name: 'ف', role: 'tech', acl: 1, allow: [], deny: [] };
const denied = (t) => !!t.body.children.find((c) => c.id === 'wfPermDenied');

(async () => {
  // 1) من غير بيانات متحمّلة = سلوك الموظف القديم (كل شيء متاح)
  let t = run('/wallets.html'); await flush();
  assert.strictEqual(t.ctx.WFPerm.can('wallets.view'), true); assert(!denied(t));

  // 2) فني: صفحة المحافظ محجوبة، العملاء محجوبة، الأوامر مفتوحة
  t = run('/wallets.html', { profile: TECH }); await flush();
  assert(denied(t), 'wallet page blocked for tech'); assert.strictEqual(t.ctx.WFPerm.can('wallets.view'), false);
  t = run('/requests.html', { profile: TECH }); await flush(); assert(!denied(t), 'requests open for tech');
  t = run('/customer.html', { profile: TECH }); await flush(); assert(denied(t), 'customer page blocked for tech (no customers.view)');
  t = run('/users.html', { profile: TECH }); await flush(); assert(denied(t), 'users page owner-only');
  t = run('/users.html', { profile: { name: 'م', role: 'owner' } }); await flush(); assert(!denied(t));
  t = run('/users.html', { profile: { name: 'قديم' } }); await flush(); assert(!denied(t), 'legacy doc = owner');
  t = run('/index.html', { profile: { name: 'موقوف', role: 'owner', disabled: true } }); await flush(); assert(denied(t), 'disabled account blocked');

  // 3) روابط: تتخفى حسب الصلاحية، وعناوين الأقسام الفاضية كمان
  const mk = (h, cls) => el('a', { href: h }, cls);
  const nodes = [el('div', {}, ['nav-section-title']), mk('requests.html'), mk('requests.html?edit=5'), mk('requests.html?add=1'), mk('devices.html?edit=3'),
    mk('https://wa.me/20100'), mk('#top'), mk('index.html'),
    el('div', {}, ['nav-section-title']), mk('wallets.html'), mk('treasury.html'), mk('customers.html'), mk('users.html')];
  nodes.forEach((n, i) => { n.nextElementSibling = nodes[i + 1] || null; });
  t = run('/index.html', { profile: TECH, nodes }); await flush();
  const hidden = (n) => n.getAttribute('data-perm-hidden') === '1';
  // فني عنده requests.edit لكن مش requests.add:
  assert.strictEqual(hidden(nodes[1]), false, 'requests list visible');
  assert.strictEqual(hidden(nodes[2]), false, 'requests edit link visible (has requests.edit)');
  assert.strictEqual(hidden(nodes[3]), true, 'requests add link hidden (no requests.add)');
  assert.strictEqual(hidden(nodes[4]), false, 'devices edit link visible');
  assert.strictEqual(hidden(nodes[9]) && hidden(nodes[10]) && hidden(nodes[11]), true, 'wallets/treasury/customers hidden');
  assert.strictEqual(hidden(nodes[8]), true, 'section title with only hidden cards is hidden');
  assert.strictEqual(hidden(nodes[0]), false, 'section with visible cards stays');
  assert.strictEqual(hidden(nodes[12]), true, 'users link hidden for non-owner');
  assert.strictEqual(hidden(nodes[5]) || hidden(nodes[6]) || hidden(nodes[7]), false, 'external/hash/home links untouched');
  assert.strictEqual(nodes[9].style.display, 'none');

  // 4) data-perm و data-owner-only
  const dp = [el('section', { 'data-perm': 'wallets.add' }), el('section', { 'data-perm': 'wallets.add, requests.view' }), el('a', { 'data-owner-only': '' })];
  t = run('/index.html', { profile: TECH, nodes: dp }); await flush();
  assert.strictEqual(hidden(dp[0]), true); assert.strictEqual(hidden(dp[1]), false, 'any-of rule'); assert.strictEqual(hidden(dp[2]), true);
  t = run('/index.html', { profile: { role: 'owner' }, nodes: [el('a', { 'data-owner-only': '' })] }); await flush();

  // 5) الدوال: تتمنع للمحظور وتشتغل للمسموح، وsave بتفرّق إضافة/تعديل
  t = run('/index.html', { profile: TECH }); await flush();
  const calls = [];
  const ev = { prevented: false, preventDefault() { this.prevented = true; } };
  t.ctx.deleteRequestRecord = (...a) => { calls.push(['deleteRequestRecord', ...a]); return 'ok'; };
  t.ctx.closeOrder = (...a) => { calls.push(['closeOrder', ...a]); return 'closed'; };
  t.ctx.saveDevice = (...a) => { calls.push(['saveDevice', a[1] ? 'edit' : 'add']); return 'saved'; };
  t.ctx.saveRequest = (...a) => { calls.push(['saveRequest', a[1] ? 'edit' : 'add']); return 'saved'; };
  t.ctx.transferBetweenWalletAndTreasury = () => { calls.push(['transfer']); };
  t.ctx.saveTask = () => { calls.push(['saveTask']); return 't'; };
  t.ctx.WFPerm._wrapActions();
  assert.strictEqual(t.ctx.deleteRequestRecord(1), undefined); assert(t.alerts.pop().includes('حذف أمر شغل'));
  assert.strictEqual(t.ctx.closeOrder(2), 'closed');
  assert.strictEqual(t.ctx.saveDevice(ev, null), 'saved', 'tech can add device'); assert.strictEqual(t.ctx.saveDevice(ev, { id: 1 }), 'saved', 'tech can edit device');
  assert.strictEqual(t.ctx.saveRequest(ev, null), undefined, 'tech cannot create request'); assert(ev.prevented, 'submit event prevented on deny'); assert(t.alerts.pop().includes('إنشاء أمر شغل'));
  assert.strictEqual(t.ctx.saveRequest(ev, { id: 3 }), 'saved', 'tech can edit request');
  t.ctx.transferBetweenWalletAndTreasury(); assert(t.alerts.pop().includes('/'), 'all-of rule shows both labels');
  assert.strictEqual(t.ctx.saveTask(), 't', 'any-of rule');
  assert.deepStrictEqual(calls.map((c) => c.join(':')), ['closeOrder:2', 'saveDevice:add', 'saveDevice:edit', 'saveRequest:edit', 'saveTask']);
  t.ctx.WFPerm._wrapActions(); t.ctx.WFPerm._wrapActions();
  assert.strictEqual(t.ctx.closeOrder(9), 'closed'); assert.strictEqual(calls.filter((c) => c[0] === 'closeOrder').length, 2, 'wrapping is idempotent (no double calls)');
  // مالك: كل شيء يعدّي
  t = run('/index.html', { profile: { role: 'owner' } }); await flush();
  t.ctx.deleteAllCustomers = () => 'wiped'; t.ctx.WFPerm._wrapActions(); assert.strictEqual(t.ctx.deleteAllCustomers(), 'wiped');
  // مدير: الحذف الشامل ممنوع افتراضيًا
  t = run('/index.html', { profile: { role: 'manager', acl: 1 } }); await flush();
  t.ctx.deleteAllCustomers = () => 'wiped'; t.ctx.WFPerm._wrapActions();
  assert.strictEqual(t.ctx.deleteAllCustomers(), undefined, 'manager has no data.wipe by default');

  // 6) النماذج: submit في مرحلة الالتقاط يتمنع للي ملوش add/edit
  t = run('/requests.html', { profile: TECH }); await flush();
  const sub = t.docListeners.submit && t.docListeners.submit.find((x) => x.cap);
  assert(sub, 'capture-phase submit listener installed');
  const evt = (id) => ({ target: { id }, stopped: false, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; } });
  let e1 = evt('requestForm'); sub.fn(e1); assert(e1.prevented && e1.stopped, 'add form blocked (no requests.add)');
  t.ctx.location.search = '?edit=7'; e1 = evt('requestForm'); sub.fn(e1); assert(!e1.prevented, 'edit form allowed (has requests.edit)');
  t.ctx.location.search = ''; e1 = evt('customerForm'); sub.fn(e1); assert(e1.prevented, 'customer form blocked'); e1 = evt('someOtherForm'); sub.fn(e1); assert(!e1.prevented, 'unrelated forms untouched');

  // 7) صفحات الدخول/البوابة: مفيش حراسة
  t = run('/login.html', { profile: TECH }); assert.strictEqual(t.ctx.WFPerm, undefined); t = run('/portal.html', { profile: TECH }); assert.strictEqual(t.ctx.WFPerm, undefined);

  console.log('permissions-ui-tests: PASS (حراسة الصفحات، الروابط والعناوين، data-perm، الدوال add/edit/all/any، النماذج، idempotent)');
})().catch((e) => { console.error(e); process.exit(1); });
