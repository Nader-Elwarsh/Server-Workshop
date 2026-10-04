const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const { webcrypto } = require('crypto');
const data = new Map();
const localStorage = { getItem: k => data.has(k) ? data.get(k) : null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
const document = { readyState: 'complete', addEventListener() {}, getElementById() { return null; }, createElement() { return { click() {}, remove() {} }; } };
const window = { crypto: webcrypto, TextEncoder, TextDecoder };
const context = vm.createContext({ window, localStorage, document, crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob, navigator: {}, console, URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} }, Blob, confirm: () => true, prompt: () => '', setTimeout, Date, Math, Number, String, Object, Array, JSON, Promise });
vm.runInContext(fs.readFileSync('app-data-management.js', 'utf8'), context, { filename: 'app-data-management.js' });
const now = Date.now();
(async () => {
  const a = { wf_c: [{ id: '1', name: 'عميل' }], _meta: { exportedAt: new Date(now).toISOString() } };
  const b = { wf_c: [{ id: '1', name: 'عميل' }], _meta: { exportedAt: new Date(now + 5000).toISOString() } };
  const c = { wf_c: [{ id: '1', name: 'عميل آخر' }], _meta: { exportedAt: new Date(now + 5000).toISOString() } };
  const ha = await context.backupDataFingerprint(a), hb = await context.backupDataFingerprint(b), hc = await context.backupDataFingerprint(c);
  if (ha !== hb || ha === hc) throw new Error('fingerprint canonicalization failed');
  const encrypted = await context.encryptBackupData({ answer: 42 }, 'correct horse');
  const decrypted = await context.decryptBackupData(encrypted, 'correct horse');
  assert.strictEqual(decrypted.answer, 42, 'encrypted backup roundtrip');
  let hostileRejected = false;
  try { await context.decryptBackupData({ ...encrypted, iterations: 1000000000 }, 'correct horse'); } catch (_) { hostileRejected = true; }
  assert.ok(hostileRejected, 'untrusted encrypted backups must not select unbounded PBKDF2 work');
  let downloads = 0, approvals = 0, snapshots = 0;
  context.snapshotAllData = async () => { snapshots++; return c; };
  context.downloadBackupData = () => { downloads++; return true; };
  context.confirm = () => { approvals++; return true; };
  localStorage.setItem('wf_auto_backup_enabled', 'yes');
  localStorage.setItem('wf_auto_backup_data_hash', ha);
  localStorage.setItem('wf_auto_backup_last_check', '0');
  await context.runAutomaticBackupCheck();
  if (downloads !== 1 || approvals !== 1 || snapshots !== 1) throw new Error('changed data did not create one backup from a single snapshot');
  localStorage.setItem('wf_auto_backup_data_hash', hc);
  localStorage.setItem('wf_auto_backup_last_check', '0');
  await context.runAutomaticBackupCheck();
  if (downloads !== 1 || snapshots !== 2) throw new Error('unchanged data created a duplicate backup or repeated its snapshot');

  // مرة واحدة بس: قيمة "no" القديمة (قبل إصلاح "لا الآن") لازم تتشال
  // عشان يترجع يتسأل تاني، وبعدها القيمة الجديدة (سواء "no" أو "yes")
  // مايتلمسش تاني ولا مرة.
  localStorage.removeItem('wf_auto_backup_legacy_reset_done');
  localStorage.setItem('wf_auto_backup_enabled', 'no');
  context.migrateLegacyAutoBackupOptOut();
  if (localStorage.getItem('wf_auto_backup_enabled') !== null) throw new Error('legacy "no" was not cleared on first migration');
  if (localStorage.getItem('wf_auto_backup_legacy_reset_done') !== '1') throw new Error('legacy migration flag was not set');
  localStorage.setItem('wf_auto_backup_enabled', 'no');
  context.migrateLegacyAutoBackupOptOut();
  if (localStorage.getItem('wf_auto_backup_enabled') !== 'no') throw new Error('migration ran more than once and touched a deliberate later choice');

  console.log('automatic-backup-tests: PASS');
})().catch(err => { console.error(err); process.exit(1); });
