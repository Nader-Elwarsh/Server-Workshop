/* اختبارات فيديو/صوت العطل واللوكيشن (wf-media.js) + ربطها بالبوابة والقواعد والسيرفر. */
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const read = (f) => fs.readFileSync(__dirname + "/" + f, "utf8");

const doc = { addEventListener() {}, getElementById() { return null; }, createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; }, head: { appendChild() {} }, querySelector() { return null; } };
const ctx = { window: {}, document: doc, navigator: {}, URL, Blob: function () {}, setTimeout, clearTimeout, console };
ctx.window = ctx; ctx.window.document = doc;
vm.createContext(ctx);
vm.runInContext(read("wf-media.js"), ctx);
const { WFLoc, WFMedia } = ctx;
const J = (v) => JSON.parse(JSON.stringify(v));

// ---- قراءة لينكات اللوكيشن ----
const p1 = J(WFLoc.parse("https://www.google.com/maps/place/X/@28.0871,30.7618,17z/data=!3d28.0872!4d30.7619"));
assert.strictEqual(p1.lat, 28.0872); assert.strictEqual(p1.lng, 30.7619);
assert.deepStrictEqual([J(WFLoc.parse("https://maps.google.com/?q=28.1,30.75")).lat, J(WFLoc.parse("https://maps.google.com/?q=28.1,30.75")).lng], [28.1, 30.75]);
assert.strictEqual(J(WFLoc.parse("٢٨.١, ٣٠.٧٥")).lng, 30.75, "Arabic digits and comma");
assert.strictEqual(J(WFLoc.parse("28.1، 30.75")).lat, 28.1);
const short = J(WFLoc.parse("شوف اللوكيشن https://maps.app.goo.gl/AbC123 تمام"));
assert.strictEqual(short.url, "https://maps.app.goo.gl/AbC123");
assert.strictEqual(WFLoc.parse("https://evil.example/maps?q=1"), null, "only Google Maps links");
assert.strictEqual(WFLoc.parse("كلام عادي"), null);
assert.strictEqual(WFLoc.clean({ lat: 200, lng: 10 }), null, "out of range");
assert.strictEqual(WFLoc.clean({ lat: 0, lng: 0 }), null, "0,0 is not a location");
assert.strictEqual(WFLoc.clean({ url: "javascript:alert(1)" }), null);
assert.ok(!("at" in J(WFLoc.clean({ url: "https://maps.app.goo.gl/x" }))), "no undefined fields (Firestore rejects them)");
assert.strictEqual(WFLoc.navHref({ lat: 28.1, lng: 30.75 }), "https://www.google.com/maps/dir/?api=1&destination=28.1,30.75");
assert.ok(/^<a /.test(WFLoc.linkHtml({ lat: 28.1, lng: 30.75 })) && WFLoc.linkHtml(null) === "");

// ---- تحقق المرفقات قبل العرض ----
const ok = { url: "https://res.cloudinary.com/demo/video/upload/v1/workshop-media/a.mp4", kind: "video", dur: 12 };
assert.strictEqual(WFMedia.clean([ok, { url: "javascript:alert(1)", kind: "video" }, { url: "https://res.cloudinary.com/demo/image/upload/x.jpg", kind: "video" }, { url: ok.url, kind: "exe" }, { url: 'https://res.cloudinary.com/d/video/upload/a"onerror=x.mp4', kind: "audio" }]).length, 1);
const html = WFMedia.listHtml([ok, { url: "https://res.cloudinary.com/demo/video/upload/v1/x.webm", kind: "audio" }], { removable: true, key: "k" });
assert.ok(/so_1\/v1\/workshop-media\/a\.jpg/.test(html), "video poster from Cloudinary");
assert.ok(/x\.mp3"/.test(html), "audio served as mp3 so iPhone can play webm recordings");
assert.ok(/data-wfm-rm="0"/.test(html) && /0:12/.test(html));
assert.strictEqual(WFMedia.fmtDur(75), "1:15");

// ---- الربط ----
const portal = read("portal.html"), rules = read("firestore.rules"), rulesP = read("firestore.rules.proposed"), fn = read("functions/index.js"), sync = read("firebase-sync.js");
assert.ok(portal.includes('src="wf-media.js"') && portal.includes("reqExtras()") && portal.includes("data.media=media") && portal.includes("data.loc=loc"), "portal request sends media + loc");
assert.ok(/permission-denied[\s\S]{0,400}delete data\.media;delete data\.loc/.test(portal), "portal falls back if rules not deployed yet");
assert.ok(portal.includes('WFLoc.field("g_loc"') && portal.includes('WFLoc.field("m_loc"'), "guest + account location");
assert.ok(/WFBack\.owns\(\)\)return;/.test(portal), "closing a sheet must not re-render the portal form");
for (const r of [rules, rulesP]) {
  assert.ok(/'createdAt', 'media', 'loc'\]\)/.test(r) && /media\.size\(\) <= 6/.test(r) && /function locOk/.test(r), "rules allow validated media/loc on portal requests");
  assert.ok(/match \/guestRequests\/\{id\} \{[\s\S]*?allow create: if false;/.test(r), "guest requests go through the rate-limited server function only");
}
assert.ok(/exports\.mediaSign = mediaCallable/.test(fn) && /exports\.mediaDelete/.test(fn) && /exports\.mediaCleanup/.test(fn) && /exports\.mediaUsage/.test(fn));
assert.ok(/'mediaFiles' && collection != 'rateLimits'/.test(rules), "browsers can't touch mediaFiles/rateLimits");
assert.ok(/r\.media = pm/.test(sync) && /r\.loc = p\.loc\.url/.test(sync), "portal media/loc carried into the work order");
assert.ok(read("app-requests.js").includes("requestMediaSection(r,canEdit)") && read("tech-portal.js").includes("WFMedia.actsHtml(mkey)"));
assert.ok(/geolocation=\(self\)/.test(read("_headers")), "Permissions-Policy must allow geolocation");
for (const page of ["request.html", "customer.html", "customers.html", "tech.html", "portal-admin.html"]) assert.ok(read(page).includes('src="wf-media.js"'), page + " loads wf-media.js");
assert.ok(read("service-worker.js").includes('"./wf-media.js"') && read("portal-sw.js").includes('"./wf-media.js"'));
console.log("media-loc-tests: PASS");

