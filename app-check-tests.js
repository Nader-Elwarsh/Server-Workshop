/* اختبارات app-check.js: نداء الدوال، الرجوع للمسار القديم، وتفعيل App Check عند وجود المفتاح */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(`${__dirname}/app-check.js`, 'utf8');

function env({ key = '', fetchImpl, withLib = true, tokenFails = false } = {}) {
  const calls = [], scripts = [], activated = [];
  class V3 { constructor(k) { this.k = k; this.kind = 'v3'; } }
  class Ent { constructor(k) { this.k = k; this.kind = 'enterprise'; } }
  const appObj = { options: { projectId: 'proj-x' }, appCheck: () => ({ activate: (p, auto) => activated.push({ p, auto }), getToken: async () => { if (tokenFails) throw new Error('no token'); return { token: 'TOK123' }; } }) };
  const firebase = { apps: [appObj], app: () => appObj };
  if (withLib) firebase.appCheck = { ReCaptchaV3Provider: V3, ReCaptchaEnterpriseProvider: Ent };
  const document = { head: { appendChild: (s) => { scripts.push(s); setTimeout(() => { if (!withLib) s.onerror && s.onerror(); else s.onload && s.onload(); }, 0); } }, createElement: () => ({}) };
  const window = { firebase, document, FIREBASE_APPCHECK_DEBUG_TOKEN: undefined };
  const ctx = { window, document, console: { warn() {} }, setTimeout, clearTimeout, AbortController, Promise, JSON, Object, Error, Array,
    fetch: async (url, init) => { calls.push({ url, init }); return fetchImpl(url, init); } };
  const code = src.replace('var SITE_KEY = "";', `var SITE_KEY = ${JSON.stringify(key)};`);
  vm.runInNewContext(code, ctx, { filename: 'app-check.js' });
  return { W: window.WFAppCheck, calls, scripts, activated, window, appObj };
}
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const eq = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
const fails = async (p, check) => { try { await p; } catch (e) { check(e); return; } assert.fail('expected rejection'); };

