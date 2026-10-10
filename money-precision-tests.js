/* دقة الفلوس: الأرصدة والمتبقي لأقرب قرش حتى مع آلاف الحركات العشرية. */
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
function makeEnv() {
  const store = {}; const ls = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] };
  const document = { addEventListener: () => {}, getElementById: () => null, querySelector: () => null };
  const window = { localStorage: ls, WFStorage: ls, document, crypto: { randomUUID: () => 'id-' + Math.random().toString(36).slice(2) } };
  const context = { window, localStorage: ls, document, crypto: window.crypto, console, alert: () => {}, confirm: () => true, prompt: () => null };
  const c = vm.createContext(context);
  vm.runInContext(fs.readFileSync(`${__dirname}/shared-data.js`, 'utf8'), c);
  ['K', 'arr', 'get', 'put', 'putAsync', 'esc', 'escAttr', 'commitStorage', 'commitStorageAsync', 'withRollback', 'withRollbackAsync', 'settings', 'arrCached', 'localDateKey', 'WFStorage'].forEach((n) => (context[n] = window[n]));
  context.id = window.id; context.renderRequests = () => {};
  ['app-shared.js', 'wallets.js', 'treasury.js', 'app-data-management.js'].forEach((f) => vm.runInContext(fs.readFileSync(`${__dirname}/${f}`, 'utf8'), c, { filename: f }));
  return { store, x: context, K: window.K };
}
{ const { store, x, K } = makeEnv(); const W = x.settings().wallets[0];
  store[K.wtx] = JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ id: 't' + i, wallet: W, type: 'in', amount: 0.1 })));
  store[K.tr] = JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ id: 'r' + i, type: 'in', amount: 0.1 })));
  assert.strictEqual([...Array(10)].reduce((a) => a + 0.1, 0) === 1, false, 'sanity: plain float sum drifts');
  assert.strictEqual(x.walletRawBalance(W), 1); assert.strictEqual(x.walletBalance(W), 1); assert.strictEqual(x.treasuryBalance(), 1); }
{ let seed = 20261010; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let round = 0; round < 5; round++) {
    const { store, x, K } = makeEnv(); const wallets = x.settings().wallets.slice(0, 3); const cents = Object.fromEntries(wallets.map((w) => [w, 0])); let tre = 0; const tx = [], tr = [];
    for (let i = 0; i < 4000; i++) { const c = Math.floor(rnd() * 500000) + 1, type = rnd() < 0.55 ? 'in' : 'out', w = wallets[Math.floor(rnd() * 3)];
      tx.push({ id: 't' + i, wallet: w, type, amount: c / 100 }); cents[w] += type === 'in' ? c : -c;
      const c2 = Math.floor(rnd() * 100000) + 1, t2 = rnd() < 0.5 ? 'in' : 'out'; tr.push({ id: 'r' + i, type: t2, amount: c2 / 100 }); tre += t2 === 'in' ? c2 : -c2; }
    store[K.wtx] = JSON.stringify(tx); store[K.tr] = JSON.stringify(tr);
    for (const w of wallets) assert.strictEqual(x.walletRawBalance(w), cents[w] / 100, `wallet ${w} round ${round}`);
    assert.strictEqual(x.treasuryBalance(), tre / 100, `treasury round ${round}`); } }
{ const expr = (t, d) => Math.max(0, Math.round(((+t || 0) - (+d || 0)) * 100) / 100);
  [[0.8, 0.1 + 0.7, 0], [100.1, 0.1 + 100, 0], [3.3, 1.1 + 2.2, 0], [0.3, 0.1 + 0.2, 0], [250.75, 100.25 + 150.5, 0], [500, 120.5, 379.5], [99.99, 0, 99.99]].forEach(([t, d, e]) => assert.strictEqual(expr(t, d), e)); }
{ const bad = /\(\+(\w+)\.total\s*\|\|\s*0\)\s*-\s*\(\+\1\.deposit\s*\|\|\s*0\)/g; const off = [];
  for (const f of fs.readdirSync(__dirname).filter((n) => /\.(js|html)$/.test(n) && !n.startsWith('brand-') && !/test/.test(n))) {
    const s = fs.readFileSync(path.join(__dirname, f), 'utf8'); let m; while ((m = bad.exec(s))) if (!/Math\.round\(\($/.test(s.slice(Math.max(0, m.index - 12), m.index))) off.push(f); }
  assert.strictEqual(off.length, 0, 'unrounded (total - deposit) in: ' + off.join(', ')); }
console.log('money-precision-tests: PASS');
