/* اختبار سلوكي للمرحلة ب: بيشغّل firebase-sync.js الحقيقي فوق Firestore وهمي بيطبّق نفس منطق firestore.rules
   (نطاق الفني)، ويتأكد إن الفني ما بيحاولش يقرأ/يكتب أي حاجة مرفوضة، وإن بياناته المحلية أوامره بس. */
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "firebase-sync.js"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class TS { constructor(d) { this.d = d; } toDate() { return this.d; } static fromDate(d) { return new TS(d); } }
const copy = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o, (k, v) => (v instanceof TS ? { __ts: v.d.toISOString() } : v)), (k, v) => (v && v.__ts ? new TS(new Date(v.__ts)) : v)));
const plain = (v) => JSON.stringify(v, (k, x) => (x instanceof TS ? x.d.toISOString() : x));
const ISO = (d) => d.d.toISOString();

const TECH_FORBIDDEN = ["techId", "techName", "techWallet", "assignedAt", "assignedBy", "customerId", "deviceId", "addressKey", "no", "createdAt", "source", "portalRequestId", "portalVis", "portal", "deposit", "depositWallet", "depositExtra", "closed", "paid", "paidAt", "closedAt", "closeWallet", "closedByTech", "jobType", "jobTypeName", "techPay", "techPayManual", "techPayAt", "techPayBy", "payShares", "payShareUids", "returnPayPending", "depositRefunded", "warrantyUntil", "warrantyDays", "warrantyManual", "warrantyDecision", "warrantyOf", "warrantyOfNo", "warrantyOfScope", "warrantyScope"];
const sameVal = (a, b) => plain(a) === plain(b);

