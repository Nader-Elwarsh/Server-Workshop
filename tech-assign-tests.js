// اختبار تعيين الفني (app-tech-assign.js) وصفحة التوزيع (dispatch-page.js) على بيئة وهمية.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function node(tag) {
  const n = { tagName: String(tag).toUpperCase(), style: {}, children: [], _text: '', attrs: {}, parentNode: null, checked: false, value: '', disabled: false,
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; },
    insertBefore(c) { return this.appendChild(c); }, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    querySelector() { return null; }, focus() {}, setSelectionRange() {} };
  Object.defineProperty(n, 'firstChild', { get() { return this.children[0] || null; } });
  Object.defineProperty(n, 'textContent', { get() { return this._text + this.children.map((c) => c.textContent).join(''); }, set(v) { this._text = String(v); this.children = []; } });
  return n;
}
function all(n, out = []) { out.push(n); n.children.forEach((c) => all(c, out)); return out; }

function makeWin({ canAssign = true, requests, dirUsers }) {
  const store = new Map(), rid = { v: 0 };
  const root = node('div'), msg = node('div'), els = { dispatchRoot: root, dispatchMsg: msg };
  const calls = [];
  const win = {
    document: { readyState: 'complete', createElement: node, getElementById: (id) => els[id] || all(root).find((n) => n.id === id) || null, body: node('body'), addEventListener() {} },
    location: { pathname: '/dispatch.html', search: '' }, navigator: { onLine: true },
    WFStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    WFPerm: { can: (k) => (k === 'requests.assign' ? canAssign : true), call: async (name) => { calls.push(name); return { users: dirUsers }; }, onChange() {} },
    firebase: { auth: () => ({ currentUser: { uid: 'boss' } }) },
    K: { c: 'wf_c', d: 'wf_d', r: 'wf_r' },
    arr: (k) => ({ wf_c: [{ id: 'c1', name: 'عميل 1', phone: '0101' }, { id: 'c2', name: 'عميل 2', phone: '0102' }], wf_d: [{ id: 'd1', type: 'غسالة', brand: 'LG' }], wf_r: requests })[k] || [],
    updateRequestRecordAsync: async (id, fn) => { const r = requests.find((x) => String(x.id) === String(id)); if (!r) return false; return fn(requests, r) === false ? false : true; },
    setTimeout, clearTimeout, console, Promise, Date, JSON, Object, Array, String, Number, Math, URLSearchParams, MutationObserver: function () { this.observe = () => {}; }
  };
  win.window = win;
  return { win, root, msg, calls, store };
}
const flush = () => new Promise((r) => setTimeout(r, 30));
const USERS = [{ uid: 't1', name: 'أحمد', role: 'tech', roleName: 'فني', wallet: 'عهدة أحمد', scope: 'assigned' }, { uid: 't2', name: 'محمد', role: 'tech', roleName: 'فني', wallet: '', scope: 'all' }];

