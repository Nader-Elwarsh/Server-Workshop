/* firebase-config.js: اختيار المشروع حسب الدومين، وعزل التجريبي عن الإنتاج. */
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const src = fs.readFileSync(`${__dirname}/firebase-config.js`, 'utf8');
function load(host, { stagingFilled = false, hosts = null } = {}) {
  let code = src;
  const EMPTY = 'var STAGING = { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" };';
  const FILLED = 'var STAGING = { apiKey: "K", authDomain: "s.firebaseapp.com", projectId: "stg-proj", storageBucket: "b", messagingSenderId: "1", appId: "1:1:web:x" };';
  assert.ok(/var STAGING = \{[^}]*\};/.test(code));
  if (stagingFilled !== 'real') code = code.replace(/var STAGING = \{[^}]*\};/, stagingFilled ? FILLED : EMPTY);
  if (hosts) code = code.replace('var STAGING_HOSTS = [];', 'var STAGING_HOSTS = ' + JSON.stringify(hosts) + ';');
  const inited = [], appended = [];
  const document = { readyState: 'complete', body: { appendChild: (e) => appended.push(e) }, getElementById: () => null, createElement: () => ({ style: {} }), addEventListener() {} };
  const w = { location: { hostname: host }, document, firebase: { apps: [], initializeApp: (c) => { inited.push(c); w.firebase.apps.push({}); }, app: () => ({ options: inited[0] }) } };
  vm.runInNewContext(code, { window: w });
  return { w, inited, appended };
}
// الإنتاج
for (const h of ['workshop.example.com', 'elwarsha.pages.dev', 'localhost', '', 'my-workshop.user.workers.dev']) {
  const e = load(h); assert.strictEqual(e.w.WF_ENV.name, 'production', h); assert.strictEqual(e.w.WF_FIREBASE_CONFIG.projectId, 'elwarsha-elfanya'); assert.strictEqual(e.appended.length, 0, 'no banner in production');
  e.w.wfFirebaseInit(); e.w.wfFirebaseInit(); assert.strictEqual(e.inited.length, 1, 'initialized once');
}
// التجريبي غير المجهّز: مفيش إعدادات أبدًا، ولا تهيئة، وشريط أحمر
for (const h of ['staging.example.com', 'staging-workshop.user.workers.dev', 'abc.staging.pages.dev', 'workshop-staging.example.com', 'STAGING.Example.com']) {
  const e = load(h); assert.strictEqual(e.w.WF_ENV.isStaging, true, h); assert.strictEqual(e.w.WF_FIREBASE_CONFIG, null, 'never falls back to production: ' + h);
  assert.strictEqual(e.w.wfFirebaseInit(), null); assert.strictEqual(e.inited.length, 0); assert.strictEqual(e.appended.length, 1); assert.ok(/غير مجهّزة/.test(e.appended[0].textContent));
}
// التجريبي المجهّز
{ const e = load('staging.example.com', { stagingFilled: true }); assert.strictEqual(e.w.WF_FIREBASE_CONFIG.projectId, 'stg-proj'); e.w.wfFirebaseInit(); assert.strictEqual(e.inited[0].projectId, 'stg-proj');
  assert.ok(/بيئة تجريبية/.test(e.appended[0].textContent)); assert.notStrictEqual(e.w.WF_FIREBASE_CONFIG.apiKey, load('x.com').w.WF_FIREBASE_CONFIG.apiKey); }
// دومين تجريبي مكتوب يدويًا، وكلمة staging جوه كلمة تانية (stagingarea) مش بتعتبر تجريبي
{ assert.strictEqual(load('preview.example.com', { hosts: ['preview.example.com'] }).w.WF_ENV.isStaging, true); assert.strictEqual(load('stagingarea.example.com').w.WF_ENV.isStaging, false); }
// مفيش إعدادات Firebase متكررة في أي مكان تاني، وكل الصفحات بتحمّل الملف قبل app-check
{ const offenders = [];
  for (const f of fs.readdirSync(__dirname).filter((n) => /\.(js|html)$/.test(n) && !n.startsWith('brand-') && !/test/.test(n) && n !== 'firebase-config.js')) if (/AIzaSy[\w-]{20,}|initializeApp\(\{/.test(fs.readFileSync(path.join(__dirname, f), 'utf8'))) offenders.push(f);
  assert.deepStrictEqual(offenders, [], 'hard-coded Firebase config found in: ' + offenders.join(', '));
  let pages = 0; for (const f of fs.readdirSync(__dirname).filter((n) => n.endsWith('.html'))) { const h = fs.readFileSync(path.join(__dirname, f), 'utf8'); if (!h.includes('app-check.js')) continue; pages++;
    assert.ok(h.indexOf('firebase-config.js') > -1 && h.indexOf('firebase-config.js') < h.indexOf('app-check.js'), f); }
  assert.ok(pages >= 30);
  for (const f of ['service-worker.js', 'portal-sw.js']) assert.ok(fs.readFileSync(path.join(__dirname, f), 'utf8').includes('./firebase-config.js'), f);
  const sync = fs.readFileSync(`${__dirname}/firebase-sync.js`, 'utf8'); assert.ok(/var CFG = window\.WF_FIREBASE_CONFIG/.test(sync) && /if \(!CFG\) \{[\s\S]*?return;\s*\}/.test(sync)); }
// الإعدادات الحقيقية للتجريبي المدخلة في الملف: مشروع تجريبي مختلف عن الإنتاج وكل القيم متسقة
{ const m = src.match(/var STAGING = (\{[^}]*\});/); const c = vm.runInNewContext('(' + m[1] + ')'); const prod = vm.runInNewContext('(' + src.match(/var PROD = (\{[^}]*\});/)[1] + ')');
  assert.ok(/staging/.test(c.projectId) && c.projectId !== prod.projectId && c.apiKey !== prod.apiKey && c.appId !== prod.appId);
  assert.strictEqual(c.authDomain, c.projectId + '.firebaseapp.com'); assert.ok(c.storageBucket.startsWith(c.projectId)); assert.ok(c.appId.startsWith('1:' + c.messagingSenderId + ':web:')); assert.ok(/^AIza[\w-]{35}$/.test(c.apiKey), 'apiKey format');
  const e = load('staging.example.com', { stagingFilled: 'real' }); }
console.log('firebase-config-tests: PASS');
