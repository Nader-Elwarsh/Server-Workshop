// اختبارات كتالوج الصلاحيات والأدوار (roles-core.js) وتركيبها في الصفحات.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('./roles-core');

// نسخة الدوال لازم تتطابق حرفيًا
assert.strictEqual(fs.readFileSync('roles-core.js', 'utf8'), fs.readFileSync('functions/roles-core.js', 'utf8'), 'functions/roles-core.js must be an exact copy of roles-core.js');

// الكتالوج: مفاتيح فريدة وبصيغة صحيحة
assert.strictEqual(new Set(core.KEYS).size, core.KEYS.length, 'duplicate permission keys');
core.KEYS.forEach((k) => { assert(/^[a-z]+\.[a-z]+$/.test(k), 'bad key ' + k); assert(core.LABELS[k], 'missing label ' + k); });
// ترتيب الكتالوج للإضافة فقط: أول 10 مفاتيح مثبتة (لو اتغيّرت الـmask القديمة في التوكنات هتبوظ)
assert.deepStrictEqual(core.KEYS.slice(0, 6), ['customers.view', 'customers.add', 'customers.edit', 'customers.delete', 'customers.merge', 'devices.view']);

// كل الإشارات للصلاحيات صحيحة
const known = new Set(core.KEYS);
Object.entries(core.PAGES).forEach(([f, k]) => { assert(known.has(k), f + ' -> unknown ' + k); assert(fs.existsSync(f), 'PAGES refers to missing file ' + f); });
Object.entries(core.FORMS).forEach(([id, s]) => { assert(known.has(s.add) && known.has(s.edit), id); assert(fs.existsSync(s.page), s.page); });
Object.entries(core.ACTIONS).forEach(([n, r]) => (r.all || r.any).forEach((k) => assert(known.has(k), n + ' -> unknown ' + k)));
Object.entries(core.SAVE_EDIT).forEach(([n, r]) => r.forEach((k) => assert(known.has(k), n + ' -> unknown ' + k)));