function makeCloud(seed) {
  const data = {};
  Object.keys(seed).forEach((c) => { data[c] = {}; Object.keys(seed[c]).forEach((id) => { data[c][id] = copy(seed[c][id]); }); });
  const cloud = { data, denied: [], reads: [], writes: [] };
  cloud.session = (uid, scoped) => {
    function can(op, col, id, existing, next, constraints) {
      if (!scoped) return true;
      const eq = (f, v) => constraints && constraints.some((c) => c[0] === f && c[2] === v);
      if (col === "staff") return op === "get" && id === uid;
      if (col === "accessConfig") return op === "get" || op === "list";
      if (col === "requests") {
        if (op === "list") return eq("techId", uid) && eq("closed", false);
        if (op === "get") return !!existing && existing.techId === uid && existing.closed === false;
        if (op === "update") {
          if (!existing || existing.techId !== uid || existing.closed === true || next.techId !== existing.techId) return false;
          if (next.status === "ملغي" && existing.status !== "ملغي") return false;
          return Object.keys(next).concat(Object.keys(existing)).every((f) => sameVal(next[f], existing[f]) || TECH_FORBIDDEN.indexOf(f) < 0);
        }
        return false;
      }
      if (col === "techOrders") {
        if (op === "list") return eq("techId", uid);
        if (op === "get" || op === "delete") return !!existing && existing.techId === uid;
        return false;
      }
      if (col === "settings") {
        if (op === "get") return id === "global" || id === "wf_meta";
        if (op === "create" || op === "update") return id === "wf_meta" && Object.keys(next).every((k) => k === "ts" || k === "dev");
        return false;
      }
      return false;
    }
    function guard(op, col, id, existing, next, constraints) {
      if (!can(op, col, id, existing, next, constraints)) { cloud.denied.push(op + " " + col + "/" + (id || "*")); const e = new Error("denied"); e.code = "permission-denied"; throw e; }
    }
    const snapDoc = (col, id) => { const v = data[col] && data[col][id]; return { id, exists: v !== undefined, data: () => copy(v), ref: refOf(col, id) }; };
    function refOf(col, id) {
      return {
        id, col,
        get: () => { try { const ex = data[col] && data[col][id]; guard("get", col, id, ex); cloud.reads.push(col + "/" + id); return Promise.resolve(snapDoc(col, id)); } catch (e) { return Promise.reject(e); } },
        set: (v, o) => { try { return Promise.resolve(write("set", col, id, v, o)); } catch (e) { return Promise.reject(e); } },
        update: (v) => { try { return Promise.resolve(write("update", col, id, v)); } catch (e) { return Promise.reject(e); } },
        delete: () => { try { return Promise.resolve(write("delete", col, id)); } catch (e) { return Promise.reject(e); } },
        onSnapshot: () => () => {}
      };
    }
    function write(kind, col, id, v, opts) {
      data[col] = data[col] || {};
      const ex = data[col][id]; let next;
      if (kind === "delete") { guard("delete", col, id, ex); delete data[col][id]; cloud.writes.push("delete " + col + "/" + id); return; }
      const val = copy(v) || {};
      Object.keys(val).forEach((f) => { if (val[f] && val[f].__delete) delete val[f]; });
      if (kind === "update") { if (!ex) { const e = new Error("nf"); e.code = "not-found"; throw e; } next = Object.assign({}, ex, val); guard("update", col, id, ex, next); }
      else if (opts && opts.merge) { next = Object.assign({}, ex || {}, val); guard(ex ? "update" : "create", col, id, ex, next); }
      else { next = val; guard(ex ? "update" : "create", col, id, ex, next); }
      data[col][id] = next; cloud.writes.push(kind + " " + col + "/" + id);
    }
    function query(col, constraints) {
      return {
        where: (f, o, v) => query(col, constraints.concat([[f, o, v]])),
        get: () => {
          try {
            guard("list", col, null, null, null, constraints);
            const docs = Object.keys(data[col] || {}).filter((id) => constraints.every((c) => sameVal(data[col][id][c[0]], c[2]))).map((id) => snapDoc(col, id));
            cloud.reads.push(col + "?" + constraints.map((c) => c[0]).join(","));
            return Promise.resolve({ docs, size: docs.length, forEach: (fn) => docs.forEach(fn) });
          } catch (e) { return Promise.reject(e); }
        },
        onSnapshot: () => () => {}
      };
    }
    const db = {
      collection: (col) => Object.assign(query(col, []), { doc: (id) => refOf(col, id) }),
      batch: () => { const ops = []; return { set: (r, v, o) => ops.push(() => write("set", r.col, r.id, v, o)), delete: (r) => ops.push(() => write("delete", r.col, r.id)), update: (r, v) => ops.push(() => write("update", r.col, r.id, v)), commit: () => { try { ops.forEach((f) => f()); return Promise.resolve(); } catch (e) { return Promise.reject(e); } } }; },
      runTransaction: async (fn) => {
        const pending = [];
        const tx = {
          get: async (r) => { const ex = data[r.col] && data[r.col][r.id]; guard("get", r.col, r.id, ex); return snapDoc(r.col, r.id); },
          set: (r, v, o) => pending.push(() => write("set", r.col, r.id, v, o)),
          update: (r, v) => pending.push(() => write("update", r.col, r.id, v)),
          delete: (r) => pending.push(() => write("delete", r.col, r.id))
        };
        const out = await fn(tx); pending.forEach((f) => f()); return out;
      }
    };
    return db;
  };
  return cloud;
}

function makeDevice(store) {
  store = store || {};
  const listeners = [];
  const ls = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem(k, v) { store[k] = String(v); listeners.forEach((f) => f(k)); },
    removeItem(k) { delete store[k]; },
    subscribe(f) { listeners.push(f); },
    _store: store
  };
  return ls;
}

