// سرعة: كاش منسّقات التاريخ لازم يطلع نفس ناتج المتصفح بالظبط (shared-data.js أول الملف)
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/shared-data.js', 'utf8');
const shim = src.slice(src.indexOf('(function () {\n  try {\n    if (typeof Intl'), src.indexOf('})();\n') + 6);
assert.ok(shim.includes('__wfIntlCache'), 'shim found');
const opts = [undefined, {}, { weekday: 'long' }, { weekday: 'short' }, { day: '2-digit', month: '2-digit' }, { hour: '2-digit', minute: '2-digit' }, { year: 'numeric', month: 'long', day: 'numeric' }, { month: 'short' }, { dateStyle: 'medium' }, { timeZone: 'Africa/Cairo', hour: 'numeric' }, { hour12: false }, { weekday: 'long', hour: 'numeric' }];
const locs = ['ar-EG', 'en-US', undefined, ['ar-EG', 'en'], 'ar'];
const dates = [new Date('2026-10-23T09:05:07Z'), new Date(0), new Date('2026-03-01'), new Date('bad')];
const M = ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString'];
const run = () => { const out = []; for (const d of dates) for (const l of locs) for (const o of opts) for (const m of M) { try { out.push(d[m](l, o)); } catch (e) { out.push('ERR ' + e.name); } } return out; };
const want = run();
vm.runInThisContext(shim);
assert.ok(Date.prototype.__wfIntlCache, 'installed');
assert.deepStrictEqual(run(), want, 'نفس الناتج بالظبط');
assert.deepStrictEqual(run(), want, 'ونفسه من الكاش');
console.log('perf-shims-tests: PASS (' + want.length + ' حالة تنسيق تاريخ)');
