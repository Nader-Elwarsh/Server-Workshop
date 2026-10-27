// حماية البوابة + حذف بيراعي الأرشيف (batch99):
// معرّفات البوابة حروف/أرقام بس، ميعاد الزيارة متنضّف، الطلبات الزيادة بتستنى موافقة، والعميل اللي ليه أرشيف مايتمسحش.
"use strict";
const assert = require("assert"), fs = require("fs"), vm = require("vm"), path = require("path");
const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
(async () => {
  // 1) القواعد: معرّف آمن + أطوال + شكل الميعاد (في النسختين)
  ["firestore.rules", "firestore.rules.proposed"].forEach((f) => {
    const r = read(f);
    assert.ok(/function safeId\(x\) \{ return x is string && x\.matches\('\^\[A-Za-z0-9_-\]\{1,80\}\$'\); \}/.test(r), f);
    assert.ok((r.match(/&& safeId\(id\)/g) || []).length === 2, f + ": devices + portalRequests");
    assert.ok(/request\.resource\.data\.visit\.matches\(/.test(r) && /portalText\(request\.resource\.data, 'name', 80\)/.test(r), f);
  });
  // 2) الميعاد في صفحة الأمر متنضّف
  assert.ok(read("app-requests.js").includes('value="${esc(visitInputValue(r.visit))}"'));
  // 3) تحويل طلبات البوابة: رفض المعرّف الغريب، تنضيف الميعاد، والحد اليومي/للعميل
  const sync = read("firebase-sync.js");
  assert.ok(/SAFE_ID = \/\^\[A-Za-z0-9_~\.\\-\]\{1,120\}\$\//.test(sync));
  assert.ok(/rejectReason: "bad_id"/.test(sync) && /holdReason: \(openBy\[p\.customerId\] \|\| 0\) >= 2 \? "customer_open" : "daily_limit"/.test(sync));
  assert.ok(/if \(p\.hold === true && p\.approved !== true\) return;/.test(sync));
  assert.ok(read("portal-admin.html").includes("data-hold-ok"));
  assert.ok(/callServer\("archiveRepointCustomer"/.test(sync), "الدمج بينقل الأرشيف");
  // 4) حذف عميل ليه أوامر في الأرشيف بيتمنع
  const src = read("app-delete-tools.js").match(/async function archivedOrdersCount[\s\S]*?window\.archiveDeleteGuard=archiveDeleteGuard;/)[0];
  const alerts = [], store = { wf_arch_cache: JSON.stringify({ cust: { c1: { n: 3 } } }) };
  const ctx = { firebase: { apps: [1] }, WFStorage: { getItem: (k) => store[k] || null }, navigator: { onLine: false }, alert: (m) => alerts.push(m), confirm: () => false, window: {}, Promise, setTimeout, String, JSON };
  ctx.window = ctx; vm.runInNewContext(src, ctx);
  assert.strictEqual(await ctx.archiveDeleteGuard("customerId", "c1", "العميل"), false);
  assert.ok(/3 أمر قديم في الأرشيف/.test(alerts[0]));
  assert.strictEqual(await ctx.archiveDeleteGuard("deviceId", "d1", "الجهاز"), false, "أوفلاين ومش معروف = بيسأل (وهنا قال لأ)");
  ctx.confirm = () => true;
  assert.strictEqual(await ctx.archiveDeleteGuard("deviceId", "d1", "الجهاز"), true);
  assert.ok(/archiveDeleteGuard\("customerId", cid/.test(read("workshop-mini-enhancements.js")) && /archiveDeleteGuard\("deviceId", did/.test(read("workshop-mini-enhancements.js")));
  // 5) تنضيف الصور اليتيمة بيشوف التيست مود والأرشيف
  const mediaSrc = read("functions/media.js");
  const scanList = (/ORPHAN_SCAN_COLLECTIONS = \[([^\]]*)\]/.exec(mediaSrc) || [])[1] || "";
  for (const c of ["faultCodes", "archRequests", "invoices", "portalPosts"]) assert.ok(scanList.includes('"' + c + '"'), "تنضيف اليتيمة لازم يفحص " + c);
  console.log("portal-guard-tests: PASS (معرّفات البوابة، الميعاد، حد التحويل التلقائي، الحذف والأرشيف، الصور اليتيمة)");
})().catch((e) => { console.error(e); process.exit(1); });
