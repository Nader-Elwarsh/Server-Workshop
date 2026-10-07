const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, 'app-lock.js'), 'utf8');
const values = new Map();
const session = new Map();
const docListeners = {};
const windowListeners = {};
let promptAnswers = [];
let alerts = [];
let deleteCalls = 0;
const localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); }
};
const sessionStorage = {
  getItem(key) { return session.has(key) ? session.get(key) : null; },
  setItem(key, value) { session.set(key, String(value)); },
  removeItem(key) { session.delete(key); }
};
const document = {
  body: { appendChild() {} },
  documentElement: { appendChild() {} },
  createElement() { return { style: {}, setAttribute() {}, appendChild() {}, textContent: '', id: '' }; },
  getElementById() { return null; },
  addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); }
};
const context = {
  document, localStorage, WFStorage: localStorage, sessionStorage, Uint32Array,
  crypto: { getRandomValues(target) { target.set([101, 202, 303]); return target; } },
  prompt() { return promptAnswers.length ? promptAnswers.shift() : null; },
  alert(message) { alerts.push(String(message)); },
  setTimeout() { return 1; }, clearTimeout() {},
  deleteAllCustomers() { deleteCalls++; return 'deleted'; }
};
context.window = context;
context.window.addEventListener = (type, fn) => { (windowListeners[type] ||= []).push(fn); };
vm.runInNewContext(source, context, { filename: 'app-lock.js' });

assert(context.WFLock.isSet() === false, 'a PIN should not be required before the user configures one');
context.WFLock.setPin('2468');
assert(context.WFLock.isSet(), 'setting a PIN should enable the local lock');
assert(context.WFLock.verify('2468'), 'the configured PIN should verify');
assert(!context.WFLock.verify('1111'), 'an incorrect PIN should fail verification');
assert(context.WFLock.entryLockEnabled(), 'entry lock should default to enabled after PIN setup');
assert(context.WFLock.deleteLockEnabled(), 'sensitive-delete lock should default to enabled after PIN setup');

// The delete guard is installed only after the page's functions exist.
for (const fn of docListeners.DOMContentLoaded || []) fn();
promptAnswers = ['wrong'];
assert.strictEqual(context.deleteAllCustomers(), undefined, 'wrong PIN must prevent a sensitive delete');
assert.strictEqual(deleteCalls, 0, 'the original destructive operation must not run after a wrong PIN');
promptAnswers = ['2468'];
assert.strictEqual(context.deleteAllCustomers(), 'deleted', 'the correct PIN should permit the guarded operation');
assert.strictEqual(deleteCalls, 1, 'the operation should execute exactly once after authorization');

// Five consecutive failures must activate the documented temporary cooldown.
for (let i = 0; i < 5; i++) {
  promptAnswers = ['bad'];
  context.WFLock.requirePin('test');
}
promptAnswers = ['2468'];
assert.strictEqual(context.WFLock.requirePin('test'), false, 'cooldown must reject even the correct PIN');
assert(alerts.some(message => message.includes('30 ثانية')), 'cooldown should provide a clear user notice');

// Check each employee page uses the synchronous local guard; public/customer pages are excluded.
const publicPages = new Set(['login.html', 'privacy.html', 'terms.html', 'portal.html', 'portal-admin.html', 'share-target.html', 'browser-interactive.html', 'debug-check.html']);
for (const name of fs.readdirSync(__dirname).filter(name => name.endsWith('.html') && !publicPages.has(name))) {
  const html = fs.readFileSync(path.join(__dirname, name), 'utf8');
  if (!html.includes('<body')) continue;
  const body = html.slice(html.indexOf('<body'));
  assert(body.includes('<script src="app-lock.js"></script>'), `${name} must synchronously install the local lock on internal pages`);
  assert(!body.includes('<script src="app-lock.js" defer>'), `${name} must not defer its early lock guard`);
}

const rules = fs.readFileSync(path.join(__dirname, 'firestore.rules'), 'utf8');
assert.strictEqual(fs.readFileSync(path.join(__dirname, 'firestore.rules.proposed'), 'utf8'), rules, 'the proposed rules file must not diverge from the canonical secured rules');
assert(/function\s+isStaff\s*\(/.test(rules), 'Firestore rules must define a staff authorization predicate');
assert(/allow\s+read,\s*write:\s*if\s+isStaff\(\)/.test(rules), 'staff-only cloud writes must remain protected by the staff predicate');
assert(/match\s+\/staff\//.test(rules), 'staff membership must be represented in Firestore rules');
assert(/match\s+\/\{collection\}\/\{document=\*\*\}[\s\S]*?isStaff\(\)\s*&&\s*collection\s*!=\s*'staff'/.test(rules), 'the catch-all rule must never grant staff-document writes');
assert(!/match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+isStaff\(\)/.test(rules), 'an unscoped catch-all must not overlap the staff allowlist');
assert(/function\s+own\(customerId\)[\s\S]*?data\.get\('disabled',\s*false\)\s*!=\s*true/.test(rules), 'disabled linked identities must lose all customer-data access');
assert(/function\s+completedOrderForCustomer/.test(rules) && /request\.resource\.data\.customerId\s*==\s*get\(orderRef\(request\.resource\.data\.orderId\)\)\.data\.customerId/.test(rules), 'complaints must reference a completed order belonging to the same customer');
assert(/match\s+\/portalOrders\/\{id\}[\s\S]*?allow\s+read:\s*if\s+own\(resource\.data\.customerId\)\s*;/.test(rules), 'portal order projection must be read-only to the customer');
const sync = fs.readFileSync(path.join(__dirname, 'firebase-sync.js'), 'utf8');
assert(/collection\("staff"\)\.doc\(user\.uid\)\.get\(\{\s*source:\s*"server"\s*\}\)/.test(sync), 'employee UI must verify staff membership from the server');
assert(!/ls\.getItem\(STAFF\)\s*===\s*user\.uid\s*\?\s*Promise\.resolve\(true\)/.test(sync), 'a cached employee UID must not bypass server authorization');
assert(!/consider old employee|نعتبره موظف قديم/.test(sync), 'unknown/authenticated users must not be promoted to staff by fallback');
assert(/if\s*\(hydrated\s*&&\s*ls\.getItem\("wf_is_staff_uid"\)\s*===\s*user\.uid\)/.test(sync), 'offline cached data must at least be bound to the previously verified staff UID');
assert(/if\s*\(!isLogin\s*&&\s*!fastHint\(\)\)\s*cover\(/.test(sync), 'internal app pages must stay covered unless a fresh server-verified staff check exists');
assert(/STAFF_TTL\s*=/.test(sync) && /function\s+staffFresh\s*\(/.test(sync), 'instant-open path must be bounded by a staff verification TTL');
assert(/lockDenied\(false\)/.test(sync), 'background staff re-check must lock the UI when membership was revoked');
assert(/if\s*\(hydrated\s*&&\s*staffFresh\(user\.uid\)\)/.test(sync), 'instant open must require hydrated data and a fresh verification for the same uid');
assert(/typeof firebase === "undefined"[\s\S]*?wfCloudCover/.test(sync), 'missing Firebase SDK must fail closed on internal pages');
assert(!/navigator\.onLine\s*===\s*false\s*&&\s*ls\.getItem\(HYD\)\)\s*\{\s*ready\s*=\s*false;\s*uncover\(\)/.test(sync), 'anonymous offline sessions must never uncover the staff data');
console.log('permission-tests: PASS (PIN, delete gate, cooldown, Firestore owner rules, staff allowlist, server-verified UI gate)');
