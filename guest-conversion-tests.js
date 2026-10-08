const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const portalAdmin = fs.readFileSync(`${__dirname}/portal-admin.html`, 'utf8');
const guestStart = portalAdmin.indexOf('function guConv(id,btn){');
const guestEnd = portalAdmin.indexOf('\nfunction guDone(id)', guestStart);
assert.ok(guestStart >= 0 && guestEnd > guestStart, 'guest converter source should be found');
const guestFunction = portalAdmin.slice(guestStart, guestEnd);

function guestEnv(failCommit = false, phone = '01001234567', failMarkOnce = false) {
  const K = { c: 'wf_c', d: 'wf_d', r: 'wf_r' };
  const store = { [K.c]: '[]', [K.d]: '[]', [K.r]: '[]' };
  const alerts = [], marks = [], commits = [];
  let nextId = 0;
  const window = {
    K,
    arr(key) { return JSON.parse(store[key] || '[]'); },
    id() { return `new-${++nextId}`; },
    orderNo() { return 'W26-10-5-1'; },
    settings() { return { executionPlaces: ['عند العميل'], workshopStatuses: ['غير مطلوب'] }; },
    wfPhoneKey(value) { const digits = String(value || '').replace(/\D/g, ''); return digits.length >= 7 ? digits : ''; },
    duplicateCustomerByPhone() { return null; },
    commitStorage(values) {
      commits.push(values);
      if (failCommit) return false;
      for (const [key, value] of Object.entries(values)) store[key] = JSON.stringify(value);
      return true;
    }
  };
  const context = {
    window,
    GR: [{ id: 'guest-1', name: 'زائر', phone, deviceType: 'غسالة', fault: 'لا تعمل', center: 'مطاي' }],
    confirm() { return true; },
    alert(message) { alerts.push(String(message)); },
    guTypeKey(value) { return value || 'أخرى'; },
    guOrderNo() { return window.orderNo(); },
    guMark(id, extra) { marks.push({ id, extra }); if (failMarkOnce && marks.length === 1) return Promise.reject(new Error('offline')); return Promise.resolve(); },
    location: { href: '' },
    encodeURIComponent,
    Date,
    String
  };
  vm.createContext(context);
  vm.runInContext(guestFunction, context, { filename: 'portal-admin.guConv' });
  return { context, store, K, alerts, marks, commits };
}

async function testGuestConversion() {
  {
    const e = guestEnv(true), button = { disabled: false };
    await e.context.guConv('guest-1', button);
    assert.strictEqual(e.commits.length, 1, 'conversion should use one multi-key commit');
    assert.deepStrictEqual(Object.keys(e.commits[0]).sort(), ['wf_c', 'wf_d', 'wf_r']);
    assert.deepStrictEqual(Object.values(e.store), ['[]', '[]', '[]'], 'a failed commit must leave no partial customer/device/order');
    assert.strictEqual(button.disabled, false, 'retry button must be re-enabled after failure');
    assert.strictEqual(e.marks.length, 0, 'cloud request must not be marked handled when local commit fails');
  }
  {
    const e = guestEnv(), button = { disabled: false };
    await e.context.guConv('guest-1', button);
    const customers = JSON.parse(e.store[e.K.c]), devices = JSON.parse(e.store[e.K.d]), orders = JSON.parse(e.store[e.K.r]);
    assert.strictEqual(customers.length, 1);
    assert.strictEqual(devices.length, 1);
    assert.strictEqual(orders.length, 1);
    assert.strictEqual(devices[0].customerId, customers[0].id);
    assert.strictEqual(orders[0].customerId, customers[0].id);
    assert.strictEqual(orders[0].deviceId, devices[0].id);
    assert.strictEqual(orders[0].guestRequestId, 'guest-1');
    assert.strictEqual(e.commits.length, 1);
    await e.context.guConv('guest-1', { disabled: false });
    assert.strictEqual(JSON.parse(e.store[e.K.r]).length, 1, 'retry after remote-mark failure must not duplicate the local order');
    assert.strictEqual(e.commits.length, 1, 'existing guest order should be linked without another local commit');
  }
  {
    const e = guestEnv(false, '01001234567', true), button = { disabled: false };
    await e.context.guConv('guest-1', button);
    assert.strictEqual(JSON.parse(e.store[e.K.r]).length, 1, 'local order should remain after cloud-link failure');
    assert.strictEqual(button.disabled, false, 'button should be usable again after cloud-link failure');
    await e.context.guConv('guest-1', button);
    assert.strictEqual(JSON.parse(e.store[e.K.r]).length, 1, 'retry must link the existing order without duplicating it');
    assert.strictEqual(e.commits.length, 1);
  }
  {
    const e = guestEnv(false, 'invalid'), button = { disabled: false };
    await e.context.guConv('guest-1', button);
    assert.strictEqual(e.commits.length, 0, 'invalid guest phones must not create customer records');
    assert.strictEqual(button.disabled, false);
    assert.ok(e.alerts.some(x => /غير صالح/.test(x)));
  }
}

