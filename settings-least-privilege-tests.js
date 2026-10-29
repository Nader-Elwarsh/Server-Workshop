// 🔐 أقل صلاحية في مجموعة settings: موظف من غير صلاحية المصروفات/أجور الفنيين
// القواعد بترفض له استعلام المجموعة كلها، فالمزامنة لازم تقرا المستندات المسموحة بالاسم وتكمّل.
// (Firestore وهمي بيحاكي سلوك القواعد: list مرفوض، وget مرفوض لـ wfkv_wf_e و wfkv_wf_techpay بس)
const assert = require("assert"), fs = require("fs");
const src = fs.readFileSync(__dirname + "/scoped-sync-tests.js", "utf8");
const H = eval(src.slice(0, src.indexOf("(async () => {")) + "\n({ makeDevice, bootSession, seedCloud })");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const denied = () => { const e = new Error("Missing or insufficient permissions."); e.code = "permission-denied"; return e; };
const SECRET = /^wfkv_wf_(e|techpay)(~\d+)?$/;

function limitSettings(db, log) {
  const wrapQ = (q, col) => ({ where: (...a) => wrapQ(q.where(...a), col), orderBy: () => wrapQ(q, col), limit: () => wrapQ(q, col),
    get: () => { if (col === "settings") { log.push("list"); return Promise.reject(denied()); } return q.get(); }, onSnapshot: (...a) => (q.onSnapshot ? q.onSnapshot(...a) : () => {}) });
  return Object.assign({}, db, {
    collection: (col) => {
      const base = db.collection(col);
      return Object.assign(wrapQ(base, col), {
        doc: (id) => {
          const r = base.doc(id);
          return Object.assign({}, r, { col, id, get: () => { if (col === "settings") log.push("get:" + id); return col === "settings" && SECRET.test(id) ? Promise.reject(denied()) : r.get(); } });
        }
      });
    }
  });
}

(async () => {
  // سحابة فيها: إعدادات عامة + مصروفات (سرية) + أجور فنيين (سرية) + سجل متابعة (مسموح)
  const cloud = H.seedCloud(), base = cloud.session, log = [];
  const follow = JSON.stringify([{ id: "f1", note: "اتصال" }]);
  Object.assign(cloud.data.settings, { "wfkv_wf_techpay": { n: 1 }, "wfkv_wf_techpay~0": { v: "[{\"pay\":50}]" }, "wfkv_wf_followup_log": { n: 1, h: "x" }, "wfkv_wf_followup_log~0": { v: follow } });
  cloud.session = (uid, scoped) => limitSettings(base(uid, scoped), log);
  const ls = H.makeDevice({});
  const s = await H.bootSession({ cloud, ls, uid: "boss", scoped: false });
  await s.sb.wfCloudSyncNow(); await sleep(50);

  assert.ok(log.includes("list"), "جرّب استعلام المجموعة الأول");
  assert.ok(log.includes("get:global") && log.includes("get:wfkv_wf_followup_log~0"), "رجع للقراءة بالاسم: " + log.join(","));
  assert.ok(JSON.parse(ls.getItem("wf_r")).length > 0, "المزامنة كمّلت: الأوامر نزلت");
  assert.deepStrictEqual(JSON.parse(ls.getItem("wf_s") || "{}").wallets, ["كاش"], "الإعدادات العامة نزلت");
  assert.strictEqual(ls.getItem("wf_followup_log"), follow, "القايمة المسموحة نزلت كاملة");
  assert.ok(!/secret|"pay"/.test(String(ls.getItem("wf_e")) + String(ls.getItem("wf_techpay"))), "المصروفات وأجور الفنيين ما نزلوش");
  assert.deepStrictEqual(s.sb.wfSettingsNoAccess().sort(), ["wf_e", "wf_techpay"], "متسجّل إنهم ممنوعين");

  // تعديل محلي على المصروفات (مثلًا من صفحة اتفتحت بالغلط) ما يتحاولش يترفع ولا يطلّع رسالة كل شوية
  const before = s.alerts.length;
  ls.setItem("wf_e", JSON.stringify([{ id: "x1", amount: 5 }]));
  await sleep(900); await s.sb.wfCloudSyncNow(); await sleep(50);
  assert.strictEqual(cloud.data.settings["wfkv_wf_e~0"].v, "[{\"secret\":1}]", "مصروفات السحابة ما اتكتبش فوقها");
  assert.strictEqual(s.alerts.length, before, "مفيش رسائل رفض متكررة");

  // المالك (الاستعلام الكامل مسموح): نفس السلوك القديم بالظبط
  const cloud2 = H.seedCloud(), ls2 = H.makeDevice({});
  const s2 = await H.bootSession({ cloud: cloud2, ls: ls2, uid: "boss", scoped: false });
  await s2.sb.wfCloudSyncNow(); await sleep(50);
  assert.strictEqual(ls2.getItem("wf_e"), "[{\"secret\":1}]", "المالك بينزّل المصروفات زي الأول");
  assert.deepStrictEqual(s2.sb.wfSettingsNoAccess(), [], "مفيش أقسام ممنوعة للمالك");

  // القاعدة نفسها (فحص ثابت): شرط من غير اسم المستند للاستعلام الكامل + حماية المستندين السريين
  const rules = fs.readFileSync("firestore.rules", "utf8");
  const blk = rules.slice(rules.indexOf("match /settings/{doc}"), rules.indexOf("match /parts/{id}"));
  assert.ok(!/allow read: if isStaff\(\);/.test(blk), "القراءة مش مفتوحة لأي موظف");
  assert.ok(/doc\.matches\('\^wfkv_wf_e\(~\[0-9\]\+\)\?\$'\) && can\(\['wallets\.view'/.test(blk), "المصروفات بصلاحية المحافظ");
  assert.ok(/doc\.matches\('\^wfkv_wf_techpay\(~\[0-9\]\+\)\?\$'\) && can\(\['techpay\.manage'/.test(blk), "الأجور بصلاحيتها");
  console.log("settings-least-privilege-tests: PASS (رفض الاستعلام الكامل → قراءة بالاسم، المسموح نزل، السري لأ، مفيش رفع مرفوض، المالك زي ما هو)");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
