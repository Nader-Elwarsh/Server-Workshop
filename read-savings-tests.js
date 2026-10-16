/* توفير قراءات Firestore: الأماكن اللي كانت بتقرا مجموعات كاملة مع كل فتحة صفحة أو كل ربع ساعة. */
const assert = require("assert");
const fs = require("fs");
const read = (f) => fs.readFileSync(__dirname + "/" + f, "utf8");
const { createNotifier } = require("./functions/notify");

// 1) الواجهة
const sync = read("firebase-sync.js");
assert.ok(!/where\("portal", "==", true\)\.onSnapshot/.test(sync), "مفيش مراقبة لكل عملاء البوابة");
assert.ok(/collection\(p\[1\]\)\.where\("updatedAt", ">", since\)\.onSnapshot/.test(sync), "مراقبة اللي اتعدّل من البوابة بس");
assert.ok(/reqSnap \? Promise\.resolve\(reqSnap\)/.test(sync), "تحويل طلبات البوابة بيستخدم نسخة المراقبة");
assert.ok(/skipS \? Promise\.resolve\(null\) : db\.collection\("settings"\)\.get\(\)/.test(sync), "الإعدادات بتتقري بس لو اتغيّرت");
assert.ok(/meta\.set\(v, \{ merge: true \}\)/.test(sync) && /touchMeta\(false, true\)/.test(sync), "ختم نسخة الإعدادات");
assert.ok(/FULL_EVERY = 48 \* 60 \* 60 \* 1000/.test(sync));
const nc = read("notif-center.js");
assert.ok(/base\.where\("at", ">", top\)/.test(nc) && /NC_FULL_MS = 20 \* 60000/.test(nc), "الإشعارات: الجديد بس مع كل صفحة");
assert.ok(!/\.limit\(60\)\.onSnapshot/.test(nc));
const portal = read("portal.html");
assert.strictEqual((portal.match(/portal:true,createdAt:FV\.serverTimestamp\(\),updatedAt:FV\.serverTimestamp\(\)/g) || []).length, 2, "إنشاء عميل/جهاز من البوابة بيختم updatedAt");
assert.ok(/wf_perm_ref_at/.test(read("app-permissions.js")));
assert.ok(/tx\.set\(ref, v, \{ merge: true \}\)/.test(read("functions/tech-ledger.js")));

// 2) السيرفر: الأوامر المتأخرة بتتقري شريحة جديدة بس، ومفيش إعادة فحص لأمر اتبعت عنه
function mockDb(seed) {
  const data = JSON.parse(JSON.stringify(seed || {})); let reads = 0;
  const docRef = (path) => ({ path, id: path.split("/").pop(),
    get: async () => { reads++; return { exists: data[path] !== undefined, data: () => (data[path] === undefined ? undefined : JSON.parse(JSON.stringify(data[path]))) }; },
    set: async (v) => { data[path] = JSON.parse(JSON.stringify(v)); }, delete: async () => { delete data[path]; } });
  const query = (col, filters) => ({
    where: (f, op, v) => query(col, filters.concat([[f, op, v]])), orderBy: () => query(col, filters), offset: () => query(col, filters), limit: () => query(col, filters),
    get: async () => {
      const cmp = { "==": (x, v) => x === v, ">": (x, v) => x != null && x > v, ">=": (x, v) => x != null && x >= v, "<": (x, v) => x != null && x < v, "<=": (x, v) => x != null && x <= v };
      const ids = Object.keys(data).filter((p) => p.startsWith(col + "/") && p.slice(col.length + 1).indexOf("/") < 0 && filters.every(([f, op, v]) => cmp[op](data[p][f], v)));
      reads += Math.max(1, ids.length);
      const docs = ids.map((p) => ({ id: p.split("/").pop(), data: () => JSON.parse(JSON.stringify(data[p])), ref: docRef(p) }));
      return { docs, size: docs.length, empty: !docs.length };
    } });
  return { data, doc: docRef, collection: (c) => query(c, []), reads: () => reads };
}
(async () => {
  const seed = { "staff/own": { name: "نادر", role: "owner" }, "customers/c1": { name: "أحمد" } };
  for (let i = 0; i < 20; i++) seed["requests/o" + i] = { no: "O" + i, customerId: "c1", visit: "2026-10-14T1" + (i % 10) + ":00", status: "جديد", closed: false };
  const db = mockDb(seed); let clock = new Date("2026-10-15T06:00:00Z");
  const N = createNotifier({ db, now: () => clock });
  const r1 = await N.tick(); assert.strictEqual(r1.overdue, 20);
  assert.ok(db.data["serverConfig/notifyTick"] && db.data["serverConfig/notifyTick"].overdueToMs, "اتحفظ لحد فين اتفحص");
  clock = new Date(clock.getTime() + 15 * 60000);
  const before = db.reads(); const r2 = await N.tick(); const used = db.reads() - before;
  assert.strictEqual(r2.overdue, 0);
  assert.ok(used < 12, "الربع ساعة التانية بتقرا شوية مستندات بس، مش كل أوامر اليومين: " + used);
  // أمر بيعدّي ميعاده دلوقتي بيتبعت عنه مرة واحدة
  db.data["requests/new"] = { no: "NEW", customerId: "c1", visit: "2026-10-15T06:20", status: "جديد", closed: false };
  clock = new Date("2026-10-15T07:30:00Z");
  assert.strictEqual((await N.tick()).overdue, 1);
  clock = new Date(clock.getTime() + 15 * 60000);
  assert.strictEqual((await N.tick()).overdue, 0);
  console.log("read-savings-tests: PASS (بوابة، إشعارات، إعدادات، صلاحيات، أوامر متأخرة على السيرفر)");
})().catch((e) => { console.error(e); process.exit(1); });
