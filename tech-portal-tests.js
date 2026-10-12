// اختبار بوابة الفني (tech-portal.js) وصفحة الفنيين والعهدة (custody-page.js) على بيئة وهمية.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function node(tag) {
  const n = { tagName: String(tag).toUpperCase(), style: {}, children: [], _text: '', attrs: {}, parentNode: null, checked: false, value: '', disabled: false, id: '',
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    insertBefore(c) { return this.appendChild(c); }, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    querySelector() { return null; }, focus() {}, setSelectionRange() {} };
  Object.defineProperty(n, 'firstChild', { get() { return this.children[0] || null; } });
  Object.defineProperty(n, 'textContent', { get() { return this._text + this.children.map((c) => c.textContent).join(''); }, set(v) { this._text = String(v); this.children = []; } });
  return n;
}
function all(n, out = []) { out.push(n); n.children.forEach((c) => all(c, out)); return out; }
const byText = (root, t, tag) => all(root).filter((n) => (!tag || n.tagName === tag) && n.textContent.includes(t) && !n.children.some((c) => c.textContent.includes(t)));
const btnOf = (root, t) => all(root).find((n) => n.tagName === 'BUTTON' && n.textContent.includes(t));
const flush = () => new Promise((r) => setTimeout(r, 25));
const dk = (v) => { const d = new Date(v); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const at = (days, h) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

function makeEnv({ rootId, search = '', data, perms = () => true, fs: fsData = {}, online = true, uid = 'tech-a' }) {
  const store = new Map(), root = node('div'), msg = node('div'), els = { [rootId]: root, [rootId.replace('Root', 'Msg')]: msg };
  const fsWrites = [], fsDeletes = [], fsUpdates = [];
  const docRef = (col, id) => ({ id, get: async () => (fsData[col] && fsData[col][id] ? { exists: true, data: () => fsData[col][id] } : { exists: false }), set: async (v) => { fsWrites.push([col, id, v]); }, delete: async () => { fsDeletes.push([col, id]); }, update: async (v) => { fsUpdates.push([col, id, v]); } });
  const win = {
    document: { readyState: 'complete', createElement: node, getElementById: (id) => els[id] || all(root).find((n) => n.id === id) || null, body: node('body'), addEventListener() {}, activeElement: null },
    location: { pathname: '/x.html', search, href: 'http://x/x.html' + search }, navigator: { onLine: online },
    WFStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    WFPerm: { can: (k) => perms(k), profile: () => ({ name: 'أحمد' }), wallet: () => 'عهدة أحمد', onChange() {} },
    wfSyncMode: 'scoped', wfSyncInfo: () => ({ pending: 0, error: '', online }),
    firebase: { auth: () => ({ currentUser: { uid } }), firestore: () => ({ collection: (c) => Object.assign({ doc: (id) => docRef(c, id || 'auto' + (fsWrites.length + 1)), where: () => ({ get: async () => ({ docs: Object.keys(fsData[c] || {}).map((id) => ({ id, data: () => fsData[c][id] })) }), onSnapshot: (ok) => { ok({ docs: Object.keys(fsData[c] || {}).filter((id) => fsData[c][id].status === 'pending').map((id) => ({ id, data: () => fsData[c][id] })) }); return () => {}; } }) }) }) },
    K: { c: 'wf_c', d: 'wf_d', r: 'wf_r', wtx: 'wf_wallet_tx' },
    arr: (k) => data[k] || [],
    updateRequestRecordAsync: async (id, fn) => { const r = data.wf_r.find((x) => String(x.id) === String(id)); if (!r) return false; return fn(data.wf_r, r) === false ? false : true; },
    settings: () => ({ wallets: ['كاش الورشة', 'عهدة أحمد'] }),
    dayKeyLocal: dk, localDateKey: dk, nextStatusOptions: (s) => [s, 'جاري التنفيذ', 'مكتمل', 'ملغي'].filter((v, i, a) => a.indexOf(v) === i),
    changeRequestStatus: async (id, st) => { data.wf_r.find((x) => x.id === id).status = st; },
    resolveDefaultWallet: (o) => (o && o.techWallet) || 'كاش الورشة',
    markPaidAndClose: (id) => { win._closed = id; win._closeWallet = (all(root).find((n) => n.id === 'rCloseWallet') || {}).value; },
    confirm: () => true, alert() {}, prompt: () => 'سبب', put: (k, v) => { data[k] = v; return true; }, id: (() => { let i = 0; return () => 'id' + (++i); })(), auditLog() {}, walletBalance: (w) => (data.wf_wallet_tx || []).filter((x) => x.wallet === w && !x.deleted).reduce((a, x) => a + (x.type === 'in' ? x.amount : -x.amount), 0),
    setTimeout, clearTimeout, setInterval: () => 0, console, Promise, Date, JSON, Object, Array, String, Number, Math, URL, URLSearchParams, RegExp, isFinite, Error
  };
  win.addEventListener = () => {}; win.removeEventListener = () => {}; win.window = win;
  return { win, root, msg, store, fsWrites, fsDeletes, fsUpdates };
}

(async () => {
  const mkData = () => ({
    wf_c: [{ id: 'c1', name: 'سعاد', phone: '01011111111', mainAddress: { center: 'المنصورة', street: 'ش النيل' } }, { id: 'c2', name: 'محمود', phone: '01022222222' }, { id: 'c3', name: 'هالة', phone: '0103' }, { id: 'c4', name: 'عادل', phone: '0104' }],
    wf_d: [{ id: 'd1', type: 'غسالة', brand: 'LG' }],
    wf_r: [
      { id: 'r1', no: 'A1', customerId: 'c1', deviceId: 'd1', fault: 'مش بتسخن', status: 'جديد', visit: at(0, 15), techId: 'tech-a', techWallet: 'عهدة أحمد', labor: 0, parts: [], total: 0, deposit: 50, closed: false, createdAt: '2026-10-01' },
      { id: 'r2', no: 'A2', customerId: 'c2', status: 'جاري التنفيذ', visit: at(-2, 10), techId: 'tech-a', closed: false, createdAt: '2026-10-02' },
      { id: 'r3', no: 'A3', customerId: 'c3', status: 'جديد', visit: at(3, 11), techId: 'tech-a', closed: false, createdAt: '2026-10-03' },
      { id: 'r4', no: 'A4', customerId: 'c4', status: 'جديد', techId: 'tech-a', closed: false, createdAt: '2026-10-04' },
      { id: 'r5', no: 'A5', customerId: 'c1', status: 'مكتمل', techId: 'tech-a', closed: true, paid: true, createdAt: '2026-10-05' }
    ],
    wf_wallet_tx: [{ id: 'lx1', refKey: 'order-final-r9', type: 'in', amount: 120, wallet: 'عهدة أحمد', reason: 'تحصيل نهائي أمر 9', date: '2026-10-12', time: '10:00' }]
  });

  // 1) اليوم
  let data = mkData(), e = makeEnv({ rootId: 'techRoot', data });
  vm.runInNewContext(fs.readFileSync('tech-portal.js', 'utf8'), e.win); await flush();
  let text = e.root.textContent;
  assert(text.includes('📅 النهارده (1)') && text.includes('متأخرة عن موعدها (1)') && text.includes('قادمة (1)') && text.includes('بدون موعد — حدّد موعدها (1)'), 'أقسام اليوم: ' + text.slice(0, 300));
  assert(text.includes('#A1 — سعاد') && !text.includes('A5'), 'المقفول مش ظاهر');
  assert(text.includes('المنصورة'), 'العنوان ظاهر');
  assert(!/طباعة|واتساب|حذف/.test(text), 'مفيش طباعة/رسائل/حذف');
  assert(all(e.root).some((n) => n.tagName === 'A' && n.href === 'tel:01011111111'), 'زر الاتصال');

  // 2) تفاصيل أمر: الموعد، الشغل، القطع (مع مصروف عهدة)، الإجمالي
  data = mkData(); e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data });
  vm.runInNewContext(fs.readFileSync('tech-portal.js', 'utf8'), e.win); await flush();
  const dtInput = all(e.root).find((n) => n.type === 'datetime-local');
  dtInput.value = at(1, 9);
  await btnOf(e.root, 'حفظ الموعد').onclick(); await flush();
  assert.strictEqual(data.wf_r[0].visit, at(1, 9), 'الموعد اتحفظ على الأمر');
  e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data });
  vm.runInNewContext(fs.readFileSync('tech-portal.js', 'utf8'), e.win); await flush();
  const ta = all(e.root).find((n) => n.tagName === 'TEXTAREA'); ta.value = 'غيّرت السخان';
  const labor = all(e.root).find((n) => n.type === 'number' && n.placeholder.includes('أجرة')); labor.value = '200';
  await btnOf(e.root, 'حفظ الشغل والأجرة').onclick(); await flush();
  assert.deepStrictEqual([data.wf_r[0].work, data.wf_r[0].labor, data.wf_r[0].total, data.wf_r[0].remain], ['غيّرت السخان', 200, 200, 150], 'الشغل والأجرة والإجمالي والمتبقي بعد العربون');
  e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data });
  vm.runInNewContext(fs.readFileSync('tech-portal.js', 'utf8'), e.win); await flush();
  const f = all(e.root).filter((n) => n.tagName === 'INPUT');
  f.find((n) => n.placeholder === 'اسم القطعة').value = 'سخان';
  f.find((n) => n.placeholder === 'سعر البيع').value = '300'; f.find((n) => n.placeholder === 'سعر الشراء').value = '220'; f.find((n) => n.placeholder === 'الكمية').value = '2';
  await btnOf(e.root, 'إضافة القطعة').onclick(); await flush(); await flush();
  const r1 = data.wf_r[0];
  assert.deepStrictEqual([r1.parts.length, r1.partsTotal, r1.partsCost, r1.total, r1.remain], [1, 600, 440, 800, 750], 'القطعة اتحسبت');
  assert.strictEqual(e.fsWrites.length, 1, 'مصروف عهدة اتسجل');
  const ex = e.fsWrites[0][2];
  assert.deepStrictEqual([e.fsWrites[0][0], ex.techId, ex.status, ex.amount, ex.orderNo, ex.wallet], ['techExpenses', 'tech-a', 'pending', 440, 'A1', 'عهدة أحمد']);
  assert(/سخان/.test(ex.note));

  // 3) قفل الأمر: لازم مكتمل أولًا، والمحفظة الافتراضية = محفظة الفني
  e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data });
  vm.runInNewContext(fs.readFileSync('tech-portal.js', 'utf8'), e.win); await flush();
  assert(e.root.textContent.includes('غيّر الحالة لـ «مكتمل» الأول') && !btnOf(e.root, 'قفل الأمر'), 'مش بيقفل قبل مكتمل');
  data.wf_r[0].status = 'مكتمل';
  e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data });
  vm.runInNewContext(fs.readFileSync('tech-portal.js', 'utf8'), e.win); await flush();
  const wsel = all(e.root).find((n) => n.id === 'rCloseWallet'); assert.strictEqual(wsel.children.filter((o) => o.selected).map((o) => o.value)[0], 'عهدة أحمد', 'المحفظة الافتراضية = عهدة الفني');
  wsel.value = 'عهدة أحمد'; btnOf(e.root, 'قفل الأمر').onclick(); assert.strictEqual(e.win._closed, 'r1'); assert.strictEqual(e.win._closeWallet, 'عهدة أحمد');
  // أمر مقفول: مفيش أدوات تعديل
  e = makeEnv({ rootId: 'techRoot', search: '?id=r5', data });
  vm.runInNewContext(fs.readFileSync('tech-portal.js', 'utf8'), e.win); await flush();
  assert(e.root.textContent.includes('الأمر مش موجود عندك') || !btnOf(e.root, 'حفظ'), 'المقفول محجوب');
  // الحالة: مفيش خيار إلغاء
  e = makeEnv({ rootId: 'techRoot', search: '?id=r2', data });
  vm.runInNewContext(fs.readFileSync('tech-portal.js', 'utf8'), e.win); await flush();
  const sel = all(e.root).find((n) => n.tagName === 'SELECT' && n.children.some((o) => o.value === 'مكتمل'));
  assert(sel && !sel.children.some((o) => o.value === 'ملغي'), 'الفني مايلغيش');

  // 4) عهدتي: رصيد من حساب الإدارة + تحصيل محلي لسه ما ظهرش + مصروفات
  data = mkData();
  const FS = { techWallets: { 'tech-a': { uid: 'tech-a', wallet: 'عهدة أحمد', balance: 1000, entries: [{ ref: 'order-final-r8', type: 'in', amount: 400, reason: 'تحصيل أمر 8', date: '2026-10-11', time: '09:00', category: 'تحصيل عميل' }, { ref: 'custody-exp-1', type: 'out', amount: 50, reason: 'بنزين', date: '2026-10-12', time: '08:00', category: 'مصروف تشغيل' }] } }, techExpenses: { e1: { techId: 'tech-a', amount: 30, note: 'مواصلات', status: 'pending', at: '2026-10-12T08:00:00Z' }, e2: { techId: 'tech-a', amount: 70, note: 'قطعة', status: 'rejected', decisionNote: 'مفيش فاتورة', at: '2026-10-11T08:00:00Z' } } };
  e = makeEnv({ rootId: 'techRoot', search: '?tab=account', data, fs: FS });
  vm.runInNewContext(fs.readFileSync('tech-portal.js', 'utf8'), e.win); await flush(); await flush();
  text = e.root.textContent;
  assert(text.includes('1,120') || text.includes('١٬١٢٠'), 'الرصيد = 1000 + 120 تحصيل محلي: ' + text.slice(0, 250));
  assert(text.includes('بانتظار ظهورها'), 'تنبيه التحصيل المحلي');
  assert(text.includes('مواصلات') && text.includes('⏳ معلّق') && text.includes('❌ مرفوض') && text.includes('مفيش فاتورة'), 'مصروفاتي');
  assert(text.includes('تحصيل أمر 8') && text.includes('بنزين'), 'الحركات');
  // إلغاء مصروف معلّق
  await btnOf(e.root, 'إلغاء').onclick(); await flush();
  assert.deepStrictEqual(e.fsDeletes[0], ['techExpenses', 'e1']);
  // مصروف جديد
  const nums = all(e.root).filter((n) => n.tagName === 'INPUT'); nums.find((n) => n.placeholder === 'المبلغ (ج)').value = '45'; nums.find((n) => n.placeholder.includes('المصروف على إيه')).value = 'بنزين العربية';
  await btnOf(e.root, 'إرسال للاعتماد').onclick(); await flush();
  assert.strictEqual(e.fsWrites.length, 1); assert.deepStrictEqual([e.fsWrites[0][2].amount, e.fsWrites[0][2].status, e.fsWrites[0][2].techId], [45, 'pending', 'tech-a']);
  // أوفلاين: المصروف يترفض برسالة
  e = makeEnv({ rootId: 'techRoot', search: '?tab=account', data, fs: FS, online: false });
  vm.runInNewContext(fs.readFileSync('tech-portal.js', 'utf8'), e.win); await flush();
  const nums2 = all(e.root).filter((n) => n.tagName === 'INPUT'); nums2.find((n) => n.placeholder === 'المبلغ (ج)').value = '10'; nums2.find((n) => n.placeholder.includes('المصروف على إيه')).value = 'شاي';
  await btnOf(e.root, 'إرسال للاعتماد').onclick(); await flush();
  assert(e.msg.textContent.includes('مفيش نت') && e.fsWrites.length === 0, 'الأوفلاين: رسالة وبدون كتابة');

  // 5) صفحة الإدارة: الاعتماد والرفض والإيداع والتسوية
  data = mkData(); data.wf_wallet_tx = [{ id: 'a', wallet: 'كاش الورشة', type: 'in', amount: 5000 }, { id: 'b', wallet: 'عهدة أحمد', type: 'in', amount: 300 }];
  const FS2 = { techExpenses: { e1: { techId: 'tech-a', techName: 'أحمد', wallet: 'عهدة أحمد', amount: 100, note: 'بنزين', status: 'pending', at: '2026-10-12T08:00:00Z' } } };
  const c = makeEnv({ rootId: 'custodyRoot', data, fs: FS2, uid: 'boss' });
  c.win.WFTech = { directory: async () => [{ uid: 'tech-a', name: 'أحمد', role: 'tech', roleName: 'فني', wallet: 'عهدة أحمد', scope: 'assigned' }, { uid: 'boss', name: 'المالك', wallet: '', scope: 'all' }], lastError: '' };
  vm.runInNewContext(fs.readFileSync('custody-page.js', 'utf8'), c.win); await flush(); await flush();
  text = c.root.textContent;
  assert(text.includes('بانتظار الاعتماد (1)') && text.includes('٣٠٠ ج'), 'كارت الفني ورصيده: ' + text.slice(0, 300));
  assert(!text.includes('المالك'), 'غير الفني مش ظاهر');
  assert(text.includes('اليوم 1') && text.includes('متأخر 1'), 'جدول الفني');
  await btnOf(c.root, 'اعتماد').onclick(); await flush(); await flush();
  const tx = data.wf_wallet_tx.find((x) => x.refKey === 'custody-exp-e1');
  assert.deepStrictEqual([tx.type, tx.amount, tx.wallet, tx.category], ['out', 100, 'عهدة أحمد', 'مصروف تشغيل'], 'حركة الصرف اتسجلت في محفظة الفني');
  assert.deepStrictEqual([c.fsUpdates[0][0], c.fsUpdates[0][1], c.fsUpdates[0][2].status], ['techExpenses', 'e1', 'approved']);
  // اعتماد تاني ما يكررش الحركة
  await btnOf(c.root, 'اعتماد').onclick(); await flush(); await flush();
  assert.strictEqual(data.wf_wallet_tx.filter((x) => x.refKey === 'custody-exp-e1').length, 1, 'ما اتكررتش');
  // إيداع
  await btnOf(c.root, 'إيداع عهدة').onclick();
  const modal = c.win.document.body.children[0];
  const amtIn = all(modal).find((n) => n.tagName === 'INPUT' && n.placeholder === 'المبلغ (ج)'); amtIn.value = '500';
  await btnOf(modal, 'تأكيد').onclick(); await flush();
  const dep = data.wf_wallet_tx.filter((x) => x.source === 'custody');
  assert.strictEqual(dep.length, 2); assert.strictEqual(dep[0].custodyId, dep[1].custodyId);
  assert.deepStrictEqual(dep.map((x) => [x.wallet, x.type, x.amount]).sort(), [['عهدة أحمد', 'in', 500], ['كاش الورشة', 'out', 500]].sort(), 'من محفظة الورشة لمحفظة الفني');
  // رفض
  const FS3 = { techExpenses: { e2: { techId: 'tech-a', techName: 'أحمد', wallet: 'عهدة أحمد', amount: 20, note: 'شاي', status: 'pending', at: '2026-10-12T08:00:00Z' } } };
  const c2 = makeEnv({ rootId: 'custodyRoot', data: mkData(), fs: FS3, uid: 'boss' });
  c2.win.WFTech = { directory: async () => [{ uid: 'tech-a', name: 'أحمد', wallet: 'عهدة أحمد', scope: 'assigned' }], lastError: '' };
  vm.runInNewContext(fs.readFileSync('custody-page.js', 'utf8'), c2.win); await flush(); await flush();
  await btnOf(c2.root, 'رفض').onclick(); await flush();
  assert.deepStrictEqual([c2.fsUpdates[0][2].status, c2.fsUpdates[0][2].decisionNote], ['rejected', 'سبب']);
  // من غير صلاحية الاعتماد/التسوية: مفيش أزرار
  const c3 = makeEnv({ rootId: 'custodyRoot', data: mkData(), fs: FS3, uid: 'boss', perms: () => false });
  c3.win.WFTech = { directory: async () => [{ uid: 'tech-a', name: 'أحمد', wallet: 'عهدة أحمد', scope: 'assigned' }], lastError: '' };
  vm.runInNewContext(fs.readFileSync('custody-page.js', 'utf8'), c3.win); await flush(); await flush();
  assert(!btnOf(c3.root, 'اعتماد') && !btnOf(c3.root, 'إيداع'), 'بدون صلاحية: لا اعتماد ولا إيداع');

  // 6) ملفات الصفحات والكاش
  const sw = fs.readFileSync('service-worker.js', 'utf8');
  ['tech.html', 'tech-portal.js', 'custody.html', 'custody-page.js'].forEach((f) => assert(sw.includes('"./' + f + '"'), f + ' في الكاش'));
  const th = fs.readFileSync('tech.html', 'utf8');
  assert(th.includes('tech-portal.js') && !th.includes('bottom-nav.js') && !th.includes('print-share.js') && !th.includes('global-search.js'), 'بوابة الفني من غير تنقل/طباعة/بحث عام');
  assert(fs.readFileSync('custody.html', 'utf8').includes('custody-page.js'));
  console.log('tech-portal-tests: PASS (اليوم/المتأخر/القادم، الموعد، الشغل، القطع+مصروف العهدة، القفل بمحفظة الفني، عهدتي والمصروفات، اعتماد/رفض/إيداع، صلاحيات)');
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
