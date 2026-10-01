const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, 'reports.js'), 'utf8');
const events = {};
const frames = [];
function element(id, value = '') {
  return {
    id, value, textContent: '', innerHTML: '', disabled: false, attrs: {}, listeners: {},
    classList: {
      values: new Set(),
      add(name) { this.values.add(name); },
      remove(name) { this.values.delete(name); },
      contains(name) { return this.values.has(name); }
    },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    removeAttribute(name) { delete this.attrs[name]; },
    getAttribute(name) { return this.attrs[name] ?? null; }
  };
}
const els = Object.fromEntries([
  'reportsHost', 'reportStatus', 'reportPeriodLabel', 'repFrom', 'repTo',
  'repApply', 'repToday', 'repWeek', 'repMonth'
].map(id => [id, element(id)]));
const now = new Date();
const localDayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const stamp = new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate(), 20), 12).toISOString();
const records = {
  orders: [{ id: 'order & <x>', no: 'WO-7', customerId: 'customer 1', deviceId: 'device/1', createdAt: stamp,
    closedAt: stamp, closed: true, status: 'مكتمل', labor: 100, partsTotal: 40, partsCost: 20, total: 140,
    deposit: 50, executionPlace: 'الورشة', workshopStatus: 'داخل الورشة', partsWaiting: true }],
  customers: [{ id: 'customer 1', createdAt: stamp }],
  devices: [{ id: 'device/1', type: 'غسالة', brand: 'Brand' }],
  parts: [{ id: 'p&1', name: 'طلمبة', qty: 0, min: 2, buy: 100, sell: 150 }],
  tasks: [{ id: 'task-1', title: 'متابعة', date: localDayKey(now), completed: false }],
  treasury: [{ date: localDayKey(now), time: '12:00', type: 'in', amount: 10 }],
  moves: [{ partId: 'p&1', at: stamp, qty: 1 }]
};
let throwOnOrders = false;
const K = { r: 'orders', c: 'customers', d: 'devices', p: 'parts', tasks: 'tasks', tr: 'treasury', m: 'moves' };
const document = {
  addEventListener(type, fn) { events[type] = fn; },
  getElementById(id) { return els[id] || null; }
};
const context = {
  document, K,
  arr(key) { if (throwOnOrders && key === 'orders') throw new Error('simulated offline storage read'); return records[key] || []; },
  walletTxEntries() { return []; },
  customerName(id) { return id === 'customer 1' ? '<img src=x onerror=alert(1)>' : String(id || '—'); },
  deviceName(id) { return id === 'device/1' ? '<svg onload=alert(1)>' : String(id || '—'); },
  dayKeyLocal: localDayKey,
  console: { error() {} },
  URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
  Blob: function Blob() {},
  alert() {},
  setTimeout,
  window: { requestAnimationFrame(fn) { frames.push(fn); } }
};
context.window.dayKeyLocal = context.dayKeyLocal;
vm.runInNewContext(source, context, { filename: 'reports.js' });

events.DOMContentLoaded();
assert(els.reportsHost.getAttribute('aria-busy') === 'true', 'report host should announce a pending update');
assert.strictEqual(els.repApply.disabled, true, 'refresh control should be disabled while rendering');
assert(els.reportStatus.textContent.includes('جاري'), 'loading status should be visible before rendering');
frames.shift()();
const html = els.reportsHost.innerHTML;
assert(els.reportsHost.getAttribute('aria-busy') === 'false', 'report host should clear its busy state');
assert.strictEqual(els.repApply.disabled, false, 'refresh control should be restored after rendering');
for (const section of ['report-finance', 'report-orders', 'report-customers', 'report-devices', 'report-inventory', 'report-workshop', 'report-treasury', 'report-tasks']) {
  assert(html.includes(`id="${section}"`), `summary target ${section} must exist`);
  assert(html.includes(`href="#${section}"`), `summary should navigate to ${section}`);
}
assert(html.includes('request.html?id=order%20%26%20%3Cx%3E'), 'order id must be URL-encoded in detail links');
assert(html.includes('customer.html?id=customer%201'), 'customer link must target the customer profile');
assert(html.includes('device.html?id=device%2F1'), 'device link must target the device profile');
assert(html.includes('part.html?id=p%261'), 'low-stock part link must target the part profile');
assert(!html.includes('<img src=x onerror=alert(1)>') && !html.includes('<svg onload=alert(1)>'), 'dynamic report labels must be HTML-escaped');
assert(html.includes('اضغط لفتح الصنف'), 'low-stock report should indicate that items are actionable');

// Invalid/reversed periods should be rejected accessibly and preserve the last good report.
els.repFrom.value = '2026-10-20';
els.repTo.value = '2026-10-01';
els.repApply.listeners.click();
assert(els.reportStatus.textContent.includes('تاريخ البداية'), 'reversed period should show a useful Arabic validation message');
assert.strictEqual(els.repFrom.getAttribute('aria-invalid'), 'true');
assert.strictEqual(els.reportsHost.innerHTML, html, 'invalid filters should not erase the last successful report');

// A storage failure should produce a recoverable user-facing state and release disabled controls.
els.repFrom.value = context.dayKeyLocal(new Date(now.getFullYear(), now.getMonth(), 1));
els.repTo.value = context.dayKeyLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0));
throwOnOrders = true;
els.repApply.listeners.click();
frames.shift()();
assert(els.reportStatus.textContent.includes('تعذر تحميل التقرير'), 'report read failures should be visible and retryable');
assert.strictEqual(els.reportStatus.getAttribute('role'), 'alert');
assert.strictEqual(els.reportsHost.getAttribute('aria-busy'), 'false');
assert.strictEqual(els.repApply.disabled, false, 'controls must be re-enabled after a failed load');
console.log('reports-quality-tests: PASS (summary routes, encoded detail links, mobile loading/error states, and date validation)');
