// دمج المزامنة حقل بحقل + حماية المسح (firebase-sync.js)
const fs = require("fs"), assert = require("assert"), vm = require("vm");
const s = fs.readFileSync("firebase-sync.js", "utf8");
const grab = (re) => { const m = s.match(re); assert.ok(m, "مش لاقي " + re); return m[0]; };
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext([grab(/var ISO = [^\n]+/), grab(/function stable\(v\)[^\n]+/), grab(/function sameField[^\n]+/), grab(/var DEP_SET = [^\n]+/), grab(/function merge3\(k, base, loc, rem\) \{[\s\S]*?\n    return \{ rec: out, both: both \};\n  \}/)].join("\n") + "\nthis.m=merge3;", ctx);
const m = (k, b, l, r) => JSON.parse(JSON.stringify(ctx.m(k, b, l, r)));

// 1) كل جهة غيّرت حقل مختلف → الاتنين يتحفظوا
let r = m("wf_c", { id: "c", name: "أ", phone: "1", note: "x" }, { id: "c", name: "أحمد", phone: "1", note: "x" }, { id: "c", name: "أ", phone: "2" });
assert.deepStrictEqual(r.rec, { id: "c", name: "أحمد", phone: "2" }); assert.deepStrictEqual(r.both, []);
// 2) العربون: أنا سجلت 1000 والسحابة اتغيّرت (الفني غيّر الحالة) → العربون والحالة الاتنين يفضلوا
const base = { id: "o", no: "W1", status: "جديد", total: 0, deposit: 0, depositWallet: "", labor: 0 };
r = m("wf_r", base, Object.assign({}, base, { deposit: 1000, depositWallet: "فودافون" }), Object.assign({}, base, { status: "تحت التنفيذ", labor: 300, total: 300 }));
assert.strictEqual(r.rec.deposit, 1000); assert.strictEqual(r.rec.depositWallet, "فودافون"); assert.strictEqual(r.rec.status, "تحت التنفيذ"); assert.strictEqual(r.rec.total, 300); assert.strictEqual(r.rec.remain, 0);
// 3) الاتنين غيّروا العربون → الأكبر
r = m("wf_r", base, Object.assign({}, base, { deposit: 200, depositWallet: "كاش" }), Object.assign({}, base, { deposit: 500, depositWallet: "فودافون" }));
assert.strictEqual(r.rec.deposit, 500); assert.strictEqual(r.rec.depositWallet, "فودافون");
// 4) الفني قفل الأمر من السيرفر وأنا عدّلت الحالة → القفل من السحابة
r = m("wf_r", base, Object.assign({}, base, { status: "مجمد", work: "x" }), Object.assign({}, base, { status: "مكتمل", closed: true, paid: true, closeWallet: "عهدة", remain: 0 }));
assert.strictEqual(r.rec.closed, true); assert.strictEqual(r.rec.status, "مكتمل"); assert.strictEqual(r.rec.closeWallet, "عهدة"); assert.strictEqual(r.rec.work, "x");
// 5) سجل الحالات: الاتنين اتجمعوا من غير تكرار
const h0 = [{ from: "", to: "جديد", at: "2026-10-20T10:00:00Z" }];
r = m("wf_r", Object.assign({}, base, { statusHistory: h0 }), Object.assign({}, base, { statusHistory: h0.concat([{ from: "جديد", to: "مجمد", at: "2026-10-20T12:00:00Z" }]) }), Object.assign({}, base, { statusHistory: h0.concat([{ from: "جديد", to: "تحت التنفيذ", at: "2026-10-20T11:00:00Z" }]) }));
assert.deepStrictEqual(r.rec.statusHistory.map((x) => x.to), ["جديد", "تحت التنفيذ", "مجمد"]);
// 6) حقل اتشال في السحابة بس → يتشال
r = m("wf_d", { id: "d", a: 1, b: 2 }, { id: "d", a: 1, b: 2 }, { id: "d", a: 1 });
assert.deepStrictEqual(r.rec, { id: "d", a: 1 });

// التوصيل: الرفع بيدمج بدل التعارض لو الأصل معروف، والسحب كمان، والمسح بيسيب نسخة
assert.ok(/var b0 = job\.kind === "set" && remote && !SCOPED \? baseRec\(k, job\.id, job\.baseHash\) : null;/.test(s));
assert.ok(/return \{ state: "merged"/.test(s) && /mergedRecs\.push/.test(s));
assert.ok(/var mg = merge3\(k, bb, loc, rec\)\.rec;/.test(s), "السحب بالتغييرات");
assert.ok(/out\.push\(merge3\(k, bb, r, c\)\.rec\)/.test(s), "السحب الكامل");
assert.ok(/if \(COLS\[k\] && !pushing\[k\]\) \{ try \{ captureBases\(k\); \} catch \(e\) \{\} \}\s*\/\/[^\n]*\n    if \(!online\(\) \|\| pushing\[k\]\)/.test(s), "الأصل بيتحفظ قبل الرفع حتى أوفلاين");
assert.strictEqual((s.match(/tombData\(k, /g) || []).length, 3, "المسح العادي والرفع الكامل بيسيبوا نسخة");
assert.ok(/if \(dels >= 10 && dels > total \* 0\.1\)/.test(s));
assert.ok(/function showCloudDeleted/.test(s) && /wfSyncTrashBtn/.test(s));
console.log("sync-merge-tests: PASS (دمج حقل بحقل، العربون والقفل وسجل الحالات، نسخة المحذوف 30 يوم)");
