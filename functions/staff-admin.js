"use strict";
/* إدارة المستخدمين والأدوار (المرحلة 1) — منطق صرف بدون اعتماد مباشر على firebase-functions،
   عشان يتختبر في Node بـmock للـAuth والـFirestore. كل العمليات (ما عدا sync) للمالك فقط. */
const core = require("./roles-core");

class AdminError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

const CONFIG_PATH = "accessConfig/roles";
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createStaffAdmin(deps) {
  const { auth, db, now = () => new Date(), randomInt, log = () => {} } = deps;
  const rnd = randomInt || ((n) => Math.floor(Math.random() * n));

  function genPassword(len = 12) {
    let s = "";
    for (let i = 0; i < len; i++) s += PASSWORD_ALPHABET[rnd(PASSWORD_ALPHABET.length)];
    return s;
  }

  async function loadConfig() {
    const snap = await db.doc(CONFIG_PATH).get();
    return snap.exists ? core.normalizeConfig(snap.data()) : core.defaultConfig();
  }
  async function ensureConfig() {
    const snap = await db.doc(CONFIG_PATH).get();
    if (snap.exists) return core.normalizeConfig(snap.data());
    const cfg = core.defaultConfig();
    await db.doc(CONFIG_PATH).set(Object.assign({}, cfg, { updatedAt: now().toISOString(), updatedBy: "system" }));
    return cfg;
  }
  async function audit(by, action, target, detail) {
    try { await db.collection("staffAudit").add({ at: now().toISOString(), by, action, target: target || null, detail: detail || null }); }
    catch (e) { log("audit failed", e && e.message); }
  }
  async function getStaff(uid) {
    const s = await db.doc(`staff/${uid}`).get();
    return s.exists ? s.data() : null;
  }
  async function requireStaff(uid) {
    const s = await getStaff(uid);
    if (!s || s.disabled === true) throw new AdminError("permission-denied", "not_staff");
    return s;
  }
  async function requireOwner(uid) {
    const s = await requireStaff(uid);
    const cfg = await loadConfig();
    if (!core.isOwner(cfg, s)) throw new AdminError("permission-denied", "owner_only");
    return { staff: s, cfg };
  }

  function cleanName(v) {
    const name = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
    if (!name || name.length > 60) throw new AdminError("invalid-argument", "bad_name");
    return name;
  }
  function cleanPassword(v) {
    const p = String(v == null ? "" : v);
    if (p.length < 8 || p.length > 64) throw new AdminError("invalid-argument", "bad_password");
    return p;
  }
  function cleanWallet(v) {
    const w = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
    if (w.length > 40) throw new AdminError("invalid-argument", "bad_wallet");
    return w;
  }
  async function assertWalletFree(wallet, exceptUid) {
    if (!wallet) return;
    const snap = await db.collection("staff").get();
    let clash = false;
    snap.forEach((d) => { if (d.id !== exceptUid && String((d.data() || {}).wallet || "").trim() === wallet) clash = true; });
    if (clash) throw new AdminError("already-exists", "wallet_taken");
  }
  async function pushClaims(uid, staff, cfg) {
    const perms = core.effectivePerms(cfg, staff);
    let existing = {};
    try { const u = await auth.getUser(uid); existing = (u && u.customClaims) || {}; } catch (_) {}
    const sc = core.scopeOf(cfg, staff) === "assigned" ? "a" : "w";
    await auth.setCustomUserClaims(uid, Object.assign({}, existing, { role: core.roleIdOf(staff), pm: core.toMask(perms), sc }));
    // نسخة من النطاق في مستند الموظف: قواعد Firestore بتقرأه من هنا (بيسري فورًا، مش بعد تجديد الـ token).
    await db.doc(`staff/${uid}`).set({ sc }, { merge: true });
    return perms;
  }
  async function activeOwners(cfg) {
    const snap = await db.collection("staff").get();
    const out = [];
    snap.forEach((d) => { if (core.isOwner(cfg, d.data())) out.push(d.id); });
    return out;
  }
  function profileOf(uid, staff, cfg) {
    const roleId = core.roleIdOf(staff);
    const role = cfg.roles[roleId];
    return { uid, name: staff.name || "", role: roleId, roleName: role ? role.name : roleId, allow: core.cleanKeys(staff.allow), deny: core.cleanKeys(staff.deny), disabled: staff.disabled === true, acl: core.managed(staff) ? 1 : 0, createdBy: staff.createdBy || "", scope: core.cleanScope(staff.scope), effectiveScope: core.scopeOf(cfg, staff), wallet: String(staff.wallet || "") };
  }

  /* أي موظف: يرجّع ملفه وصلاحياته، ويحدّث claims، ويرقّي مستند قديم لدور «مالك». */
  async function sync(uid) {
    let staff = await requireStaff(uid);
    const cfg = await ensureConfig();
    if (!core.managed(staff)) { // مستند قديم (مكتوب يدويًا): يترقّى لمالك مهما كان في حقل role
      staff = Object.assign({}, staff, { role: "owner", acl: 1 });
      await db.doc(`staff/${uid}`).set({ role: "owner", acl: 1, migratedAt: now().toISOString() }, { merge: true });
      await audit(uid, "migrate_legacy_owner", uid, null);
    }
    const perms = await pushClaims(uid, staff, cfg);
    return Object.assign(profileOf(uid, staff, cfg), { perms, isOwner: core.isOwner(cfg, staff), config: cfg });
  }

  async function list(uid) {
    const { cfg } = await requireOwner(uid);
    const snap = await db.collection("staff").get();
    const rows = [];
    snap.forEach((d) => rows.push({ uid: d.id, data: d.data() }));
    const authInfo = {};
    for (let i = 0; i < rows.length; i += 100) {
      const res = await auth.getUsers(rows.slice(i, i + 100).map((r) => ({ uid: r.uid })));
      (res.users || []).forEach((u) => { authInfo[u.uid] = u; });
    }
    return {
      config: cfg,
      users: rows.map((r) => {
        const u = authInfo[r.uid] || {};
        return Object.assign(profileOf(r.uid, r.data, cfg), {
          email: u.email || "", authDisabled: u.disabled === true,
          lastSignIn: (u.metadata && u.metadata.lastSignInTime) || null, createdAt: r.data.createdAt || (u.metadata && u.metadata.creationTime) || null,
          legacy: !core.managed(r.data), isSelf: r.uid === uid
        });
      }).sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email), "ar"))
    };
  }

  /* قائمة الفنيين لتعيينهم على الأوامر: لأي موظف عنده صلاحية تعيين فني (أو المالك). من غير إيميلات. */
  async function directory(uid) {
    const staff = await requireStaff(uid);
    const cfg = await loadConfig();
    const perms = core.effectivePerms(cfg, staff);
    if (!core.isOwner(cfg, staff) && perms.indexOf("requests.assign") < 0 && perms.indexOf("custody.approve") < 0 && perms.indexOf("custody.settle") < 0) throw new AdminError("permission-denied", "cannot_assign");
    const snap = await db.collection("staff").get();
    const users = [];
    snap.forEach((d) => {
      const x = d.data() || {};
      if (x.disabled === true) return;
      const roleId = core.roleIdOf(x), role = cfg.roles[roleId];
      users.push({ uid: d.id, name: x.name || "", role: roleId, roleName: role ? role.name : roleId, wallet: String(x.wallet || ""), scope: core.scopeOf(cfg, x) });
    });
    users.sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"));
    return { users };
  }

  async function create(uid, data) {
    const { cfg } = await requireOwner(uid);
    const email = String(data.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new AdminError("invalid-argument", "bad_email");
    const name = cleanName(data.name);
    const password = cleanPassword(data.password);
    const roleId = String(data.role || "");
    if (!cfg.roles[roleId]) throw new AdminError("invalid-argument", "bad_role");
    const wallet = cleanWallet(data.wallet);
    await assertWalletFree(wallet, null);
    let existing = null;
    try { existing = await auth.getUserByEmail(email); } catch (e) { if (!e || e.code !== "auth/user-not-found") throw e; }
    if (existing) throw new AdminError("already-exists", "email_exists");
    const created = await auth.createUser({ email, password, displayName: name, emailVerified: false, disabled: false });
    const staff = { name, role: roleId, acl: 1, allow: core.cleanKeys(data.allow), deny: core.cleanKeys(data.deny), disabled: false, createdAt: now().toISOString(), createdBy: uid };
    const sc = core.cleanScope(data.scope); if (sc) staff.scope = sc;
    if (wallet) staff.wallet = wallet;
    try {
      await db.doc(`staff/${created.uid}`).set(staff);
      await pushClaims(created.uid, staff, cfg);
    } catch (e) {
      try { await db.doc(`staff/${created.uid}`).delete(); } catch (_) {}
      try { await auth.deleteUser(created.uid); } catch (_) {}
      throw e;
    }
    await audit(uid, "create_user", created.uid, { email, role: roleId });
    return { uid: created.uid, email, name, role: roleId };
  }

  async function update(uid, data) {
    const { cfg } = await requireOwner(uid);
    const target = String(data.uid || "");
    if (!target) throw new AdminError("invalid-argument", "bad_uid");
    const stored = await getStaff(target);
    if (!stored) throw new AdminError("not-found", "no_such_user");
    const cur = core.managed(stored) ? stored : Object.assign({}, stored, { role: "owner" }); // مستند قديم = مالك
    const patch = {};
    if (data.name !== undefined) patch.name = cleanName(data.name);
    if (data.role !== undefined) {
      if (!cfg.roles[String(data.role)]) throw new AdminError("invalid-argument", "bad_role");
      patch.role = String(data.role);
    }
    if (data.allow !== undefined) patch.allow = core.cleanKeys(data.allow);
    if (data.deny !== undefined) patch.deny = core.cleanKeys(data.deny);
    if (data.disabled !== undefined) patch.disabled = data.disabled === true;
    if (data.scope !== undefined) patch.scope = core.cleanScope(data.scope); // "" = يرجع لنطاق الدور
    if (data.wallet !== undefined) { patch.wallet = cleanWallet(data.wallet); await assertWalletFree(patch.wallet, target); }
    if (!Object.keys(patch).length) throw new AdminError("invalid-argument", "nothing_to_update");
    patch.acl = 1; // أي مستند بيتعدّل من النظام يبقى «مُدار»
    if (patch.role === undefined && !core.managed(stored)) patch.role = "owner";
    const next = Object.assign({}, cur, patch);
    const wasOwner = core.isOwner(cfg, cur), willBeOwner = core.isOwner(cfg, next);
    if (target === uid && patch.disabled === true) throw new AdminError("failed-precondition", "cannot_disable_self");
    if (wasOwner && !willBeOwner) {
      const owners = await activeOwners(cfg);
      if (owners.filter((x) => x !== target).length === 0) throw new AdminError("failed-precondition", "last_owner");
    }
    patch.updatedAt = now().toISOString();
    patch.updatedBy = uid;
    await db.doc(`staff/${target}`).set(patch, { merge: true });
    const changedAccess = patch.role !== undefined || patch.allow !== undefined || patch.deny !== undefined || patch.disabled !== undefined || patch.scope !== undefined;
    if (changedAccess) await pushClaims(target, next, cfg);
    if (patch.disabled !== undefined) {
      await auth.updateUser(target, { disabled: patch.disabled === true });
      if (patch.disabled === true) await auth.revokeRefreshTokens(target);
    }
    await audit(uid, "update_user", target, { before: { role: core.roleIdOf(cur), disabled: cur.disabled === true }, after: { role: core.roleIdOf(next), disabled: next.disabled === true }, fields: Object.keys(patch).filter((k) => k !== "updatedAt" && k !== "updatedBy" && k !== "acl") });
    return profileOf(target, next, cfg);
  }

  async function resetPassword(uid, data) {
    await requireOwner(uid);
    const target = String(data.uid || "");
    const cur = target ? await getStaff(target) : null;
    if (!cur) throw new AdminError("not-found", "no_such_user");
    const password = data.password ? cleanPassword(data.password) : genPassword(12);
    await auth.updateUser(target, { password });
    await auth.revokeRefreshTokens(target);
    await audit(uid, "reset_password", target, null);
    return { uid: target, password };
  }

  async function saveRoles(uid, data) {
    const { cfg: oldCfg } = await requireOwner(uid);
    if (!data || typeof data.config !== "object" || !data.config) throw new AdminError("invalid-argument", "bad_config");
    const next = core.normalizeConfig(data.config);
    const snap = await db.collection("staff").get();
    const orphans = [];
    snap.forEach((d) => { const x = d.data(); if (core.managed(x) && x.role && !next.roles[x.role]) orphans.push(x.role); });
    if (orphans.length) throw new AdminError("failed-precondition", "role_in_use:" + Array.from(new Set(orphans)).join(","));
    next.version = (oldCfg.version || 1) + 1;
    await db.doc(CONFIG_PATH).set(Object.assign({}, next, { updatedAt: now().toISOString(), updatedBy: uid }));
    // حدّث claims كل المستخدمين بالمصفوفة الجديدة.
    const failures = [];
    for (const d of snap.docs || []) {
      try { await pushClaims(d.id, d.data(), next); } catch (e) { failures.push(d.id); }
    }
    await audit(uid, "save_roles", null, { version: next.version, roles: Object.keys(next.roles) });
    return { config: next, claimFailures: failures };
  }

  return { sync, list, directory, create, update, resetPassword, saveRoles, loadConfig, genPassword, AdminError };
}

module.exports = { createStaffAdmin, AdminError, CONFIG_PATH };