const shareSource = fs.readFileSync(`${__dirname}/share-target.js`, 'utf8');
const shareStart = shareSource.indexOf('async function createRequestFromCallShare() {');
const shareEnd = shareSource.indexOf('\n}\n\n// لازم نستنى initQuickOrder', shareStart);
assert.ok(shareStart >= 0 && shareEnd > shareStart, 'call-share creator source should be found');
const shareFunction = shareSource.slice(shareStart, shareEnd + 2);

function shareEnv() {
  const K = { c: 'wf_c', d: 'wf_d', r: 'wf_r' };
  const store = {
    [K.c]: JSON.stringify([{ id: 'c1' }, { id: 'c2' }]),
    [K.d]: JSON.stringify([{ id: 'd1', customerId: 'c1' }]),
    [K.r]: '[]'
  };
  const controls = { qoCustomer: { value: 'c2' }, qoDevice: { value: 'd1' }, qoFault: { value: 'عطل' } };
  const alerts = [], removed = [];
  let nextId = 0;
  const context = {
    K,
    document: { getElementById(id) { return controls[id] || null; } },
    arr(key) { return JSON.parse(store[key] || '[]'); },
    settings() { return { executionPlaces: ['عند العميل'], workshopStatuses: ['غير مطلوب'] }; },
    id() { return `share-${++nextId}`; },
    orderNo() { return 'W26-10-5-2'; },
    recordStatusHistory(r) { r.statusHistory = [{ to: r.status }]; },
    applyStatusTimestamp(r) { r.statusUpdatedAt = 'now'; },
    saveJSONSafe(key, value) { store[key] = JSON.stringify(value); return true; },
    removePendingCall(id) { removed.push(id); },
    alert(message) { alerts.push(String(message)); },
    location: { href: '' },
    __audioRef: null,
    __audioPromise: null,
    __creating: false,
    __pendingCallId: 'call-1',
    Date,
    String
  };
  context.wfNavigate = async url => { context.location.href = url; };
  vm.createContext(context);
  vm.runInContext(`${shareFunction}\nthis.createRequestFromCallShare=createRequestFromCallShare;`, context, { filename: 'share-target.createRequestFromCallShare' });
  return { context, store, K, controls, alerts, removed };
}

async function testCallShare() {
  const e = shareEnv();
  await e.context.createRequestFromCallShare();
  assert.strictEqual(JSON.parse(e.store[e.K.r]).length, 0, 'call-share must reject a device owned by another customer');
  assert.ok(e.alerts.some(x => /تابع لعميل آخر/.test(x)));
  e.controls.qoCustomer.value = 'c1';
  await e.context.createRequestFromCallShare();
  const [order] = JSON.parse(e.store[e.K.r]);
  assert.strictEqual(order.customerId, 'c1');
  assert.strictEqual(order.deviceId, 'd1');
  assert.strictEqual(e.context.location.href, `request.html?id=${order.id}`);
  assert.deepStrictEqual(e.removed, ['call-1']);
}

(async () => {
  await testGuestConversion();
  await testCallShare();
  console.log('guest-conversion-tests: PASS (atomic local save, retry idempotency, phone validation, and call-share ownership)');
})().catch(error => { console.error(error); process.exit(1); });
