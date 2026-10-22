/* اختبارات دوال البحث بالتليفون (functions/phone-lookup.js) بقاعدة بيانات وهمية في الذاكرة */
const assert = require('assert');
const { createPhoneHandlers, normalizePhone, PhoneError } = require('./functions/phone-lookup');

function fakeDb(seed = {}, opts = {}) {
  const store = new Map(Object.entries(seed));
  const ref = (col, id) => ({
    path: `${col}/${id}`,
    get: async () => ({ exists: store.has(`${col}/${id}`), data: () => store.get(`${col}/${id}`) })
  });
  const db = {
    collection: (col) => ({ doc: (id) => ref(col, id) }),
    runTransaction: async (fn) => {
      if (opts.failTransactions) throw new Error('store down');
      const tx = {
        get: async (r) => ({ exists: store.has(r.path), data: () => store.get(r.path) }),
        set: (r, v) => store.set(r.path, v),
        update: (r, v) => store.set(r.path, Object.assign({}, store.get(r.path), v))
      };
      return fn(tx);
    }
  };
  return { db, store };
}
const rejects = async (p, code) => { try { await p; } catch (e) { assert.ok(e instanceof PhoneError, 'must be PhoneError'); assert.strictEqual(e.code, code); return; } assert.fail('expected ' + code); };
const req = (phone, extra = {}) => Object.assign({ data: { phone }, appVerified: true, origin: 'https://app.test', ip: '1.1.1.1' }, extra);

