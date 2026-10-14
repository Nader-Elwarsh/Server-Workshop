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

function makeEnv({ rootId, search = '', data, perms = () => true, fs: fsData = {}, online = true, uid = 'tech-a', callImpl = {}, store: keep }) {
  const calls = [], syncs = { n: 0 };
  const store = keep || new Map(), root = node('div'), msg = node('div'), els = { [rootId]: root, [rootId.replace('Root', 'Msg')]: msg };
  const fsWrites = [], fsDeletes = [], fsUpdates = [];
  const docRef = (col, id) => ({ id, get: async () => (fsData[col] && fsData[col][id] ? { exists: true, data: () => fsData[col][id] } : { exists: false }), set: async (v) => { fsWrites.push([col, id, v]); }, delete: async () => { fsDeletes.push([col, id]); }, update: async (v) => { fsUpdates.push([col, id, v]); } });
  const win = {
    document: { readyState: 'complete', createElement: node, getElementById: (id) => els[id] || all(root).find((n) => n.id === id) || null, body: node('body'), addEventListener() {}, activeElement: null },
    location: { pathname: '/x.html', search, href: 'http://x/x.html' + search }, navigator: { onLine: online },
    WFStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    WFPerm: { can: (k) => perms(k), profile: () => ({ name: 'أحمد' }), wallet: () => 'عهدة أحمد', onChange() {}, call: async (name, d) => { calls.push([name, d]); const f = callImpl[name]; if (!f) { const er = new Error(''); er.code = 'not_found'; throw er; } return f(d); } },
    wfCloudSyncNow: async () => { syncs.n++; },
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
  return { win, root, msg, store, fsWrites, fsDeletes, fsUpdates, calls, syncs };
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

  const ACC = { uid: 'tech-a', name: 'أحمد', wallet: 'عهدة أحمد', balance: 1120,
    entries: [{ ref: 'order-final-r8', type: 'in', amount: 400, reason: 'تحصيل أمر 8', date: '2026-10-11', time: '09:00', category: 'تحصيل عميل' }, { ref: 'custody-exp-1', type: 'out', amount: 50, reason: 'بنزين', date: '2026-10-12', time: '08:00', category: 'مصروف تشغيل' }],
    history: [{ id: 'r8', no: 'A8', customer: 'سامي', device: 'تلاجة توشيبا', work: 'غيّرت الثرموستات', total: 450, deposit: 50, collected: 400, wallet: 'عهدة أحمد', closedAt: '2026-10-11T09:00:00.000Z', byTech: true },
      { id: 'r7', no: 'A7', customer: 'منى', device: '', work: '', total: 100, deposit: 0, collected: 100, wallet: 'كاش الورشة', closedAt: '2026-10-10T09:00:00.000Z', byTech: false }],
    expenses: [{ id: 'e1', amount: 30, note: 'مواصلات', status: 'pending', at: '2026-10-12T08:00:00Z' }, { id: 'e2', amount: 70, note: 'قطعة', status: 'rejected', decisionNote: 'مفيش فاتورة', at: '2026-10-11T08:00:00Z' }],
    stats: { open: 4, closedTotal: 2, closedMonth: 2, collectedMonth: 500, laborMonth: 300, pendingExpenses: 30 } };
  const accImpl = { techAccount: async () => JSON.parse(JSON.stringify(ACC)) };
  const run = (env) => vm.runInNewContext(fs.readFileSync('tech-portal.js', 'utf8'), env.win);

  // 1) النهارده: الأقسام، المربعات، الشريط السفلي، ومفيش طباعة/رسائل/حذف
  let data = mkData(), e = makeEnv({ rootId: 'techRoot', data, callImpl: accImpl });
  run(e); await flush();
  let text = e.root.textContent;
  assert(text.includes('📅 النهارده (1)') && text.includes('متأخرة عن موعدها (1)') && text.includes('قادمة (1)') && text.includes('بدون موعد — حدّد موعدها (1)'), 'أقسام اليوم: ' + text.slice(0, 300));
  assert(text.includes('#A1 — سعاد') && !text.includes('#A5'), 'المقفول مش ظاهر في المفتوح');
  assert(text.includes('المنصورة'), 'العنوان ظاهر');
  assert(!/طباعة|واتساب|حذف/.test(text), 'مفيش طباعة/رسائل/حذف');
  assert(all(e.root).some((n) => n.tagName === 'A' && n.href === 'tel:01011111111'), 'زر الاتصال');
  const nav = all(e.root).find((n) => n.tagName === 'NAV');
  assert(nav && ['الرئيسية', 'النهارده', 'أوامري', 'المقفولة', 'عهدتي'].every((t) => nav.textContent.includes(t)), 'الشريط السفلي');
  assert(nav.textContent.includes('النهارده2'), 'عدّاد النهارده = النهارده + المتأخر');
  btnOf(nav, 'الرئيسية').onclick(); assert.strictEqual(e.win.location.href, 'index.html', 'الرئيسية للفني = رئيسية النظام');
  // موظف كامل فاتح بوابة الفني: زرار «الرئيسية» بيرجّعه لرئيسية النظام
  const eF = makeEnv({ rootId: 'techRoot', data: mkData(), callImpl: accImpl }); eF.win.wfSyncMode = 'full'; run(eF); await flush();
  const navF = all(eF.root).find((n) => n.tagName === 'NAV');
  assert(navF.textContent.includes('الرئيسية') && navF.textContent.includes('النهارده'), 'الرئيسية + النهارده');
  btnOf(navF, 'الرئيسية').onclick();
  assert.strictEqual(eF.win.location.href, 'index.html', 'الرئيسية = index.html');
  assert.deepStrictEqual(e.calls.map((c) => c[0]), ['techAccount'], 'الحساب بيتحمّل من السيرفر');
  assert(text.includes('متزامن'), 'حالة المزامنة');

  // التخزين لسه بيتقرا: الصفحة تستنى بدل ما تترسم فاضية، وبعدها مزامنة تلقائية أول ما الاتصال يجهز
  let openStore; const eW = makeEnv({ rootId: 'techRoot', data: mkData(), callImpl: accImpl });
  eW.win.WFStorageReady = new Promise((r) => { openStore = r; }); eW.win.wfSyncInfo = () => ({ ready: true, pending: 0 });
  run(eW); await flush(); await flush();
  assert(!eW.root.textContent.includes('#A1'), 'مستني التخزين');
  openStore(true); await new Promise((r) => setTimeout(r, 120)); await flush();
  assert(eW.root.textContent.includes('#A1 — سعاد'), 'اترسمت بعد ما التخزين جهز');
  assert(eW.syncs.n >= 1, 'مزامنة تلقائية من غير ضغط 🔄');

  // تسجيل الدخول بيرجع بعد فتح الصفحة: الحساب بيتحمّل لوحده (من غير 🔄) والنسخة المحفوظة بتظهر على طول
  const eA = makeEnv({ rootId: 'techRoot', search: '?tab=account', data: mkData(), callImpl: accImpl });
  eA.store.set('wf_tech_account', JSON.stringify({ uid: 'tech-a', data: ACC, at: '2026-10-12T10:00:00Z' }));
  let authCb = null; const cu = { currentUser: null, onAuthStateChanged: (f) => { authCb = f; } };
  eA.win.firebase.auth = () => cu;
  run(eA); await flush();
  assert(!eA.calls.length, 'مستني تسجيل الدخول');
  cu.currentUser = { uid: 'tech-a' }; authCb(cu.currentUser); await flush(); await flush();
  assert(eA.calls.some((c) => c[0] === 'techAccount'), 'الحساب اتحمّل بعد الدخول');
  assert(eA.root.textContent.includes('١٬١٢٠') || eA.root.textContent.includes('1,120'), 'الرصيد ظاهر');

  // من غير أوامر مفتوحة: رسالة + رابط للمقفولة (مش «مفيش أوامر» وبس)
  const d0 = mkData(); d0.wf_r = d0.wf_r.filter((r) => r.closed); e = makeEnv({ rootId: 'techRoot', data: d0, callImpl: accImpl });
  run(e); await flush(); await flush();
  assert(e.root.textContent.includes('مفيش أوامر مفتوحة') && e.root.textContent.includes('قفلت 2 أمر الشهر ده') && btnOf(e.root, 'شوف أوامرك المقفولة'), 'توجيه للسجل');

  // 2) تفاصيل أمر: الموعد، الشغل، القطع (مع مصروف عهدة)، الإجمالي
  data = mkData(); e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data, callImpl: accImpl });
  run(e); await flush();
  const dtInput = all(e.root).find((n) => n.type === 'datetime-local');
  dtInput.value = at(1, 9);
  assert(!btnOf(e.root, 'حفظ الموعد'), 'مفيش زرار حفظ: الحفظ تلقائي');
  await dtInput.onchange(); await flush();
  assert.strictEqual(data.wf_r[0].visit, at(1, 9), 'الموعد اتحفظ على الأمر');
  e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data, callImpl: accImpl }); run(e); await flush();
  const ta = all(e.root).find((n) => n.tagName === 'TEXTAREA'); ta.value = 'غيّرت السخان';
  const labor = all(e.root).find((n) => n.type === 'number' && n.placeholder.includes('أجرة')); labor.value = '200';
  assert(!btnOf(e.root, 'حفظ الشغل'), 'مفيش زرار حفظ: الحفظ تلقائي');
  labor.oninput(); await new Promise((r) => setTimeout(r, 1100)); await flush();
  assert.strictEqual(data.wf_r[0].labor, 200, 'اتحفظ لوحده بعد ما بطّل كتابة');
  await labor.onchange(); await flush();
  assert.deepStrictEqual([data.wf_r[0].work, data.wf_r[0].labor, data.wf_r[0].total, data.wf_r[0].remain], ['غيّرت السخان', 200, 200, 150], 'الشغل والأجرة والإجمالي والمتبقي بعد العربون');
  e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data, callImpl: accImpl }); run(e); await flush();
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
  assert.deepStrictEqual([ex.pay, r1.parts[0].paidBy, r1.parts[0].expenseId], ['custody', 'custody', e.fsWrites[0][1]], 'القطعة مربوطة بمصروفها');
  // من جيبه: المصروف بنوع own؛ ومن غير مصروف: مفيش كتابة
  for (const [how, writes] of [['own', 1], ['none', 0]]) {
    e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data, callImpl: accImpl }); run(e); await flush();
    const g = all(e.root).filter((n) => n.tagName === 'INPUT');
    g.find((n) => n.placeholder === 'اسم القطعة').value = 'ترموستات ' + how;
    g.find((n) => n.placeholder === 'سعر البيع').value = '100'; g.find((n) => n.placeholder === 'سعر الشراء').value = '60';
    all(e.root).find((n) => n.id === 'tpPartPay').value = how;
    await btnOf(e.root, 'إضافة القطعة').onclick(); await flush(); await flush();
    const last = data.wf_r[0].parts[data.wf_r[0].parts.length - 1];
    assert.strictEqual(e.fsWrites.length, writes, how);
    assert.strictEqual(last.paidBy, how);
    if (writes) assert.deepStrictEqual([e.fsWrites[0][2].pay, e.fsWrites[0][2].amount, last.expenseId], ['own', 60, e.fsWrites[0][1]]);
  }
  // شيل القطعة → مصروفها المعلّق يتلغي
  e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data, callImpl: accImpl }); run(e); await flush();
  const expId = data.wf_r[0].parts[1].expenseId;
  await all(e.root).filter((n) => n.tagName === 'BUTTON' && n.textContent === '✖')[1].onclick(); await flush(); await flush();
  assert.deepStrictEqual([data.wf_r[0].parts.length, e.fsDeletes[0]], [2, ['techExpenses', expId]], 'القطعة ومصروفها اتشالوا');
  data.wf_r[0].parts = data.wf_r[0].parts.slice(0, 1); data.wf_r[0].partsTotal = 600; data.wf_r[0].partsCost = 440; data.wf_r[0].total = 800; data.wf_r[0].remain = 750;
  // من غير صلاحية تعديل: عرض بس
  e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data, callImpl: accImpl, perms: (k) => k !== 'requests.edit' }); run(e); await flush();
  assert(!all(e.root).some((n) => n.type === 'datetime-local') && !btnOf(e.root, 'إضافة القطعة') && !all(e.root).some((n) => n.tagName === 'TEXTAREA'), 'بدون requests.edit مفيش تعديل');

  // 3) القفل: لازم مكتمل، المحفظة الافتراضية = عهدته، والقفل بيروح للسيرفر
  e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data, callImpl: accImpl }); run(e); await flush();
  assert(e.root.textContent.includes('غيّر الحالة لـ «مكتمل» الأول') && !btnOf(e.root, 'قفل الأمر'), 'مش بيقفل قبل مكتمل');
  data.wf_r[0].status = 'مكتمل';
  const closeImpl = Object.assign({}, accImpl, { techCloseOrder: async (d) => ({ ok: true, orderId: d.orderId, no: 'A1', collected: 750, wallet: d.wallet }) });
  e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data, callImpl: closeImpl }); run(e); await flush();
  let wsel = all(e.root).find((n) => n.id === 'rCloseWallet');
  assert.strictEqual(wsel.value, 'عهدة أحمد', 'المحفظة الافتراضية = عهدة الفني');
  assert.deepStrictEqual(wsel.children.map((o) => o.value), ['عهدة أحمد', 'كاش الورشة'], 'عهدته الأول وبعدها محافظ الورشة');
  await btnOf(e.root, 'قفل الأمر').onclick(); await flush(); await flush();
  const cc = e.calls.find((c) => c[0] === 'techCloseOrder');
  assert(cc, 'القفل اتبعت للسيرفر');
  assert.deepStrictEqual([cc[1].orderId, cc[1].wallet, cc[1].expectTotal, cc[1].expectDeposit], ['r1', 'عهدة أحمد', 800, 50]);
  assert(/^\d{4}-\d\d-\d\d$/.test(cc[1].date) && /^\d\d:\d\d$/.test(cc[1].time), 'تاريخ ووقت الجهاز');
  assert(e.syncs.n >= 1, 'رفع التعديلات قبل القفل');
  assert(!JSON.parse(e.store.get('wf_r')).some((r) => r.id === 'r1'), 'الأمر اتشال من الجهاز');
  assert(/tab=done/.test(e.win.location.href), 'راح للمقفولة');
  assert(/750|٧٥٠/.test(e.store.get('wf_tech_flash')) && /عهدة أحمد/.test(e.store.get('wf_tech_flash')), 'رسالة النجاح فيها المبلغ والمحفظة');
  // اختيار محفظة تانية
  data = mkData(); data.wf_r[0].status = 'مكتمل'; data.wf_r[0].total = 100;
  e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data, callImpl: closeImpl }); run(e); await flush();
  wsel = all(e.root).find((n) => n.id === 'rCloseWallet'); wsel.value = 'كاش الورشة';
  await btnOf(e.root, 'قفل الأمر').onclick(); await flush(); await flush();
  assert.strictEqual(e.calls.find((c) => c[0] === 'techCloseOrder')[1].wallet, 'كاش الورشة');
  // السيرفر رفض: رسالة واضحة والأمر يفضل
  data = mkData(); data.wf_r[0].status = 'مكتمل';
  const staleImpl = Object.assign({}, accImpl, { techCloseOrder: async () => { const er = new Error('stale_total'); er.code = 'aborted'; throw er; } });
  e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data, callImpl: staleImpl }); run(e); await flush();
  await btnOf(e.root, 'قفل الأمر').onclick(); await flush(); await flush();
  assert(e.msg.textContent.includes('لسه بتترفع'), 'رسالة التعديلات اللي بتترفع: ' + e.msg.textContent);
  assert(data.wf_r.some((r) => r.id === 'r1') && !/tab=done/.test(e.win.location.href), 'الأمر فضل');
  // الدالة مش متنشرة
  e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data, callImpl: accImpl }); run(e); await flush();
  await btnOf(e.root, 'قفل الأمر').onclick(); await flush(); await flush();
  assert(e.msg.textContent.includes('techCloseOrder'), 'رسالة إن الدالة مش متنشرة');
  // أوفلاين: مايبعتش
  e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data, callImpl: closeImpl, online: false }); run(e); await flush();
  await btnOf(e.root, 'قفل الأمر').onclick(); await flush();
  assert(e.msg.textContent.includes('محتاج نت') && !e.calls.some((c) => c[0] === 'techCloseOrder'), 'القفل محتاج نت');
  // من غير صلاحية القفل
  e = makeEnv({ rootId: 'techRoot', search: '?id=r1', data, callImpl: closeImpl, perms: (k) => k !== 'requests.close' }); run(e); await flush();
  assert(!btnOf(e.root, 'قفل الأمر'), 'بدون requests.close مفيش قفل');
  // أمر مقفول: مش ظاهر
  e = makeEnv({ rootId: 'techRoot', search: '?id=r5', data, callImpl: accImpl }); run(e); await flush();
  assert(!btnOf(e.root, 'حفظ'), 'المقفول محجوب');
  // الحالة: مفيش خيار إلغاء
  e = makeEnv({ rootId: 'techRoot', search: '?id=r2', data, callImpl: accImpl }); run(e); await flush();
  const sel = all(e.root).find((n) => n.tagName === 'SELECT' && n.children.some((o) => o.value === 'مكتمل'));
  assert(sel && !sel.children.some((o) => o.value === 'ملغي'), 'الفني مايلغيش');
  // رسالة النجاح بتظهر مرة واحدة بعد التحويل
  const st = new Map([['wf_tech_flash', '✅ اتقفل الأمر #A1 واتسجل ٧٥٠ ج']]);
  e = makeEnv({ rootId: 'techRoot', search: '?tab=done', data, callImpl: accImpl, store: st }); run(e); await flush();
  assert(e.msg.textContent.includes('اتقفل الأمر #A1') && st.get('wf_tech_flash') === '', 'الرسالة ظهرت واتمسحت');

  // 4) المقفولة: من السيرفر
  await flush();
  text = e.root.textContent;
  assert(text.includes('أوامرك المقفولة (2)') && text.includes('#A8 — سامي') && text.includes('تلاجة توشيبا') && text.includes('اتقفل من الإدارة'), 'سجل المقفولة: ' + text.slice(0, 300));
  assert(text.includes('اتقفلت الشهر ده') && text.includes('حصّلت الشهر ده'), 'إحصائيات الشهر');
  // بعد الخروج والدخول (جهاز فاضي): السجل والرصيد بيرجعوا من السيرفر
  e = makeEnv({ rootId: 'techRoot', search: '?tab=done', data: { wf_r: [], wf_c: [], wf_d: [] }, callImpl: accImpl }); run(e); await flush(); await flush();
  assert(e.root.textContent.includes('#A8 — سامي'), 'السجل رجع من السيرفر حتى والجهاز فاضي');
  // أوفلاين: آخر نسخة محفوظة
  const keep = e.store;
  e = makeEnv({ rootId: 'techRoot', search: '?tab=done', data: { wf_r: [] }, callImpl: {}, online: false, store: keep }); run(e); await flush();
  assert(e.root.textContent.includes('#A8 — سامي') && e.root.textContent.includes('أوفلاين'), 'النسخة المحفوظة أوفلاين');

  // 5) عهدتي: الرصيد من السيرفر + المصروفات + الحركات
  data = mkData();
  e = makeEnv({ rootId: 'techRoot', search: '?tab=account', data, callImpl: accImpl }); run(e); await flush(); await flush();
  text = e.root.textContent;
  assert(text.includes('١٬١٢٠') || text.includes('1,120'), 'الرصيد من السيرفر: ' + text.slice(0, 250));
  assert(text.includes('مواصلات') && text.includes('⏳ معلّق') && text.includes('❌ مرفوض') && text.includes('مفيش فاتورة'), 'مصروفاتي');
  assert(text.includes('تحصيل أمر 8') && text.includes('بنزين'), 'الحركات');
  await btnOf(e.root, 'إلغاء').onclick(); await flush();
  assert.deepStrictEqual(e.fsDeletes[0], ['techExpenses', 'e1']);
  const nums = all(e.root).filter((n) => n.tagName === 'INPUT'); nums.find((n) => n.placeholder === 'المبلغ (ج)').value = '45'; nums.find((n) => n.placeholder.includes('المصروف على إيه')).value = 'بنزين العربية';
  await btnOf(e.root, 'إرسال للاعتماد').onclick(); await flush();
  assert.strictEqual(e.fsWrites.length, 1); assert.deepStrictEqual([e.fsWrites[0][2].amount, e.fsWrites[0][2].status, e.fsWrites[0][2].techId], [45, 'pending', 'tech-a']);
  e = makeEnv({ rootId: 'techRoot', search: '?tab=account', data, callImpl: accImpl, online: false }); run(e); await flush();
  const nums2 = all(e.root).filter((n) => n.tagName === 'INPUT'); nums2.find((n) => n.placeholder === 'المبلغ (ج)').value = '10'; nums2.find((n) => n.placeholder.includes('المصروف على إيه')).value = 'شاي';
  await btnOf(e.root, 'إرسال للاعتماد').onclick(); await flush();
  assert(e.msg.textContent.includes('مفيش نت') && e.fsWrites.length === 0, 'الأوفلاين: رسالة وبدون كتابة');

  // 6) صفحة الإدارة: الاعتماد والرفض والإيداع والتسوية
  data = mkData(); data.wf_wallet_tx = [{ id: 'a', wallet: 'كاش الورشة', type: 'in', amount: 5000 }, { id: 'b', wallet: 'عهدة أحمد', type: 'in', amount: 300 }];
  const FS2 = { techExpenses: { e1: { techId: 'tech-a', techName: 'أحمد', wallet: 'عهدة أحمد', amount: 100, note: 'بنزين', status: 'pending', at: '2026-10-12T08:00:00Z' } } };
  const c = makeEnv({ rootId: 'custodyRoot', data, fs: FS2, uid: 'boss' });
  c.win.WFTech = { directory: async () => [{ uid: 'tech-a', name: 'أحمد', role: 'tech', roleName: 'فني', wallet: 'عهدة أحمد', scope: 'assigned' }, { uid: 'boss', name: 'المالك', wallet: '', scope: 'all' }], lastError: '' };
  vm.runInNewContext(fs.readFileSync('custody-page.js', 'utf8'), c.win); await flush(); await flush();
  text = c.root.textContent;
  assert(text.includes('بانتظار الاعتماد (1)') && text.includes('300 ج'), 'كارت الفني ورصيده: ' + text.slice(0, 300));
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
  // مصروف من جيب الفني: اعتماد من غير حركة، وبيتضاف لمستحقاته • ودفعته الإدارة: بيتسجل من محفظة الورشة اللي اتختارت
  {
    const d4 = mkData(); d4.wf_wallet_tx = [];
    const FS4 = { techExpenses: { o1: { techId: 'tech-a', techName: 'أحمد', wallet: 'عهدة أحمد', amount: 60, note: 'قطعة: ترموستات', status: 'pending', pay: 'own', at: '2026-10-12T08:00:00Z' }, w1: { techId: 'tech-a', techName: 'أحمد', wallet: 'عهدة أحمد', amount: 80, note: 'قطعة: موتور', status: 'pending', pay: 'workshop', at: '2026-10-12T09:00:00Z' } } };
    const c4 = makeEnv({ rootId: 'custodyRoot', data: d4, fs: FS4, uid: 'boss' });
    c4.win.WFTech = { directory: async () => [{ uid: 'tech-a', name: 'أحمد', wallet: 'عهدة أحمد', scope: 'assigned' }], lastError: '' };
    vm.runInNewContext(fs.readFileSync('custody-page.js', 'utf8'), c4.win); await flush(); await flush();
    assert(c4.root.textContent.includes('من جيبه') && c4.root.textContent.includes('الإدارة دفعتها'), 'نوع الدفع ظاهر');
    const goBtns = all(c4.root).filter((n) => n.tagName === 'BUTTON' && n.textContent.includes('اعتماد'));
    await goBtns[0].onclick(); await flush(); await flush();
    assert.deepStrictEqual([d4.wf_wallet_tx.length, c4.fsUpdates[0][1], c4.fsUpdates[0][2].status], [0, 'o1', 'approved'], 'من جيبه: مفيش حركة محفظة');
    await goBtns[1].onclick();
    const m4 = c4.win.document.body.children[c4.win.document.body.children.length - 1];
    all(m4).find((n) => n.tagName === 'SELECT').value = 'كاش الورشة';
    await btnOf(m4, 'اعتماد').onclick(); await flush(); await flush();
    const wtx = d4.wf_wallet_tx.find((x) => x.refKey === 'custody-exp-w1');
    assert.deepStrictEqual([wtx.wallet, wtx.amount, wtx.type, c4.fsUpdates[1][2].paidFrom], ['كاش الورشة', 80, 'out', 'كاش الورشة'], 'دفعتها الإدارة: من محفظة الورشة');
  }
  // من غير صلاحية الاعتماد/التسوية: مفيش أزرار
  const c3 = makeEnv({ rootId: 'custodyRoot', data: mkData(), fs: FS3, uid: 'boss', perms: () => false });
  c3.win.WFTech = { directory: async () => [{ uid: 'tech-a', name: 'أحمد', wallet: 'عهدة أحمد', scope: 'assigned' }], lastError: '' };
  vm.runInNewContext(fs.readFileSync('custody-page.js', 'utf8'), c3.win); await flush(); await flush();
  assert(!btnOf(c3.root, 'اعتماد') && !btnOf(c3.root, 'إيداع'), 'بدون صلاحية: لا اعتماد ولا إيداع');

  // 7) ملفات الصفحات والكاش
  const sw = fs.readFileSync('service-worker.js', 'utf8');
  ['tech.html', 'tech-portal.js', 'custody.html', 'custody-page.js'].forEach((f) => assert(sw.includes('"./' + f + '"'), f + ' في الكاش'));
  const th = fs.readFileSync('tech.html', 'utf8');
  assert(th.includes('tech-portal.js') && !th.includes('bottom-nav.js') && !th.includes('print-share.js') && !th.includes('global-search.js'), 'بوابة الفني من غير تنقل/طباعة/بحث عام');
  assert(fs.readFileSync('custody.html', 'utf8').includes('custody-page.js'));
  console.log('tech-portal-tests: PASS (اليوم/المتأخر/القادم، الموعد، الشغل، القطع+مصدر فلوسها (عهدة/جيبه/الإدارة)، القفل بمحفظة الفني، عهدتي والمصروفات، اعتماد/رفض/إيداع، صلاحيات)');
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
