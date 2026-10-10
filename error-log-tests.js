/* اختبارات error-log.js: خصوصية، تجميع، إرسال، وربط الصفحات */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(`${__dirname}/error-log.js`, 'utf8');
function makeEnv({ staff = true, online = true, commitFails = false, session = {} } = {}) {
  const listeners = {}, timers = [], writes = [], sess = Object.assign({}, session);
  const batch = { set: (ref, data, opts) => writes.push({ ref, data, opts }), delete() {}, commit: async () => { if (commitFails) throw new Error('offline'); return true; } };
  const db = { batch: () => batch, collection: (c) => ({ doc: (id) => ({ c, id }) }) };
  const fsFn = () => db; fsFn.FieldValue = { increment: (n) => ({ inc: n }) };
  const window = {
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    location: { pathname: '/customers.html' }, navigator: { onLine: online, userAgent: 'Mozilla/5.0 Test' },
    sessionStorage: { getItem: (k) => (k in sess ? sess[k] : null), setItem: (k, v) => { sess[k] = String(v); } },
    WFStorage: { getItem: (k) => (k === 'wf_is_staff_uid' && staff ? 'u1' : null) },
    firebase: { apps: [{}], auth: () => ({ currentUser: { uid: 'u1' } }), firestore: fsFn },
    document: { getElementById: () => null }, confirm: () => true
  };
  const ctx = { window, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {}, Date, JSON, Array, Object, String, RegExp, Promise, Error };
  vm.runInNewContext(src, ctx);
  return { W: window, window, timers, writes, sess, fire: (t, ev) => (listeners[t] || []).forEach((f) => f(ev)) };
}
const E = (e, message, stack = 'Error: x\n at fn (https://site/app-requests.js:120:5)') => ({ message, error: { message, stack }, filename: 'https://site/app-requests.js', target: e.window });
(async () => {
  { const e = makeEnv(); const ev = E(e, 'Cannot read x of ahmed@example.com phone 01012345678'); e.fire('error', ev); e.fire('error', ev);
    assert.strictEqual(e.W.WFErrorLog.pending(), 1); const q = JSON.parse(e.sess.wf_err_queue); assert.strictEqual(q[0].n, 2);
    assert.ok(!/ahmed|example\.com|01012345678/.test(JSON.stringify(q))); assert.strictEqual(q[0].page, 'customers.html');
    e.fire('error', E(e, 'y'.repeat(5000), 'z'.repeat(5000))); assert.ok(JSON.parse(e.sess.wf_err_queue).every((x) => x.msg.length <= 300 && x.stack.length <= 900)); }
  { const e = makeEnv(); for (const m of ['ResizeObserver loop limit exceeded', 'Script error.', '']) e.fire('error', E(e, m));
    e.fire('error', Object.assign(E(e, 'boom', 'at chrome-extension://abc/x.js:1:1'), { filename: 'chrome-extension://abc/x.js' }));
    e.fire('error', { message: 'img', target: { tagName: 'IMG' } }); assert.strictEqual(e.W.WFErrorLog.pending(), 0); }
  { const e = makeEnv(); for (let i = 0; i < 60; i++) e.fire('error', E(e, 'distinct ' + i + 'z'.repeat(i))); assert.ok(e.W.WFErrorLog.pending() <= 25); }
  { const e = makeEnv(); const ev = E(e, 'db error 42'); e.fire('error', ev); e.fire('error', ev);
    assert.strictEqual(await e.W.WFErrorLog.flush(), 1); const w = e.writes[0];
    assert.strictEqual(w.ref.c, 'clientErrors'); assert.ok(/^[a-z0-9]+_\d{8}$/.test(w.ref.id)); assert.strictEqual(w.opts.merge, true);
    assert.strictEqual(JSON.stringify(w.data.count), '{"inc":2}'); assert.ok(w.data.expireAt instanceof Date);
    assert.strictEqual(JSON.stringify(Object.keys(w.data).sort()), JSON.stringify(['at', 'count', 'expireAt', 'fp', 'kind', 'msg', 'page', 'stack', 'ua', 'uid']));
    assert.strictEqual(e.W.WFErrorLog.pending(), 0); }
  { const a = makeEnv({ staff: false }); a.fire('error', E(a, 'a b c')); assert.strictEqual(await a.W.WFErrorLog.flush(), 0); assert.strictEqual(a.writes.length, 0);
    const b = makeEnv({ online: false }); b.fire('error', E(b, 'off')); assert.strictEqual(await b.W.WFErrorLog.flush(), 0);
    const c = makeEnv({ commitFails: true }); c.fire('error', E(c, 'fail')); assert.strictEqual(await c.W.WFErrorLog.flush(), 0); assert.strictEqual(c.W.WFErrorLog.pending(), 1); }
  { const e = makeEnv(); e.fire('unhandledrejection', { reason: new Error('p') }); e.fire('unhandledrejection', { reason: 'plain' });
    assert.strictEqual(makeEnv({ session: e.sess }).W.WFErrorLog.pending(), 2); }
  { const e = makeEnv(); e.window.sessionStorage.setItem = () => { throw new Error('q'); }; e.window.sessionStorage.getItem = () => { throw new Error('d'); };
    e.fire('error', E(e, 'storage broken')); e.fire('unhandledrejection', { reason: null }); }
  { let staff = 0; for (const f of fs.readdirSync(__dirname).filter((x) => x.endsWith('.html'))) { const h = fs.readFileSync(`${__dirname}/${f}`, 'utf8');
      if (/<script src="firebase-sync\.js"/.test(h)) { staff++; assert.ok(h.includes('<meta charset="utf-8"><script src="error-log.js" defer></script>'), f); } else assert.ok(!h.includes('error-log.js'), f); }
    assert.ok(staff >= 20); const st = fs.readFileSync(`${__dirname}/settings.html`, 'utf8'); assert.ok(st.includes('clientErrorsResult') && st.includes('wfClearClientErrors()'));
    assert.ok(fs.readFileSync(`${__dirname}/service-worker.js`, 'utf8').includes('"./error-log.js"')); assert.ok(!/localStorage/.test(src)); }
  console.log('error-log-tests: PASS');
})().catch((e) => { console.error(e); process.exit(1); });
