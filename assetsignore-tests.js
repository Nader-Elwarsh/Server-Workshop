/* أي ملف بتحتاجه الصفحات أو الـservice worker لازم يتنشر: .assetsignore مايستبعدوش بالغلط (زي *-check.js كان هيستبعد app-check.js). */
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = __dirname;
const patterns = fs.readFileSync(path.join(root, '.assetsignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('!'));
const rx = (p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '(/.*)?$');
const rules = patterns.map(rx);
const ignored = (rel) => rules.some((r) => r.test(rel));

const INTENTIONAL = new Set(['debug-check.html', 'browser-interactive.html']); // صفحات تشخيص مقصود عدم نشرها
const needed = new Set();
for (const f of fs.readdirSync(root).filter((x) => x.endsWith('.html') && !INTENTIONAL.has(x))) {
  const h = fs.readFileSync(path.join(root, f), 'utf8');
  needed.add(f);
  for (const m of h.matchAll(/<(?:script|link|img)[^>]+(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
    const u = m[1];
    if (/^(https?:|\/\/|data:|mailto:|tel:)/.test(u) || u.includes('${')) continue;
    needed.add(u.replace(/^\.\//, ''));
  }
}
const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const core = sw.match(/const CORE_FILES\s*=\s*\[([\s\S]*?)\];/);
if (core) for (const m of core[1].matchAll(/"\.\/([^"]+)"/g)) needed.add(m[1]);
const psw = fs.readFileSync(path.join(root, 'portal-sw.js'), 'utf8');
for (const m of psw.matchAll(/"\.\/([^"]+)"/g)) needed.add(m[1]);

const blocked = [...needed].filter((f) => fs.existsSync(path.join(root, f)) && ignored(f));
assert.deepStrictEqual(blocked, [], '.assetsignore would exclude files the app needs: ' + blocked.join(', '));
// ولازم يفضل مستبعد الحاجات الحساسة/الداخلية
for (const f of ['functions/index.js', 'firestore.rules', 'firestore.rules.proposed', 'firebase.json', 'phone-lookup-tests.js', 'syntax-check.js', 'debug-check.html', 'README.md']) assert.ok(ignored(f), `${f} should stay unpublished`);
assert.ok(!ignored('app-check.js') && !ignored('firebase-sync.js') && !ignored('shared-data.js'));
console.log('assetsignore-tests: PASS (' + needed.size + ' referenced files checked)');
