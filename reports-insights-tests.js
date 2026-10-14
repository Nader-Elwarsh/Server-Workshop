/* reports-insights-tests.js — الإضافات الجديدة في صفحة التقارير: المقارنة بالفترة اللي فاتت، التحصيل والمديونية،
   أداء الفنيين، المرتجعات والإلغاء، الاستهلاك الفعلي للمخزن (خروج − إرجاع)، واستبعاد الأصناف المؤرشفة. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, 'reports.js'), 'utf8');
const now = new Date(), y = now.getFullYear(), m = now.getMonth();
const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const at = (mm, dd, h = 12) => new Date(y, mm, dd, h).toISOString();
const D3 = at(m, 3), D4 = at(m, 4), D6 = at(m, 6), P10 = at(m - 1, 10);
const records = {
  orders: [
    { id: 'a', no: 'A1', customerId: 'c1', deviceId: 'd1', createdAt: at(m, 1), closedAt: D4, closed: true, status: 'مكتمل', labor: 200, partsTotal: 100, partsCost: 60, total: 300, techName: 'حسن', techPay: 50,
      statusHistory: [{ from: 'مكتمل', to: 'جاري التنفيذ', at: D3, note: 'مرتجع (كان مغلقًا): نفس العطل رجع' }] },
    { id: 'b', no: 'B1', customerId: 'c1', deviceId: 'd2', createdAt: at(m, 2), closedAt: D6, closed: true, status: 'مكتمل', labor: 100, partsTotal: 0, partsCost: 0, total: 100, techName: 'سيد', fault: 'مش بتبرد', visit: at(m, 3), visitedAt: at(m, 5) },
    { id: 'L', no: 'L1', customerId: 'c2', deviceId: 'd1', createdAt: at(m, 2), closedAt: D6, closed: true, status: 'مكتمل', labor: 50, partsTotal: 100, partsCost: 120, total: 150, techName: 'حسن', techPay: 40, fault: 'الطلمبة بايظة', parts: [{ name: 'طلمبة', qty: 1 }], visit: at(m, 2, 18), visitedAt: at(m, 2, 17) },
    { id: 'w', no: 'W1', customerId: 'c1', deviceId: 'd2', createdAt: at(m, 5), closed: false, status: 'جديد', fault: 'مش بتبرد!!' },
    { id: 'v', no: 'V1', customerId: 'c2', deviceId: 'd2', createdAt: at(m, 2), closed: false, status: 'ملغي', cancelReason: 'السعر عالي على العميل', visitedAt: at(m, 3), statusHistory: [{ from: 'جاري التنفيذ', to: 'ملغي', at: D4 }] },
    { id: 'c', no: 'C1', customerId: 'c2', deviceId: 'd1', createdAt: at(m, 2), closed: false, status: 'مكتمل', labor: 150, total: 150, deposit: 50 },
    { id: 'x', no: 'X1', customerId: 'c2', deviceId: 'd1', createdAt: at(m, 3), closed: false, status: 'ملغي', cancelReason: 'العميل اتراجع', statusHistory: [{ from: 'جديد', to: 'ملغي', at: D3 }] },
    { id: 'o', no: 'O1', customerId: 'c2', deviceId: 'd2', createdAt: at(m, 5), closed: false, status: 'جاري التنفيذ', deposit: 40, techName: 'سيد' },
    { id: 'p', no: 'P1', customerId: 'c1', deviceId: 'd2', createdAt: P10, closedAt: P10, closed: true, status: 'مكتمل', labor: 100, partsTotal: 0, total: 100, warrantyUntil: at(m + 2, 1) },
    { id: 'old', no: 'Z1', customerId: 'vip', deviceId: 'd1', createdAt: at(m - 8, 1), closedAt: at(m - 8, 2), closed: true, status: 'مكتمل', labor: 5000, total: 5000 }
  ],
  customers: [{ id: 'c1', createdAt: at(m, 1), mainAddress: { center: 'مطاي', village: 'أبو عزيز' } }, { id: 'c2', createdAt: P10, mainAddress: { center: 'سمالوط' } }],
  devices: [{ id: 'd1', type: 'غسالة', brand: 'توشيبا' }, { id: 'd2', type: 'تلاجة', brand: 'شارب' }],
  parts: [{ id: 'p1', name: 'طلمبة', qty: 5, min: 1, buy: 30, sell: 50 }, { id: 'p2', name: 'مؤرشف', qty: 9, min: 0, buy: 1000, archived: true }],
  tasks: [], treasury: [],
  moves: [{ partId: 'p1', at: D4, qty: 3, type: 'خروج بسبب إضافة قطعة لأمر شغل' }, { partId: 'p1', at: D6, qty: 1, type: 'إرجاع بسبب تعديل أمر' }, { partId: 'p1', at: D4, qty: 10, type: 'توريد' }]
};
const wtx = [
  { category: 'تحصيل عميل', type: 'in', amount: 300, date: key(new Date(y, m, 4)), wallet: 'كاش' },
  { category: 'تحصيل عميل', type: 'in', amount: 50, date: key(new Date(y, m, 2)), wallet: 'فودافون' },
  { category: 'تحصيل عميل', type: 'in', amount: 999, date: key(new Date(y, m, 4)), wallet: 'كاش', deleted: true },
  { category: 'مصروف تشغيل', type: 'out', amount: 20, date: key(new Date(y, m, 4)), subCategory: 'بنزين' }
];
const K = { r: 'orders', c: 'customers', d: 'devices', p: 'parts', tasks: 'tasks', tr: 'treasury', m: 'moves' };
const els = {}; ['reportsHost', 'reportStatus', 'reportPeriodLabel', 'repFrom', 'repTo', 'repApply', 'repToday', 'repWeek', 'repMonth'].forEach(id => {
  els[id] = { id, value: '', textContent: '', innerHTML: '', disabled: false, attrs: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, setAttribute(n, v) { this.attrs[n] = v; }, removeAttribute(n) { delete this.attrs[n]; }, getAttribute(n) { return this.attrs[n] ?? null; } };
});
const ev = {}, frames = [];
records.settings = null;
const SETTINGS = { monthlyTarget: 1000 };
const ctx = { settings: () => SETTINGS, put() {}, document: { addEventListener(t, f) { ev[t] = f; }, getElementById(id) { return els[id] || null; } }, K, arr: k => records[k] || [], walletTxEntries: () => wtx,
  customerName: id => id, deviceName: id => id, dayKeyLocal: key, console: { error(e) { throw e; } }, setTimeout, URL, Blob: function () {}, alert() {},
  window: { requestAnimationFrame(f) { frames.push(f); } } };
ctx.window.dayKeyLocal = key;
vm.runInNewContext(src, ctx, { filename: 'reports.js' });
ev.DOMContentLoaded(); frames.shift()();
const html = els.reportsHost.innerHTML;
const sec = id => (html.match(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`)) || [''])[0];
// المحصّل الفعلي: من غير الحركات المحذوفة
assert(sec('report-collect').includes('350.00 ج'), 'collected must sum non-deleted customer collections');
// المستحق: الأمر المكتمل المش مقفول = 150 − 50 عربون
assert(sec('report-collect').includes('100.00 ج') && sec('report-collect').includes('C1'), 'receivables = completed, not closed, total − deposit');
assert(sec('report-collect').includes('<b>40.00 ج</b>'), 'deposits held on open orders');
// الفنيين
const techs = sec('report-techs');
assert(techs.includes('👷 حسن') && techs.includes('450.00 ج') && techs.includes('<b class="rep-bad">1</b>'), 'tech revenue and returns');
assert(techs.includes('👷 سيد'), 'every tech with closed/open orders is listed');
// المرتجعات والإلغاء
const ret = sec('report-returns');
assert(ret.includes('نفس العطل رجع') && ret.includes('العميل اتراجع'), 'return and cancel reasons are grouped');
// المخزن: استهلاك 3 − 1 = 2، والمؤرشف مش داخل في القيمة
const inv = sec('report-inventory');
assert(inv.includes('3 قطعة') && inv.includes('بتكلفة 60 ج'), 'consumption counts out moves and nets returns at cost');
assert(inv.includes('150.00 ج') && !inv.includes('9,150.00'), 'archived parts are excluded from stock value');
// المقارنة بالفترة اللي فاتت
assert(html.includes('عن اللي فاتت'), 'KPIs compare with the previous period');
// المناطق
assert(sec('report-areas').includes('مطاي') && sec('report-areas').includes('أبو عزيز'), 'areas use customer addresses');
// المصاريف حسب البند
assert(sec('report-finance').includes('بنزين'), 'expenses are broken down by sub-category');
// (1) هدف الشهر
assert(sec('report-target').includes('1,000 ج') && sec('report-target').includes('لو كملت بنفس المعدل'), 'monthly target + forecast');
// (2) الأوامر الخسرانة: L1 = 150 − 120 − 40 = −10
assert(sec('report-finance').includes('L1') && sec('report-finance').includes('خسارة'), 'losing orders listed');
// (3) الأعطال لكل نوع: «مش بتبرد» و«مش بتبرد!!» نفس العطل
assert(/مش بتبرد <small>— 2 مرة/.test(sec('report-devices')), 'faults normalized and counted per device type');
assert(sec('report-devices').includes('طلمبة (1)'), 'parts per device type');
// (4) توقع النفاد: p1 (5 قطع، سحب 2 في 60 يوم) مش هيخلص خلال 30 يوم؛ الجدول موجود
assert(sec('report-inventory').includes('هيخلص بعد'), 'run-out table exists');
// (5) المواعيد: B1 اتزار بعد ميعاده بيومين، L1 في ميعاده
assert(sec('report-response').includes('50%') && sec('report-response').includes('2 يوم تأخير'), 'on-time % and late visits');
// (6) معاينة ماتحولتش: V1
assert(sec('report-returns').includes('معاينات ماتحولتش') && sec('report-returns').includes('السعر عالي على العميل'), 'lost inspections with reasons');
// (7) عميل كبير بطّل ييجي
assert(sec('report-customers').includes('vip') && sec('report-customers').includes('بطّلوا ييجوا'), 'sleeping VIP customers');
// (8) ربحية المناطق بعد المشاوير
assert(sec('report-areas').includes('ربحية كل منطقة') && sec('report-areas').includes('20.00 ج'), 'area profit uses trip expenses');
// (9) الضمان: W1 اتفتح على جهاز d2 لسه في ضمان P1، وA1 مرتجع جوه مدة المرتجع
const war = sec('report-warranty');
assert(war.includes('W1') && war.includes('أمر جديد جوه ضمان') && war.includes('A1'), 'warranty work detected');
console.log('reports-insights-tests: PASS (comparison, collections, techs, returns, inventory, areas, target, losing orders, faults, run-out, response, inspections, LTV, area profit, warranty)');
