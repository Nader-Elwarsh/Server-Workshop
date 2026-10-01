/* اختبار أداء شاشتي العملاء والأجهزة: ملخص + قائمة كاملة على بيانات كبيرة نسبيًا لازم يخلصوا بسرعة.
   (قبل الإصلاح كان الملخص بياخد ثواني لأن كل عميل/جهاز كان بيعيد قراءة كل الأوامر من التخزين). */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const store = {};
const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const C = [], D = [], R = [];
for (let i = 0; i < 300; i++) C.push({ id: 'c' + i, name: 'عميل ' + i, phone: '010' + i, createdAt: new Date(2026, 0, 1 + i % 200).toISOString(), mainAddress: { center: 'مركز', village: 'قرية' + i % 20 } });
for (let i = 0; i < 400; i++) D.push({ id: 'd' + i, customerId: 'c' + (i % 300), type: 'غسالة', brand: 'x' });
for (let i = 0; i < 1500; i++) R.push({ id: 'r' + i, customerId: 'c' + (i % 300), deviceId: 'd' + (i % 400), status: i % 4 ? 'مكتمل' : 'جديد', closed: !!(i % 4), total: 300, deposit: i % 7 ? 300 : 100, visit: new Date(2026, 8, 1 + i % 28).toISOString(), executionPlace: i % 9 ? 'المنزل' : 'الورشة', fault: 'عطل '.repeat(20), parts: [{ n: 'a' }, { n: 'b' }] });
store.wf_c = JSON.stringify(C); store.wf_d = JSON.stringify(D); store.wf_r = JSON.stringify(R);
const els = {}; const el = id => els[id] || (els[id] = { innerHTML: '', value: '', classList: { add() {}, remove() {}, contains() { return false; } }, style: {} });
const doc = { getElementById: el, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => el('x'), body: el('body'), documentElement: el('de') };
const ctx = { localStorage: ls, document: doc, console, location: { search: '', pathname: '/customers.html' }, navigator: {}, setTimeout, clearTimeout, Date, Map, Set, Object, JSON, Math, URLSearchParams, sessionStorage: ls, addEventListener() {}, matchMedia: () => ({ matches: false }) };
ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('shared-data.js', 'utf8'), ctx);
ctx.defineOverride = (n, f, fn) => { ctx[n] = fn; };
ctx.villageGroupOf = () => 'city'; ctx.addressText = a => (a && a.village) || ''; ctx.psActions = () => ''; ctx.worstRequestAgeInfo = () => null;
vm.runInContext(fs.readFileSync('workshop-mini-simple-ui.js', 'utf8').replace(/defineOverride\(/g, 'window.defineOverride('), ctx);
const time = fn => { const a = Date.now(); fn(); return Date.now() - a; };
const LIMIT = 400; // ms — هامش واسع جدًا (الفعلي عادةً أقل من 50ms)
const t1 = time(() => ctx.renderCustomers());
const t2 = time(() => ctx.renderDevices());
ctx.showAllCustomers(); const t3 = time(() => ctx.renderCustomers());
ctx.showAllDevices(); const t4 = time(() => ctx.renderDevices());
console.log('list-performance-tests: customers summary ' + t1 + 'ms, devices summary ' + t2 + 'ms, customers list ' + t3 + 'ms, devices list ' + t4 + 'ms');
[t1, t2, t3, t4].forEach(t => assert(t < LIMIT, 'list render too slow: ' + t + 'ms (limit ' + LIMIT + 'ms)'));
assert(/\d+/.test(els.customerList.innerHTML) && els.customerList.innerHTML.length > 500, 'customer list must render');
console.log('list-performance-tests: PASS');
