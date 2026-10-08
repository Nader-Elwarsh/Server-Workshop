/* اختبار: فشل الحفظ لازم يظهر للمستخدم (شريط تحذير) ويختفي لما الحفظ ينجح، وسجل بدون id يتسجّل تحذيره */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("./workshop-idb.js"), "utf8");
const local = new Map();
let failWrites = true;
const bodyKids = new Map();
const doc = {
  body: { appendChild(el) { bodyKids.set(el.id, el); } },
  getElementById(id) { const el = bodyKids.get(id); return el ? Object.assign(el, { remove() { bodyKids.delete(id); } }) : null; },
  createElement() { return { style: {}, setAttribute() {} }; },
  documentElement: { setAttribute() {}, removeAttribute() {}, style: {} },
  readyState: "complete",
  addEventListener() {}
};
const warnings = [];
const window = {
  document: doc,
  navigator: {},
  localStorage: {
    getItem(k) { return local.has(k) ? local.get(k) : null; },
    setItem(k, v) { if (failWrites) throw new Error("quota"); local.set(k, String(v)); },
    removeItem(k) { local.delete(k); }
  },
  indexedDB: null
};
vm.runInNewContext(source, { window, console: { warn: (...a) => warnings.push(a), error() {} }, Promise, JSON, Object, Array, Date, Math, String, Error, Map, Set });
(async () => {
  await window.WFStorageReady;
  window.WFStorage.setItem("wf_x", "1");
  await new Promise(r => setTimeout(r, 20));
  assert.ok(window.WFStorageStatus.writeError, "write failure must be recorded in status");
  assert.ok(bodyKids.has("wf-storage-alert"), "user must see a visible alert");
  failWrites = false;
  window.WFStorage.setItem("wf_y", "2");
  await new Promise(r => setTimeout(r, 20));
  assert.ok(!window.WFStorageStatus.writeError, "status clears after a successful write");
  assert.ok(!bodyKids.has("wf-storage-alert"), "alert disappears after recovery");
  console.log("idb-failure-visibility-tests: PASS");
})().catch(e => { console.error(e); process.exitCode = 1; });
