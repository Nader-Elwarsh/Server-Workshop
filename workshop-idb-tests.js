const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("./workshop-idb.js"), "utf8");
const local = new Map([["wf_c", JSON.stringify([{ id: "c-1", name: "عميل تجريبي" }])], ["wf_d", "[]"], ["wf_r", "[]"]]);
const warnings = [];
const window = {
  localStorage: {
    getItem(key) { return local.has(key) ? local.get(key) : null; },
    setItem(key, value) { local.set(key, String(value)); }
  },
  indexedDB: null
};
vm.runInNewContext(source, { window, console: { warn: (...args) => warnings.push(args), error() {} }, Promise, JSON, Object, Array, Date, Math, String, Error, Map, Set });
assert.deepEqual(Object.keys(window.WorkshopDB.stores).sort(), ["wf_c", "wf_d", "wf_r"]);
for (const method of ["initialize", "readCollection", "getById", "queryIndex", "replace", "replaceMany", "transaction", "flush"]) {
  assert.equal(typeof window.WorkshopDB[method], "function", `WorkshopDB.${method} must exist`);
}
assert.equal(window.WorkshopDB.isAvailable(), false);
window.WorkshopDBReady.then(ready => {
  assert.equal(ready, false, "IDB setup should report fallback instead of blocking the app");
  assert.equal(JSON.parse(local.get("wf_c"))[0].id, "c-1", "legacy data must remain untouched on fallback");
  assert.ok(warnings.length > 0, "fallback should be diagnosable");
  console.log("workshop-idb-tests: PASS (repository API, three stores, and localStorage fallback)");
}).catch(error => { console.error(error); process.exitCode = 1; });
