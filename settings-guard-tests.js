// الإعدادات ماترجعش للافتراضي مع التحديثات (batch102): مفيش كتابة قبل ما التخزين يجهز، المزامنة مابترفعش قايمة رجعت للافتراضي فوق قايمتك،
// وأنواع المصاريف المستخدمة في الحركات بترجع للقايمة مرة واحدة.
"use strict";
const assert = require("assert"), fs = require("fs"), vm = require("vm");
const sd = fs.readFileSync("shared-data.js", "utf8"), sync = fs.readFileSync("firebase-sync.js", "utf8"), wl = fs.readFileSync("wallets.js", "utf8");
assert.ok(/const ready = !WFStorage \|\| typeof WFStorage\.isReady !== "function" \|\| WFStorage\.isReady\(\);/.test(sd));
assert.ok(/if \(stored !== normalized && ready/.test(sd));
assert.ok(/window\.WFSettingsDefaultLists = /.test(sd) && /personalExpenseCategories: \["مواصلات", "أكل وشرب", "متفرقات"\]/.test(sd));
assert.ok(/stable\(v\[key\]\) === stable\(DL\[key\]\) && Array\.isArray\(base\[key\]\) && base\[key\]\.length && stable\(base\[key\]\) !== stable\(DL\[key\]\)\) \{ revived\.push\(key\); return false; \}/.test(sync));
// الاسترجاع
const fn = wl.match(/function recoverWalletSubCategories\(\)\{[\s\S]*?\n\}/)[0] + "\n" + wl.match(/function subCategoryKeyFor\(category\)\{[\s\S]*?\n\}/)[0];
let S = { expenseCategories: ["وقود ومواصلات"], personalExpenseCategories: ["مواصلات", "أكل وشرب", "متفرقات"] };
const ctx = { K: { wtx: "w", s: "s" }, window: {}, console,
  _roArr: () => [{ category: "مصروف شخصي", subCategory: "بقالة" }, { category: "مصروف شخصي", subCategory: "لبس وأحذية" }, { category: "مصروف تشغيل", subCategory: "خامات للشغل" }, { category: "مصروف شخصي", subCategory: "مواصلات" }, { category: "تحصيل عميل", subCategory: "x" }, { category: "مصروف شخصي", subCategory: "قديم", deleted: true }],
  settings: () => JSON.parse(JSON.stringify(S)), put: (k, v) => { S = v; return true; } };
vm.runInNewContext(fn, ctx);
assert.strictEqual(ctx.recoverWalletSubCategories(), 3);
assert.deepStrictEqual(JSON.parse(JSON.stringify(S.personalExpenseCategories)), ["مواصلات", "أكل وشرب", "متفرقات", "بقالة", "لبس وأحذية"]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(S.expenseCategories)), ["وقود ومواصلات", "خامات للشغل"]);
assert.strictEqual(ctx.recoverWalletSubCategories(), 0, "مرة واحدة بس");
console.log("settings-guard-tests: PASS (مفيش كتابة قبل التخزين، حماية القوايم في المزامنة، استرجاع أنواع المصاريف)");