async function bootSession(opts) {
  const cloud = opts.cloud, ls = opts.ls;
  const db = cloud.session(opts.uid, opts.scoped);
  const timers = [];
  const el = () => ({ style: {}, appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, querySelector: () => null, insertBefore() {}, parentNode: null, set textContent(v) { this._t = v; }, get textContent() { return this._t; } });
  const doc = { readyState: "complete", createElement: () => { const e = el(); setTimeout(() => e.onload && e.onload(), 0); return e; }, getElementById: () => null, querySelector: () => null, body: el(), head: { appendChild(t) { if (t.onload) setTimeout(t.onload, 0); } }, documentElement: el(), addEventListener() {}, visibilityState: "visible" };
  const alerts = [];
  const loc = { pathname: opts.scoped ? "/tech.html" : "/index.html", search: "", href: "http://x/index.html", reload() { loc.reloaded = (loc.reloaded || 0) + 1; }, replace(u) { loc.replacedTo = u; } };
  const fakeUser = { uid: opts.uid, email: opts.uid + "@x", getIdTokenResult: () => Promise.resolve({ claims: opts.claims || {} }) };
  const fb = {
    apps: [], initializeApp() { return {}; }, app: () => ({ options: {} }),
    auth: Object.assign(() => ({ setPersistence: () => Promise.resolve(), onAuthStateChanged: (cb) => setTimeout(() => cb(fakeUser), 0), signOut: () => Promise.resolve(), currentUser: fakeUser }), { Auth: { Persistence: { LOCAL: "local" } } }),
    firestore: Object.assign(() => db, { Timestamp: TS, FieldValue: { serverTimestamp: () => new TS(new Date()), delete: () => ({ __delete: true }) } })
  };
  const sb = {
    console: { log() {}, warn() {}, error() {} }, Date, JSON, Math, Object, Array, Promise, Error, String, Number, parseInt, isNaN, RegExp, Set,
    setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout, setInterval: () => 0, clearInterval: () => {}, URL,
    firebase: fb, WFStorage: ls, document: doc, location: loc, navigator: { onLine: true }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    alert(m) { alerts.push(String(m)); }, confirm: () => true, addEventListener() {}, WF_FIREBASE_CONFIG: { projectId: "t" }, Uint32Array
  };
  sb.window = sb; sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(SRC, sb);
  for (let i = 0; i < 60 && !(sb.wfSyncMode && sbReady(sb)); i++) await sleep(10);
  await sleep(30);
  return { sb, loc, cloud, alerts };
}
function sbReady(sb) { return typeof sb.wfCloudSyncNow === "function"; }

const O = (id, extra) => Object.assign({ id, no: id.toUpperCase(), customerId: "c-" + id, deviceId: "d-" + id, closed: false, status: "جديد", total: 100, deposit: 10, partsCost: 40, work: "", parts: [], createdAt: "2026-10-01T10:00:00.000Z" }, extra || {});
const C = (id) => ({ id, name: "عميل " + id, phone: "010" + id.length, mainAddress: { center: "س" }, createdAt: "2026-09-01T10:00:00.000Z" });
const D = (id) => ({ id, customerId: id.replace("d-", "c-"), type: "غسالة", createdAt: "2026-09-02T10:00:00.000Z" });

function seedCloud() {
  const reqs = {}, cust = {}, dev = {}, techOrders = {};
  const rows = [["o1", "tech-a"], ["o2", "tech-a"], ["o3", "tech-b"], ["o4", null], ["o5", "tech-a", true]];
  rows.forEach(([id, tech, closed]) => {
    reqs[id] = O(id, { techId: tech || undefined, closed: !!closed, techWallet: tech === "tech-a" ? "عهدة أ" : undefined }); if (!tech) delete reqs[id].techId;
    cust["c-" + id] = C("c-" + id); dev["d-" + id] = D("d-" + id);
    if (tech) techOrders[id] = { techId: tech, orderId: id, customer: C("c-" + id), device: D("d-" + id) };
  });
  return makeCloud({
    staff: { "tech-a": { name: "Tech", role: "tech", sc: "a" }, "tech-b": { name: "B", sc: "a" }, "boss": { name: "Boss", role: "owner" } },
    requests: reqs, customers: cust, devices: dev, techOrders,
    parts: { p1: { id: "p1", name: "ضاغط", cost: 900 } }, treasury: { t1: { id: "t1", amount: 5 } }, walletTx: { w1: { id: "w1", wallet: "عهدة أ", type: "in", amount: 100, date: "2026-10-11", time: "10:00", reason: "تحصيل", note: "سري" }, w2: { id: "w2", wallet: "عهدة أ", type: "out", amount: 30, date: "2026-10-12", time: "09:00", reason: "بنزين" }, w3: { id: "w3", wallet: "الخزنة الرئيسية", type: "in", amount: 999, date: "2026-10-12", time: "09:00", reason: "x" } },
    settings: { global: { wallets: ["كاش"], statuses: ["جديد"] }, wf_meta: { ts: 1, dev: "x" }, "wfkv_wf_e": { n: 1 }, "wfkv_wf_e~0": { v: "[{\"secret\":1}]" } }
  });
}

