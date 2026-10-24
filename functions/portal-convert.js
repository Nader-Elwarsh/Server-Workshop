"use strict";
/* portal-convert.js — طلب البوابة بيتحول لأمر شغل على السيرفر فورًا (حتى لو مفيش جهاز إدارة مفتوح).
   بيتضاف لـ index.js بسطر: Object.assign(exports, require("./portal-convert"));
   الأجهزة القديمة لسه بتحوّل برضه وهي مفتوحة: نفس id الأمر = مفيش تكرار، واللي يسبق بيعلّم الطلب handled. */
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineString } = require("firebase-functions/params");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const C = require("./portal-core");

const region = defineString("NOTIFY_REGION", { default: "us-central1" });

async function convert(db, id) {
  const reqRef = db.doc(`portalRequests/${id}`), ordRef = db.doc(`requests/${id}`);
  return db.runTransaction(async (tx) => {
    const rs = await tx.get(reqRef);
    if (!rs.exists) return "gone";
    const raw = rs.data() || {};
    if (raw.handled === true) return "handled";
    const [cs, ds, os] = await Promise.all([
      raw.customerId && C.SAFE_ID.test(String(raw.customerId)) ? tx.get(db.doc(`customers/${raw.customerId}`)) : null,
      raw.deviceId && C.SAFE_ID.test(String(raw.deviceId)) ? tx.get(db.doc(`devices/${raw.deviceId}`)) : null,
      C.SAFE_ID.test(id) ? tx.get(ordRef) : null
    ]);
    // عدّاد السبام: أوامر البوابة المفتوحة للعميل، واللي اتحولت آخر 24 ساعة
    const portalOrders = raw.customerId ? await tx.get(db.collection("requests").where("source", "==", "portal").where("closed", "==", false)) : { docs: [] };
    const dayAgo = Date.now() - 864e5;
    let openBy = 0, lastDay = 0;
    portalOrders.docs.forEach((d) => { const x = d.data() || {}; if (x.customerId === raw.customerId && x.status !== "ملغي") openBy++; const t = x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : Date.parse(x.createdAt); if (t > dayAgo) lastDay++; });
    const dec = C.decide(id, raw, { customer: cs && cs.exists ? cs.data() : null, device: ds && ds.exists ? ds.data() : null, existing: os && os.exists ? os.data() : null, openByCustomer: openBy, lastDay });
    if (dec.patch) { tx.update(reqRef, dec.patch); return dec.action; }
    if (dec.action !== "convert") return dec.action;
    const now = new Date(), prefix = C.dayPrefix(now);
    const [same, arch, gs] = await Promise.all([tx.get(db.collection("requests").where("no", ">=", prefix).where("no", "<", prefix + "")), tx.get(db.doc("archMeta/nos")), tx.get(db.doc("settings/global"))]);
    const no = C.nextNo(prefix, same.docs.map((d) => d.get("no")), ((arch.exists ? arch.data() : {}).d || {})[prefix]);
    const r = C.orderFromRequest(id, dec.p, { no, now: now.toISOString(), settings: gs.exists ? gs.data() : {} });
    const doc = Object.assign({}, r, { createdAt: Timestamp.fromDate(now), _ts: FieldValue.serverTimestamp(), _by: "srv" });
    delete doc.id;
    tx.set(ordRef, doc);
    tx.update(reqRef, { handled: true, orderId: id, orderNo: no });
    tx.set(db.doc("settings/wf_meta"), { ts: Date.now(), dev: "srv-portal" }, { merge: true }); // الأجهزة القديمة تسحب الأمر الجديد
    return "converted";
  });
}

exports.portalConvert = onDocumentWritten({ document: "portalRequests/{id}", region, maxInstances: 3, memory: "256MiB", timeoutSeconds: 60, retry: false }, async (ev) => {
  const after = ev.data && ev.data.after && ev.data.after.exists ? ev.data.after.data() : null;
  if (!after || after.handled === true) return;
  try { const r = await convert(getFirestore(), ev.params.id); console.log("[portalConvert]", ev.params.id, r); }
  catch (e) { console.error("[portalConvert]", ev.params.id, e && e.message); }
});
