"use strict";
/* ---------------------------------------------------------------------
   مرفقات العطل (صور/فيديو/صوت) على Cloudinary — التوقيع والمسح والتنظيف.
   - sign: توقيع رفع ملف واحد باسم (public_id) بيتولّد هنا وبيتسجّل في
     mediaFiles/{id} (مين رفعه وإمتى) → كده نقدر نعرف الملفات اليتيمة
     (اترفعت ومحدش حفظها في أمر/طلب) ونمسحها، والعميل يمسح بتاعه بس.
   - remove: مسح ملفات من السحابة نهائيًا (الموظف اللي له تعديل الأوامر،
     أو العميل لملف هو رفعه من أقل من يومين — قبل ما يبعت الطلب).
   - usage / orphans: للمالك — المساحة المستخدمة، ومسح الملفات اليتيمة.
   مفيش أي مسح لحاجة برا فولدر workshop-media (صور الأجهزة والقطع ليها مسار تاني).
   --------------------------------------------------------------------- */
const crypto = require("node:crypto");

class MediaError extends Error { constructor(code, message) { super(message); this.code = code; } }

const FORMATS = {
  image: "jpg,jpeg,png,webp,heic,heif",
  video: "mp4,mov,m4v,3gp,webm,mkv,mp3,m4a,aac,ogg,oga,opus,wav,amr,weba"
};
const KINDS = { image: "image", video: "video", audio: "video" }; // kind → resource_type
const FOLDER = "workshop-media";
const DAY = 86400000;

function signParams(params, secret) {
  const canonical = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return crypto.createHash("sha1").update(canonical + secret).digest("hex");
}
function docId(pid) { return String(pid).replace(/[^A-Za-z0-9_-]/g, "_"); }
function parseUrl(url, cloud) {
  const m = /^https:\/\/res\.cloudinary\.com\/([^/\s]+)\/(image|video)\/upload\/(?:v\d+\/)?(workshop-media\/[A-Za-z0-9_-]{4,80})(?:\.[A-Za-z0-9]{2,5})?$/.exec(String(url || ""));
  if (!m || (cloud && m[1] !== cloud)) return null;
  return { cloud: m[1], rt: m[2], pid: m[3] };
}