(async () => {
  /* ---- 1) فني على جهاز كان عليه بيانات المالك: لازم تتمسح، وينزل أوامره بس، من غير أي محاولة مرفوضة ---- */
  let cloud = seedCloud();
  const ownerLeft = { wf_c: JSON.stringify([C("c-zzz")]), wf_r: JSON.stringify([O("zzz", { techId: "x" })]), wf_p: JSON.stringify([{ id: "p9", name: "x" }]), wf_e: "[{\"owner\":1}]", wf_cloud_hydrated_uid: "boss", wf_is_staff_uid: "boss", wf_staff_ok_at: String(Date.now()), wf_sync_mode: "full" };
  let ls = makeDevice(ownerLeft);
  let s = await bootSession({ cloud, ls, uid: "tech-a", scoped: true });
  assert.deepStrictEqual(cloud.denied, [], "الفني ما يحاولش عمليات مرفوضة: " + cloud.denied);
  const rIds = JSON.parse(ls.getItem("wf_r")).map((r) => r.id).sort();
  assert.deepStrictEqual(rIds, ["o1", "o2"], "أوامره المفتوحة المعيّنة بس");
  assert.deepStrictEqual(JSON.parse(ls.getItem("wf_c")).map((r) => r.id).sort(), ["c-o1", "c-o2"], "عملاء أوامره بس");
  assert.deepStrictEqual(JSON.parse(ls.getItem("wf_d")).map((r) => r.id).sort(), ["d-o1", "d-o2"], "أجهزة أوامره بس");
  assert.deepStrictEqual(JSON.parse(ls.getItem("wf_p") || "[]"), [], "مفيش مخزن");
  assert.strictEqual(ls.getItem("wf_e"), null, "بيانات المالك المحلية اتمسحت");
  assert.ok(!/zzz|secret/.test(Object.values(ownerLeft).join("")), "مفيش أثر لبيانات المالك");
  assert.strictEqual(ls.getItem("wf_sync_mode"), "scoped");
  assert.deepStrictEqual(JSON.parse(ls.getItem("wf_s")).wallets, ["كاش"], "الإعدادات العامة بتنزل");
  assert.ok(!cloud.reads.some((x) => /^(customers|devices|parts|treasury|walletTx)/.test(x)), "ما قراش مجموعات ممنوعة");

  /* ---- 2) تعديل أمره: يترفع كتعديل حقول بس ---- */
  let rows = JSON.parse(ls.getItem("wf_r"));
  rows.find((r) => r.id === "o1").work = "غيّرت الفلتر"; rows.find((r) => r.id === "o1").parts = [{ name: "فلتر", qty: 1, sell: 50 }];
  ls.setItem("wf_r", JSON.stringify(rows));
  await s.sb.wfCloudSyncNow();
  assert.deepStrictEqual(cloud.denied, [], "تعديل شغل الأمر مسموح: " + cloud.denied);
  assert.strictEqual(cloud.data.requests.o1.work, "غيّرت الفلتر");
  assert.strictEqual(cloud.data.requests.o1.techId, "tech-a");
  assert.strictEqual(cloud.data.requests.o2.work, "", "أمر تاني ما اتلمسش");

  /* ---- 3) تعديل عميل/جهاز محليًا ما يترفعش ولا يتعارض ---- */
  const cs = JSON.parse(ls.getItem("wf_c")); cs[0].name = "اسم متلاعب"; ls.setItem("wf_c", JSON.stringify(cs));
  await s.sb.wfCloudSyncNow();
  assert.deepStrictEqual(cloud.denied, []);
  assert.strictEqual(cloud.data.customers["c-o1"].name, "عميل c-o1", "عميل السحابة زي ما هو");

  /* ---- 4) حقل ممنوع (العربون) اتغيّر على الجهاز مع شغل مسموح: الممنوع مابيترفعش، والمسموح بيوصل (من غير ما السيرفر يرفض الأمر كله) ---- */
  rows = JSON.parse(ls.getItem("wf_r")); Object.assign(rows.find((r) => r.id === "o2"), { deposit: 9999, work: "غيّرت الموتور", status: "مكتمل" }); ls.setItem("wf_r", JSON.stringify(rows));
  cloud.denied.length = 0;
  await s.sb.wfCloudSyncNow();
  assert.deepStrictEqual(cloud.denied, [], "مفيش رفض: " + cloud.denied);
  assert.strictEqual(cloud.data.requests.o2.deposit, 10, "العربون ما اتغيرش في السحابة");
  assert.deepStrictEqual([cloud.data.requests.o2.work, cloud.data.requests.o2.status], ["غيّرت الموتور", "مكتمل"], "الشغل والحالة وصلوا للإدارة");
  await s.sb.wfCloudSyncNow();
  assert.strictEqual(JSON.parse(ls.getItem("wf_r")).find((r) => r.id === "o2").deposit, 10, "الجهاز رجع لعربون السحابة");

  /* ---- 4ب) الإدارة عدّلت الأمر (العطل) والفني عدّل الحالة في نفس الوقت: مفيش تعارض يعلّق الرفع، وكل واحد تعديله بيفضل ---- */
  cloud.data.requests.o1.fault = "العطل من الإدارة"; cloud.data.requests.o1.updatedBy = "boss";
  rows = JSON.parse(ls.getItem("wf_r")); Object.assign(rows.find((r) => r.id === "o1"), { status: "جاري التنفيذ", work: "فكيت الجهاز" }); ls.setItem("wf_r", JSON.stringify(rows));
  cloud.denied.length = 0;
  await s.sb.wfCloudSyncNow();
  assert.deepStrictEqual(cloud.denied, []);
  assert.deepStrictEqual([cloud.data.requests.o1.status, cloud.data.requests.o1.work, cloud.data.requests.o1.fault], ["جاري التنفيذ", "فكيت الجهاز", "العطل من الإدارة"], "الاتنين اتحفظوا");
  assert.ok(!s.sb.wfSyncInfo().conflicts, "مفيش تعارض");
  await s.sb.wfCloudSyncNow();
  assert.strictEqual(JSON.parse(ls.getItem("wf_r")).find((r) => r.id === "o1").fault, "العطل من الإدارة", "تعديل الإدارة نزل للفني");

  /* ---- 5) القفل مش من الجهاز: لو الجهاز علّم الأمر مقفول بنفسه مابيترفعش. القفل بيتعمل من دالة السيرفر،
           وبعدها المزامنة بتشيل الأمر وعميله وجهازه من جهاز الفني ---- */
  cloud.denied.length = 0;
  rows = JSON.parse(ls.getItem("wf_r")); Object.assign(rows.find((r) => r.id === "o1"), { closed: true, paid: true, status: "ملغي" }); ls.setItem("wf_r", JSON.stringify(rows));
  await s.sb.wfCloudSyncNow();
  assert.deepStrictEqual(cloud.denied, []);
  assert.notStrictEqual(cloud.data.requests.o1.closed, true, "القفل المباشر من الجهاز ما وصلش");
  assert.notStrictEqual(cloud.data.requests.o1.status, "ملغي", "والإلغاء كمان");
  Object.assign(cloud.data.requests.o1, { closed: true, paid: true, status: "مكتمل", closedByTech: "tech-a" }); delete cloud.data.techOrders.o1; // = techCloseOrder
  cloud.denied.length = 0;
  await s.sb.wfCloudSyncNow();
  await sleep(200);
  assert.deepStrictEqual(cloud.denied, [], "مفيش محاولات مرفوضة بعد القفل: " + cloud.denied);
  assert.deepStrictEqual(JSON.parse(ls.getItem("wf_r")).map((r) => r.id), ["o2"], "الأمر المقفول اختفى من جهازه");
  assert.deepStrictEqual(JSON.parse(ls.getItem("wf_c")).map((r) => r.id), ["c-o2"], "وعميله وجهازه كمان");
  assert.deepStrictEqual(JSON.parse(ls.getItem("wf_d")).map((r) => r.id), ["d-o2"]);

  /* ---- 6) الإدارة قفلت/نقلت أمره وهو عنده تعديل غير مرفوع: الأمر يتشال بدون خطأ ---- */
  cloud.data.requests.o2.techId = "tech-b"; cloud.denied.length = 0;
  rows = JSON.parse(ls.getItem("wf_r")); rows[0].work = "تعديل متأخر"; ls.setItem("wf_r", JSON.stringify(rows));
  await s.sb.wfCloudSyncNow();
  assert.deepStrictEqual(JSON.parse(ls.getItem("wf_r")), [], "الأمر اتنقل لفني تاني فاتشال");
  assert.notStrictEqual(cloud.data.requests.o2.work, "تعديل متأخر", "ما كتبش على أمر مش بتاعه");

  /* ---- 7) نفس الجهاز بيتحوّل لحساب إدارة: بيانات الفني (لقطات العملاء) ما تترفعش فوق السجلات الكاملة ---- */
  cloud = seedCloud();
  ls = makeDevice({});
  s = await bootSession({ cloud, ls, uid: "tech-a", scoped: true });
  assert.deepStrictEqual(JSON.parse(ls.getItem("wf_c")).length, 2);
  const before = plain(cloud.data.customers);
  s = await bootSession({ cloud, ls, uid: "boss", scoped: false });
  assert.deepStrictEqual(cloud.denied, []);
  assert.strictEqual(plain(cloud.data.customers), before, "عملاء السحابة ما اتغيروش");
  assert.strictEqual(JSON.parse(ls.getItem("wf_c")).length, 5, "المالك نزّل كل العملاء");
  assert.strictEqual(ls.getItem("wf_sync_mode"), "full");

  /* ---- 8) جهاز الإدارة بيكتب نسخة العرض للفنيين ---- */
  cloud = seedCloud(); cloud.data.techOrders = {};
  ls = makeDevice({});
  s = await bootSession({ cloud, ls, uid: "boss", scoped: false });
  assert.ok(s.loc.reloaded, "أول تحميل بيعمل ريلود");
  s = await bootSession({ cloud, ls, uid: "boss", scoped: false }); // بعد الريلود
  await sleep(1700); // projectOrders بعد goReady بـ1.5 ثانية
  await s.sb.wfCloudSyncNow();
  const mr0 = JSON.parse(ls.getItem("wf_r")); delete mr0.find((r) => r.id === "o3").closed; ls.setItem("wf_r", JSON.stringify(mr0));
  await s.sb.wfCloudSyncNow(); await sleep(1500);
  assert.strictEqual(cloud.data.requests.o3.closed, false, "الأمر المعيّن من غير closed بيتظبط عشان فلتر السيرفر");
  const to = cloud.data.techOrders;
  assert.deepStrictEqual(Object.keys(to).sort(), ["o1", "o2", "o3"], "أوامر مفتوحة ومعيّنة بس");
  assert.strictEqual(to.o1.techId, "tech-a");
  assert.strictEqual(to.o1.customer.id, "c-o1");
  assert.strictEqual(to.o1.device.id, "d-o1");
  assert.ok(!("portalUid" in to.o1.customer) && !("email" in to.o1.customer));
  // إلغاء التعيين يمسح نسخة العرض
  const mr = JSON.parse(ls.getItem("wf_r")); delete mr.find((r) => r.id === "o2").techId; ls.setItem("wf_r", JSON.stringify(mr));
  await s.sb.wfCloudSyncNow(); await sleep(300);
  assert.strictEqual(cloud.data.techOrders.o2, undefined, "اتمسحت بعد إلغاء التعيين");
  assert.ok(cloud.data.techOrders.o1 && cloud.data.techOrders.o3);


  /* ---- 8ب) حساب عهدة الفني بقى من السيرفر (دالة techAccount): جهاز الإدارة ما بيكتبش نسخة منه ---- */
  assert.ok(!cloud.data.techWallets || !cloud.data.techWallets["tech-a"], "مفيش كتابة لحساب العهدة من الأجهزة");

  /* ---- 9) الفني يخرج ويدخل تاني: تعديلاته اللي لسه ماترفعتش ما تضيعش، والموعد يترفع ---- */
  cloud = seedCloud();
  ls = makeDevice({});
  s = await bootSession({ cloud, ls, uid: "tech-a", scoped: true });
  let t9 = JSON.parse(ls.getItem("wf_r"));
  t9.find((r) => r.id === "o1").visit = "2026-10-12T10:30"; ls.setItem("wf_r", JSON.stringify(t9));
  await s.sb.wfCloudSyncNow();
  assert.deepStrictEqual(cloud.denied, [], "تعديل الموعد مسموح: " + cloud.denied);
  assert.strictEqual(cloud.data.requests.o1.visit, "2026-10-12T10:30", "الموعد وصل السيرفر (وبالتالي الإدارة)");
  t9 = JSON.parse(ls.getItem("wf_r")); t9.find((r) => r.id === "o2").work = "شغل لسه ماترفعش"; ls.setItem("wf_r", JSON.stringify(t9));
  ["wf_cloud_hydrated_uid", "wf_last_full_sync", "wf_is_staff_uid", "wf_staff_ok_at"].forEach((k) => ls.removeItem(k)); // زي الخروج
  s = await bootSession({ cloud, ls, uid: "tech-a", scoped: true });
  assert.strictEqual(JSON.parse(ls.getItem("wf_r")).find((r) => r.id === "o2").work, "شغل لسه ماترفعش", "التعديل المحلي فضل");
  await s.sb.wfCloudSyncNow();
  assert.strictEqual(cloud.data.requests.o2.work, "شغل لسه ماترفعش", "واترفع بعد الدخول");

  /* ---- 10) أمر جديد من حساب الفني: بيتشال برسالة واضحة ---- */
  t9 = JSON.parse(ls.getItem("wf_r")); t9.push(O("mine-new", { techId: "tech-a" })); ls.setItem("wf_r", JSON.stringify(t9));
  await s.sb.wfCloudSyncNow();
  assert.ok(!JSON.parse(ls.getItem("wf_r")).some((r) => r.id === "mine-new"), "الأمر الجديد اتشال");
  assert.ok(s.alerts.some((m) => /ينشئ أوامر جديدة/.test(m)), "رسالة للفني");
  assert.strictEqual(cloud.data.requests["mine-new"], undefined);

  /* ---- 11) تحويل لحساب تاني على نفس الجهاز بيمسح بيانات الفني ---- */
  s = await bootSession({ cloud, ls, uid: "tech-b", scoped: true });
  assert.deepStrictEqual(JSON.parse(ls.getItem("wf_r")).map((r) => r.id), ["o3"], "فني تاني: أوامره هو بس");

  console.log("scoped-sync-tests: PASS (مسح بيانات الجهاز عند التبديل، سحب أوامره فقط، رفع الحقول المسموحة، رفض العربون، قفل الأمر، سحب أمر منقول، التحويل لحساب إدارة، نسخة العرض)");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
