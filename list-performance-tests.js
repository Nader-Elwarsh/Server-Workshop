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
ctx.window = ctx; ctx.WFStorage = ls; ctx.self = ctx; vm.createContext(ctx);
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
// Inventory card rendering must count exits with one movement-index build, not
// filter the complete movement history once for every part in the list.
const inventoryParts = Array.from({ length: 180 }, (_, i) => ({ id: 'p' + i, name: 'قطعة ' + i, category: 'اختبار', qty: 5, min: 1, buy: 2, use: 4 }));
store.wf_p = JSON.stringify(inventoryParts);
let movementFilters = 0;
let inventoryMoves = Array.from({ length: 1080 }, (_, i) => ({ id: 'm' + i, partId: 'p' + (i % inventoryParts.length), type: 'خروج', qty: 1, at: new Date().toISOString() }));
inventoryMoves.push({ id: 'inbound', partId: 'p0', type: 'دخول', qty: 20, at: new Date().toISOString() });
inventoryMoves.filter = function (fn, thisArg) { movementFilters++; return Array.prototype.filter.call(this, fn, thisArg); };
const originalArrCached = ctx.arrCached;
ctx.arrCached = key => key === 'wf_m' ? inventoryMoves : originalArrCached(key);
ctx.categoryColorClass = () => '';
ctx.categoryIcon = () => '<svg></svg>';
ctx.showAllParts();
assert.ok(els.partList.innerHTML.includes('استُخدم 6 مرة'), 'part usage count should include only outbound inventory movements');
assert.strictEqual(movementFilters, 0, 'part list should not filter the full movement history once per rendered part');
inventoryMoves = [{ id: 'new-out', partId: 'p0', type: 'خروج', qty: 1, at: new Date().toISOString() }];
inventoryMoves.filter = function (fn, thisArg) { movementFilters++; return Array.prototype.filter.call(this, fn, thisArg); };
ctx.renderParts();
assert.ok(els.partList.innerHTML.includes('استُخدم 1 مرة'), 'movement index should refresh when the stored movement array changes');
assert.strictEqual(movementFilters, 0, 'updated inventory list should still use indexed movement counts');
console.log('list-performance-tests: PASS');
