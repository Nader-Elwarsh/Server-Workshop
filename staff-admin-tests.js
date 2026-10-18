// اختبارات دوال إدارة المستخدمين والأدوار (functions/staff-admin.js) بـmock للـAuth وFirestore.
const assert = require('assert');
const { createStaffAdmin, AdminError } = require('./functions/staff-admin');
const core = require('./functions/roles-core');

function makeEnv(seedStaff) {
  const docs = new Map(), audit = [];
  Object.keys(seedStaff || {}).forEach((uid) => docs.set('staff/' + uid, seedStaff[uid]));
  const users = new Map(), claims = {}, revoked = [];
  let seq = 0;
  const auth = {
    async getUser(uid) { if (!users.has(uid)) throw { code: 'auth/user-not-found' }; return Object.assign({ customClaims: claims[uid] || {} }, users.get(uid)); },
    async getUserByEmail(email) { for (const u of users.values()) if (u.email === email) return u; throw { code: 'auth/user-not-found' }; },
    async createUser(p) { const uid = 'NEW' + (++seq); users.set(uid, { uid, email: p.email, displayName: p.displayName, disabled: !!p.disabled, password: p.password }); return { uid }; },
    async updateUser(uid, p) { users.set(uid, Object.assign({}, users.get(uid) || { uid }, p)); },
    async deleteUser(uid) { users.delete(uid); },
    async setCustomUserClaims(uid, c) { claims[uid] = c; },
    async revokeRefreshTokens(uid) { revoked.push(uid); },
    async getUsers(ids) { return { users: ids.map((i) => users.get(i.uid)).filter(Boolean) }; }
  };
  const snapOf = (entries) => ({ docs: entries.map(([id, data]) => ({ id, data: () => data })), forEach(fn) { this.docs.forEach(fn); } });
  const db = {
    doc(path) {
      return {
        async get() { return docs.has(path) ? { exists: true, data: () => JSON.parse(JSON.stringify(docs.get(path))) } : { exists: false }; },
        async set(data, opts) { docs.set(path, opts && opts.merge ? Object.assign({}, docs.get(path) || {}, data) : data); },
        async delete() { docs.delete(path); }
      };
    },
    collection(name) {
      return {
        async get() { const out = []; for (const [p, d] of docs) if (p.startsWith(name + '/')) out.push([p.slice(name.length + 1), d]); return snapOf(out); },
        async add(d) { if (name === 'staffAudit') audit.push(d); }
      };
    }
  };
  let tick = 0;
  const admin = createStaffAdmin({ auth, db, now: () => new Date(1700000000000 + (++tick) * 1000), randomInt: (n) => (++seq * 7) % n });
  return { admin, docs, users, claims, revoked, audit, auth };
}
async function rejects(promise, code, msg) {
  try { await promise; } catch (e) { assert(e instanceof AdminError, 'expected AdminError, got ' + (e && e.stack)); assert.strictEqual(e.code, code, 'code ' + e.code + ' != ' + code + ' (' + e.message + ')'); if (msg) assert(String(e.message).includes(msg), e.message); return; }
  assert.fail('expected rejection ' + code);
}