(async () => {
  // 1) assign: يعيّن، يتخطى المقفول، يشيل التعيين، يحدد المحفظة
  let reqs = [{ id: 'r1', no: 1, customerId: 'c1', deviceId: 'd1' }, { id: 'r2', no: 2, customerId: 'c2', closed: true }, { id: 'r3', no: 3, customerId: 'c2' }];
  let e = makeWin({ requests: reqs, dirUsers: USERS });
  vm.runInNewContext(fs.readFileSync('app-tech-assign.js', 'utf8'), e.win);
  const res = await e.win.WFTech.assign(['r1', 'r2'], 't1');
  assert.deepStrictEqual([res.done, res.skipped], [1, 1]);
  assert.deepStrictEqual([reqs[0].techId, reqs[0].techName, reqs[0].techWallet, reqs[0].assignedBy], ['t1', 'أحمد', 'عهدة أحمد', 'boss']);
  assert(!reqs[1].techId, 'closed order untouched');
  await e.win.WFTech.assign(['r1'], ''); assert.strictEqual(reqs[0].techId, '', 'unassign clears');
  await assert.rejects(e.win.WFTech.assign(['r1'], 'ghost'), /no_such_tech/);
  assert.strictEqual(JSON.parse(e.store.get('wf_tech_dir')).length, 2, 'directory cached for offline');
  // أوفلاين: يقرأ من النسخة المحلية
  e.win.navigator.onLine = false; e.calls.length = 0;
  const e2 = makeWin({ requests: reqs, dirUsers: [] }); e2.store.set('wf_tech_dir', JSON.stringify(USERS)); e2.win.navigator.onLine = false;
  vm.runInNewContext(fs.readFileSync('app-tech-assign.js', 'utf8'), e2.win);
  assert.strictEqual((await e2.win.WFTech.directory()).length, 2); assert.strictEqual(e2.calls.length, 0, 'no network call offline');
  // من غير صلاحية
  const e3 = makeWin({ requests: reqs, dirUsers: USERS, canAssign: false });
  vm.runInNewContext(fs.readFileSync('app-tech-assign.js', 'utf8'), e3.win);
  await assert.rejects(e3.win.WFTech.assign(['r1'], 't1'), /not_allowed/);

  // 2) صفحة التوزيع
  reqs = [{ id: 'r1', no: 1, customerId: 'c1', deviceId: 'd1', fault: 'مش بتسخن' }, { id: 'r2', no: 2, customerId: 'c2', closed: true }, { id: 'r3', no: 3, customerId: 'c2', techId: 't2', techName: 'محمد' }, { id: 'r4', no: 4, customerId: 'c2', status: 'ملغي' }];
  const d = makeWin({ requests: reqs, dirUsers: USERS });
  vm.runInNewContext(fs.readFileSync('app-tech-assign.js', 'utf8'), d.win);
  vm.runInNewContext(fs.readFileSync('dispatch-page.js', 'utf8'), d.win);
  await flush(); await flush();
  let nodes = all(d.root), text = d.root.textContent;
  assert(text.includes('#1') && !text.includes('#2 ') && !text.includes('#3') && !text.includes('#4'), 'default filter: open + unassigned only');
  assert(text.includes('LG'), 'device label shown');
  const boxes = nodes.filter((n) => n.tagName === 'INPUT' && n.type === 'checkbox');
  assert.strictEqual(boxes.length, 1);
  boxes[0].checked = true; boxes[0].onchange();
  const who = nodes.find((n) => n.id === 'dispatchWho'); who.value = 't1';
  const go = nodes.find((n) => n.id === 'dispatchGo'); assert(go.textContent.includes('(1)'), 'selected counter');
  await go.onclick(); await flush();
  assert.strictEqual(reqs[0].techId, 't1'); assert(d.msg.textContent.includes('اتعيّن 1'), 'success message');
  // تعيين من غير اختيار فني
  const d2 = makeWin({ requests: [{ id: 'r9', no: 9, customerId: 'c1' }], dirUsers: USERS });
  vm.runInNewContext(fs.readFileSync('app-tech-assign.js', 'utf8'), d2.win); vm.runInNewContext(fs.readFileSync('dispatch-page.js', 'utf8'), d2.win);
  await flush(); await flush();
  const n2 = all(d2.root); const b2 = n2.find((n) => n.type === 'checkbox'); b2.checked = true; b2.onchange();
  n2.find((n) => n.id === 'dispatchWho').value = '__none__'; // أول خيار في الـselect الحقيقي
  await n2.find((n) => n.id === 'dispatchGo').onclick(); assert(d2.msg.textContent.includes('اختار الفني'), 'must choose a technician first');
  console.log('tech-assign-tests: PASS (تعيين/إلغاء/تخطي المقفول، كاش الفنيين أوفلاين، صفحة التوزيع، بدون صلاحية)');
})().catch((e) => { console.error(e); process.exit(1); });
