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
    { id: 'b', no: 'B1', customerId: 'c1', deviceId: 'd2', createdAt: at(m, 2), closedAt: D6, closed: true, status: 'مكتمل', labor: 100, partsTotal: 0, partsCost: 0, total: 100, techName: 'سيد' },
    { id: 'c', no: 'C1', customerId: 'c2', deviceId: 'd1', createdAt: at(m, 2), closed: false, status: 'مكتمل', labor: 150, total: 150, deposit: 50 },
    { id: 'x', no: 'X1', customerId: 'c2', deviceId: 'd1', createdAt: at(m, 3), closed: false, status: 'ملغي', cancelReason: 'العميل اتراجع', statusHistory: [{ from: 'جديد', to: 'ملغي', at: D3 }] },
    { id: 'o', no: 'O1', customerId: 'c2', deviceId: 'd2', createdAt: at(m, 5), closed: false, status: 'جاري التنفيذ', deposit: 40, techName: 'سيد' },
    { id: 'p', no: 'P1', customerId: 'c1', deviceId: 'd1', createdAt: P10, closedAt: P10, closed: true, status: 'مكتمل', labor: 100, partsTotal: 0, total: 100 }
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
const ctx = { document: { addEventListener(t, f) { ev[t] = f; }, getElementById(id) { return els[id] || null; } }, K, arr: k => records[k] || [], walletTxEntries: () => wtx,
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
assert(techs.includes('👷 حسن') && techs.includes('300.00 ج') && techs.includes('<b class="rep-bad">1</b>'), 'tech revenue and returns');
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
console.log('reports-insights-tests: PASS (comparison, collections/receivables, techs, returns/cancels, inventory consumption, areas, expense breakdown)');