(async () => {
  // 1) من غير مفتاح: App Check متوقف تمامًا ومفيش تحميل مكتبة
  {
    const e = env({ fetchImpl: async () => resp(200, { result: { ok: 1 } }) });
    assert.strictEqual(e.W.isConfigured(), false);
    assert.strictEqual(await e.W.attach(e.appObj), false);
    assert.strictEqual(e.scripts.length, 0, 'no library is loaded without a key');
    eq(await e.W.headers(), {});
    eq(await e.W.call('portalLoginLookup', { phone: '010' }), { ok: 1 });
    const c = e.calls[0];
    assert.strictEqual(c.url, 'https://us-central1-proj-x.cloudfunctions.net/portalLoginLookup');
    assert.strictEqual(c.init.method, 'POST');
    eq(JSON.parse(c.init.body), { data: { phone: '010' } });
    assert.ok(!('X-Firebase-AppCheck' in c.init.headers));
  }
  // 2) تصنيف الأخطاء: fallback للمسار القديم أو رفض نهائي
  {
    const cases = [
      [() => resp(404, {}), 'fn/404', true], [() => resp(500, { error: { status: 'INTERNAL' } }), 'fn/internal', true],
      [() => resp(503, { error: { status: 'UNAVAILABLE' } }), 'fn/unavailable', true],
      [() => resp(429, { error: { status: 'RESOURCE_EXHAUSTED' } }), 'fn/resource_exhausted', false],
      [() => resp(400, { error: { status: 'INVALID_ARGUMENT' } }), 'fn/invalid_argument', false],
      [() => resp(403, { error: { status: 'PERMISSION_DENIED' } }), 'fn/permission_denied', false],
      [() => resp(412, { error: { status: 'FAILED_PRECONDITION' } }), 'fn/failed_precondition', false]
    ];
    for (const [mk, code, fb] of cases) {
      const e = env({ fetchImpl: async () => mk() });
      await fails(e.W.call('x', {}), (err) => { assert.strictEqual(err.code, code); assert.strictEqual(err.fallback, fb, code); });
    }
    const net = env({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
    await fails(net.W.call('x', {}), (err) => { assert.strictEqual(err.code, 'fn/network'); assert.strictEqual(err.fallback, true); });
    const nonJson = env({ fetchImpl: async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } }) });
    await fails(nonJson.W.call('x', {}), (err) => assert.strictEqual(err.fallback, true));
  }
  // 3) مع المفتاح: تفعيل reCAPTCHA v3 وإرسال التوكن في الهيدر
  {
    const e = env({ key: 'SITEKEY', fetchImpl: async () => resp(200, { result: { email: 'a@b.com' } }) });
    assert.strictEqual(e.W.isConfigured(), true);
    assert.strictEqual(await e.W.attach(e.appObj), true);
    assert.strictEqual(e.activated.length, 1); assert.strictEqual(e.activated[0].p.kind, 'v3'); assert.strictEqual(e.activated[0].p.k, 'SITEKEY'); assert.strictEqual(e.activated[0].auto, true);
    await e.W.attach(e.appObj); assert.strictEqual(e.activated.length, 1, 'same app is activated once');
    eq(await e.W.headers(), { 'X-Firebase-AppCheck': 'TOK123' });
    await e.W.call('portalLoginLookup', { phone: '010' });
    assert.strictEqual(e.calls[0].init.headers['X-Firebase-AppCheck'], 'TOK123');
  }
  // 4) مزوّد Enterprise، والتطبيق الثانوي (sec)
  {
    const e = env({ key: 'K2', fetchImpl: async () => resp(200, { result: {} }) });
    const code = src.replace('var SITE_KEY = "";', 'var SITE_KEY = "K2";').replace('var PROVIDER = "v3";', 'var PROVIDER = "enterprise";');
    const e2 = env({ key: 'K2', fetchImpl: async () => resp(200, { result: {} }) });
    // نعيد تشغيل الملف بمزوّد enterprise
    const act = []; const app2 = { options: { projectId: 'p' }, appCheck: () => ({ activate: (p) => act.push(p), getToken: async () => ({ token: 't' }) }) };
    class Ent { constructor(k) { this.kind = 'enterprise'; this.k = k; } } class V3 {}
    const w = { firebase: { apps: [app2], app: () => app2, appCheck: { ReCaptchaV3Provider: V3, ReCaptchaEnterpriseProvider: Ent } } };
    vm.runInNewContext(code, { window: w, document: { head: { appendChild: (s) => setTimeout(() => s.onload(), 0) }, createElement: () => ({}) }, console, setTimeout, clearTimeout, AbortController, Promise, JSON, Object, Error, Array, fetch: async () => resp(200, { result: {} }) });
    await w.WFAppCheck.attach(app2); const secondary = { options: {}, appCheck: () => ({ activate: (p) => act.push(p) }) }; await w.WFAppCheck.attach(secondary);
    eq(act.map((p) => p.kind), ['enterprise', 'enterprise']);
  }
  // 5) المكتبة ناقصة أو التوكن فشل: النظام يكمّل من غير App Check (مفيش كسر)
  {
    const e = env({ key: 'K', withLib: false, fetchImpl: async () => resp(200, { result: { ok: 1 } }) });
    assert.strictEqual(await e.W.attach(e.appObj), false);
    eq(await e.W.headers(), {});
    eq(await e.W.call('x', {}), { ok: 1 });
    const t = env({ key: 'K', tokenFails: true, fetchImpl: async () => resp(200, { result: { ok: 1 } }) });
    await t.W.attach(t.appObj);
    eq(await t.W.headers(), {}); eq(await t.W.call('x', {}), { ok: 1 });
  }
  // 6) ربط الصفحات: كل صفحة بتحمّل app-check.js قبل مكان تهيئة Firebase، والبوابة بتستخدم الدوال
  {
    const glob = fs.readdirSync(__dirname).filter((f) => f.endsWith('.html'));
    let sync = 0;
    for (const f of glob) {
      const h = fs.readFileSync(`${__dirname}/${f}`, 'utf8');
      if (/<script src="firebase-sync\.js"/.test(h)) { sync++; assert.ok(h.indexOf('app-check.js') > -1 && h.indexOf('app-check.js') < h.indexOf('firebase-sync.js'), `${f}: app-check.js before firebase-sync.js`); }
    }
    assert.ok(sync >= 20, 'staff pages found');
    for (const f of ['privacy.html', 'terms.html']) { const h = fs.readFileSync(`${__dirname}/${f}`, 'utf8'); assert.ok(h.indexOf('app-check.js') > -1 && h.indexOf('app-check.js') < h.indexOf('wl-public-init.js'), f); }
    const portal = fs.readFileSync(`${__dirname}/portal.html`, 'utf8');
    assert.ok(portal.indexOf('app-check.js') < portal.indexOf('firebase.initializeApp(window.WF_FIREBASE_CONFIG)'), 'portal loads app-check before init');
    assert.ok(/WFAppCheck\.call\("portalLoginLookup"/.test(portal) && /WFAppCheck\.call\("portalPhoneAvailable"/.test(portal));
    assert.ok(!/db\.collection\("phoneIndex"\)\.doc\(p\)\.get\(\)\.then\(function\(d\)\{if\(d\.exists\)throw\{code:"phone-exists"\}/.test(portal), 'signup pre-check no longer reads phoneIndex directly first');
    const sync2 = fs.readFileSync(`${__dirname}/firebase-sync.js`, 'utf8');
    assert.ok(/firebase\.initializeApp\(CFG\);\s*try \{ if \(window\.WFAppCheck\) WFAppCheck\.attach\(firebase\.app\(\)\)/.test(sync2));
    assert.ok(/WFAppCheck\.attach\(SEC\)/.test(sync2) && /WFAppCheck\.attach\(SEC\)/.test(fs.readFileSync(`${__dirname}/portal-admin.html`, 'utf8')));
    for (const [f, name] of [['service-worker.js', './app-check.js'], ['portal-sw.js', './app-check.js']]) assert.ok(fs.readFileSync(`${__dirname}/${f}`, 'utf8').includes(`"${name}"`), `${f} precaches app-check.js`);
    const idx = /const SITE_KEY|var SITE_KEY = "";/.test(src); assert.ok(idx, 'shipped with App Check disabled by default');
  }
  console.log('app-check-tests: PASS');
})().catch((e) => { console.error(e); process.exit(1); });
