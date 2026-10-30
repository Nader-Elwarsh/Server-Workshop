// بوابة العملاء أوفلاين: بعد ما الـ Service Worker يتفعّل، إعادة تحميل portal.html من غير نت لازم تلاقي كل ملفات الهيكل
// (مكتبات Firebase وإعدادها وهوية النظام...) من الكاش. قبل الإصلاح كانت بتتحمّل من الشبكة بس فالصفحة ما كانتش بتشتغل.
// التشغيل: node portal-offline-browser-tests.js
const http = require("http"), fs = require("fs"), path = require("path");
let pw; for (const p of ["playwright", "/opt/npm-tools/node_modules/playwright"]) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log("portal-offline-browser-tests: SKIPPED (playwright غير متوفر) — لم يُجرَ أي فحص" + (process.env.CI ? " ← فشل في CI" : "")); process.exit(process.env.CI ? 1 : 0); }
const ROOT = __dirname, TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname), f = path.join(ROOT, u === "/" ? "index.html" : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  // زي Cloudflare: الملفات بتتراجع كل مرة، فمفيش كاش للمتصفح يخبّي مشكلة الـ Service Worker
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control": "max-age=0, must-revalidate" }); fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port + "/";
  const browser = await pw.chromium.launch(), ctx = await browser.newContext(), page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(base + "portal.html", { waitUntil: "load" }); await page.waitForTimeout(2500);
  const active = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active); });
  await ctx.setOffline(true);
  const fails = []; page.on("requestfailed", (q) => { if (q.url().startsWith(base)) fails.push(q.url().replace(base, "")); });
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(2000);
  const rendered = await page.evaluate(() => (document.getElementById("app") || {}).innerHTML ? document.getElementById("app").innerHTML.length : 0);
  await browser.close(); server.close();
  if (!active) throw new Error("الـ Service Worker ما اتفعّلش");
  if (fails.length) throw new Error("ملفات الهيكل ما اتحمّلتش أوفلاين: " + fails.join(", "));
  if (rendered < 500) throw new Error("الصفحة ما اترسمتش أوفلاين (" + rendered + ")");
  console.log("portal-offline-browser-tests: PASS (إعادة تحميل البوابة بدون نت: كل ملفات الهيكل اتحمّلت من الكاش والصفحة اترسمت)");
})().catch((e) => { console.error("portal-offline-browser-tests: FAIL — " + e.message); server.close(); process.exit(1); });
