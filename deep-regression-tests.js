const fs = require('fs');
const vm = require('vm');
async function main(){
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
for (const file of ['shared-data.js', 'app-shared.js', 'app-requests.js', 'app-dashboard-reports.js', 'app-route-followup.js', 'app-devices.js', 'app-quick-add.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}
for (const name of ['K', 'arr', 'put', 'putAsync', 'commitStorage', 'commitStorageAsync', 'saveJSONSafe', 'withRollback', 'withRollbackAsync', 'settings', 'id']) if (context.window[name]) context[name] = context.window[name];
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
await context.changeRequestStatus('r1', 'ملغي');
check(get(K.p)[0].qty === 2, 'cancel did not persist returned stock');
check(get(K.m).some(x => x.requestId === 'r1' && x.qty === 2), 'cancel did not persist stock movement');

// Re-opening must consume the same quantity again and persist it.
await context.changeRequestStatus('r1', 'جديد');
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
await context.confirmAddPartToRequest('r2');
check(get(K.p)[0].qty===5&&get(K.m).length===0&&get(K.r)[0].parts.length===0,'fractional stock quantity must be rejected on an existing order');
controls.rpExtName={value:'قطعة خارجية'};controls.rpExtBuy={value:'5'};controls.rpExtSell={value:'10'};controls.rpExtQty={value:'1.5'};
await context.confirmAddExternalPartToRequest('r2');
check(get(K.r)[0].parts.length===0,'fractional external quantity must be rejected on an existing order');
check(alerts.some(x=>/عدد صحيح/.test(x)),'fractional quantities need a useful validation message');
controls.rpQty={value:'1'};
await context.confirmAddPartToRequest('r2');
check(get(K.p)[0].qty===4&&get(K.r)[0].parts.length===1&&get(K.m).length===1,'valid part addition must persist stock, movement, and order together');
controls.rpExtName={value:'قطعة خارجية'};controls.rpExtBuy={value:'5'};controls.rpExtSell={value:'10'};controls.rpExtQty={value:'1'};
await context.confirmAddExternalPartToRequest('r2');
check(get(K.r)[0].parts.length===2&&get(K.r)[0].parts[1].external,'valid external part must persist to IndexedDB-backed requests');
await context.changeRequestVisit('r2','2026-10-08');
await context.changeRequestFault('r2','عطل محدث');
await context.setWorkshopStatus('r2','تم السحب');
await context.setRouteContactStatus('r2','no-answer');
await context.toggleVisited('r2');
check(get(K.r)[0].visit==='2026-10-08'&&get(K.r)[0].fault==='عطل محدث'&&get(K.r)[0].workshopStatus==='تم السحب'&&get(K.r)[0].contactStatus==='no-answer'&&get(K.r)[0].visitedAt,'request detail and route updates must persist before resolving');

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

// Request persistence must reject missing/mismatched customer-device pairs and re-check live stock.
set(K.c,[{id:'c1',name:'عميل 1'},{id:'c2',name:'عميل 2'}]);
set(K.d,[{id:'d1',customerId:'c1',type:'غسالة'}]);set(K.p,[{id:'p3',qty:1,buy:5,use:10}]);set(K.m,[]);set(K.r,[]);
const baseRequest={customerId:'c2',deviceId:'d1',addressKey:'main',visit:'',status:'جديد',executionPlace:'عند العميل',workshopStatus:'غير مطلوب',partsWaiting:false,tag:'',fault:'اختبار',work:'',labor:0,parts:[],partsTotal:0,total:0,deposit:0,depositWallet:''};
let relationResult=await context.persistRequestRecord({...baseRequest});
check(!relationResult.ok&&/تابع لعميل آخر/.test(relationResult.error),"a request cannot reference another customer's device");
relationResult=await context.persistRequestRecord({...baseRequest,customerId:'c1',deviceId:'missing'});
check(!relationResult.ok&&/غير موجود/.test(relationResult.error),'a request cannot reference a missing device');
relationResult=await context.persistRequestRecord({...baseRequest,customerId:'c1',parts:[{partId:'p3',qty:2,sell:10,cost:5}],partsTotal:20,total:20});
check(!relationResult.ok&&/لم تعد متاحة/.test(relationResult.error),'final save rechecks current stock availability');
check(get(K.r).length===0&&get(K.p)[0].qty===1&&get(K.m).length===0,'failed order validation must not mutate stock, movement, or order data');
controls.qoCustomer={value:'c2'};controls.qoDevice={value:'d1'};controls.qoFault={value:'اختبار'};
context.quickCreateRequest();
check(get(K.r).length===0,'quick order creation must reject a customer/device mismatch too');
controls.qoCustomer={value:'missing'};
context.saveQuickDeviceHome();
context.rCustomer={value:'missing'};
context.saveQuickDevice();
check(get(K.d).length===1,'quick-device paths must reject a missing parent customer');

// A deposit is still permitted while the total is unknown (zero), then bounded after a total is known.
set(K.r,[{id:'r5',status:'جاري التنفيذ',labor:0,partsTotal:0,total:0,deposit:0,closed:false,paid:false}]);
controls['qcLabor-r5']={value:'0'};controls['qcNewDeposit-r5']={value:'20'};controls['qcWallet-r5']={value:'محفظتي'};
context.confirmQuickPartialPayment('r5');
check(get(K.r)[0].deposit===20,'pre-estimate deposits remain supported when the order total is unknown');

// Date-only values must remain local dates in report range checks.
const start = new Date(2026, 8, 20, 0, 0, 0, 0), end = new Date(2026, 8, 20, 23, 59, 59, 999);
check(context.inRange('2026-09-20', start, end), 'date-only report value shifted outside local day');

console.log('deep-regression-tests: PASS');
}
main().catch(error=>{console.error(error);process.exitCode=1});
