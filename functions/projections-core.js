"use strict";
/* projections-core.js — نسخ العرض من أمر الشغل (منطق نقي من غير Firebase عشان يتختبر):
   - techOrders/{id}: للفني المعيّن (بيانات العميل والجهاز من غير بيانات البوابة الخاصة).
   - portalOrders/{id}: لعميل البوابة يتابع أمره (من غير تكلفة القطع) — حسب إعدادات الإظهار portalVis.
   نفس منطق firebase-sync.js (projectTech / projectPortalOrders) بالظبط، بس بقى بيشتغل على السيرفر لكل تعديل في أي أمر
   (من أي جهاز: القديم أو الجديد)، بدل ما يستنى جهاز إدارة قديم يكون مفتوح. */

function pick(o, drop) { const r = {}; Object.keys(o || {}).forEach((f) => { if (drop.indexOf(f) < 0) r[f] = o[f]; }); return r; }
const r2 = (n) => Math.round((+n || 0) * 100) / 100;

function techView(order, customer, device) {
  if (!order || !order.techId || order.closed === true || !customer) return null;
  return {
    techId: String(order.techId), orderId: order.id, no: order.no || "", customerId: order.customerId, deviceId: order.deviceId || "",
    customer: Object.assign(pick(customer, ["portal", "portalUid", "email"]), { id: customer.id }),
    device: device ? Object.assign(pick(device, ["portal"]), { id: device.id }) : null
  };
}

function warrantyScopeAuto(r, partName) {
  const parts = (r.parts || []).map((x) => x && (x.external ? (x.name || "") : partName(x.partId) || "")).filter(Boolean);
  const work = String(r.work || "").trim() || String(r.fault || "").trim();
  return [work ? `🛠️ ${work}` : "", parts.length ? `🔩 القطع: ${[...new Set(parts)].join("، ")}` : ""].filter(Boolean).join("\n");
}

/* settingsVis = settings/global.portalVis ، partName(id) = اسم صنف المخزن */
function portalView(r, customer, device, settingsVis, partName) {
  if (!r || !customer || customer.portal !== true) return null;
  const d = device || {};
  const V = Object.assign({ price: true, labor: true, parts: true, work: true, history: true, workshopStatus: true, visit: true }, settingsVis || {}, r.portalVis || {});
  const vv = (k, base) => (V[k] === undefined ? !!V[base] : !!V[k]);
  const showTotal = vv("total", "price"), showDep = vv("deposit", "price"), showRemain = vv("remain", "price"), showLabor = vv("labor", "labor"), showPartPrice = vv("partPrices", "price"), showQty = V.partQty !== false;
  const p = { customerId: r.customerId, no: r.no || "", deviceId: r.deviceId || "", deviceLabel: [d.type, d.brand, d.model].filter(Boolean).join(" "), fault: r.fault || "", status: (r.status === "مكتمل" || r.closed ? "مكتمل" : (r.status || "جديد")), executionPlace: r.executionPlace || "", closed: !!r.closed, partsWaiting: !!r.partsWaiting, source: r.source || "", createdAt: r.createdAt || "" };
  if (V.visit) p.visit = r.visit || "";
  if (V.workshopStatus) p.workshopStatus = r.workshopStatus || "";
  if (showTotal) p.total = +r.total || 0;
  const netDep = r2((+r.deposit || 0) - (+r.depositRefunded || 0));
  if (showDep) p.deposit = Math.max(0, netDep);
  if (showRemain) p.remain = r.closed || r.paid || r.status === "ملغي" ? 0 : Math.max(0, r2((+r.total || 0) - netDep));
  if (showLabor) p.labor = +r.labor || 0;
  if (V.work) p.work = r.work || "";
  if (V.parts) p.parts = (r.parts || []).map((i) => { const o = { name: (!i.external && partName(i.partId)) || i.name || "قطعة" }; if (showQty) o.qty = +i.qty || 1; if (showPartPrice) o.price = +i.sell || 0; return o; });
  if (V.history) p.history = (r.statusHistory || []).map((x) => ({ to: x.to || "", at: x.at || "" }));
  if (r.closed && r.warrantyUntil) {
    p.warrantyUntil = String(r.warrantyUntil);
    const sc = (V.work || V.parts) ? (String(r.warrantyScope || "").trim() || warrantyScopeAuto(r, partName)) : String(r.warrantyScope || "");
    if (sc) p.warrantyScope = String(sc).slice(0, 600);
  }
  if (r.warrantyDecision === "warranty") p.warrantyOfNo = String(r.warrantyOfNo || "");
  return p;
}

