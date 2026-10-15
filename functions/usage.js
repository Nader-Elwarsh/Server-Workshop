"use strict";
/* ---------------------------------------------------------------------
   الاستهلاك والمساحة على السحابة (usageReport + تنبيه usage_high).
   بيجمع من غير ما يقرا بيانات الورشة نفسها:
   - Firestore: القراءات/الكتابات/المسح النهارده (اليوم بتوقيت جوجل —
     الحصة المجانية بتتجدد 12 بالليل بتوقيت كاليفورنيا) والشهر ده، من Cloud Monitoring.
   - الدوال (Cloud Run functions): عدد الطلبات الشهر ده.
   - Cloudinary: المساحة والباندويدث والكريدت من الـ usage API.
   - Artifact Registry: حجم نسخ الدوال المتخزنة (gcf-artifacts) في كل منطقة.
   - Firebase Auth: عدد الحسابات.
   التقرير بيتخزن في serverConfig/usage ويتحدّث كل 15 دقيقة كحد أقصى.
   --------------------------------------------------------------------- */

const FREE = {
  reads: 50000, writes: 20000, deletes: 20000,          // Firestore في اليوم
  storageBytes: 1024 ** 3,                               // Firestore: 1 GiB
  fnRequests: 2000000,                                   // Cloud Run functions في الشهر
  artifactBytes: 0.5 * 1024 ** 3,                        // Artifact Registry: 0.5 GB
  cloudinaryCredits: 25                                  // Cloudinary Free في الشهر
};
// أسعار تقريبية بالدولار بعد الحد المجاني (المالك يقدر يعدّلها من الشاشة).
const PRICES = {
  regional: { reads: 0.03, writes: 0.09, deletes: 0.01, storageGiB: 0.15 },     // لكل 100 ألف / لكل GiB شهريًا
  multi: { reads: 0.06, writes: 0.18, deletes: 0.02, storageGiB: 0.18 },
  fnPerMillion: 0.40, artifactPerGB: 0.10, cloudinaryPlus: 99, cloudinaryPlusCredits: 225
};
const METRICS = {
  reads: ["firestore.googleapis.com/document/read_count", "firestore.googleapis.com/document/read_ops_count"],
  writes: ["firestore.googleapis.com/document/write_count", "firestore.googleapis.com/document/write_ops_count"],
  deletes: ["firestore.googleapis.com/document/delete_count", "firestore.googleapis.com/document/delete_ops_count"],
  fn: ["run.googleapis.com/request_count"]
};

/* بداية اليوم بتوقيت كاليفورنيا (America/Los_Angeles) — ده وقت تجديد حصة Firestore المجانية. */
function pacificMidnight(ms) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const p = {}; f.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
  const h = +p.hour % 24, sinceMidnight = ((h * 60 + +p.minute) * 60 + +p.second) * 1000 + (ms % 1000);
  return ms - sinceMidnight;
}
function monthStart(ms) { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); }

