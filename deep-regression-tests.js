const fs = require('fs');
const vm = require('vm');
const store = new Map();
const localStorage = {
  getItem(k) { return store.has(k) ? store.get(k) : null; },
  setItem(k, v) { store.set(k, String(v)); },
  removeItem(k) { store.delete(k); },
};
const document = { addEventListener() {}, getElementById() { return null; }, querySelector() { return null; } };
const window = { addEventListener() {}, auditLog() {} };
const alerts = [];
const controls = {};
document.getElementById = id => controls[id] || null;
const context = vm.createContext({ window, localStorage, sessionStorage: localStorage, document, console, crypto: { randomUUID: () => 'test-' + Math.random() }, alert(message) { alerts.push(String(message)); }, confirm() { return true; }, prompt() { return 'test'; }, location: { href: '' }, setTimeout, clearTimeout, Date, Math, Number, String, Object, Array, JSON, Promise, URLSearchParams });
for (const file of ['shared-data.js', 'app-shared.js', 'app-requests.js', 'app-dashboard-reports.js', 'app-route-followup.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}
for (const name of ['K', 'arr', 'put', 'commitStorage', 'saveJSONSafe', 'withRollback', 'settings', 'id']) if (context.window[name]) context[name] = context.window[name];
context.id = context.id || (() => 'test-' + Math.random());
context.renderRequests = () => {};
context.renderDash = () => {};
context.requestProfile = () => {};
const K = context.window.K;
function set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
function get(k) { return JSON.parse(localStorage.getItem(k) || 'null'); }
function check(condition, message) { if (!condition) throw new Error(message); }

// Cancelling an order must persist the returned stock and movement.
set(K.p, [{ id: 'p1', name: 'Part', qty: 0, buy: 5, use: 10 }]);
set(K.m, []);
set(K.r, [{ id: 'r1', no: 'R1', status: 'جاري التنفيذ', parts: [{ partId: 'p1', qty: 2, buy: 5, cost: 5, sell: 10 }], closed: false, paid: false }]);
context.changeRequestStatus('r1', 'ملغي');
check(get(K.p)[0].qty === 2, 'cancel did not persist returned stock');
check(get(K.m).some(x => x.requestId === 'r1' && x.qty === 2), 'cancel did not persist stock movement');

// Re-opening must consume the same quantity again and persist it.
context.changeRequestStatus('r1', 'جديد');
check(get(K.p)[0].qty === 0, 'reopen did not persist stock deduction');
check(get(K.m).filter(x => x.requestId === 'r1').length === 2, 'reopen did not persist second stock movement');

// Piece quantities must be whole numbers in initial, edited, external, and detail-page entry.
controls.rPart={value:'p2'};controls.rPartQty={value:'1.5'};
set(K.p,[{id:'p2',name:'Part 2',qty:5,buy:5,use:10}]);set(K.m,[]);
set(K.r,[{id:'r2',status:'جاري التنفيذ',labor:20,parts:[],partsTotal:0,partsCost:0,total:20,deposit:0,closed:false,paid:false}]);
context.addPartToOrder();
check(get(K.p)[0].qty===5&&get(K.r)[0].parts.length===0,'fractional stock quantity must be rejected on order creation');
controls.rExtName={value:'قطعة خارجية'};controls.rExtBuy={value:'5'};controls.rExtSell={value:'10'};controls.rExtQty={value:'1.5'};
context.addExternalPartToOrder();
check(get(K.r)[0].parts.length===0,'fractional external quantity must be rejected on order creation');
context.updateOrderPartQty(0,'1.5');
check(alerts.some(x=>/عدد صحيح/.test(x)),'fractional order-line quantity edits must be rejected');
controls.rpPart={value:'p2'};controls.rpQty={value:'1.5'};
context.confirmAddPartToRequest('r2');
check(get(K.p)[0].qty===5&&get(K.m).length===0&&get(K.r)[0].parts.length===0,'fractional stock quantity must be rejected on an existing order');
controls.rpExtName={value:'قطعة خارجية'};controls.rpExtBuy={value:'5'};controls.rpExtSell={value:'10'};controls.rpExtQty={value:'1.5'};
context.confirmAddExternalPartToRequest('r2');
check(get(K.r)[0].parts.length===0,'fractional external quantity must be rejected on an existing order');
check(alerts.some(x=>/عدد صحيح/.test(x)),'fractional quantities need a useful validation message');

// Once a total is known, neither partial payment nor final close can silently over-collect.
set(K.r,[{id:'r3',status:'جاري التنفيذ',labor:10,partsTotal:40,total:50,deposit:45,closed:false,paid:false}]);
controls['qcLabor-r3']={value:'10'};controls['qcNewDeposit-r3']={value:'10'};controls['qcWallet-r3']={value:'محفظتي'};
context.confirmQuickPartialPayment('r3');
check(get(K.r)[0].deposit===45,'partial payment greater than known balance must be rejected');
set(K.r,[{id:'r4',status:'مكتمل',total:50,partsTotal:50,labor:0,deposit:75,closed:false,paid:false}]);
controls.rCloseWallet={value:'محفظتي'};controls['qcLabor-r4']={value:'0'};
context.markPaidAndClose('r4');
check(!get(K.r)[0].closed,'standard close must reject deposit greater than total');
context.confirmQuickClose('r4');
check(!get(K.r)[0].closed,'route quick close must reject deposit greater than total');
check(alerts.some(x=>/أكبر من إجمالي الأمر/.test(x)),'over-collection needs a clear repair message');

// Date-only values must remain local dates in report range checks.
const start = new Date(2026, 8, 20, 0, 0, 0, 0), end = new Date(2026, 8, 20, 23, 59, 59, 999);
check(context.inRange('2026-09-20', start, end), 'date-only report value shifted outside local day');

console.log('deep-regression-tests: PASS');
