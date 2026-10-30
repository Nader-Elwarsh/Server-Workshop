// فحص حقن HTML/JS في متصفح حقيقي (Chromium عبر Playwright) لصفحات الموظفين والبوابة.
// بيحط بيانات خبيثة في التخزين المحلي (اسم عميل، عنوان، موديل، عطل، ملاحظات، سبب حركة، اسم قطعة…)
// بنوعين: وسوم HTML («<img onerror>») وكسر خاصية بعلامة تنصيص من غير < > (البوابة بتشيل < > بس، فده النوع الأخطر)،
// ويفتح الصفحات في الوضع الأوفلاين (جلسة موظف محفوظة)، ويتأكد إن مفيش أي كود اتنفذ ولا خاصية on* اتحقنت في الصفحة.
// التشغيل: node xss-browser-tests.js
const http = require("http"), fs = require("fs"), path = require("path");
let pw; for (const p of ["playwright", "/opt/npm-tools/node_modules/playwright"]) { try { pw = require(p); break; } catch (e) {} }
if (!pw) { console.log("xss-browser-tests: SKIPPED (playwright غير متوفر) — لم يُجرَ أي فحص" + (process.env.CI ? " ← فشل في CI" : "")); process.exit(process.env.CI ? 1 : 0); }
const ROOT = __dirname;
const TAG = (k) => `<img src=x onerror="window.__xss=(window.__xss||[]).concat('${k}')">`;
const QUOTE = (k) => `x" autofocus onfocus="window.__xss=(window.__xss||[]).concat('${k}')" data-a="`;
const SQUOTE = (k) => `x' autofocus onfocus='window.__xss=(window.__xss||[]).concat("${k}")' data-b='`;
// كل نوع حقن في جولة لوحده (لو اتجمعوا في نص واحد علامات التنصيص بتبوّظ بعض والفحص يبقى أعمى — اتكشف بصفحة canary)
let MODE = TAG; const P = (k) => MODE(k);
const now = new Date().toISOString(), today = now.slice(0, 10);
const UID = "xss-owner";
function seed() {
  const c = [{ id: "c1", name: P("cname"), phone: "01005781925", phone2: P("phone2"), email: P("email"), mainAddress: { center: P("center"), village: P("village"), street: P("street") }, createdAt: now, portal: true }];
  const d = [{ id: "d1", customerId: "c1", type: P("dtype"), brand: P("brand"), model: P("model"), category: P("dcat"), desc: P("desc"), createdAt: now }];
  const r = [{ id: "r1", no: "W26-10-30-1", customerId: "c1", deviceId: "d1", status: "جديد", fault: P("fault"), customerNote: P("cnote"), work: P("work"), executionPlace: "عند العميل", visit: today, tag: "", createdAt: now,
    parts: [{ external: true, name: P("extpart"), qty: 1, sell: 10, cost: 5 }, { partId: "p1", qty: 1, sell: 10, cost: 5 }], partsTotal: 20, partsCost: 10, labor: 100, total: 120, deposit: 20, remain: 100, depositWallet: "كاش", source: "portal",
    statusHistory: [{ from: "", to: "جديد", at: now, note: P("histnote") }], techName: P("tech") }];
  const old = new Date(Date.now() - 60 * 86400000).toISOString(), wu = new Date(Date.now() + 20 * 86400000).toISOString();
  r.push({ id: "r2", no: "W26-08-30-1", customerId: "c2", deviceId: "d1", status: "مكتمل", fault: P("fault2"), customerNote: P("cnote2"), work: P("work2"), executionPlace: "الورشة", visit: old.slice(0, 10), createdAt: old, closed: true, paid: true, paidAt: old, closedAt: old,
    partsTotal: 0, labor: 50, total: 50, deposit: 0, remain: 0, warrantyDays: 50, warrantyUntil: wu, techName: P("tech2"), statusHistory: [{ from: "جاري التنفيذ", to: "مكتمل", at: old, note: P("histnote2") }] });
  const p = [{ id: "p1", name: P("pname"), code: "C1", category: P("pcat"), qty: 2, buy: 5, use: 10, createdAt: now }];
  const wtx = [{ id: "w1", refKey: "order-deposit-r1", wallet: "كاش", type: "in", amount: 20, category: "تحصيل عميل", reason: P("reason"), note: P("wnote"), date: today, time: "10:00", source: "order-link", createdAt: now }];
  const tr = [{ id: "t1", type: "in", amount: 5, reason: P("treason"), note: P("tnote"), date: today, time: "09:00", createdAt: now }];
  const tasks = [{ id: "k1", title: P("task"), note: P("tasknote"), customerId: "c1", due: today, createdAt: now }];
  const fc = [{ id: "f1", code: "E1", title: P("fctitle"), brand: P("fcbrand"), desc: P("fcdesc"), createdAt: now }];
  // ⚠️ مفتاح الخزنة الحقيقي wf_tr (كان الفحص بيزرع wf_treasury فصفحة الخزنة ما كانتش بتعرض أي بيانات خبيثة)، وحركات القطع wf_m
  const pm = [{ id: "m1", partId: "p1", type: P("mtype"), qty: 1, total: 10, wallet: P("mwallet"), requestId: "r1", saleId: "s1", buyer: P("mbuyer"), invoice: P("minv"), note: P("mnote"), at: now, createdAt: now }];
  const wtx2 = [{ id: "w2", refKey: "x2", wallet: P("wname"), type: "out", amount: 7, category: P("wcat"), reason: P("reason2"), note: P("wnote2"), date: today, time: "11:00", source: "manual", createdAt: now }];
  const c2 = [{ id: "c2", name: P("cname2"), phone: "01005781925", mainAddress: { center: P("center2") }, createdAt: now }];
  return { wf_c: c.concat(c2), wf_d: d, wf_r: r, wf_p: p, wf_m: pm, wf_wallet_tx: wtx.concat(wtx2), wf_tr: tr, wf_tasks: tasks, wf_fault_codes: fc,
    wf_s: { wallets: ["كاش", P("wname")], walletCategories: [P("wcat")], statuses: ["جديد", "جاري التنفيذ", "مكتمل", "ملغي"], executionPlaces: ["عند العميل", "الورشة"] },
    wf_pending_calls: [{ id: "pc1", title: P("pctitle"), text: P("pctext"), url: P("pcurl"), fileName: P("pcfile"), phone: "01005781925", at: now }],
    wf_followup_log: [{ id: "fl1", orderId: "r1", note: P("flnote"), at: now }] };
}
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const f = path.join(ROOT, u === "/" ? "index.html" : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
const PAGES = (process.env.XSS_PAGES ? process.env.XSS_PAGES.split(",") : null) || ["index.html", "customers.html", "customer.html?id=c1", "devices.html", "device.html?id=d1", "requests.html", "request.html?id=r1", "request.html?edit=r1", "route.html", "followup.html",
  "dispatch.html", "warranty.html", "reports.html", "wallets.html", "wallet.html?type=wallet&name=%D9%83%D8%A7%D8%B4", () => "wallet.html?type=wallet&name=" + encodeURIComponent(P("wname")), "wallets.html?edit=1", "treasury.html", "tasks.html", "inventory.html", "part.html?id=p1", "part-moves.html?id=p1", "pending-calls.html",
  "merge-customers.html", "faultcodes.html", "faultcode.html?id=f1", "custody.html", "customers.html?edit=c1", "devices.html?edit=d1"];
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port + "/";
  const browser = await pw.chromium.launch();
  const bad = [], rendered = [];
  for (const [mname, mfn] of [["tag", TAG], ["dquote", QUOTE], ["squote", SQUOTE]]) { MODE = mfn; const S = seed();
  for (const pg0 of PAGES) { const pg = typeof pg0 === "function" ? pg0() : pg0;
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 800 } });
    await ctx.addInitScript(({ S, UID }) => {
      Object.defineProperty(Navigator.prototype, "onLine", { get: () => false }); // أوفلاين: افتح من البيانات المحلية بجلسة الموظف المحفوظة
      if (!sessionStorage.getItem("__seeded")) {
        Object.keys(S).forEach((k) => localStorage.setItem(k, JSON.stringify(S[k])));
        localStorage.setItem("wf_cloud_hydrated_uid", UID); localStorage.setItem("wf_is_staff_uid", UID); localStorage.setItem("wf_staff_ok_at", String(Date.now()));
        localStorage.setItem("wf_theme", "light"); sessionStorage.setItem("__seeded", "1");
      }
      window.alert = () => {}; window.confirm = () => false; window.prompt = () => null;
    }, { S, UID });
    const page = await ctx.newPage();
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    if (process.env.XSS_DEBUG) { page.on("pageerror", (e) => console.log("  pageerror", pg, String(e).slice(0, 200))); page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("  console", pg, m.text().slice(0, 200)); }); }
    try { await page.goto(base + pg, { waitUntil: "load", timeout: 20000 }); } catch (e) {}
    await page.waitForTimeout(1500);
    // صفحات القوائم بتبدأ بملخص: افتح «كل …» بنفس دوال الأزرار (showAllCustomers/Devices/Requests/Parts/Warranties) عشان السجلات نفسها تترسم
    await page.evaluate(() => { ["showAllCustomers", "showAllDevices", "showAllRequests", "showAllParts", "showAllWarranties"].forEach((f) => { try { if (typeof window[f] === "function") window[f](); } catch (e) {} }); document.querySelectorAll("details").forEach((d) => { d.open = true; }); }).catch(() => {});
    await page.waitForTimeout(600);
    // حرّك التركيز والماوس على كل العناصر عشان أي onfocus/onmouseover محقون يتنفذ
    const res = await page.evaluate(() => {
      document.querySelectorAll("input,textarea,select,a,button,[tabindex]").forEach((el) => { try { el.focus(); el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); } catch (e) {} });
      const inj = []; document.querySelectorAll("*").forEach((el) => { for (const a of el.attributes) if (/^on/i.test(a.name) && /__xss/.test(a.value)) inj.push(el.tagName + "[" + a.name + "]"); });
      document.querySelectorAll("img[src='x']").forEach((el) => inj.push("IMG[src=x]"));
      return { xss: window.__xss || [], inj, text: document.body ? document.body.innerText.length : 0, hasName: document.body ? /cname|onerror|autofocus/.test(document.body.innerText) : false };
    }).catch((e) => ({ xss: [], inj: [], text: 0, err: String(e) }));
    await page.waitForTimeout(200);
    if (process.env.XSS_DEBUG) console.log("  body", pg, (await page.evaluate(() => document.body ? document.body.innerText : "").catch(() => "")).replace(/\s+/g, " ").slice(0, 400));
    const late = await page.evaluate(() => window.__xss || []).catch(() => []);
    const fired = Array.from(new Set([].concat(res.xss, late)));
    if (fired.length || res.inj.length) bad.push(`[${mname}] ${pg}: تنفيذ=[${fired.join(",")}] خواص محقونة=[${Array.from(new Set(res.inj)).join(",")}]`);
    if (mname === "tag") rendered.push(`${pg}${res.hasName ? "✓" : "·"}`);
    await ctx.close();
  }
  }
  await browser.close(); server.close();
  console.log("الصفحات (✓ = البيانات الخبيثة ظهرت كنص في الصفحة فعلًا): " + rendered.join("  "));
  if (bad.length) { console.error("xss-browser-tests: FAIL (" + bad.length + ")\n" + bad.join("\n")); process.exit(1); }
  console.log("xss-browser-tests: PASS (" + PAGES.length + " صفحة × 3 أنواع حقن، مفيش كود اتنفذ ولا خاصية on* اتحقنت)");
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