/* ---- السيرفر: functions/media.js (توقيع/مسح/يتيمة) بقاعدة بيانات وهمية ---- */
(async () => {
  const { createMedia, parseUrl, signParams } = require("./functions/media.js");
  const store = {};
  const mkSnap = (path, id) => ({ id, exists: store[path] !== undefined, data: () => store[path], ref: docRef(path) });
  function docRef(path) { return { path, get: async () => mkSnap(path, path.split("/").pop()), set: async (v, o) => { store[path] = o && o.merge ? Object.assign({}, store[path] || {}, v) : v; }, delete: async () => { delete store[path]; } }; }
  function col(name) {
    const q = (filters) => ({ where: (f, op, v) => q(filters.concat([[f, op, v]])), get: async () => { const docs = Object.keys(store).filter((k) => k.startsWith(name + "/") && k.split("/").length === 2).filter((k) => filters.every(([f, op, v]) => op === "<" ? store[k][f] < v : store[k][f] === v)).map((k) => mkSnap(k, k.split("/")[1])); return { size: docs.length, docs, forEach: (fn) => docs.forEach(fn) }; } });
    return Object.assign(q([]), { doc: (id) => docRef(name + "/" + id) });
  }
  const db = { collection: col, runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, v, o) => r.set(v, o) }) };
  let T = Date.parse("2026-10-15T10:00:00Z");
  const calls = [];
  const fetchImpl = async (url, opt) => { calls.push({ url, body: opt && opt.body && opt.body.toString() }); if (/usage$/.test(url)) return { ok: true, json: async () => ({ plan: "Free", storage: { usage: 5242880 }, credits: { usage: 1.5, limit: 25, used_percent: 6 }, resources: 9 }) }; return { ok: true, json: async () => ({ result: "ok" }) }; };
  const actors = { st: { role: "staff", perms: { "requests.edit": 1 }, owner: false }, own: { role: "staff", perms: {}, owner: true }, cu: { role: "customer", perms: {}, owner: false }, cu2: { role: "customer", perms: {}, owner: false }, x: { role: "", perms: {}, owner: false } };
  const m = createMedia({ db, now: () => T, creds: () => ({ cloud: "demo", apiKey: "K", secret: "S" }), fetchImpl, actor: async (u) => actors[u], randomId: (() => { let n = 0; return () => "abc" + (++n); })() });

  await assert.rejects(m.sign("x", { kind: "video" }), /upload_not_authorized/);
  const s1 = await m.sign("cu", { kind: "image" });
  assert.strictEqual(s1.resource, "image"); assert.ok(/^workshop-media\/i/.test(s1.publicId));
  assert.strictEqual(s1.signature, signParams({ allowed_formats: s1.allowedFormats, public_id: s1.publicId, timestamp: s1.timestamp }, "S"), "signature covers public_id + formats");
  assert.ok(!/mp4/.test(s1.allowedFormats));
  const s2 = await m.sign("cu", { kind: "audio" });
  assert.strictEqual(s2.resource, "video");
  for (let i = 0; i < 18; i++) await m.sign("cu", { kind: "video" });
  await assert.rejects(m.sign("cu", { kind: "video" }), /media_rate_limited/, "20/day for customers");

  const url = (pid, rt) => `https://res.cloudinary.com/demo/${rt}/upload/v17/${pid}.jpg`;
  assert.deepStrictEqual(parseUrl(url(s1.publicId, "image"), "demo"), { cloud: "demo", rt: "image", pid: s1.publicId });
  assert.strictEqual(parseUrl("https://res.cloudinary.com/demo/image/upload/v1/workshop-secure/dev.jpg", "demo"), null, "never touches device/part photos");
  assert.strictEqual(parseUrl(url(s1.publicId, "image"), "other"), null);

  // عميل تاني مايقدرش يمسح ملف مش بتاعه، والعميل صاحب الملف يقدر خلال يومين
  let r = await m.remove("cu2", { urls: [url(s1.publicId, "image")] });
  assert.strictEqual(r.denied, 1);
  r = await m.remove("cu", { urls: [url(s1.publicId, "image")] });
  assert.strictEqual(r.deleted, 1); assert.deepStrictEqual(r.done, [url(s1.publicId, "image")]);
  assert.ok(/image\/destroy$/.test(calls[calls.length - 1].url) && /public_id=workshop-media/.test(calls[calls.length - 1].body));
  T += 3 * 86400000;
  r = await m.remove("cu", { urls: [url(s2.publicId, "video")] });
  assert.strictEqual(r.denied, 1, "customer can't delete after 2 days");
  r = await m.remove("st", { urls: [url(s2.publicId, "video")] });
  assert.strictEqual(r.deleted, 1, "staff with requests.edit can delete");
  assert.ok(/video\/destroy$/.test(calls[calls.length - 1].url));

  // اليتيمة: ملف مذكور في أمر أو في سلة المهملات بيفضل، والباقي يتيم
  const files = Object.keys(store).filter((k) => k.startsWith("mediaFiles/")).map((k) => store[k].pid);
  store["requests/r1"] = { media: [{ url: url(files[0], "video"), kind: "video" }] };
  store["settings/wfkv_wf_trash~0"] = { v: "...\"" + files[1] + ".mp4\"..." };
  store["faultCodes/fc1"] = { kind: "test", title: "تيست مود", media: [{ url: url(files[2], "image"), kind: "image" }] };
  store["invoices/i1"] = { photo: url(files[3], "image"), note: "فاتورة مورد", partIds: [] };
  store["portalPosts/p1"] = { title: "نصيحة", image: url(files[4], "image"), published: true };
  await assert.rejects(m.orphans("st", {}), /owner_only/);
  const dry = await m.orphans("own", { minAgeDays: 1 });
  assert.strictEqual(dry.checked, files.length); assert.strictEqual(dry.orphans, files.length - 5, "صورة التيست مود وصورة الفاتورة وصورة المقال مش يتيمة"); assert.strictEqual(dry.deleted, 0);
  const done = await m.orphans("own", { minAgeDays: 1, apply: true });
  assert.strictEqual(done.deleted, files.length - 5);
  assert.ok(store["mediaFiles/" + files[0].replace(/\//g, "_")] && store["mediaFiles/" + files[1].replace(/\//g, "_")], "referenced files kept");
  const u = await m.usage("own");
  assert.strictEqual(u.usage.storage, 5242880); assert.strictEqual(u.tracked, 5);
  console.log("media-server-tests: PASS");
})().catch((e) => { console.error(e); process.exit(1); });

/* ---- الاستهلاك: functions/usage.js ---- */
(async () => {
  const { createUsage, pacificMidnight, FREE } = require("./functions/usage.js");
  // منتصف الليل في كاليفورنيا = 10 الصبح بتوقيت مصر (الصيفي والشتوي)
  const t = Date.parse("2026-10-15T20:00:00Z");
  assert.strictEqual(new Date(pacificMidnight(t)).toISOString(), "2026-10-15T07:00:00.000Z");
  assert.strictEqual(new Date(pacificMidnight(Date.parse("2026-01-10T05:00:00Z"))).toISOString(), "2026-01-09T08:00:00.000Z");
  const store = {}, seen = [];
  const db = { doc: (p) => ({ get: async () => ({ exists: !!store[p], data: () => store[p] }), set: async (v) => { store[p] = v; } }) };
  const fetchImpl = async (url) => {
    seen.push(url);
    const ok = (j) => ({ ok: true, status: 200, json: async () => j });
    if (/databases\/\(default\)/.test(url)) return ok({ locationId: "me-central1" });
    if (/read_count/.test(url)) return { ok: false, status: 400, json: async () => ({ error: { status: "INVALID_ARGUMENT" } }) }; // اسم قديم مش موجود
    if (/read_ops_count/.test(url)) return ok({ timeSeries: [{ points: /alignmentPeriod=86400s/.test(url) ? [{ value: { int64Value: "60000" } }, { value: { int64Value: "1000" } }] : [{ value: { int64Value: "45000" } }] }] });
    if (/write_count/.test(url)) return ok({ timeSeries: [{ points: [{ value: { int64Value: "500" } }] }] });
    if (/delete_count/.test(url)) return ok({});
    if (/run\.googleapis/.test(url)) return ok({ timeSeries: [{ points: [{ value: { int64Value: "12345" } }] }] });
    if (/gcf-artifacts/.test(url)) return /me-central1/.test(url) ? { ok: false, status: 404, json: async () => ({}) } : ok({ sizeBytes: "600000000" });
    if (/cloudinary.*usage/.test(url)) return ok({ plan: "Free", storage: { usage: 1e9 }, credits: { usage: 21, limit: 25, used_percent: 84 }, resources: 120 });
    return { ok: false, status: 500, json: async () => ({}) };
  };
  let T = t;
  const u = createUsage({ fetchImpl, getToken: async () => "tok", projectId: "p1", db, cloudinary: () => ({ cloud: "c", apiKey: "k", secret: "s" }), countUsers: async () => 7, regions: () => ["us-central1", "me-central1", "us-central1"], now: () => T });
  const r = await u.report(false);
  assert.strictEqual(r.dbLocation, "me-central1"); assert.strictEqual(r.multiRegion, false); assert.strictEqual(r.prices.firestore.reads, 0.03);
  assert.strictEqual(r.firestore.today.reads, 45000, "falls back to *_ops_count metric");
  assert.strictEqual(r.firestore.month.reads, 61000); assert.strictEqual(r.firestore.overDays.reads, 10000, "only the part over 50k/day counts");
  assert.strictEqual(r.functions.monthRequests, 12345); assert.strictEqual(r.authUsers, 7);
  assert.deepStrictEqual(r.artifacts, [{ region: "us-central1", bytes: 600000000 }], "404 region skipped, duplicates removed");
  assert.strictEqual(r.cloudinary.creditsPct, 84);
  const before = seen.length; await u.report(false); assert.strictEqual(seen.length, before, "cached for 15 min");
  T += 30000; await u.report(true); assert.strictEqual(seen.length, before, "refresh throttled to once a minute");
  const al = u.alerts(r).map((a) => a.id).sort();
  assert.deepStrictEqual(al, ["art-us-central1", "cld", "fs-reads"]);
  // صلاحيات Monitoring ناقصة: الباقي يشتغل والخطأ يتعرف
  const u2 = createUsage({ fetchImpl: async (url) => /monitoring/.test(url) ? { ok: false, status: 403, json: async () => ({ error: { status: "PERMISSION_DENIED" } }) } : fetchImpl(url), getToken: async () => "tok", projectId: "p1", db: { doc: () => ({ get: async () => ({ exists: false }), set: async () => {} }) }, now: () => T });
  const r2 = await u2.collect();
  assert.strictEqual(r2.errors.firestore, "denied"); assert.strictEqual(r2.firestore, null); assert.ok(r2.artifacts);
  assert.strictEqual(FREE.reads, 50000);
  const n = read("functions/notify.js"), nc = read("notif-center.js"), idx = read("functions/index.js");
  assert.ok(/usage_high: \{ aud: "admin", perm: "__owner__"/.test(n) && /usage_high: \["admin"/.test(nc) && /deps\.usageAlerts/.test(n));
  assert.ok(/exports\.usageReport/.test(idx) && /secrets: \[apiSecret\] \}, async \(\) => \{\n  try \{ const r = await notifier\.tick/.test(idx), "daily tick can read Cloudinary usage");
  assert.ok(read("settings.html").includes('src="cloud-usage.js"'));
  const { parseBudgetMessage } = require("./functions/usage.js");
  const bm = parseBudgetMessage({ costAmount: 0.0812, budgetAmount: 2, currencyCode: "USD", budgetDisplayName: "الورشة" }, { billingAccountId: "014AF1-90A09A-6F099B" }, 5);
  assert.strictEqual(bm.cost, 0.08); assert.strictEqual(bm.account, "014AF1-90A09A-6F099B"); assert.strictEqual(parseBudgetMessage({}, {}, 1), null);
  store["serverConfig/billing"] = bm;
  const rb = await u.report(false); assert.strictEqual(rb.billing.cost, 0.08, "report carries Google's real bill");
  assert.ok(/exports\.billingWatch = onMessagePublished\(\{ topic: "billing-alerts"/.test(idx));
  console.log("usage-tests: PASS");
})().catch((e) => { console.error(e); process.exit(1); });