// كل دالة محمية لازم تكون معرّفة فعلًا في كود التطبيق (عشان الحراسة ماتبقاش على اسم ميت بعد تغيير اسم دالة)
const src = fs.readdirSync('.').filter((f) => /\.js$/.test(f) && !/(tests?|check|smoke)\b|^brand-|^roles-core|^users-page|^app-permissions/.test(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const names = Object.keys(core.ACTIONS).concat(Object.keys(core.SAVE_EDIT));
const dead = names.filter((n) => !new RegExp('(?:function\\s+' + n + '\\s*\\(|window\\.' + n + '\\s*=|\\b' + n + '\\s*=\\s*(?:async\\s*)?(?:function|\\())').test(src));
assert.deepStrictEqual(dead, [], 'guarded functions not defined anywhere: ' + dead.join(', '));

// الأدوار الافتراضية
const cfg = core.defaultConfig();
assert.deepStrictEqual(cfg.order, ['owner', 'manager', 'tech']);
assert.strictEqual(cfg.roles.owner.perms.length, core.KEYS.length); assert(cfg.roles.owner.locked);
['wallets', 'treasury'].forEach((g) => { assert(!cfg.roles.tech.perms.some((k) => k.startsWith(g + '.')), 'tech must not touch ' + g); });
assert(!cfg.roles.tech.perms.includes('customers.view') && !cfg.roles.tech.perms.includes('data.wipe'));
assert(cfg.roles.manager.perms.includes('wallets.view') && !cfg.roles.manager.perms.includes('wallets.edit') && !cfg.roles.manager.perms.includes('data.wipe'));
Object.values(cfg.roles).forEach((r) => r.perms.forEach((k) => assert(known.has(k))));

// normalizeConfig: المالك ثابت، تنظيف، أسماء، fallback
assert.deepStrictEqual(core.normalizeConfig(null), cfg); assert.deepStrictEqual(core.normalizeConfig({ roles: 5 }), cfg);
const n = core.normalizeConfig({ version: 4, order: ['x', 'tech', 'Bad Id'], roles: { owner: { name: 'المالك الكبير', perms: [] }, tech: { name: '  ', perms: ['requests.view', 'requests.view', 'nope'] }, 'Bad Id': { name: 'x' }, ok_1: { name: 'A'.repeat(100), perms: 'x' } } });
assert.strictEqual(n.roles.owner.perms.length, core.KEYS.length); assert.strictEqual(n.roles.owner.name, 'المالك الكبير');
assert.strictEqual(n.roles.tech.name, 'tech'); assert.deepStrictEqual(n.roles.tech.perms, ['requests.view']);
assert.strictEqual(n.roles.ok_1.name.length, 40); assert(!n.roles['Bad Id']); assert.strictEqual(n.version, 4);
assert(n.order.includes('owner') && n.order.indexOf('tech') < n.order.indexOf('ok_1'));

// effectivePerms
assert.strictEqual(core.effectivePerms(cfg, { name: 'قديم' }).length, core.KEYS.length, 'legacy staff doc = owner');
assert.strictEqual(core.effectivePerms(cfg, { role: 'owner', disabled: true }).length, 0, 'disabled has nothing');
assert.strictEqual(core.effectivePerms(cfg, null).length, 0);
assert.strictEqual(core.effectivePerms(cfg, { role: 'deleted_role', acl: 1 }).length, 0, 'managed doc with unknown role has nothing');
assert.strictEqual(core.effectivePerms(cfg, { role: 'admin' }).length, core.KEYS.length, 'hand-written doc with a stray role field (e.g. admin) = legacy owner, never locked out');
assert.strictEqual(core.effectivePerms(cfg, { role: 'tech' }).length, core.KEYS.length, 'unmanaged doc ignores role even if it names a real role');
assert(core.managed({ acl: 1 }) && core.managed({ createdBy: 'u1' }) && !core.managed({ role: 'tech' }) && !core.managed(null));
const tp = core.effectivePerms(cfg, { role: 'tech', acl: 1, allow: ['wallets.view', 'junk'], deny: ['requests.close'] });
assert(tp.includes('wallets.view') && !tp.includes('requests.close') && tp.includes('requests.view'));
assert.strictEqual(core.effectivePerms(cfg, { role: 'owner', deny: ['data.wipe'] }).includes('data.wipe'), true, 'owner cannot be reduced by overrides');
assert(core.isOwner(cfg, {}) && core.isOwner(cfg, { role: 'owner' }) && core.isOwner(cfg, { role: 'admin' }) && !core.isOwner(cfg, { role: 'tech', acl: 1 }) && !core.isOwner(cfg, { role: 'owner', disabled: true }));

// mask round-trip
[[], core.KEYS, tp, ['customers.view'], ['data.wipe']].forEach((l) => assert.deepStrictEqual(core.fromMask(core.toMask(l)), core.KEYS.filter((k) => l.includes(k))));
assert(core.toMask(core.KEYS).length <= 20, 'mask stays tiny for the token claim limit');

// satisfies
const set = { 'a.b': 1, 'c.d': 1 };
assert(core.satisfies(set, 'a.b') && !core.satisfies(set, 'x.y') && core.satisfies(set, { all: ['a.b', 'c.d'] }) && !core.satisfies(set, { all: ['a.b', 'x.y'] }) && core.satisfies(set, { any: ['x.y', 'c.d'] }) && !core.satisfies(set, { any: ['x.y'] }));

// تركيب الحراسة: بيتحمّل تلقائيًا من firebase-sync.js (مش من كل صفحة) ومش بيتحمّل في الدخول
const fsrc = fs.readFileSync('firebase-sync.js', 'utf8');
assert(/if \(!isLogin && !window\.WFPerm\) loadScript\("roles-core\.js"\)\.then\(function \(\) \{ return window\.WFRoles \? loadScript\("app-permissions\.js"\) : null; \}\);/.test(fsrc), 'firebase-sync.js must lazy-load roles-core.js then app-permissions.js (not on login)');
assert(fsrc.indexOf('firebase.initializeApp(CFG);') < fsrc.indexOf('loadScript("roles-core.js")'), 'permissions load after Firebase init');
const pages = fs.readdirSync('.').filter((f) => f.endsWith('.html'));
const staffPages = pages.filter((f) => fs.readFileSync(f, 'utf8').includes('firebase-sync.js') && f !== 'login.html');
assert(staffPages.length >= 27, 'staff pages must all load firebase-sync.js: ' + staffPages.length);
pages.forEach((f) => assert(!fs.readFileSync(f, 'utf8').includes('app-permissions.js'), f + ' must not include app-permissions.js directly (loaded by firebase-sync.js; avoids double load)'));
const withPerm = staffPages.length;
['portal.html', 'login.html'].forEach((f) => assert(!fs.readFileSync(f, 'utf8').includes('app-permissions.js'), f + ' must not load staff permissions'));
// الصفحات الجديدة متخزنة للأوفلاين
const sw = fs.readFileSync('service-worker.js', 'utf8');
['users.html', 'users-page.js', 'roles-core.js', 'app-permissions.js', 'dispatch.html', 'dispatch-page.js', 'app-tech-assign.js'].forEach((f) => assert(sw.includes('"./' + f + '"'), f + ' must be in service worker CORE_FILES'));
// كارت الإدارة في الرئيسية للمالك فقط
assert(/href="users\.html"[^>]*data-owner-only/.test(fs.readFileSync('index.html', 'utf8')));
// نطاق البيانات (المرحلة أ): الافتراضي all، المالك دايمًا all، استثناء المستخدم يغلب الدور، والكتالوج للإضافة فقط
const cfgS = core.defaultConfig(); cfgS.roles.tech.scope = 'assigned';
assert.strictEqual(core.scopeOf(cfgS, { role: 'tech', acl: 1 }), 'assigned');
assert.strictEqual(core.scopeOf(cfgS, { role: 'tech', acl: 1, scope: 'all' }), 'all');
assert.strictEqual(core.scopeOf(cfgS, { role: 'owner', acl: 1, scope: 'assigned' }), 'all');
assert.strictEqual(core.scopeOf(core.defaultConfig(), { role: 'tech', acl: 1 }), 'all');
assert.strictEqual(core.normalizeConfig({ roles: { owner: { name: 'm', perms: [], scope: 'assigned' } } }).roles.owner.scope, 'all');
assert.strictEqual(core.normalizeConfig({ roles: { x1: { name: 'x', perms: [], scope: 'bogus' } } }).roles.x1.scope, 'all');
assert.deepStrictEqual(core.KEYS.slice(-3), ['requests.assign', 'custody.approve', 'custody.settle'], 'new perms appended at the end (masks stay valid)');
assert.strictEqual(core.KEYS.indexOf('data.wipe'), 49, 'older indexes unchanged');
assert.deepStrictEqual(core.fromMask(core.toMask(core.KEYS.slice(0, 50))).length, 50, 'old 50-bit masks still decode');
assert.strictEqual(core.PAGES['dispatch.html'], 'requests.assign');
console.log('roles-core-tests: PASS (' + core.KEYS.length + ' صلاحية، ' + Object.keys(core.PAGES).length + ' صفحة، ' + names.length + ' دالة محمية، ' + withPerm + ' صفحة مركّب عليها)');
