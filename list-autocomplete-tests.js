/* قوائم الاختيار بالبحث (نوع/تصنيف/ماركة...): حدث input/focus متأخر من لوحة مفاتيح
   الموبايل بعد اختيار نتيجة ما يمسحش الاختيار، لكن الكتابة الجديدة فعلاً تمسحه. */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
function el(extra) { return Object.assign({ dispatchEvent() {}, value: '', dataset: {}, innerHTML: '', classList: { add() {}, remove() {} }, querySelectorAll: () => [] }, extra || {}); }
function makeEnv() {
  const els = { dType: el({ dataset: { listKind: 'type' } }), dTypeSearch: el(), dTypeResults: el() };
  const document = { getElementById: (id) => els[id] || null };
  const ctx = vm.createContext({ Event: class {}, document, console, setTimeout, settings: () => ({ types: ['ثلاجات', 'غسالات'] }), esc: (s) => String(s) });
  vm.runInContext(fs.readFileSync(`${__dirname}/app-list-autocomplete.js`, 'utf8'), ctx, { filename: 'app-list-autocomplete.js' });
  vm.runInContext('LIST_SOURCES.type = { getList() { return ["ثلاجات", "غسالات"]; }, addNew() { return true; } };', ctx);
  return { els, x: ctx };
}
{ // اختيار ثم input متأخر بنفس النص: الاختيار يفضل
  const { els, x } = makeEnv();
  x.selectListOption('dType', 'ثلاجات');
  assert.strictEqual(els.dType.value, 'ثلاجات'); assert.strictEqual(els.dTypeSearch.value, 'ثلاجات');
  x.filterListOptions('dType', els.dTypeSearch.value);
  assert.strictEqual(els.dType.value, 'ثلاجات', 'late input/focus must not clear selection'); }
{ // كتابة نص مختلف بعد الاختيار: الاختيار القديم يتلغي
  const { els, x } = makeEnv();
  x.selectListOption('dType', 'ثلاجات'); els.dTypeSearch.value = 'غس';
  x.filterListOptions('dType', 'غس');
  assert.strictEqual(els.dType.value, '', 'typing something else cancels the old selection'); }
{ // بدون اختيار سابق: الحقل فاضي
  const { els, x } = makeEnv(); els.dTypeSearch.value = 'ثلا';
  x.filterListOptions('dType', 'ثلا'); assert.strictEqual(els.dType.value, ''); }
console.log('list-autocomplete-tests passed');
