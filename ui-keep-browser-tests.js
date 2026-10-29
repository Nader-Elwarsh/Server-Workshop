// «ماتطلعنيش برّه»: في متصفح حقيقي (Chromium/Playwright) — الإعدادات ← الحسابات:
// إضافة / ترتيب / إعادة تسمية / حذف حساب لازم تسيب قايمة الحسابات مفتوحة، والقسم نفسه مفتوح، ومكانك في الصفحة زي ما هو،
// والتركيز يرجع لخانة «اسم جديد» بعد الإضافة. التشغيل: node ui-keep-browser-tests.js
const http = require("http"), fs = require("fs"), path = require("path");
let pw; for (const p of ["playwright", "/opt/npm-tools/node_modules/playwright"]) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log("ui-keep-browser-tests: SKIPPED (playwright غير متوفر) — لم يُجرَ أي فحص" + (process.env.CI ? " ← فشل في CI" : "")); process.exit(process.env.CI ? 1 : 0); }
const ROOT = __dirname, UID = "keep-owner";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname), f = path.join(ROOT, u === "/" ? "index.html" : u);
  if (process.env.UIKEEP_OFF && /ui-keep\.js$/.test(u)) { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end("/* off */"); } // لإثبات إن الاختبار بيكشف المشكلة القديمة
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
const assert = (c, m) => { if (!c) throw new Error(m); };
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port + "/";
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 800 } });
  await ctx.addInitScript(({ UID }) => {
    Object.defineProperty(Navigator.prototype, "onLine", { get: () => false });
    if (!sessionStorage.getItem("__seeded")) {
      localStorage.setItem("wf_s", JSON.stringify({ wallets: ["كاش", "فودافون كاش", "إنستاباي", "أورنج كاش", "محفظة 5", "محفظة 6", "محفظة 7", "محفظة 8"], walletCategories: ["شخصي", "تشغيل"] }));
      localStorage.setItem("wf_cloud_hydrated_uid", UID); localStorage.setItem("wf_is_staff_uid", UID); localStorage.setItem("wf_staff_ok_at", String(Date.now())); localStorage.setItem("wf_theme", "light");
      sessionStorage.setItem("__seeded", "1");
    }
    window.confirm = () => true; window.alert = () => {};
  }, { UID });
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(base + "settings.html", { waitUntil: "load" }); await page.waitForTimeout(1500);
  // افتح قسم الحسابات (أيقونة الشبكة) ثم قايمة «الحسابات» نفسها
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll(".st-nav [data-st]")).find((x) => /الحسابات/.test(x.textContent)); b.click(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelector("#settings-list-wallets > details > summary").click(); });
  await page.waitForTimeout(200);
  const state = () => page.evaluate(() => {
    const d = document.querySelector("#settings-list-wallets > details"), panel = document.getElementById("wallet-settings-panel");
    return { listOpen: !!(d && d.open), panelShown: !!(panel && !panel.classList.contains("st-hide")), y: Math.round(window.scrollY), focus: document.activeElement && document.activeElement.id,
      wallets: Array.from(document.querySelectorAll("#settings-list-wallets .inline-edit-input")).map((i) => i.value) };
  });
  // انزل لآخر القايمة (زي الموبايل) عشان نتأكد إن المكان مابيتنطّش
  await page.evaluate(() => { const r = document.querySelector("#settings-list-wallets .sortable-list").lastElementChild; r.scrollIntoView({ block: "center" }); });
  await page.waitForTimeout(200);
  let s0 = await state();
  assert(s0.listOpen && s0.panelShown, "البداية: القايمة مفتوحة " + JSON.stringify(s0));
  const steps = [];
  if (process.env.UIKEEP_DEBUG) await page.evaluate(() => { window.__tr = []; const o = Element.prototype.scrollIntoView; Element.prototype.scrollIntoView = function () { window.__tr.push("sIV " + (this.id || this.className) + " " + new Error().stack.split("\n")[2]); return o.apply(this, arguments); }; const st = window.scrollTo; window.scrollTo = function () { window.__tr.push("sTo " + JSON.stringify([...arguments]) + " " + new Error().stack.split("\n")[2]); return st.apply(this, arguments); }; window.addEventListener("scroll", () => window.__tr.push("y=" + Math.round(scrollY) + " h=" + document.documentElement.scrollHeight)); });
  // 1) ترتيب: انزل آخر عنصر قبل الأخير ⬆️
  let before = await state();
  await page.evaluate(() => { const rows = document.querySelectorAll("#settings-list-wallets .inline-edit-row"); rows[rows.length - 1].querySelectorAll("button")[0].click(); });
  await page.waitForTimeout(300); steps.push(["ترتيب", await state(), before]);
  if (process.env.UIKEEP_DEBUG) console.log((await page.evaluate(() => window.__tr)).join("\n"));
  // 2) إعادة تسمية
  // تعديل زي المستخدم: يضغط على الخانة (المتصفح يوصّلها للشاشة)، يكتب، ويخرج منها
  if (!steps[0][1].listOpen) throw new Error("ترتيب: قايمة الحسابات اتقفلت بعد التعديل (ده سلوك «الخروج من الإعدادات»)");
  const inp = page.locator("#settings-list-wallets .inline-edit-input").nth(2);
  await inp.click({ timeout: 3000 }); await page.waitForTimeout(150); before = await state();
  await inp.fill("إنستاباي 2"); await page.keyboard.press("Tab");
  await page.waitForTimeout(300); steps.push(["تعديل", await state(), before]);
  // 3) إضافة بالكيبورد (Enter) زي المستخدم
  await page.click("#newInlineItem-wallets"); await page.waitForTimeout(150); before = await state();
  await page.keyboard.type("حساب جديد"); await page.keyboard.press("Enter");
  await page.waitForTimeout(300); steps.push(["إضافة", await state(), before]);
  // 4) حذف (زرار الحذف بيطلب ضغطة تأكيد تانية)
  await page.evaluate(() => { const rows = document.querySelectorAll("#settings-list-wallets .inline-edit-row"); rows[rows.length - 1].scrollIntoView({ block: "center" }); });
  await page.waitForTimeout(150); before = await state();
  await page.locator("#settings-list-wallets .inline-edit-row").last().locator("button").nth(2).click();
  await page.waitForTimeout(150);
  await page.locator("#settings-list-wallets .inline-edit-row").last().locator("button").nth(2).click();
  await page.waitForTimeout(400); steps.push(["حذف", await state(), before]);
  await browser.close(); server.close();
  const report = steps.map(([n, s, b]) => `${n}: قايمة=${s.listOpen ? "مفتوحة" : "مقفولة"} قسم=${s.panelShown ? "ظاهر" : "مخفي"} المكان ${b.y}→${s.y} تركيز=${s.focus || "-"}`).join("\n");
  console.log(report);
  steps.forEach(([n, s, b]) => { assert(s.listOpen, n + ": قايمة الحسابات اتقفلت (الخروج من الإعدادات)"); assert(s.panelShown, n + ": قسم الحسابات اختفى"); assert(Math.abs(s.y - b.y) < 80, n + ": مكان الصفحة اتنطّ من " + b.y + " لـ " + s.y); });
  { const b = steps[0][2].wallets, a = steps[0][1].wallets, n = b.length; assert(a[n - 2] === b[n - 1] && a[n - 1] === b[n - 2], "الترتيب اتنفذ فعلًا: " + a); }
  assert(steps[1][1].wallets.includes("إنستاباي 2"), "التعديل اتنفذ فعلًا");
  assert(steps[2][1].wallets.includes("حساب جديد"), "الإضافة اتنفذت فعلًا");
  assert(steps[2][1].focus === "newInlineItem-wallets", "بعد الإضافة التركيز رجع لخانة «اسم جديد»: " + steps[2][1].focus);
  assert(!steps[3][1].wallets.includes(steps[2][1].wallets[steps[2][1].wallets.length - 1]), "الحذف اتنفذ فعلًا: " + steps[3][1].wallets);
  console.log("ui-keep-browser-tests: PASS (ترتيب/تعديل/إضافة/حذف: القايمة والقسم فضلوا مفتوحين، المكان ثابت، التركيز رجع للإضافة)");
})().catch((e) => { console.error("ui-keep-browser-tests: FAIL — " + e.message); server.close(); process.exit(1); });