function createUsage({ fetchImpl = fetch, getToken, projectId, db, cloudinary, countUsers, regions = ["us-central1"], dbLocation = "", now = () => Date.now(), log = () => {} }) {
  async function gget(url) {
    const tok = await getToken();
    const res = await fetchImpl(url, { headers: { Authorization: "Bearer " + tok } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error((j.error && j.error.status) || ("HTTP " + res.status)); e.status = res.status; throw e; }
    return j;
  }
  /* مجموع مقياس في فترة؛ لو daily=true بيرجّع كمان كل يوم لوحده (لحساب الزيادة عن الحد اليومي). */
  async function metricSum(types, start, end, daily) {
    let lastErr = null, anyOk = false;
    for (const type of types) {
      const period = daily ? 86400 : Math.max(60, Math.ceil((end - start) / 1000));
      const q = new URLSearchParams({
        filter: `metric.type="${type}"`,
        "interval.startTime": new Date(start).toISOString(), "interval.endTime": new Date(end).toISOString(),
        "aggregation.alignmentPeriod": period + "s", "aggregation.perSeriesAligner": "ALIGN_SUM", "aggregation.crossSeriesReducer": "REDUCE_SUM"
      });
      let j;
      try { j = await gget(`https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries?${q}`); }
      catch (e) { if (e.status === 403) throw e; lastErr = e; continue; } // اسم مقياس مش موجود: جرّب التاني
      anyOk = true;
      const pts = ((j.timeSeries || [])[0] || {}).points;
      if (!pts) continue; // المقياس ده مش موجود/مفيش بيانات: جرّب الاسم التاني
      const vals = pts.map((x) => +(x.value && (x.value.int64Value || x.value.doubleValue)) || 0);
      return { total: vals.reduce((a, b) => a + b, 0), days: vals };
    }
    if (lastErr && !anyOk) throw lastErr;
    return { total: 0, days: [] };
  }

  async function firestoreUsage(t) {
    const d0 = pacificMidnight(t), m0 = monthStart(t);
    const out = { today: {}, month: {}, overDays: {} };
    for (const k of ["reads", "writes", "deletes"]) {
      const [day, month] = await Promise.all([metricSum(METRICS[k], d0, t), metricSum(METRICS[k], m0, t, true)]);
      out.today[k] = day.total; out.month[k] = month.total;
      out.overDays[k] = month.days.reduce((a, v) => a + Math.max(0, v - FREE[k]), 0); // الزيادة عن الحد اليومي في أيام الشهر
    }
    out.resetAt = d0 + 86400000; // ميعاد تجديد الحصة اليومية الجاي
    return out;
  }
  async function artifactSizes() {
    const out = [];
    const list = Array.from(new Set(typeof regions === "function" ? regions() : regions));
    for (const loc of list) {
      try {
        const j = await gget(`https://artifactregistry.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${loc}/repositories/gcf-artifacts`);
        out.push({ region: loc, bytes: +j.sizeBytes || 0 });
      } catch (e) { if (e.status !== 404) out.push({ region: loc, bytes: null, error: e.message }); }
    }
    return out;
  }
  async function cloudinaryUsage() {
    if (!cloudinary) return null;
    const c = cloudinary();
    const res = await fetchImpl(`https://api.cloudinary.com/v1_1/${encodeURIComponent(c.cloud)}/usage`, { headers: { Authorization: "Basic " + Buffer.from(`${c.apiKey}:${c.secret}`).toString("base64") } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error("cloudinary " + res.status);
    return { plan: j.plan || "", storage: +(j.storage && j.storage.usage) || 0, bandwidth: +(j.bandwidth && j.bandwidth.usage) || 0, transformations: +(j.transformations && j.transformations.usage) || 0,
      credits: +(j.credits && j.credits.usage) || 0, creditsLimit: +(j.credits && j.credits.limit) || 0, creditsPct: +(j.credits && j.credits.used_percent) || 0, resources: +j.resources || 0, lastUpdated: j.last_updated || "" };
  }
  // كل جزء ليه 20 ثانية بالكتير: لو حاجة علّقت باقي التقرير يرجع بدل ما الطلب كله يقف (ويطلع «Failed to fetch»).
  function within(ms, p) { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms); })]).finally(() => clearTimeout(t)); }
  async function safe(name, fn, errors) { try { return await within(20000, Promise.resolve().then(fn)); } catch (e) { errors[name] = (e && e.status === 403) ? "denied" : String(e && e.message || e).slice(0, 120); log(name, e && e.message); return null; } }

  async function dbLoc() {
    if (dbLocation) return dbLocation;
    try { const j = await gget(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)`); dbLocation = j.locationId || ""; } catch (e) { log("db location", e && e.message); }
    return dbLocation;
  }
  async function collect() {
    const t = now(), errors = {};
    await within(8000, dbLoc()).catch(() => "");
    const [fs, fn, art, cl, users] = await Promise.all([
      safe("firestore", () => firestoreUsage(t), errors),
      safe("functions", () => metricSum(METRICS.fn, monthStart(t), t), errors),
      safe("artifacts", artifactSizes, errors),
      safe("cloudinary", cloudinaryUsage, errors),
      safe("auth", () => (countUsers ? countUsers() : null), errors)
    ]);
    const multi = /^(nam|eur)\d/.test(dbLocation);
    return { at: t, project: projectId, dbLocation, multiRegion: multi, firestore: fs, functions: fn ? { monthRequests: fn.total } : null,
      artifacts: art, cloudinary: cl, authUsers: users, errors, free: FREE, prices: Object.assign({}, PRICES, { firestore: multi ? PRICES.multi : PRICES.regional }) };
  }

  async function report(force) {
    const ref = db.doc("serverConfig/usage"), snap = await ref.get(), cur = snap.exists ? snap.data() : null;
    if (!force && cur && cur.at && now() - cur.at < 15 * 60000) return cur;
    if (force && cur && cur.at && now() - cur.at < 60000) return cur; // ضغط متكرر: دقيقة على الأقل
    const r = await collect();
    await ref.set(JSON.parse(JSON.stringify(r)));
    return r;
  }

  /* تنبيهات للمالك: أي حاجة عدّت 80% من المجاني (أو زادت عنه). */
  function alerts(r) {
    const out = [];
    const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
    if (r.firestore) {
      [["reads", "قراءات"], ["writes", "كتابات"], ["deletes", "عمليات مسح"]].forEach(([k, n]) => {
        const p = pct(r.firestore.today[k], FREE[k]);
        if (p >= 80) out.push({ id: "fs-" + k, title: `☁️ قاعدة البيانات: ${n} النهارده ${p}% من المجاني`, body: `${r.firestore.today[k].toLocaleString("en")} من ${FREE[k].toLocaleString("en")} في اليوم${p >= 100 ? " — الزيادة بتتحسب فلوس" : ""}` });
      });
    }
    if (r.cloudinary && r.cloudinary.creditsLimit) {
      const p = Math.round(r.cloudinary.creditsPct || pct(r.cloudinary.credits, r.cloudinary.creditsLimit));
      if (p >= 80) out.push({ id: "cld", title: `☁️ مساحة الصور والفيديو (Cloudinary) ${p}% من الباقة`, body: `${r.cloudinary.credits.toFixed(1)} من ${r.cloudinary.creditsLimit} كريدت — امسح المرفقات القديمة من الإعدادات` });
    }
    if (r.functions && r.functions.monthRequests >= FREE.fnRequests * 0.8) out.push({ id: "fn", title: `☁️ تشغيل الدوال ${pct(r.functions.monthRequests, FREE.fnRequests)}% من المجاني الشهر ده`, body: `${r.functions.monthRequests.toLocaleString("en")} من 2,000,000` });
    (r.artifacts || []).forEach((a) => { if (a.bytes > FREE.artifactBytes * 0.8) out.push({ id: "art-" + a.region, title: `☁️ نسخ الدوال المتخزنة (${a.region}) ${(a.bytes / 1e9).toFixed(2)} جيجا`, body: "المجاني 0.5 جيجا — فعّل سياسة مسح النسخ القديمة" }); });
    return out;
  }

  return { report, collect, alerts, pacificMidnight };
}

module.exports = { createUsage, FREE, PRICES, pacificMidnight };
