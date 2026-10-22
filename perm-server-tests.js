// الصلاحيات من السيرفر: قواعد Firestore (فحص ثابت) + سلوك المزامنة لما القواعد ترفض (Firestore وهمي)
const assert = require("assert"), fs = require("fs");
const rules = fs.readFileSync("firestore.rules", "utf8");
assert.strictEqual(rules, fs.readFileSync("firestore.rules.proposed", "utf8"), "النسختين متطابقين");
assert.ok(/function ownerS\(\)/.test(rules) && /function can\(ks\) \{ return ownerS\(\) \|\| me\(\)\.get\('p', \{\}\)\.keys\(\)\.hasAny\(ks\); \}/.test(rules));
assert.ok(!/token\.get\('role'/.test(rules), "مفيش اعتماد على role في التوكن (كان بيعتبر أي موظف من غير claim مالك)");
const block = (name) => { const i = rules.indexOf("match /" + name + "/{"); assert.ok(i > 0, "مفيش قاعدة لـ " + name); return rules.slice(i, rules.indexOf("\n    }", i)); };
const need = { customers: "customers.delete", devices: "devices.delete", requests: "requests.delete", parts: "inventory.delete", partMoves: "inventory.delete", invoices: "invoices.delete", walletTx: "wallets.delete", treasury: "treasury.delete", tasks: "tasks.delete", faultCodes: "faultcodes.delete", syncDeletes: "ownerS()" };
Object.keys(need).forEach((c) => { const b = block(c); assert.ok(b.includes(need[c]), c + " محتاج " + need[c]); assert.ok(!/allow read, write: if isStaff\(\);/.test(b), c + " مفتوح لأي موظف"); });
assert.ok(/match \/walletTx\/\{id\} \{[\s\S]*?txSrcOk\(request\.resource\.data\)/.test(rules), "حركة محفظة من غير صلاحية المحافظ = من شغلانته بس");
assert.ok(/match \/\{collection\}\/\{document=\*\*\} \{[\s\S]*?isStaff\(\) && ownerS\(\)/.test(rules), "أي مجموعة تانية للمالك بس");
assert.ok(/match \/staffAudit\/\{doc\} \{\s*allow read: if isStaff\(\) && ownerS\(\);/.test(rules));
// كل مجموعة بيقراها التطبيق ليها قاعدة صريحة (غير الـ catch-all) عشان الموظف المحدود
const sync = fs.readFileSync("firebase-sync.js", "utf8");
const cols = JSON.parse("{" + sync.match(/var COLS = \{([^}]+)\}/)[1].replace(/(\w+):/g, '"$1":') + "}");
Object.values(cols).forEach((c) => block(c));

// ---- سلوك: موظف محدود (من غير المحافظ، ومن غير إضافة أكواد) ----
const src = fs.readFileSync(__dirname + "/scoped-sync-tests.js", "utf8");
const H = eval(src.slice(0, src.indexOf("(async () => {")) + "\n({ makeDevice, bootSession, seedCloud })");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const denied = () => { const e = new Error("Missing or insufficient permissions."); e.code = "permission-denied"; return e; };
function limit(db, noRead, noWrite) {
  const wrapRef = (r, col) => Object.assign({}, r, { get: () => (noRead[col] ? Promise.reject(denied()) : r.get()), set: (...a) => (noWrite[col] ? Promise.reject(denied()) : r.set(...a)), update: (...a) => (noWrite[col] ? Promise.reject(denied()) : r.update(...a)), delete: () => (noWrite[col] ? Promise.reject(denied()) : r.delete()) });
  const wrapQ = (q, col) => ({ where: (...a) => wrapQ(q.where(...a), col), orderBy: () => wrapQ(q, col), limit: () => wrapQ(q, col), get: () => (noRead[col] ? Promise.reject(denied()) : q.get()), onSnapshot: () => () => {} });
  return Object.assign({}, db, {
    collection: (col) => Object.assign(wrapQ(db.collection(col), col), { doc: (id) => Object.assign(wrapRef(db.collection(col).doc(id), col), { col, id }) }),
    batch: () => { const b = db.batch(), bad = []; return { set: (r, ...a) => { if (noWrite[r.col]) bad.push(r.col); return b.set(r, ...a); }, delete: (r) => { if (noWrite[r.col]) bad.push(r.col); return b.delete(r); }, update: (r, ...a) => { if (noWrite[r.col]) bad.push(r.col); return b.update(r, ...a); }, commit: () => (bad.length ? Promise.reject(denied()) : b.commit()) }; },
    runTransaction: (fn) => db.runTransaction(async (tx) => fn({ get: (r) => (noRead[r.col] ? Promise.reject(denied()) : tx.get(r)), set: (r, ...a) => { if (noWrite[r.col]) throw denied(); return tx.set(r, ...a); }, update: (r, ...a) => { if (noWrite[r.col]) throw denied(); return tx.update(r, ...a); }, delete: (r) => { if (noWrite[r.col]) throw denied(); return tx.delete(r); } }))
  });
}
(async () => {
  const cloud = H.seedCloud(), base = cloud.session;
  cloud.data.faultCodes = { f1: { id: "f1", code: "E1", title: "باب" } };
  cloud.session = (uid, scoped) => limit(base(uid, scoped), { walletTx: 1, treasury: 1 }, { walletTx: 1, treasury: 1, faultCodes: 1 });
  const ls = H.makeDevice({ wf_wallet_tx: JSON.stringify([{ id: "old", amount: 1 }]) });
  const s = await H.bootSession({ cloud, ls, uid: "boss", scoped: false });
  await s.sb.wfCloudSyncNow(); await sleep(50);
  assert.ok(JSON.parse(ls.getItem("wf_r")).length > 0, "الأوامر نزلت عادي");
  assert.deepStrictEqual(JSON.parse(ls.getItem("wf_wallet_tx")), [], "قسم مالوش صلاحية يشوفه: فاضي على الجهاز ومش موقف المزامنة");
  // كود جديد (مالوش صلاحية إضافة) → بيترجع ويتشال، ورسالة واضحة
  const fc = JSON.parse(ls.getItem("wf_fault_codes") || "[]"); fc.push({ id: "f2", code: "E2", title: "جديد" }); fc[0].title = "باب معدّل"; ls.setItem("wf_fault_codes", JSON.stringify(fc));
  await sleep(900); await s.sb.wfCloudSyncNow(); await sleep(50);
  const after = JSON.parse(ls.getItem("wf_fault_codes"));
  assert.deepStrictEqual(after.map((x) => x.id), ["f1"], "الجديد اتشال"); assert.strictEqual(after[0].title, "باب", "التعديل رجع");
  assert.ok(s.alerts.some((m) => /مالكش صلاحية/.test(m)), "رسالة صلاحية");
  assert.ok(!cloud.data.faultCodes.f2 && cloud.data.faultCodes.f1.title === "باب");
  // العملاء (مسموح) بيترفعوا عادي
  const cs = JSON.parse(ls.getItem("wf_c")); cs[0].name = "اسم جديد"; ls.setItem("wf_c", JSON.stringify(cs));
  await sleep(900); await s.sb.wfCloudSyncNow(); await sleep(50);
  assert.strictEqual(cloud.data.customers[cs[0].id].name, "اسم جديد");
  console.log("perm-server-tests: PASS (قواعد بالصلاحيات لكل قسم، المزامنة بتتعامل مع الرفض من غير ما تقف)");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