/* مقارنة من غير updatedAt (عشان مانكتبش لو مفيش تغيير) */
function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).filter((k) => k !== "updatedAt").sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
const same = (a, b) => stable(a) === stable(b);

/* التواريخ في نسخة البوابة نص (زي ما الأجهزة كانت بتكتبها) — Timestamp من Firestore بيتحول ISO */
function plain(v) {
  if (v && typeof v.toDate === "function") return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") { const o = {}; Object.keys(v).forEach((k) => { o[k] = plain(v[k]); }); return o; }
  return v;
}

/* بيقرا الأمر/العميل/الجهاز ويكتب النسخ لو اتغيرت. serverTime = وقت السيرفر (FieldValue.serverTimestamp) */
function makeProject(serverTime) {
  async function project(db, id, after) {
    const P = module.exports;
    const r = after ? P.plain(Object.assign({ id }, after)) : null;
    const [cs, ds, tOld, pOld] = await Promise.all([
      r && r.customerId ? db.doc(`customers/${r.customerId}`).get() : null,
      r && r.deviceId ? db.doc(`devices/${r.deviceId}`).get() : null,
      db.doc(`techOrders/${id}`).get(),
      db.doc(`portalOrders/${id}`).get()
    ]);
    const c = cs && cs.exists ? P.plain(Object.assign({ id: cs.id }, cs.data())) : null;
    const d = ds && ds.exists ? P.plain(Object.assign({ id: ds.id }, ds.data())) : null;
    const ops = [];
    // نسخة الفني
    const tv = r ? P.techView(r, c, d) : null;
    if (tv && !(tOld.exists && P.same(tOld.data(), tv))) ops.push(["set", `techOrders/${id}`, tv]);
    if (!tv && tOld.exists) ops.push(["delete", `techOrders/${id}`]);
    // نسخة البوابة
    if (r) {
      let vis = {}, names = {};
      if (c && c.portal === true) {
        const ids = [...new Set((r.parts || []).filter((x) => x && !x.external && x.partId).map((x) => x.partId))];
        const [g, ...ps] = await Promise.all([db.doc("settings/global").get(), ...ids.map((p) => db.doc(`parts/${p}`).get())]);
        vis = (g.exists && (g.data() || {}).portalVis) || {};
        ps.forEach((s) => { if (s.exists) names[s.id] = (s.data() || {}).name || (s.data() || {}).title || ""; });
      }
      const pv = P.portalView(r, c, d, vis, (pid) => names[pid] || "");
      if (pv && !(pOld.exists && P.same(pOld.data(), pv))) ops.push(["set", `portalOrders/${id}`, pv]);
      if (!pv && pOld.exists && c && c.portal !== true) ops.push(["delete", `portalOrders/${id}`]); // العميل اتشال من البوابة
    } else if (pOld.exists) {
      // الأمر اتمسح: لو اتنقل للأرشيف نسيب نسخته (العميل يفضل شايف تاريخه)، لو اتمسح بجد نشيلها
      const tomb = await db.doc(`syncDeletes/requests__${id}`).get();
      if (tomb.exists && (tomb.data() || {}).arch !== true) ops.push(["delete", `portalOrders/${id}`]);
    }
    if (!ops.length) return 0;
    const b = db.batch();
    ops.forEach(([k, path, data]) => { if (k === "set") b.set(db.doc(path), Object.assign({}, data, { updatedAt: serverTime() })); else b.delete(db.doc(path)); });
    await b.commit();
    return ops.length;
  }
  return project;
}

module.exports = { techView, portalView, warrantyScopeAuto, same, plain, makeProject };