(async () => {
  // 1) تطبيع الأرقام (نفس منطق المتصفح)
  assert.strictEqual(normalizePhone('01012345678'), '01012345678');
  assert.strictEqual(normalizePhone('٠١٠١٢٣٤٥٦٧٨'), '01012345678');
  assert.strictEqual(normalizePhone('+20 101 234 5678'), '01012345678');
  assert.strictEqual(normalizePhone('0020 1012345678'), '01012345678');
  assert.strictEqual(normalizePhone('1012345678'), '01012345678');
  for (const bad of ['', null, undefined, '0131234567', '12345', '010123456789', 'abc', '01312345678']) assert.strictEqual(normalizePhone(bad), '', `bad: ${bad}`);

  const seed = { 'phoneIndex/01012345678': { email: 'a@b.com', uid: 'u1' }, 'phoneIndex/01112345678': { email: '01112345678@phone.elwarsha.app', uid: 'u2' }, 'phoneIndex/01212345678': { email: 'garbage', uid: 'u3' } };

  // 2) البحث: موجود / غير موجود / بيانات تالفة
  {
    const { db } = fakeDb(seed); const h = createPhoneHandlers({ db });
    assert.deepStrictEqual(await h.lookup(req('01012345678')), { email: 'a@b.com' });
    assert.deepStrictEqual(await h.lookup(req('٠١١١٢٣٤٥٦٧٨')), { email: '01112345678@phone.elwarsha.app' });
    assert.deepStrictEqual(await h.lookup(req('01512345678')), { email: null });
    assert.deepStrictEqual(await h.lookup(req('01212345678')), { email: null }, 'malformed stored email is never returned');
    await rejects(h.lookup(req('123')), 'invalid-argument');
    await rejects(h.lookup({ data: null, appVerified: true, origin: '', ip: 'x' }), 'invalid-argument');
  }
  // 3) فحص التوفّر
  {
    const { db } = fakeDb(seed); const h = createPhoneHandlers({ db });
    assert.deepStrictEqual(await h.available(req('01012345678')), { available: false });
    assert.deepStrictEqual(await h.available(req('01512345678')), { available: true });
    await rejects(h.available(req('bad')), 'invalid-argument');
  }
  // 4) Origin المسموح
  {
    const { db } = fakeDb(seed); const h = createPhoneHandlers({ db, allowedOrigins: () => ['https://app.test'] });
    await h.lookup(req('01012345678'));
    await rejects(h.lookup(req('01012345678', { origin: 'https://evil.test' })), 'permission-denied');
    await rejects(h.lookup(req('01012345678', { origin: '' })), 'permission-denied');
    const open = createPhoneHandlers({ db, allowedOrigins: () => [] });
    await open.lookup(req('01012345678', { origin: '' }));
  }
  // 5) App Check: وضع المراقبة مقبول، وضع الإلزام بيرفض غير المعتمد
  {
    const { db } = fakeDb(seed);
    const soft = createPhoneHandlers({ db, enforceAppCheck: () => false });
    await soft.lookup(req('01012345678', { appVerified: false }));
    const hard = createPhoneHandlers({ db, enforceAppCheck: () => true });
    await hard.lookup(req('01012345678', { appVerified: true }));
    await rejects(hard.lookup(req('01012345678', { appVerified: false })), 'failed-precondition');
    await rejects(hard.available(req('01012345678', { appVerified: false })), 'failed-precondition');
  }
  // 6) حد الطلبات: لكل رقم، لكل IP، وإعادة الضبط بعد انتهاء المدة
  {
    let t = 1_000_000; const { db } = fakeDb(seed);
    const h = createPhoneHandlers({ db, now: () => t, limits: { lookupPerPhone: { limit: 3, windowMs: 1000 }, lookupPerIp: { limit: 5, windowMs: 1000 }, availablePerIp: { limit: 2, windowMs: 1000 } } });
    for (let i = 0; i < 3; i++) await h.lookup(req('01012345678', { ip: 'ip' + i }));
    await rejects(h.lookup(req('01012345678', { ip: 'fresh' })), 'resource-exhausted');          // نفس الرقم من IP جديد
    await h.lookup(req('01112345678', { ip: 'a' }));                                               // رقم تاني لسه مسموح
    for (let i = 0; i < 5; i++) await h.lookup(req('0151234567' + i, { ip: 'same' }));
    await rejects(h.lookup(req('01512345679', { ip: 'same' })), 'resource-exhausted');            // نفس الـIP عدّى 5 طلبات
    t += 1001;
    await h.lookup(req('01012345678', { ip: 'fresh' }));                                           // اتصفّر بعد المدة
    await h.available(req('01012345678', { ip: 'z' })); await h.available(req('01012345678', { ip: 'z' }));
    await rejects(h.available(req('01012345678', { ip: 'z' })), 'resource-exhausted');
  }
  // 7) عطل مخزن العدّادات مايوقفش تسجيل الدخول
  {
    const { db } = fakeDb(seed, { failTransactions: true }); const logs = [];
    const h = createPhoneHandlers({ db, log: (...a) => logs.push(a.join(' ')) });
    assert.deepStrictEqual(await h.lookup(req('01012345678')), { email: 'a@b.com' });
    assert.ok(logs.length >= 1);
  }
  // 8) مفاتيح العدّاد مش بتخزّن رقم التليفون ولا الـIP صريحين
  {
    const { db, store } = fakeDb(seed); const h = createPhoneHandlers({ db });
    await h.lookup(req('01012345678', { ip: '203.0.113.9' }));
    const keys = [...store.keys()].filter((k) => k.startsWith('rateLimits/'));
    assert.ok(keys.length === 2 && keys.every((k) => !k.includes('01012345678') && !k.includes('203.0.113.9')), keys.join());
    assert.ok([...store.entries()].filter(([k]) => k.startsWith('rateLimits/')).every(([, v]) => v.expireAt instanceof Date));
  }
  // طلب الزائر من السيرفر: الحقول بتتنضف، المرجع بيتولد، والحد لكل رقم
  {
    const { db, store } = fakeDb();
    const h = createPhoneHandlers({ db, allowedOrigins: () => ['https://app.test'], serverTime: () => 'TS' });
    const g = (extra) => req('01012345678', { data: Object.assign({ phone: '01012345678', name: 'أحمد', center: 'مطاي', village: '', street: 'شارع المستشفى', deviceType: 'غسالة', fault: 'مبتصفيش', loc: { lat: 28.1, lng: 30.7, evil: 1 } }, extra || {}) });
    const r1 = await h.guest(g());
    assert.ok(/^G-[A-HJ-NP-Z2-9]{6}$/.test(r1.ref));
    const doc = store.get('guestRequests/' + r1.ref);
    assert.strictEqual(doc.ref, r1.ref); assert.strictEqual(doc.handled, false); assert.strictEqual(doc.guest, true); assert.strictEqual(doc.createdAt, 'TS'); assert.deepStrictEqual(doc.loc, { lat: 28.1, lng: 30.7, acc: 0 });
    await rejects(h.guest(g({ fault: 'x' })), 'invalid-argument');
    await h.guest(g()); await h.guest(g());
    await rejects(h.guest(g()), 'resource-exhausted');
  }
  console.log('phone-lookup-tests: PASS');
})().catch((e) => { console.error(e); process.exit(1); });
