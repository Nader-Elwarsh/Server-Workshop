// اختبار سلوكي: firebase-sync.js الحقيقي على Firestore وهمي (نفس أداة scoped-sync-tests) — جهاز المالك
const assert = require("assert"), fs = require("fs");
const src = fs.readFileSync(__dirname + "/scoped-sync-tests.js", "utf8");
const H = eval(src.slice(0, src.indexOf("(async () => {")) + "\n({ makeDevice, bootSession, seedCloud })");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const cloud = H.seedCloud(), ls = H.makeDevice({});
  const s = await H.bootSession({ cloud, ls, uid: "boss", scoped: false });
  await s.sb.wfCloudSyncNow(); await sleep(50);
  assert.ok(JSON.parse(ls.getItem("wf_r")).some((r) => r.id === "o4"), "المالك نزّل الأوامر");
  // الفني (أو جهاز تاني) غيّر الحالة والأجرة في السحابة، وأنا على الجهاز ده سجلت عربون — من غير ما أشوف تعديله
  Object.assign(cloud.data.requests.o4, { status: "تحت التنفيذ", labor: 300, total: 300 });
  const rows = JSON.parse(ls.getItem("wf_r")); Object.assign(rows.find((r) => r.id === "o4"), { deposit: 1000, depositWallet: "كاش" });
  ls.setItem("wf_r", JSON.stringify(rows));
  await s.sb.wfCloudSyncNow(); await sleep(900); await s.sb.wfCloudSyncNow(); await sleep(50);
  const c = cloud.data.requests.o4, l = JSON.parse(ls.getItem("wf_r")).find((r) => r.id === "o4");
  assert.strictEqual(c.deposit, 1000, "العربون وصل السحابة"); assert.strictEqual(c.status, "تحت التنفيذ", "تعديل الجهاز التاني ما ضاعش"); assert.strictEqual(c.labor, 300);
  assert.strictEqual(l.deposit, 1000); assert.strictEqual(l.status, "تحت التنفيذ", "الجهاز ده شاف تعديل التاني");
  assert.strictEqual(Object.keys(JSON.parse(ls.getItem("wf_sync_conflicts") || "{}")).length, 0, "من غير شاشة تعارض");
  // المسح بيسيب نسخة في syncDeletes
  const cs = JSON.parse(ls.getItem("wf_c")).filter((x) => x.id !== "c-o4"); ls.setItem("wf_c", JSON.stringify(cs));
  await sleep(900); await s.sb.wfCloudSyncNow(); await sleep(50);
  assert.ok(!cloud.data.customers["c-o4"], "اتمسح من السحابة");
  const t = cloud.data.syncDeletes && cloud.data.syncDeletes["customers__c-o4"];
  assert.ok(t && t.rec && JSON.parse(t.rec).name === "عميل c-o4" && t.exp, "نسخة المحذوف موجودة ليها تاريخ انتهاء");
  console.log("sync-merge-e2e-tests: PASS (عربون + تعديل من جهاز تاني بيتدمجوا، نسخة المحذوف)");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