(async () => {
  // ---- sync: موظف قديم من غير role يترقّى لمالك، وتتكتب claims، وتتولّد الإعدادات الافتراضية ----
  let t = makeEnv({ boss: { name: 'المالك' } });
  t.users.set('boss', { uid: 'boss', email: 'boss@x.com' });
  let p = await t.admin.sync('boss');
  assert.strictEqual(p.role, 'owner'); assert.strictEqual(p.isOwner, true); assert.strictEqual(p.perms.length, core.KEYS.length);
  assert.strictEqual(t.docs.get('staff/boss').role, 'owner', 'legacy doc migrated');
  assert.strictEqual(t.claims.boss.role, 'owner'); assert.strictEqual(t.claims.boss.pm, core.toMask(core.KEYS));
  assert(t.docs.has('accessConfig/roles'), 'default config created');
  assert(t.audit.some((a) => a.action === 'migrate_legacy_owner'));
  await rejects(t.admin.sync('stranger'), 'permission-denied', 'not_staff');

  // ---- create: المالك فقط، تحقق من المدخلات، الإيميل المكرر ----
  const mk = await t.admin.create('boss', { email: ' Tech@Example.com ', name: 'أحمد الفني', password: 'secret123', role: 'tech', deny: ['devices.add', 'nonsense.key'], allow: ['reports.view'] });
  assert.strictEqual(mk.email, 'tech@example.com');
  const sd = t.docs.get('staff/' + mk.uid);
  assert.deepStrictEqual([sd.role, sd.allow, sd.deny, sd.disabled], ['tech', ['reports.view'], ['devices.add'], false]);
  const techPerms = core.fromMask(t.claims[mk.uid].pm);
  assert(techPerms.includes('reports.view') && !techPerms.includes('devices.add') && techPerms.includes('requests.view'), 'claims mask = role + overrides');
  assert(!techPerms.includes('wallets.view'), 'tech has no wallet access by default');
  await rejects(t.admin.create('boss', { email: 'tech@example.com', name: 'x', password: 'secret123', role: 'tech' }), 'already-exists');
  await rejects(t.admin.create('boss', { email: 'bad', name: 'x', password: 'secret123', role: 'tech' }), 'invalid-argument', 'bad_email');
  await rejects(t.admin.create('boss', { email: 'a@b.co', name: '', password: 'secret123', role: 'tech' }), 'invalid-argument', 'bad_name');
  await rejects(t.admin.create('boss', { email: 'a@b.co', name: 'x', password: 'short', role: 'tech' }), 'invalid-argument', 'bad_password');
  await rejects(t.admin.create('boss', { email: 'a@b.co', name: 'x', password: 'secret123', role: 'ghost' }), 'invalid-argument', 'bad_role');
  await rejects(t.admin.create(mk.uid, { email: 'z@z.co', name: 'z', password: 'secret123', role: 'tech' }), 'permission-denied', 'owner_only'); // الفني مش مالك
  assert.strictEqual(t.users.size, 2, 'failed creates leave no auth users');

  // ---- فشل كتابة مستند الموظف يرجّع حساب Auth (rollback) ----
  const t3 = makeEnv({ boss: {} });
  const realDoc = t3.docs.set.bind(t3.docs);
  t3.docs.set = (k, v) => { if (k.startsWith('staff/NEW')) throw new Error('boom'); return realDoc(k, v); };
  await assert.rejects(t3.admin.create('boss', { email: 'r@r.co', name: 'r', password: 'secret123', role: 'tech' }), /boom/);
  assert.strictEqual(t3.users.size, 0, 'auth user rolled back');

  // ---- update: دور/استثناءات/إيقاف + حمايات ----
  const up = await t.admin.update('boss', { uid: mk.uid, role: 'manager', allow: [], deny: [] });
  assert.strictEqual(up.role, 'manager'); assert(core.fromMask(t.claims[mk.uid].pm).includes('customers.delete'));
  await t.admin.update('boss', { uid: mk.uid, disabled: true });
  assert.strictEqual(t.users.get(mk.uid).disabled, true); assert(t.revoked.includes(mk.uid));
  await rejects(t.admin.sync(mk.uid), 'permission-denied'); // الموقوف مش موظف فعّال
  await t.admin.update('boss', { uid: mk.uid, disabled: false });
  assert.strictEqual(t.users.get(mk.uid).disabled, false);
  await rejects(t.admin.update('boss', { uid: 'boss', disabled: true }), 'failed-precondition', 'cannot_disable_self');
  await rejects(t.admin.update('boss', { uid: 'boss', role: 'tech' }), 'failed-precondition', 'last_owner');
  await rejects(t.admin.update('boss', { uid: 'nobody', name: 'x' }), 'not-found');
  await rejects(t.admin.update('boss', { uid: mk.uid }), 'invalid-argument', 'nothing_to_update');
  await rejects(t.admin.update(mk.uid, { uid: 'boss', name: 'hack' }), 'permission-denied'); // مدير مش مالك
  // مالك تاني يسمح بتنزيل الأول
  const o2 = await t.admin.create('boss', { email: 'o2@x.com', name: 'مالك تاني', password: 'secret123', role: 'owner' });
  await t.admin.update('boss', { uid: 'boss', role: 'manager' });
  await rejects(t.admin.update('boss', { uid: 'boss', name: 'x' }), 'permission-denied', 'owner_only'); // بعد التنزيل مبقاش مالك
  await t.admin.update(o2.uid, { uid: 'boss', role: 'owner' }); // يرجّعه

  // ---- resetPassword ----
  const rp = await t.admin.resetPassword('boss', { uid: mk.uid });
  assert(/^[A-Za-z0-9]{12}$/.test(rp.password) && !/[Il1O0]/.test(rp.password), 'generated password readable');
  assert.strictEqual(t.users.get(mk.uid).password, rp.password);
  assert(!JSON.stringify(t.audit).includes(rp.password), 'password never logged');
  await rejects(t.admin.resetPassword('boss', { uid: 'nobody' }), 'not-found');
  await rejects(t.admin.resetPassword('boss', { uid: mk.uid, password: 'abc' }), 'invalid-argument', 'bad_password');

  // ---- saveRoles: المالك يتثبت، دور مستخدم لا يتحذف، claims تتحدّث ----
  const cfg = core.defaultConfig();
  cfg.roles.owner.perms = ['customers.view']; // محاولة تقليل صلاحيات المالك
  cfg.roles.manager.perms = ['customers.view'];
  cfg.roles.r_new = { name: '  فني   أول  ', perms: ['requests.view', 'bogus'] }; cfg.order.push('r_new');
  const sv = await t.admin.saveRoles('boss', { config: cfg });
  assert.strictEqual(sv.config.roles.owner.perms.length, core.KEYS.length, 'owner stays full');
  assert.strictEqual(sv.config.roles.r_new.name, 'فني أول'); assert.deepStrictEqual(sv.config.roles.r_new.perms, ['requests.view']);
  assert.strictEqual(sv.config.version, 2);
  assert.deepStrictEqual(core.fromMask(t.claims[mk.uid].pm), ['customers.view'], 'manager claims refreshed after matrix change');
  const cfg2 = JSON.parse(JSON.stringify(sv.config)); delete cfg2.roles.manager; cfg2.order = cfg2.order.filter((x) => x !== 'manager');
  await rejects(t.admin.saveRoles('boss', { config: cfg2 }), 'failed-precondition', 'role_in_use:manager');
  await rejects(t.admin.saveRoles('boss', { config: null }), 'invalid-argument');
  await rejects(t.admin.saveRoles(mk.uid, { config: cfg }), 'permission-denied');

  // ---- list ----
  const ls = await t.admin.list('boss');
  assert.strictEqual(ls.users.length, 3); assert(ls.users.every((u) => u.email), 'emails resolved from auth'); assert(ls.users.some((u) => u.isSelf && u.uid === 'boss'));
  await rejects(t.admin.list(mk.uid), 'permission-denied');

  // ---- حساب قديم مكتوب يدويًا وفيه role غريب (admin): مالك، مش بيتقفل عليه النظام ----
  const L = makeEnv({ old: { name: 'قديم', role: 'admin' } });
  L.users.set('old', { uid: 'old', email: 'old@x.com' });
  const lp = await L.admin.sync('old');
  assert.strictEqual(lp.role, 'owner'); assert.strictEqual(lp.isOwner, true); assert.strictEqual(lp.acl, 1);
  assert.deepStrictEqual([L.docs.get('staff/old').role, L.docs.get('staff/old').acl], ['owner', 1], 'stray role overwritten by migration');
  // مالك قديم تاني لسه من غير ترحيل: update عليه ما يتعاملش معاه كمدير
  const L2 = makeEnv({ a: { role: 'admin' }, b: { role: 'staff' } });
  L2.users.set('a', { uid: 'a', email: 'a@x.com' }); L2.users.set('b', { uid: 'b', email: 'b@x.com' });
  const lst = await L2.admin.list('a'); assert(lst.users.every((u) => u.legacy && u.role === 'owner'), 'unmanaged docs listed as legacy owners');
  await L2.admin.update('a', { uid: 'b', name: 'ب' });
  assert.deepStrictEqual([L2.docs.get('staff/b').role, L2.docs.get('staff/b').acl], ['owner', 1], 'name-only update keeps legacy doc an owner');
  await L2.admin.update('a', { uid: 'b', role: 'tech' }); // a لسه مالك فينفع
  assert.strictEqual(L2.docs.get('staff/b').role, 'tech');
  await rejects(L2.admin.update('a', { uid: 'a', role: 'tech' }), 'failed-precondition', 'last_owner'); // a آخر مالك (وهو قديم)


  // ---- المرحلة أ: نطاق البيانات + محفظة العهدة + قائمة الفنيين ----
  let T = makeEnv({ boss: { name: 'المالك' } }); T.users.set('boss', { uid: 'boss', email: 'boss@x.com' });
  await T.admin.sync('boss');
  const t1 = await T.admin.create('boss', { email: 't1@x.com', name: 'أحمد', password: 'secret123', role: 'tech', wallet: '  عهدة   أحمد ' });
  assert.strictEqual(T.docs.get('staff/' + t1.uid).wallet, 'عهدة أحمد', 'wallet normalized');
  assert.strictEqual(T.claims[t1.uid].sc, 'w', 'default scope = whole workshop');
  await rejects(T.admin.create('boss', { email: 't2@x.com', name: 'محمد', password: 'secret123', role: 'tech', wallet: 'عهدة أحمد' }), 'already-exists', 'wallet_taken');
  const t2 = await T.admin.create('boss', { email: 't2@x.com', name: 'محمد', password: 'secret123', role: 'tech', scope: 'assigned' });
  assert.strictEqual(T.claims[t2.uid].sc, 'a', 'user-level override -> assigned');
  // scope على الدور
  const cfg0 = await T.admin.loadConfig(); const cfg1 = JSON.parse(JSON.stringify(cfg0)); cfg1.roles.tech.scope = 'assigned';
  const svr = await T.admin.saveRoles('boss', { config: cfg1 });
  assert.strictEqual(svr.config.roles.tech.scope, 'assigned');
  assert.strictEqual(T.claims[t1.uid].sc, 'a', 'role scope pushed to claims on save');
  await T.admin.update('boss', { uid: t1.uid, scope: 'all' });
  assert.strictEqual(T.claims[t1.uid].sc, 'w', 'per-user override beats role'); 
  await T.admin.update('boss', { uid: t1.uid, scope: '' });
  assert.strictEqual(T.claims[t1.uid].sc, 'a', 'empty override -> follow role');
  assert.strictEqual(T.docs.get('staff/' + t1.uid).sc, 'a', 'scope mirrored into the staff doc (Firestore rules read it)');
  assert.strictEqual(T.docs.get('staff/' + t2.uid).sc, 'a');
  await T.admin.update('boss', { uid: t1.uid, scope: 'all' });
  assert.strictEqual(T.docs.get('staff/' + t1.uid).sc, 'w', 'mirror follows override');
  await T.admin.update('boss', { uid: t1.uid, scope: '' });
  assert.strictEqual(T.claims.boss && (await T.admin.sync('boss')).effectiveScope, 'all'); // المالك دايمًا all
  // update wallet: يمنع التكرار ويسمح بالمسح
  await rejects(T.admin.update('boss', { uid: t2.uid, wallet: 'عهدة أحمد' }), 'already-exists', 'wallet_taken');
  await T.admin.update('boss', { uid: t1.uid, wallet: '' }); assert.strictEqual(T.docs.get('staff/' + t1.uid).wallet, '');
  await rejects(T.admin.update('boss', { uid: t1.uid, wallet: 'x'.repeat(41) }), 'invalid-argument', 'bad_wallet');
  // directory: المالك + اللي عنده requests.assign فقط، والموقوفين مش بيظهروا، من غير إيميلات
  let dir = await T.admin.directory('boss');
  assert(dir.users.some((u) => u.uid === t1.uid && u.scope === 'assigned') && dir.users.every((u) => !('email' in u)));
  await rejects(T.admin.directory(t1.uid), 'permission-denied', 'cannot_assign');
  await T.admin.update('boss', { uid: t1.uid, allow: ['requests.assign'] });
  dir = await T.admin.directory(t1.uid); assert(dir.users.length >= 3, 'tech with requests.assign can list staff');
  await T.admin.update('boss', { uid: t2.uid, disabled: true });
  dir = await T.admin.directory('boss'); assert(!dir.users.some((u) => u.uid === t2.uid), 'disabled staff hidden from directory');
  // المدير الافتراضي: يعيّن فنيين لكن مش بيعتمد/يسوّي عهدة
  const mg = await T.admin.create('boss', { email: 'm@x.com', name: 'مدير', password: 'secret123', role: 'manager' });
  const mp = core.fromMask(T.claims[mg.uid].pm);
  assert(mp.includes('requests.assign') && !mp.includes('custody.approve') && !mp.includes('custody.settle'), 'manager defaults: assign yes, custody approve/settle no');

  // ---- حذف نهائي: مش نفسك، مش آخر مالك، وبيمسح حساب الدخول ومستند الموظف ----
  {
    const tD = makeEnv({ boss: {} });
    const vic = await tD.admin.create('boss', { email: 'del@x.co', name: 'مؤقت', password: 'secret123', role: 'tech' });
    await rejects(tD.admin.remove('boss', { uid: 'boss' }), 'failed-precondition', 'cannot_delete_self');
    await rejects(tD.admin.remove(vic.uid, { uid: 'boss' }), 'permission-denied', 'owner_only');
    const out = await tD.admin.remove('boss', { uid: vic.uid });
    assert.strictEqual(out.deleted, true); assert(!tD.users.has(vic.uid), 'auth user deleted'); assert(!tD.docs.get('staff/' + vic.uid), 'staff doc deleted');
    await rejects(tD.admin.remove('boss', { uid: vic.uid }), 'not-found', 'no_such_user');
    assert(tD.audit.some((x) => x.action === 'delete_user'));
  }
  // ---- سجل المراجعة بيسجّل كل عملية ----
  const actions = t.audit.map((a) => a.action);
  ['create_user', 'update_user', 'reset_password', 'save_roles'].forEach((a) => assert(actions.includes(a), 'audit has ' + a));
  console.log('staff-admin-tests: PASS (sync/migrate، create+rollback، update+حمايات آخر مالك، reset، saveRoles، list، audit)');
})().catch((e) => { console.error(e); process.exit(1); });
