const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const reportsSource = fs.readFileSync(path.join(__dirname, 'reports.js'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(__dirname, 'app-dashboard-reports.js'), 'utf8');
const now = new Date();
const year = now.getFullYear();
const month = now.getMonth();
const monthStart = new Date(year, month, 1);
const monthEnd = new Date(year, month + 1, 0);
const nextMonth = new Date(year, month + 1, 1);
const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const stamp = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString();
const currentDate = new Date(year, month, Math.min(5, monthEnd.getDate()));
const currentCreated = new Date(year, month, Math.min(6, monthEnd.getDate()));
const legacyCreated = new Date(year, month, Math.min(7, monthEnd.getDate()));
const openCreated = new Date(year, month, Math.min(8, monthEnd.getDate()));
const priorCreated = new Date(year, month, 0);
const futureClosed = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1);

const records = {
  orders: [
    { id: 'closed-this-period', no: 'WO-1', customerId: 'c1', deviceId: 'd1', createdAt: stamp(priorCreated), closedAt: stamp(currentDate), closed: true, status: 'مكتمل', labor: 100, partsTotal: 40, partsCost: 20, total: 140, deposit: 0 },
    { id: 'created-now-closed-later', no: 'WO-2', customerId: 'c1', deviceId: 'd1', createdAt: stamp(currentCreated), closedAt: stamp(futureClosed), closed: true, status: 'مكتمل', labor: 500, partsTotal: 200, partsCost: 100, total: 700, deposit: 0 },
    { id: 'legacy-closed', no: 'WO-3', customerId: 'c1', deviceId: 'd1', createdAt: stamp(legacyCreated), closed: true, status: 'مكتمل', labor: 10, partsTotal: 5, partsCost: 2, total: 15, deposit: 0 },
    { id: 'open-order', no: 'WO-4', customerId: 'c1', deviceId: 'd1', createdAt: stamp(openCreated), closed: false, status: 'جاري التنفيذ', labor: 1000, partsTotal: 500, partsCost: 300, total: 1500, deposit: 0 },
    { id: 'active-workshop-old', no: 'WO-5', customerId: 'c1', deviceId: 'd1', createdAt: stamp(priorCreated), closed: false, status: 'جاري التنفيذ', executionPlace: 'الورشة', workshopStatus: 'داخل الورشة', partsWaiting: true, labor: 0, partsTotal: 0, partsCost: 0, total: 0, deposit: 0 },
    { id: 'delivered-this-period-old-order', no: 'WO-6', customerId: 'c1', deviceId: 'd1', createdAt: stamp(priorCreated), workshopAt: stamp(currentDate), closed: false, status: 'جاري التنفيذ', executionPlace: 'الورشة', workshopStatus: 'تم التسليم', partsWaiting: false, labor: 0, partsTotal: 0, partsCost: 0, total: 0, deposit: 0 }
  ],
  customers: [{ id: 'c1', createdAt: stamp(currentDate) }],
  devices: [{ id: 'd1', type: 'غسالة', brand: 'اختبار' }],
  parts: [],
  tasks: [],
  treasury: [],
  moves: []
};
const walletEntries = [
  { id: 'expense', category: 'مصروف تشغيل', type: 'out', amount: 10, date: key(currentDate), wallet: 'نقدي' },
  { id: 'refund', category: 'مصروف تشغيل', type: 'in', amount: 3, date: key(currentDate), wallet: 'نقدي' }
];
const K = { r: 'orders', c: 'customers', d: 'devices', p: 'parts', tasks: 'tasks', tr: 'treasury', m: 'moves', wtx: 'walletEntries' };

function element(id, value = '') {
  return {
    id, value, textContent: '', innerHTML: '', disabled: false, attrs: {}, listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute(name, val) { this.attrs[name] = String(val); },
    removeAttribute(name) { delete this.attrs[name]; },
    getAttribute(name) { return this.attrs[name] ?? null; }
  };
}

