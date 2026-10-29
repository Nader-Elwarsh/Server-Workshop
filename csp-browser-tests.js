// فحص CSP في متصفح حقيقي (Chromium عبر Playwright): بيقدّم المشروع محليًا بسياسة _headers
// (Report-Only بتتحوّل لـ «فرض» جوه الفحص بس)، ويفتح كل صفحة HTML، ويجمع أي مخالفة CSP.
// التشغيل: node csp-browser-tests.js   (محتاج playwright؛ لو مش موجود بيقول كده ويخرج بنجاح من غير ما يدّعي إنه فحص)
// ملحوظة: الشبكة الخارجية (Firebase) ممكن تكون مقفولة في بيئة الفحص — الفحص بيعدّ مخالفات CSP بس، مش أخطاء الشبكة.
const http = require("http"), fs = require("fs"), path = require("path");
let pw; for (const p of ["playwright", "/opt/npm-tools/node_modules/playwright"]) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log("csp-browser-tests: SKIPPED (playwright غير متوفر) — لم يُجرَ أي فحص" + (process.env.CI ? " ← فشل في CI" : "")); process.exit(process.env.CI ? 1 : 0); }
const ROOT = __dirname;
const hdr = fs.readFileSync(path.join(ROOT, "_headers"), "utf8");
const block = hdr.split(/\n(?=\S)/).find((b) => b.startsWith("/*")) || "";
const ro = process.env.CSP_TEST_POLICY || (block.match(/Content-Security-Policy-Report-Only:\s*(.+)/) || [])[1];
if (!ro) { console.error("مفيش Content-Security-Policy-Report-Only في _headers"); process.exit(1); }
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const f = path.join(ROOT, u === "/" ? "index.html" : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Content-Security-Policy": ro });
  fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port + "/";
  const browser = await pw.chromium.launch();
  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html") && !/^(browser-interactive|debug-check)\.html$/.test(f)).sort();
  const bad = [];
  for (const f of pages) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    // مستخدم «مسجّل» محليًا عشان الصفحات ماتحوّلش على login على طول (الشبكة مش لازمة لفحص CSP)
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    page.on("console", (m) => { const t = m.text(); if (/Content Security Policy|Refused to (load|execute|apply|connect|frame)/i.test(t)) bad.push(f + ": " + t.slice(0, 300)); });
    page.on("pageerror", (e) => { if (/Content Security Policy|unsafe-eval|EvalError/i.test(String(e))) bad.push(f + ": " + String(e).slice(0, 300)); });
    try { await page.goto(base + f, { waitUntil: "load", timeout: 15000 }); await page.waitForTimeout(700); }
    catch (e) { /* صفحة بتعمل redirect أو بتستنى شبكة — مش موضوع CSP */ }
    await ctx.close();
  }
  await browser.close(); server.close();
  if (bad.length) { console.error("csp-browser-tests: FAIL (" + bad.length + ")\n" + Array.from(new Set(bad)).join("\n")); process.exit(1); }
  console.log("csp-browser-tests: PASS (" + pages.length + " صفحة اتفتحت بالسياسة مفروضة، صفر مخالفات CSP)");
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