function createMedia({ db, now = () => Date.now(), creds, fetchImpl = fetch, actor, log = () => {}, randomId = () => crypto.randomBytes(9).toString("base64url").replace(/[^A-Za-z0-9]/g, "x") }) {
  async function destroy(pid, rt) {
    const c = creds(), timestamp = Math.floor(now() / 1000);
    const params = { invalidate: "true", public_id: pid, timestamp };
    const form = new URLSearchParams(Object.assign({}, params, { timestamp: String(timestamp), api_key: c.apiKey, signature: signParams(params, c.secret) }));
    const res = await fetchImpl(`https://api.cloudinary.com/v1_1/${encodeURIComponent(c.cloud)}/${rt}/destroy`, { method: "POST", body: form });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || (j.result !== "ok" && j.result !== "not found")) { log("destroy failed", pid, res.status, j && (j.result || (j.error && j.error.message))); return false; }
    return true;
  }

  async function sign(uid, data) {
    const a = await actor(uid);
    if (!a.role) throw new MediaError("permission-denied", "upload_not_authorized");
    const kind = data && (data.kind === "audio" || data.kind === "image") ? data.kind : "video";
    const t = now();
    const day = new Date(t + 2 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
    const ref = db.collection("rateLimits").doc(`media_${uid}_${day}`);
    const limit = a.role === "staff" ? 300 : 20;
    const ok = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const n = snap.exists ? (+snap.data().n || 0) : 0;
      if (n >= limit) return false;
      tx.set(ref, { n: n + 1, uid, expireAt: new Date(t + 3 * DAY) }, { merge: true });
      return true;
    });
    if (!ok) throw new MediaError("resource-exhausted", "media_rate_limited");
    const rt = KINDS[kind], pid = `${FOLDER}/${kind[0]}${t.toString(36)}${randomId()}`;
    await db.collection("mediaFiles").doc(docId(pid)).set({ uid, pid, rt, kind, at: t, role: a.role });
    const c = creds(), timestamp = Math.floor(t / 1000), allowed = FORMATS[rt];
    const signature = signParams({ allowed_formats: allowed, public_id: pid, timestamp }, c.secret);
    return { cloud: c.cloud, apiKey: c.apiKey, timestamp, publicId: pid, allowedFormats: allowed, resource: rt, signature, kind };
  }

  async function remove(uid, data) {
    const a = await actor(uid);
    if (!a.role) throw new MediaError("permission-denied", "not_allowed");
    const urls = Array.isArray(data && data.urls) ? data.urls.slice(0, 50) : [];
    const cloud = creds().cloud, out = { deleted: 0, denied: 0, failed: 0, done: [] };
    const staffOk = a.role === "staff" && (a.owner || a.perms["requests.edit"] || a.perms["requests.add"]);
    for (const u of urls) {
      const p = parseUrl(u, cloud);
      if (!p) { out.denied++; continue; }
      const ref = db.collection("mediaFiles").doc(docId(p.pid));
      const snap = await ref.get();
      const rec = snap.exists ? snap.data() : null;
      const own = rec && rec.uid === uid && now() - (+rec.at || 0) < 2 * DAY;
      if (!staffOk && !own) { out.denied++; continue; }
      if (await destroy(p.pid, (rec && rec.rt) || p.rt)) { out.deleted++; out.done.push(u); if (snap.exists) await ref.delete(); } else out.failed++;
    }
    return out;
  }

  async function requireOwner(uid) {
    const a = await actor(uid);
    if (!a.owner) throw new MediaError("permission-denied", "owner_only");
    return a;
  }

  async function usage(uid) {
    await requireOwner(uid);
    const c = creds();
    let plan = null;
    try {
      const res = await fetchImpl(`https://api.cloudinary.com/v1_1/${encodeURIComponent(c.cloud)}/usage`, { headers: { Authorization: "Basic " + Buffer.from(`${c.apiKey}:${c.secret}`).toString("base64") } });
      const j = await res.json().catch(() => ({}));
      if (res.ok) plan = { plan: j.plan || "", storage: +(j.storage && j.storage.usage) || 0, bandwidth: +(j.bandwidth && j.bandwidth.usage) || 0, credits: +(j.credits && j.credits.usage) || 0, creditsLimit: +(j.credits && j.credits.limit) || 0, creditsPct: +(j.credits && j.credits.used_percent) || 0, resources: +j.resources || 0 };
    } catch (e) { log("usage failed", e && e.message); }
    const files = await db.collection("mediaFiles").get();
    return { usage: plan, tracked: files.size };
  }

  /* الملفات اليتيمة: اترفعت من أكتر من minAgeDays ومش موجودة في أي أمر شغل أو طلب بوابة أو سلة المهملات. */
  async function orphans(uid, data) {
    await requireOwner(uid);
    const minAge = Math.max(1, Math.min(60, +(data && data.minAgeDays) || 3));
    const apply = !!(data && data.apply);
    const cutoff = now() - minAge * DAY;
    const [files, reqs, preqs, settings] = await Promise.all([
      db.collection("mediaFiles").where("at", "<", cutoff).get(),
      db.collection("requests").get(),
      db.collection("portalRequests").get(),
      db.collection("settings").get()
    ]);
    const chunks = [];
    reqs.forEach((d) => chunks.push(JSON.stringify(d.data())));
    preqs.forEach((d) => chunks.push(JSON.stringify(d.data())));
    settings.forEach((d) => { if (String(d.id).indexOf("wfkv_wf_trash") === 0) chunks.push(JSON.stringify(d.data())); });
    const hay = chunks.join("\n");
    const list = [];
    files.forEach((d) => { const f = d.data(); if (f && f.pid && hay.indexOf(f.pid) < 0) list.push({ ref: d.ref, pid: f.pid, rt: f.rt || "video", kind: f.kind || "" }); });
    const out = { checked: files.size, orphans: list.length, deleted: 0, failed: 0, kinds: {} };
    list.forEach((x) => { out.kinds[x.kind] = (out.kinds[x.kind] || 0) + 1; });
    if (!apply) return out;
    for (const x of list.slice(0, 300)) {
      if (await destroy(x.pid, x.rt)) { out.deleted++; await x.ref.delete(); } else out.failed++;
    }
    return out;
  }

  return { sign, remove, usage, orphans, destroy };
}

module.exports = { createMedia, MediaError, parseUrl, signParams, docId, FORMATS };