// Standalone reports page: the order list still includes orders created in the
// selected period, but financial totals only recognize the actual close date.
const reportEvents = {};
const reportFrames = [];
const reportElements = Object.fromEntries([
  'reportsHost', 'reportStatus', 'reportPeriodLabel', 'repFrom', 'repTo',
  'repApply', 'repToday', 'repWeek', 'repMonth'
].map(id => [id, element(id)]));
reportElements.repFrom.value = key(monthStart);
reportElements.repTo.value = key(monthEnd);
const reportContext = {
  document: {
    addEventListener(type, fn) { reportEvents[type] = fn; },
    getElementById(id) { return reportElements[id] || null; }
  },
  K,
  arr(storageKey) { return records[storageKey] || []; },
  walletTxEntries() { return walletEntries; },
  customerName(id) { return id || '—'; },
  deviceName(id) { return id || '—'; },
  dayKeyLocal: key,
  console: { error() {} },
  URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
  Blob: function Blob() {},
  alert() {},
  setTimeout,
  window: { requestAnimationFrame(fn) { reportFrames.push(fn); } }
};
reportContext.window.dayKeyLocal = key;
vm.runInNewContext(reportsSource, reportContext, { filename: 'reports.js' });
reportEvents.DOMContentLoaded();
reportFrames.shift()();
const reportHtml = reportElements.reportsHost.innerHTML;
const financeSection = reportHtml.match(/<section id="report-finance"[\s\S]*?<\/section>/)?.[0] || '';
assert(financeSection.includes('<td>🔨 المصنعية</td><td>110.00 ج</td>'), 'standalone report should count current-period close plus legacy close only');
assert(financeSection.includes('<td>🔧 قطع الغيار المحصلة</td><td>45.00 ج</td>'), 'parts revenue should use the same close-date filter');
assert(financeSection.includes('<td>📦 تكلفة القطع</td><td>22.00 ج</td>'), 'parts cost should use the same close-date filter');
assert(financeSection.includes('<td>💰 الإيراد</td><td>155.00 ج</td>'), 'reported revenue should reconcile with recognized closed orders');
assert(financeSection.includes('<td>🧯 مصاريف التشغيل</td><td>7.00 ج</td>'), 'expense refunds should offset operating expenses');
assert(financeSection.includes('<td>✅ صافي المكسب</td><td>126.00 ج</td>'), 'net profit should reconcile to gross profit less net operating expenses');
assert(reportHtml.includes('created-now-closed-later'), 'orders created in the period remain listed even when closed later');
assert(!financeSection.includes('500.00 ج'), 'a later-period close must not be recognized in the creation period');
assert(reportHtml.includes('>📦 انتظار قطع</span><b>1</b>'), 'waiting-parts summary should count current active orders from earlier periods');
assert(reportHtml.includes('>🏭 في الورشة</span><b>1</b>'), 'workshop summary should count current active orders from earlier periods');
const workshopSection = reportHtml.match(/<section id="report-workshop"[\s\S]*?<\/section>/)?.[0] || '';
assert(workshopSection.includes('داخل الورشة') && workshopSection.includes('أجهزة/أوامر داخل الورشة الآن</span><b>1</b>'), 'workshop summary must reconcile with its current-state detail section');
assert(workshopSection.includes('تم التسليم بالفترة</span><b>1</b>'), 'a workshop delivery this period must be counted even when its order was created earlier');

// Dashboard/monthly report must apply identical accounting and produce safe,
// navigable detail links even for IDs containing URL-reserved characters.
const monthValue = `${year}-${String(month + 1).padStart(2, '0')}`;
const dashboardElements = {
  reportMode: element('reportMode', 'month'),
  reportMonth: element('reportMonth', monthValue),
  reportWeek: element('reportWeek'),
  monthlyReport: element('monthlyReport'),
  expenseList: element('expenseList')
};
const dashboardContext = {
  K,
  document: { getElementById(id) { return dashboardElements[id] || null; } },
  arrCached(storageKey) { return records[storageKey] || []; },
  walletTxEntries() { return walletEntries; },
  parseLocalDateValue(value) { return new Date(value); },
  monthKeyLocal(value) { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; },
  esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); },
  customerName(id) { return id || '—'; },
  console,
  Date,
  encodeURIComponent
};
vm.runInNewContext(dashboardSource, dashboardContext, { filename: 'app-dashboard-reports.js' });
dashboardContext.financeReport();
const dashboardHtml = dashboardElements.monthlyReport.innerHTML;
assert(dashboardHtml.includes('<td>🔨 المصنعية</td><td>110.00 ج</td>'), 'dashboard report should use close-date financial recognition');
assert(dashboardHtml.includes('<td>✅ صافي المكسب</td><td>126.00 ج</td>'), 'dashboard net profit should reconcile');
assert(dashboardHtml.includes('<td>✅ أوامر مكتملة</td><td>2</td>'), 'completed count should use close date, with legacy fallback');
const detail = dashboardContext.reportOrderLine({ id: 'id &/عربي', no: 'WO-X', customerId: 'c1', closed: true }, 100);
assert(detail.includes('request.html?id=id%20%26%2F%D8%B9%D8%B1%D8%A8%D9%8A'), 'dashboard report detail links must encode special characters');
const laborDetails = dashboardContext.reportRowMeta('labor').rows.join('');
assert(laborDetails.includes('closed-this-period') || laborDetails.includes('WO-1'), 'labor details should include the close in the selected period');
assert(!laborDetails.includes('WO-2'), 'labor details must not list orders closed after the selected period');
const profitPercentDetails = dashboardContext.reportRowMeta('partsProfitPct').rows.join('');
assert(profitPercentDetails.includes('51.1%'), 'parts-profit detail must use the same close-date scope as report totals');
assert(!profitPercentDetails.includes('50.2%'), 'parts-profit detail must exclude orders closed after the selected period');

console.log('reports-accuracy-tests: PASS (close-date accounting, legacy fallback, expense netting, and safe detail links)');
