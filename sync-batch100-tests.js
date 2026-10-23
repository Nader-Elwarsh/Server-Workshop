// المزامنة (batch100): كمية الصنف بتتجمع من الجهازين، والقوايم (المكالمات المعلّقة/السلة/…) بتتدمج بدل ما جهاز يكتب فوق التاني.
"use strict";
const fs = require("fs"), assert = require("assert"), vm = require("vm");
const s = fs.readFileSync("firebase-sync.js", "utf8");
const grab = (re) => { const m = s.match(re); assert.ok(m, "مش لاقي " + re); return m[0]; };
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext([grab(/var ISO = [^\n]+/), grab(/function stable\(v\)[^\n]+/), grab(/function sameField[^\n]+/), grab(/var DEP_SET = [^\n]+/),
  grab(/function merge3\(k, base, loc, rem\) \{[\s\S]*?\n    return \{ rec: out, both: both \};\n  \}/),
  grab(/function xKey\(x\)[^\n]+/), grab(/function mergeArrRaw\(baseRaw, locRaw, remRaw\) \{[\s\S]*?\n    return JSON\.stringify\(out\);\n  \}/),
  "this.m = merge3; this.ma = mergeArrRaw;"].join("\n"), ctx);
// 1) المخزن: 10 قطع، جهاز صرف 1 (9) وجهاز تاني باع 2 (8) → 7
const p = { id: "p", name: "ثرموستات", qty: 10, buy: 50 };
let r = JSON.parse(JSON.stringify(ctx.m("wf_p", p, Object.assign({}, p, { qty: 9 }), Object.assign({}, p, { qty: 8, buy: 55 }))));
assert.strictEqual(r.rec.qty, 7, "الخصمين اتحسبوا"); assert.strictEqual(r.rec.buy, 55);
// توريد هنا (+5) وصرف هناك (−3) → 12
r = JSON.parse(JSON.stringify(ctx.m("wf_p", p, Object.assign({}, p, { qty: 15 }), Object.assign({}, p, { qty: 7 }))));
assert.strictEqual(r.rec.qty, 12);
// 2) القوايم: الجهاز ده ضاف مكالمة ومسح واحدة، والتاني ضاف مكالمة → الإضافتين يفضلوا والممسوحة تتشال
const base = JSON.stringify([{ id: "a", n: "أحمد" }, { id: "b", n: "بلال" }]);
const loc = JSON.stringify([{ id: "a", n: "أحمد" }, { id: "c", n: "كريم" }]);           // مسح b وضاف c
const rem = JSON.stringify([{ id: "a", n: "أحمد (اتعدل)" }, { id: "b", n: "بلال" }, { id: "d", n: "داليا" }]); // عدّل a وضاف d
const out = JSON.parse(ctx.ma(base, loc, rem)).map((x) => x.id + ":" + x.n);
assert.deepStrictEqual(out, ["a:أحمد (اتعدل)", "d:داليا", "c:كريم"]);
// مش قايمة → مفيش دمج (بيرجع للطريقة القديمة)
assert.strictEqual(ctx.ma("{}", "{}", "{}"), null);
// 3) التوصيل
assert.ok(/h: bh/.test(s) && /mergeArrRaw\(xBase\(k\), snapshotRaw, remoteRaw\)/.test(s) && /mergeArrRaw\(xBase\(k\), lr, ex\[k\]\.v\)/.test(s));
console.log("sync-batch100-tests: PASS (كمية المخزن من جهازين، دمج القوايم، التوصيل)");
